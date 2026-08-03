import { describe, it, expect } from "vitest";
import dayjs from "dayjs";
import { formatTimeAgo, validateEventDates } from "./date";

describe("formatTimeAgo", () => {
  it("shows minutes for under an hour", () => {
    expect(formatTimeAgo(dayjs().subtract(5, "minute").toISOString())).toBe("5 minutes ago");
  });

  it("shows hours for under a day", () => {
    expect(formatTimeAgo(dayjs().subtract(3, "hour").toISOString())).toBe("3 hours ago");
  });

  it("shows days for a day or more", () => {
    expect(formatTimeAgo(dayjs().subtract(2, "day").toISOString())).toBe("2 days ago");
  });

  it("uses singular units", () => {
    expect(formatTimeAgo(dayjs().subtract(1, "hour").toISOString())).toBe("1 hour ago");
  });
});

describe("validateEventDates", () => {
  it("returns null when all fields are empty", () => {
    expect(validateEventDates({})).toBeNull();
  });

  it("returns null for a fully valid ordering", () => {
    expect(
      validateEventDates({
        registrationOpensAt: "2026-07-01T09:00",
        registrationDeadline: "2026-07-05T17:00",
        startsAt: "2026-07-10T09:00",
        endsAt: "2026-07-10T17:00",
      }),
    ).toBeNull();
  });

  it("flags registration open after the deadline", () => {
    expect(
      validateEventDates({ registrationOpensAt: "2026-07-06T09:00", registrationDeadline: "2026-07-05T17:00" }),
    ).toMatch(/on or before the registration deadline/i);
  });

  it("flags a deadline after the event start", () => {
    expect(
      validateEventDates({ registrationDeadline: "2026-07-11T09:00", startsAt: "2026-07-10T09:00" }),
    ).toMatch(/on or before the event start/i);
  });

  it("flags registration open after the event start when no deadline is set", () => {
    expect(
      validateEventDates({ registrationOpensAt: "2026-07-11T09:00", startsAt: "2026-07-10T09:00" }),
    ).toMatch(/on or before the event start/i);
  });

  it("flags start equal to end (must be strictly before)", () => {
    expect(
      validateEventDates({ startsAt: "2026-07-10T09:00", endsAt: "2026-07-10T09:00" }),
    ).toMatch(/end must be after/i);
  });

  it("flags start after end", () => {
    expect(
      validateEventDates({ startsAt: "2026-07-10T18:00", endsAt: "2026-07-10T09:00" }),
    ).toMatch(/end must be after/i);
  });

  it("returns null when only start+end are present and valid", () => {
    expect(validateEventDates({ startsAt: "2026-07-10T09:00", endsAt: "2026-07-10T17:00" })).toBeNull();
  });
});
