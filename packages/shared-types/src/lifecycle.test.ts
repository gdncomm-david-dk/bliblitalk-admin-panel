import { describe, it, expect } from "vitest";
import { EventStatus } from "./enums";
import { canTransition, allowedFrom, ALLOWED_TRANSITIONS } from "./lifecycle";

describe("event lifecycle transition table", () => {
  it("allows the core happy-path transitions", () => {
    expect(canTransition(EventStatus.DRAFT, EventStatus.PUBLISHED)).toBe(true);
    expect(canTransition(EventStatus.PUBLISHED, EventStatus.REGISTRATION_OPEN)).toBe(true);
    expect(canTransition(EventStatus.REGISTRATION_OPEN, EventStatus.REGISTRATION_CLOSED)).toBe(true);
    expect(canTransition(EventStatus.REGISTRATION_CLOSED, EventStatus.ONGOING)).toBe(true);
    expect(canTransition(EventStatus.ONGOING, EventStatus.COMPLETED)).toBe(true);
    expect(canTransition(EventStatus.COMPLETED, EventStatus.ARCHIVED)).toBe(true);
  });

  it("allows reopening a closed registration before the event starts", () => {
    expect(canTransition(EventStatus.REGISTRATION_CLOSED, EventStatus.REGISTRATION_OPEN)).toBe(true);
  });

  it("allows cancelling from every pre-completion state", () => {
    for (const s of [
      EventStatus.DRAFT,
      EventStatus.PUBLISHED,
      EventStatus.REGISTRATION_OPEN,
      EventStatus.REGISTRATION_CLOSED,
      EventStatus.ONGOING,
    ]) {
      expect(canTransition(s, EventStatus.CANCELLED)).toBe(true);
    }
  });

  it("rejects nonsensical transitions", () => {
    expect(canTransition(EventStatus.COMPLETED, EventStatus.REGISTRATION_OPEN)).toBe(false);
    expect(canTransition(EventStatus.CANCELLED, EventStatus.PUBLISHED)).toBe(false);
    expect(canTransition(EventStatus.ARCHIVED, EventStatus.DRAFT)).toBe(false);
    expect(canTransition(EventStatus.DRAFT, EventStatus.ONGOING)).toBe(false);
  });

  it("never lists a state as a transition to itself", () => {
    for (const s of Object.values(EventStatus)) {
      expect(allowedFrom(s)).not.toContain(s);
    }
  });

  it("has an entry for every one of the 8 states", () => {
    expect(Object.keys(ALLOWED_TRANSITIONS).sort()).toEqual(Object.values(EventStatus).sort());
  });
});
