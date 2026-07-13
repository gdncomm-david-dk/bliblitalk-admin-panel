import dayjs from "dayjs";

/** Human-friendly event date, e.g. "Mon, 14 Jul 2026 · 14:00". */
export function formatEventDate(iso: string): string {
  return dayjs(iso).format("ddd, DD MMM YYYY · HH:mm");
}

/** Short date, e.g. "14 Jul 2026". */
export function formatShortDate(iso: string): string {
  return dayjs(iso).format("DD MMM YYYY");
}
