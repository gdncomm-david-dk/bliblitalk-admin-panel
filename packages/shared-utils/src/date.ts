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
