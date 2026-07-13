import { describe, it, expect } from "vitest";
import { statusColor, statusLabel } from "./statusColor";

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

  it("falls back to blue for unknown statuses", () => {
    expect(statusColor("SOMETHING_ELSE")).toBe("blue");
  });
});

describe("statusLabel", () => {
  it("humanizes known statuses", () => {
    expect(statusLabel("WAITING")).toBe("Waiting list");
    expect(statusLabel("SHORTLISTED")).toBe("Shortlisted");
  });
});
