// Single source of truth for status → Blu color mapping.
// Upcoming/Registered = Blue, Completed = Green, Waiting = Orange, Rejected = Red, Shortlisted = Purple.

export type BluColor = "blue" | "green" | "orange" | "red" | "purple";

export const STATUS_COLOR: Record<string, BluColor> = {
  // Registration statuses
  REGISTERED: "blue",
  WAITING: "orange",
  REJECTED: "red",
  SHORTLISTED: "purple",
  CANCELLED: "red",
  // Attendance
  PRESENT: "green",
  ABSENT: "red",
  // Event statuses
  DRAFT: "orange",
  PUBLISHED: "blue",
  REGISTRATION_CLOSED: "orange",
  COMPLETED: "green",
  // Derived, not a real EventStatus — see isEventLive().
  LIVE: "red",
  // Legacy alias
  UPCOMING: "blue",
};

export function statusColor(status: string): BluColor {
  return STATUS_COLOR[status] ?? "blue";
}

const LABELS: Record<string, string> = {
  REGISTERED: "Registered",
  WAITING: "Waiting list",
  REJECTED: "Rejected",
  SHORTLISTED: "Shortlisted",
  CANCELLED: "Cancelled",
  PRESENT: "Present",
  ABSENT: "Absent",
  DRAFT: "Draft",
  PUBLISHED: "Upcoming",
  REGISTRATION_CLOSED: "Registration closed",
  COMPLETED: "Completed",
  LIVE: "Live Now",
  UPCOMING: "Upcoming",
};

export function statusLabel(status: string): string {
  return LABELS[status] ?? status;
}

/**
 * Whether an event is currently happening (now is within [startsAt, endsAt]).
 * Purely a display concern — the stored EventStatus doesn't change while live;
 * it still flips PUBLISHED/REGISTRATION_CLOSED -> COMPLETED only once endsAt passes
 * (see the API's sweepEventLifecycle scheduler).
 */
export function isEventLive(event: { status: string; startsAt: string | Date; endsAt: string | Date }): boolean {
  if (event.status !== "PUBLISHED" && event.status !== "REGISTRATION_CLOSED") return false;
  const now = Date.now();
  return now >= new Date(event.startsAt).getTime() && now <= new Date(event.endsAt).getTime();
}

/** Display-only status: swaps in the synthetic "LIVE" status while the event is happening. */
export function getEventDisplayStatus(event: {
  status: string;
  startsAt: string | Date;
  endsAt: string | Date;
}): string {
  return isEventLive(event) ? "LIVE" : event.status;
}
