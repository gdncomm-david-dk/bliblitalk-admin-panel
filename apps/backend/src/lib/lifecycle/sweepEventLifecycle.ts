import { EventStatus, RegistrationStatus } from "@repo/shared-types";
import { prisma } from "../../db/client";
import { AppError } from "../../middleware/error";
import { logger } from "../../logger";
import { transitionEvent } from "./transitionEvent";
import { decideTarget, type LifecycleCandidate } from "./scheduleDecisions";

// DRAFT..ARCHIVED is at most 6 hops; bounds one candidate's intra-tick cascade so a
// pathological backlog can't make a single tick run unbounded.
const MAX_STEPS_PER_TICK = 6;

const CANDIDATE_SELECT = {
  id: true,
  status: true,
  registrationOpensAt: true,
  registrationDeadline: true,
  startsAt: true,
  endsAt: true,
  capacity: true,
  waitingListEnabled: true,
  autoCompleteAfterMinutes: true,
  _count: { select: { registrations: { where: { status: RegistrationStatus.REGISTERED } } } },
} as const;

type CandidateRow = {
  id: string;
  status: EventStatus;
  registrationOpensAt: Date | null;
  registrationDeadline: Date | null;
  startsAt: Date;
  endsAt: Date;
  capacity: number;
  waitingListEnabled: boolean;
  autoCompleteAfterMinutes: number;
  _count: { registrations: number };
};

function toLifecycleCandidate(row: CandidateRow): LifecycleCandidate {
  return {
    status: row.status,
    registrationOpensAt: row.registrationOpensAt,
    registrationDeadline: row.registrationDeadline,
    startsAt: row.startsAt,
    endsAt: row.endsAt,
    capacity: row.capacity,
    waitingListEnabled: row.waitingListEnabled,
    autoCompleteAfterMinutes: row.autoCompleteAfterMinutes,
    registeredCount: row._count.registrations,
  };
}

/**
 * Flips isOverdue for ONGOING events past end+grace. Not a status change, so
 * it bypasses transitionEvent by design — a plain, idempotent, set-based
 * UPDATE guarded by isOverdue=false is safe for any number of pods to run
 * concurrently, with nothing to double-write.
 */
async function flagOverdue(now: Date): Promise<void> {
  const rows = await prisma.$queryRaw<{ id: string }[]>`
    UPDATE "Event" SET "isOverdue" = true
    WHERE status = 'ONGOING' AND "isOverdue" = false
      AND "endsAt" + make_interval(mins => "gracePeriodMinutes") <= ${now}
    RETURNING id`;
  if (rows.length > 0) logger.info({ count: rows.length }, "flagged overdue events");
}

async function fetchCandidates(now: Date): Promise<CandidateRow[]> {
  return prisma.event.findMany({
    where: {
      OR: [
        { status: EventStatus.PUBLISHED, registrationOpensAt: { lte: now } },
        { status: EventStatus.REGISTRATION_OPEN, registrationDeadline: { lte: now } },
        { status: EventStatus.REGISTRATION_OPEN, startsAt: { lte: now } },
        // No time filter: an event can fill before its deadline. decideTarget's own
        // capacity check (fed by _count above) decides whether this row actually closes.
        { status: EventStatus.REGISTRATION_OPEN, waitingListEnabled: false, capacity: { gt: 0 } },
        { status: EventStatus.REGISTRATION_CLOSED, startsAt: { lte: now } },
        { status: EventStatus.ONGOING, endsAt: { lte: now } },
      ],
    },
    select: CANDIDATE_SELECT,
  });
}

/**
 * Re-counts REGISTERED seats for one event right before a capacity-driven
 * close, so a cancellation between tick-start detection and this call
 * correctly aborts the close. Deadline- and start-driven closes never call
 * this — a passed deadline or start time never un-passes.
 */
async function stillFull(eventId: string, capacity: number): Promise<boolean> {
  const registered = await prisma.registration.count({
    where: { eventId, status: RegistrationStatus.REGISTERED },
  });
  return registered >= capacity;
}

async function advanceOne(row: CandidateRow, now: Date): Promise<void> {
  let current = row;
  for (let step = 0; step < MAX_STEPS_PER_TICK; step++) {
    const candidate = toLifecycleCandidate(current);
    const to = decideTarget(candidate, now);
    if (!to) return;

    if (to === EventStatus.REGISTRATION_CLOSED && current.capacity > 0 && !current.waitingListEnabled) {
      const deadlineOrStartDriven =
        (current.registrationDeadline !== null && current.registrationDeadline <= now) ||
        current.startsAt <= now;
      if (!deadlineOrStartDriven && !(await stillFull(current.id, current.capacity))) return;
    }

    try {
      await transitionEvent(current.id, to, { type: "SYSTEM" }, "scheduler:auto-transition");
      logger.info({ eventId: current.id, from: current.status, to }, "auto-transitioned event");
    } catch (err) {
      if (err instanceof AppError && err.code === "INVALID_TRANSITION") {
        logger.debug({ eventId: current.id, to, err }, "auto-transition rejected — event already moved");
      } else {
        logger.error({ eventId: current.id, from: current.status, to, err }, "auto-transition failed");
      }
      return;
    }

    // Cascade: re-read fresh in case another boundary now applies within this same
    // tick (e.g. after downtime, both the deadline and the start time have passed).
    const refreshed = await prisma.event.findUnique({ where: { id: current.id }, select: CANDIDATE_SELECT });
    if (!refreshed) return;
    current = refreshed;
  }
}

export async function sweepEventLifecycle(): Promise<void> {
  // `SELECT now()` with no WHERE clause always returns exactly one row; the
  // fallback only exists to satisfy noUncheckedIndexedAccess and would never
  // realistically trigger.
  const nowRows = await prisma.$queryRaw<{ now: Date }[]>`SELECT now() AS now`;
  const now = nowRows[0]?.now ?? new Date();

  await flagOverdue(now);

  const candidates = await fetchCandidates(now);
  for (const candidate of candidates) {
    try {
      await advanceOne(candidate, now);
    } catch (err) {
      logger.error({ err, eventId: candidate.id }, "lifecycle sweep failed for event");
    }
  }
}
