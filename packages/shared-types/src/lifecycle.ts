import { EventStatus } from "./enums";
import type { NextAutoTransition } from "./schemas";

/**
 * Single source of truth for legal event-status transitions (PRD §2.2).
 * Auto vs manual triggering is decided by callers (scheduler vs admin action);
 * this table only encodes which (from -> to) pairs are legal at all.
 */
export const ALLOWED_TRANSITIONS: Record<EventStatus, EventStatus[]> = {
  [EventStatus.DRAFT]: [EventStatus.PUBLISHED, EventStatus.CANCELLED],
  [EventStatus.PUBLISHED]: [
    EventStatus.REGISTRATION_OPEN,
    EventStatus.CANCELLED,
  ],
  [EventStatus.REGISTRATION_OPEN]: [
    EventStatus.REGISTRATION_CLOSED,
    EventStatus.CANCELLED,
  ],
  [EventStatus.REGISTRATION_CLOSED]: [
    EventStatus.REGISTRATION_OPEN, // manual reopen before start
    EventStatus.ONGOING,
    EventStatus.CANCELLED,
  ],
  [EventStatus.ONGOING]: [EventStatus.COMPLETED, EventStatus.CANCELLED],
  [EventStatus.COMPLETED]: [EventStatus.ARCHIVED],
  [EventStatus.CANCELLED]: [EventStatus.ARCHIVED],
  [EventStatus.ARCHIVED]: [],
};

export function allowedFrom(from: EventStatus): EventStatus[] {
  return ALLOWED_TRANSITIONS[from] ?? [];
}

export function canTransition(from: EventStatus, to: EventStatus): boolean {
  return allowedFrom(from).includes(to);
}

/**
 * Whether an event has finished, in the sense that certificates may be issued for it.
 *
 * Lives here, in the mirrored package, because three call sites in two repos must agree on
 * it: bliblitalk-user-fe gates the certificate download on it and derives the My Events
 * `certificateAvailable` flag from it, and bliblitalk-admin's bulk issue refuses to run before
 * it. They previously disagreed — attendance alone was treated as enough — which let a
 * certificate be issued for an event that had not happened yet. A local copy per repo is
 * exactly how that drift returns.
 *
 * ARCHIVED counts: per ALLOWED_TRANSITIONS it is only reachable from COMPLETED or CANCELLED,
 * and filing a finished event away must not revoke the certificates its attendees earned.
 * CANCELLED does not count — the event never ran, so there is nothing to certify. ONGOING does
 * not either, even past its end time: the scheduler moves it to COMPLETED, and stored status is
 * the authority rather than a clock comparison.
 */
export function isEventFinished(status: EventStatus): boolean {
  return status === EventStatus.COMPLETED || status === EventStatus.ARCHIVED;
}

/**
 * Display-only hint for the FE: the next time-based transition the scheduler
 * will make and when. Computed from timestamps for the FE countdown; it never
 * drives the badge (the badge mirrors stored status + isOverdue). Lives next to
 * ALLOWED_TRANSITIONS so the display mirror of the transition table cannot
 * drift from the engine that actually drives it (apps/backend's decideTarget).
 */
export function computeNextAutoTransition(e: {
  status: EventStatus;
  registrationOpensAt: Date | null;
  registrationDeadline: Date | null;
  startsAt: Date;
  endsAt: Date;
}): NextAutoTransition {
  switch (e.status) {
    case EventStatus.PUBLISHED:
      return e.registrationOpensAt
        ? { to: EventStatus.REGISTRATION_OPEN, at: e.registrationOpensAt.toISOString() }
        : null;
    case EventStatus.REGISTRATION_OPEN:
      return e.registrationDeadline
        ? { to: EventStatus.REGISTRATION_CLOSED, at: e.registrationDeadline.toISOString() }
        : null;
    case EventStatus.REGISTRATION_CLOSED:
      return { to: EventStatus.ONGOING, at: e.startsAt.toISOString() };
    case EventStatus.ONGOING:
      return { to: EventStatus.COMPLETED, at: e.endsAt.toISOString() };
    default:
      return null;
  }
}
