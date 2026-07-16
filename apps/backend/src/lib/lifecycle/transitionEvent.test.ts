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

  it("resolves a concurrent race for the same target with exactly one history row (CAS)", async () => {
    const ev = await makeEvent(EventStatus.DRAFT);
    const results = await Promise.allSettled([
      transitionEvent(ev.id, EventStatus.PUBLISHED, { type: "SYSTEM" }),
      transitionEvent(ev.id, EventStatus.PUBLISHED, { type: "ADMIN", id: "admin-1" }),
    ]);
    expect(results[0].status).toBe("fulfilled");
    expect(results[1].status).toBe("fulfilled");

    const after = await prisma.event.findUnique({ where: { id: ev.id } });
    expect(after?.status).toBe(EventStatus.PUBLISHED);

    const history = await prisma.eventStatusHistory.count({ where: { eventId: ev.id } });
    expect(history).toBe(1);
  });

  it("gives the losing racer an honest 409 when a concurrent call reached a different target", async () => {
    const ev = await makeEvent(EventStatus.ONGOING);
    const results = await Promise.allSettled([
      transitionEvent(ev.id, EventStatus.COMPLETED, { type: "SYSTEM" }),
      transitionEvent(ev.id, EventStatus.CANCELLED, { type: "ADMIN", id: "admin-1" }),
    ]);

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected") as PromiseRejectedResult[];
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    // The loser's error must reflect the REAL post-race status (COMPLETED, the winner's
    // target), not the stale ONGOING it originally read — a stale `from` here would mean
    // the reported `allowed` list is wrong too (it would wrongly include CANCELLED, the
    // very target this call just got rejected for).
    expect(rejected[0]!.reason).toMatchObject({
      code: "INVALID_TRANSITION",
      status: 409,
      details: { from: EventStatus.COMPLETED, to: EventStatus.CANCELLED, allowed: [EventStatus.ARCHIVED] },
    });

    const history = await prisma.eventStatusHistory.count({ where: { eventId: ev.id } });
    expect(history).toBe(1);
  });

  it("runs COMPLETED side effects: clears isOverdue and flips displayConfig.pastEvent", async () => {
    const ev = await prisma.event.create({
      data: {
        slug: `${PREFIX}${Date.now()}-completed-fx`,
        title: "Lifecycle txn test",
        description: "x",
        category: "Technology",
        location: "Online",
        startsAt: new Date(Date.now() - 200000),
        endsAt: new Date(Date.now() - 100000),
        status: EventStatus.ONGOING,
        isOverdue: true,
        displayConfig: {
          pastEvent: false,
          speaker: true,
          gallery: true,
          keyTakeaways: true,
          recording: true,
          certificate: true,
        },
      },
    });

    await transitionEvent(ev.id, EventStatus.COMPLETED, { type: "SYSTEM" });

    const after = await prisma.event.findUnique({ where: { id: ev.id } });
    expect(after?.status).toBe(EventStatus.COMPLETED);
    expect(after?.isOverdue).toBe(false);
    expect((after?.displayConfig as Record<string, unknown>).pastEvent).toBe(true);
    expect((after?.displayConfig as Record<string, unknown>).speaker).toBe(true);

    const history = await prisma.eventStatusHistory.findFirst({ where: { eventId: ev.id } });
    expect(history?.sideEffectsStatus).toBe("DONE");
  });
});
