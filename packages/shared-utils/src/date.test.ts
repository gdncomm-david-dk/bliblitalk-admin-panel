import { describe, it, expect } from "vitest";
import dayjs from "dayjs";
import { formatTimeAgo } from "./date";

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
