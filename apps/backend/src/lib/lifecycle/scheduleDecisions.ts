import { EventStatus } from "@repo/shared-types";

/**
 * Everything decideTarget needs to know about one event, decoupled from
 * Prisma's row shape so this logic is pure and fast to unit-test without a
 * database.
 */
export type LifecycleCandidate = {
  status: EventStatus;
  registrationOpensAt: Date | null;
  registrationDeadline: Date | null;
  startsAt: Date;
  endsAt: Date;
  capacity: number;
  waitingListEnabled: boolean;
  autoCompleteAfterMinutes: number;
  registeredCount: number;
};

/**
 * Given one event and the current time, decides the single next status it is
 * due for, or null if no boundary has been crossed. Pure — no DB access, no
 * side effects — so the scheduler's decision logic is exhaustively unit
 * tested independently of Postgres.
 *
 * REGISTRATION_OPEN's capacity rule mirrors the exact one already used at
 * registration time (events.service.ts: capacity>0 && count>=capacity;
 * capacity=0 means unlimited): decision #2 — waitlist OFF + full closes
 * registration; waitlist ON + full stays open and keeps waitlisting. It ALSO
 * closes once the event's own start time passes, regardless of deadline or
 * capacity — REGISTRATION_OPEN can only reach ONGOING via REGISTRATION_CLOSED
 * (see transitions.ts), so without this an event with no deadline and no
 * capacity cap would never leave REGISTRATION_OPEN at all.
 */
export function decideTarget(e: LifecycleCandidate, now: Date): EventStatus | null {
  switch (e.status) {
    case EventStatus.PUBLISHED:
      return e.registrationOpensAt !== null && e.registrationOpensAt <= now
        ? EventStatus.REGISTRATION_OPEN
        : null;

    case EventStatus.REGISTRATION_OPEN: {
      const deadlinePassed = e.registrationDeadline !== null && e.registrationDeadline <= now;
      const eventStarted = e.startsAt <= now;
      const full = e.capacity > 0 && e.registeredCount >= e.capacity;
      const closedByCapacity = full && !e.waitingListEnabled;
      return deadlinePassed || eventStarted || closedByCapacity ? EventStatus.REGISTRATION_CLOSED : null;
    }

    case EventStatus.REGISTRATION_CLOSED:
      return e.startsAt <= now ? EventStatus.ONGOING : null;

    case EventStatus.ONGOING: {
      const autoCompleteAt = new Date(e.endsAt.getTime() + e.autoCompleteAfterMinutes * 60_000);
      return autoCompleteAt <= now ? EventStatus.COMPLETED : null;
    }

    default:
      return null; // DRAFT/COMPLETED/CANCELLED/ARCHIVED: the scheduler never drives these
  }
}
