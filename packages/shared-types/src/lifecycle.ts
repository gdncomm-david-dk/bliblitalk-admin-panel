import { EventStatus } from "./enums";

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
