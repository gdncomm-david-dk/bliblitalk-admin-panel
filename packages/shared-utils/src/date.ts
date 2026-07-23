import dayjs from "dayjs";

/** Human-friendly event date, e.g. "Mon, 14 Jul 2026 · 14:00". */
export function formatEventDate(iso: string): string {
  return dayjs(iso).format("ddd, DD MMM YYYY · HH:mm");
}

/** Short date, e.g. "14 Jul 2026". */
export function formatShortDate(iso: string): string {
  return dayjs(iso).format("DD MMM YYYY");
}

/** Coarse "N unit ago" for a past timestamp, e.g. "5 minutes ago", "3 hours ago", "2 days ago". */
export function formatTimeAgo(iso: string | Date): string {
  const then = dayjs(iso);
  const minutes = dayjs().diff(then, "minute");
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  const hours = dayjs().diff(then, "hour");
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = dayjs().diff(then, "day");
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

export interface EventDateFields {
  registrationOpensAt?: string | null;
  registrationDeadline?: string | null;
  startsAt?: string | null;
  endsAt?: string | null;
}

/**
 * Returns the first date-ordering violation message, or null when the *present* fields satisfy
 * registrationOpensAt ≤ registrationDeadline ≤ startsAt < endsAt. Each rule is checked only when
 * both of its operands are present, so a partially-filled form never reports a spurious error.
 */
export function validateEventDates(f: EventDateFields): string | null {
  const opens = f.registrationOpensAt ? dayjs(f.registrationOpensAt) : null;
  const deadline = f.registrationDeadline ? dayjs(f.registrationDeadline) : null;
  const starts = f.startsAt ? dayjs(f.startsAt) : null;
  const ends = f.endsAt ? dayjs(f.endsAt) : null;

  if (opens && deadline && opens.isAfter(deadline))
    return "Registration open time must be on or before the registration deadline.";
  if (deadline && starts && deadline.isAfter(starts))
    return "Registration deadline must be on or before the event start.";
  if (opens && starts && opens.isAfter(starts))
    return "Registration open time must be on or before the event start.";
  if (starts && ends && !starts.isBefore(ends))
    return "Event end must be after the event start.";
  return null;
}
