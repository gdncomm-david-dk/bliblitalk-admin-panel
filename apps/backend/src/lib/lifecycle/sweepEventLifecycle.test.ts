import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { EventStatus, RegistrationStatus } from "@repo/shared-types";
import { prisma } from "../../db/client";
import { sweepEventLifecycle } from "./sweepEventLifecycle";

const PREFIX = "lifecycle-sweep-test-";
const MIN = 60_000;

type EventOverrides = Partial<{
  status: EventStatus;
  registrationOpensAt: Date | null;
  registrationDeadline: Date | null;
  startsAt: Date;
  endsAt: Date;
  capacity: number;
  waitingListEnabled: boolean;
  autoCompleteAfterMinutes: number;
  gracePeriodMinutes: number;
  isOverdue: boolean;
}>;

async function makeEvent(overrides: EventOverrides) {
  const now = Date.now();
  return prisma.event.create({
    data: {
      slug: `${PREFIX}${now}-${Math.round(Math.random() * 100000)}`,
      title: "Lifecycle sweep test",
      description: "x",
      category: "Technology",
      location: "Online",
      startsAt: overrides.startsAt ?? new Date(now + 86400000),
      endsAt: overrides.endsAt ?? new Date(now + 90000000),
      status: overrides.status ?? EventStatus.PUBLISHED,
      registrationOpensAt: overrides.registrationOpensAt,
      registrationDeadline: overrides.registrationDeadline,
      capacity: overrides.capacity ?? 0,
      waitingListEnabled: overrides.waitingListEnabled ?? true,
      autoCompleteAfterMinutes: overrides.autoCompleteAfterMinutes ?? 2880,
      gracePeriodMinutes: overrides.gracePeriodMinutes ?? 120,
      isOverdue: overrides.isOverdue ?? false,
    },
  });
}

async function registerFiller(eventId: string, n: number) {
  for (let i = 0; i < n; i++) {
    const user = await prisma.user.create({
      data: { email: `${PREFIX}filler-${Date.now()}-${i}@gdn-commerce.com`, name: "Filler", passwordHash: "x" },
    });
    await prisma.registration.create({
      data: { userId: user.id, eventId, status: RegistrationStatus.REGISTERED },
    });
  }
}

async function cleanup() {
  const events = await prisma.event.findMany({ where: { slug: { startsWith: PREFIX } }, select: { id: true } });
  const ids = events.map((e) => e.id);
  if (ids.length) {
    await prisma.registration.deleteMany({ where: { eventId: { in: ids } } });
    await prisma.eventStatusHistory.deleteMany({ where: { eventId: { in: ids } } });
    await prisma.event.deleteMany({ where: { id: { in: ids } } });
  }
  await prisma.user.deleteMany({ where: { email: { startsWith: `${PREFIX}filler-` } } });
}

describe("sweepEventLifecycle", () => {
  beforeEach(cleanup);
  afterAll(cleanup);

  it("flags overdue ONGOING events past end+grace, idempotently", async () => {
    const ev = await makeEvent({
      status: EventStatus.ONGOING,
      endsAt: new Date(Date.now() - 10 * MIN),
      gracePeriodMinutes: 5,
    });
    await sweepEventLifecycle();
    let after = await prisma.event.findUnique({ where: { id: ev.id } });
    expect(after?.isOverdue).toBe(true);

    await sweepEventLifecycle(); // second tick — must not error or double-do anything
    after = await prisma.event.findUnique({ where: { id: ev.id } });
    expect(after?.isOverdue).toBe(true);
  });

  it("auto-opens registration once registrationOpensAt has passed", async () => {
    const ev = await makeEvent({
      status: EventStatus.PUBLISHED,
      registrationOpensAt: new Date(Date.now() - MIN),
      startsAt: new Date(Date.now() + 86400000),
      endsAt: new Date(Date.now() + 90000000),
    });
    await sweepEventLifecycle();
    const after = await prisma.event.findUnique({ where: { id: ev.id } });
    expect(after?.status).toBe(EventStatus.REGISTRATION_OPEN);
  });

  it("auto-closes registration at the deadline", async () => {
    const ev = await makeEvent({
      status: EventStatus.REGISTRATION_OPEN,
      registrationDeadline: new Date(Date.now() - MIN),
      startsAt: new Date(Date.now() + 86400000),
      endsAt: new Date(Date.now() + 90000000),
    });
    await sweepEventLifecycle();
    const after = await prisma.event.findUnique({ where: { id: ev.id } });
    expect(after?.status).toBe(EventStatus.REGISTRATION_CLOSED);
  });

  it("auto-closes registration when full and the waitlist is disabled", async () => {
    const ev = await makeEvent({
      status: EventStatus.REGISTRATION_OPEN,
      capacity: 1,
      waitingListEnabled: false,
      startsAt: new Date(Date.now() + 86400000),
      endsAt: new Date(Date.now() + 90000000),
    });
    await registerFiller(ev.id, 1);
    await sweepEventLifecycle();
    const after = await prisma.event.findUnique({ where: { id: ev.id } });
    expect(after?.status).toBe(EventStatus.REGISTRATION_CLOSED);
  });

  it("keeps registration open when full but the waitlist is enabled", async () => {
    const ev = await makeEvent({
      status: EventStatus.REGISTRATION_OPEN,
      capacity: 1,
      waitingListEnabled: true,
      startsAt: new Date(Date.now() + 86400000),
      endsAt: new Date(Date.now() + 90000000),
    });
    await registerFiller(ev.id, 1);
    await sweepEventLifecycle();
    const after = await prisma.event.findUnique({ where: { id: ev.id } });
    expect(after?.status).toBe(EventStatus.REGISTRATION_OPEN);
  });

  it("does not close a capacity-eligible event that is not actually full", async () => {
    const ev = await makeEvent({
      status: EventStatus.REGISTRATION_OPEN,
      capacity: 5,
      waitingListEnabled: false, // matches the broad detection arm...
      startsAt: new Date(Date.now() + 86400000),
      endsAt: new Date(Date.now() + 90000000),
    });
    await registerFiller(ev.id, 1); // ...but only 1 of 5 seats are taken
    await sweepEventLifecycle();
    const after = await prisma.event.findUnique({ where: { id: ev.id } });
    expect(after?.status).toBe(EventStatus.REGISTRATION_OPEN);
  });

  it("auto-closes registration once the event's own start time passes, even with no deadline or capacity cap", async () => {
    const ev = await makeEvent({
      status: EventStatus.REGISTRATION_OPEN,
      registrationDeadline: null,
      capacity: 0,
      waitingListEnabled: true,
      startsAt: new Date(Date.now() - MIN),
      endsAt: new Date(Date.now() + 90000000),
    });
    await sweepEventLifecycle();
    // startsAt has already passed, so REGISTRATION_CLOSED (driven purely by the
    // start-time boundary, with no deadline or capacity cap in play) is itself
    // immediately due for the same startsAt-driven ONGOING hop within this same
    // tick — the intra-tick cascade (see the "cascades a multi-boundary backlog"
    // test) is what carries it the rest of the way. Assert the intermediate hop
    // via history to confirm registration did close on the start-time boundary,
    // and the final settled status.
    const after = await prisma.event.findUnique({ where: { id: ev.id } });
    expect(after?.status).toBe(EventStatus.ONGOING);

    const history = await prisma.eventStatusHistory.findMany({
      where: { eventId: ev.id },
      orderBy: { createdAt: "asc" },
    });
    expect(history.map((h) => h.toStatus)).toEqual([EventStatus.REGISTRATION_CLOSED, EventStatus.ONGOING]);
  });

  it("auto-starts an event once its start time has passed", async () => {
    const ev = await makeEvent({
      status: EventStatus.REGISTRATION_CLOSED,
      startsAt: new Date(Date.now() - MIN),
      endsAt: new Date(Date.now() + 90000000),
    });
    await sweepEventLifecycle();
    const after = await prisma.event.findUnique({ where: { id: ev.id } });
    expect(after?.status).toBe(EventStatus.ONGOING);
  });

  it("auto-completes an event once end+autoCompleteAfterMinutes has passed, running COMPLETED side effects", async () => {
    const ev = await makeEvent({
      status: EventStatus.ONGOING,
      startsAt: new Date(Date.now() - 3 * MIN),
      endsAt: new Date(Date.now() - 2 * MIN),
      autoCompleteAfterMinutes: 1,
      isOverdue: true,
    });
    await sweepEventLifecycle();
    const after = await prisma.event.findUnique({ where: { id: ev.id } });
    expect(after?.status).toBe(EventStatus.COMPLETED);
    expect(after?.isOverdue).toBe(false);
  });

  it("cascades a multi-boundary backlog through several states in one tick", async () => {
    const ev = await makeEvent({
      status: EventStatus.PUBLISHED,
      registrationOpensAt: new Date(Date.now() - 4 * MIN),
      registrationDeadline: new Date(Date.now() - 3 * MIN),
      startsAt: new Date(Date.now() - 2 * MIN),
      endsAt: new Date(Date.now() - MIN),
      autoCompleteAfterMinutes: 0,
    });
    await sweepEventLifecycle();
    const after = await prisma.event.findUnique({ where: { id: ev.id } });
    expect(after?.status).toBe(EventStatus.COMPLETED);

    const history = await prisma.eventStatusHistory.findMany({
      where: { eventId: ev.id },
      orderBy: { createdAt: "asc" },
    });
    expect(history.map((h) => h.toStatus)).toEqual([
      EventStatus.REGISTRATION_OPEN,
      EventStatus.REGISTRATION_CLOSED,
      EventStatus.ONGOING,
      EventStatus.COMPLETED,
    ]);
  });

  it("isolates a failure on one candidate from the rest of the sweep", async () => {
    const good = await makeEvent({
      status: EventStatus.REGISTRATION_CLOSED,
      startsAt: new Date(Date.now() - MIN),
      endsAt: new Date(Date.now() + 90000000),
    });
    const bad = await makeEvent({
      status: EventStatus.REGISTRATION_CLOSED,
      startsAt: new Date(Date.now() - MIN),
      endsAt: new Date(Date.now() + 90000000),
    });
    await prisma.event.delete({ where: { id: bad.id } }); // vanishes between fetch and processing

    await expect(sweepEventLifecycle()).resolves.not.toThrow();

    const after = await prisma.event.findUnique({ where: { id: good.id } });
    expect(after?.status).toBe(EventStatus.ONGOING);
  });
});
