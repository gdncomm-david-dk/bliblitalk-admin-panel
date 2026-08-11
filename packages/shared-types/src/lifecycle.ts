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
