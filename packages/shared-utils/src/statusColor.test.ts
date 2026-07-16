import { describe, it, expect } from "vitest";
import { statusColor, statusLabel, isEventLive } from "./statusColor";

describe("statusColor", () => {
  it("maps registration statuses", () => {
    expect(statusColor("REGISTERED")).toBe("blue");
    expect(statusColor("WAITING")).toBe("orange");
    expect(statusColor("REJECTED")).toBe("red");
    expect(statusColor("SHORTLISTED")).toBe("purple");
    expect(statusColor("CANCELLED")).toBe("red");
  });

  it("maps event statuses", () => {
    expect(statusColor("PUBLISHED")).toBe("blue");
    expect(statusColor("REGISTRATION_CLOSED")).toBe("orange");
    expect(statusColor("COMPLETED")).toBe("green");
  });

  it("maps the newly-added 8-state event statuses", () => {
    expect(statusColor("REGISTRATION_OPEN")).toBe("blue");
    expect(statusColor("ONGOING")).toBe("red");
    expect(statusColor("ARCHIVED")).toBe("orange");
  });

  it("falls back to blue for unknown statuses", () => {
    expect(statusColor("SOMETHING_ELSE")).toBe("blue");
  });
});

describe("statusLabel", () => {
  it("humanizes known statuses", () => {
    expect(statusLabel("WAITING")).toBe("Waiting list");
    expect(statusLabel("SHORTLISTED")).toBe("Shortlisted");
  });

  it("humanizes the newly-added 8-state event statuses", () => {
    expect(statusLabel("REGISTRATION_OPEN")).toBe("Registration Open");
    expect(statusLabel("ONGOING")).toBe("Ongoing");
    expect(statusLabel("ARCHIVED")).toBe("Archived");
  });
});

describe("isEventLive", () => {
  it("is true for ONGOING within the event window", () => {
    const now = Date.now();
    expect(
      isEventLive({
        status: "ONGOING",
        startsAt: new Date(now - 1000).toISOString(),
        endsAt: new Date(now + 1000).toISOString(),
      }),
    ).toBe(true);
  });

  it("is false for ONGOING outside the event window", () => {
    const now = Date.now();
    expect(
      isEventLive({
        status: "ONGOING",
        startsAt: new Date(now - 10000).toISOString(),
        endsAt: new Date(now - 1000).toISOString(),
      }),
    ).toBe(false);
  });

  it("is false for a status that never counts as live", () => {
    const now = Date.now();
    expect(
      isEventLive({
        status: "COMPLETED",
        startsAt: new Date(now - 1000).toISOString(),
        endsAt: new Date(now + 1000).toISOString(),
      }),
    ).toBe(false);
  });
});
