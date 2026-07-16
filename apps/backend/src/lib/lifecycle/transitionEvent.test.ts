import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { EventStatus } from "@repo/shared-types";
import { prisma } from "../../db/client";
import { transitionEvent } from "./transitionEvent";
import { AppError } from "../../middleware/error";

const PREFIX = "lifecycle-txn-test-";

async function makeEvent(status: EventStatus) {
  const now = new Date();
  return prisma.event.create({
    data: {
      slug: `${PREFIX}${Date.now()}-${Math.round(now.getTime() % 100000)}`,
      title: "Lifecycle txn test",
      description: "x",
      category: "Technology",
      location: "Online",
      startsAt: new Date(now.getTime() + 86400000),
      endsAt: new Date(now.getTime() + 90000000),
      status,
    },
  });
}

async function cleanup() {
  const events = await prisma.event.findMany({ where: { slug: { startsWith: PREFIX } }, select: { id: true } });
  const ids = events.map((e) => e.id);
  if (ids.length) {
    await prisma.eventStatusHistory.deleteMany({ where: { eventId: { in: ids } } });
    await prisma.event.deleteMany({ where: { id: { in: ids } } });
  }
}

describe("transitionEvent", () => {
  beforeEach(cleanup);
  afterAll(cleanup);

  it("performs a legal transition and writes exactly one history row", async () => {
    const ev = await makeEvent(EventStatus.DRAFT);
    await transitionEvent(ev.id, EventStatus.PUBLISHED, { type: "ADMIN", id: "admin-1" }, "go live");

    const after = await prisma.event.findUnique({ where: { id: ev.id } });
    expect(after?.status).toBe(EventStatus.PUBLISHED);

    const history = await prisma.eventStatusHistory.findMany({ where: { eventId: ev.id } });
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({
      fromStatus: EventStatus.DRAFT,
      toStatus: EventStatus.PUBLISHED,
      actorType: "ADMIN",
      actorId: "admin-1",
      reason: "go live",
    });
  });

  it("advances statusChangedAt", async () => {
    const ev = await makeEvent(EventStatus.DRAFT);
    const before = ev.statusChangedAt.getTime();
    await new Promise((r) => setTimeout(r, 5));
    await transitionEvent(ev.id, EventStatus.PUBLISHED, { type: "SYSTEM" });
    const after = await prisma.event.findUnique({ where: { id: ev.id } });
    expect(after!.statusChangedAt.getTime()).toBeGreaterThan(before);
  });

  it("rejects an illegal transition with 409 and does not write history", async () => {
    const ev = await makeEvent(EventStatus.COMPLETED);
    await expect(
      transitionEvent(ev.id, EventStatus.REGISTRATION_OPEN, { type: "ADMIN", id: "admin-1" }),
    ).rejects.toMatchObject({ code: "INVALID_TRANSITION", status: 409 });
    const history = await prisma.eventStatusHistory.count({ where: { eventId: ev.id } });
    expect(history).toBe(0);
  });

  it("404s for a missing event", async () => {
    await expect(
      transitionEvent("does-not-exist", EventStatus.PUBLISHED, { type: "SYSTEM" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND", status: 404 });
  });

  it("is idempotent: same-status transition is a no-op (no write, no history)", async () => {
    const ev = await makeEvent(EventStatus.DRAFT);
    const statusBefore = ev.status;
    const changedAtBefore = ev.statusChangedAt;

    await transitionEvent(ev.id, EventStatus.DRAFT, { type: "SYSTEM" });

    const after = await prisma.event.findUnique({ where: { id: ev.id } });
    expect(after?.status).toBe(statusBefore);
    expect(after?.statusChangedAt.getTime()).toBe(changedAtBefore.getTime());

    const historyCount = await prisma.eventStatusHistory.count({ where: { eventId: ev.id } });
    expect(historyCount).toBe(0);
  });
});
