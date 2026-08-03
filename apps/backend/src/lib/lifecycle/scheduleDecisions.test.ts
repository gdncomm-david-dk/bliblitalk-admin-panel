import { describe, it, expect } from "vitest";
import { EventStatus } from "@repo/shared-types";
import { decideTarget, type LifecycleCandidate } from "./scheduleDecisions";

const NOW = new Date("2026-08-01T12:00:00Z");
const PAST = new Date("2026-07-01T00:00:00Z");
const FUTURE = new Date("2026-09-01T00:00:00Z");

function base(overrides: Partial<LifecycleCandidate>): LifecycleCandidate {
  return {
    status: EventStatus.PUBLISHED,
    registrationOpensAt: null,
    registrationDeadline: null,
    startsAt: FUTURE,
    endsAt: FUTURE,
    capacity: 0,
    waitingListEnabled: true,
    autoCompleteAfterMinutes: 2880,
    registeredCount: 0,
    ...overrides,
  };
}

describe("decideTarget", () => {
  it("opens registration once registrationOpensAt has passed", () => {
    expect(decideTarget(base({ status: EventStatus.PUBLISHED, registrationOpensAt: PAST }), NOW)).toBe(
      EventStatus.REGISTRATION_OPEN,
    );
  });

  it("does not open registration before registrationOpensAt", () => {
    expect(decideTarget(base({ status: EventStatus.PUBLISHED, registrationOpensAt: FUTURE }), NOW)).toBeNull();
  });

  it("never auto-opens when registrationOpensAt is unset", () => {
    expect(decideTarget(base({ status: EventStatus.PUBLISHED, registrationOpensAt: null }), NOW)).toBeNull();
  });

  it("closes registration once the deadline has passed", () => {
    expect(
      decideTarget(base({ status: EventStatus.REGISTRATION_OPEN, registrationDeadline: PAST }), NOW),
    ).toBe(EventStatus.REGISTRATION_CLOSED);
  });

  it("closes registration when full and the waitlist is disabled (decision #2, OFF)", () => {
    expect(
      decideTarget(
        base({
          status: EventStatus.REGISTRATION_OPEN,
          capacity: 5,
          registeredCount: 5,
          waitingListEnabled: false,
        }),
        NOW,
      ),
    ).toBe(EventStatus.REGISTRATION_CLOSED);
  });

  it("keeps registration open when full but the waitlist is enabled (decision #2, ON)", () => {
    expect(
      decideTarget(
        base({
          status: EventStatus.REGISTRATION_OPEN,
          capacity: 5,
          registeredCount: 5,
          waitingListEnabled: true,
        }),
        NOW,
      ),
    ).toBeNull();
  });

  it("treats capacity 0 as unlimited (never closes on capacity alone)", () => {
    expect(
      decideTarget(
        base({
          status: EventStatus.REGISTRATION_OPEN,
          capacity: 0,
          registeredCount: 999,
          waitingListEnabled: false,
        }),
        NOW,
      ),
    ).toBeNull();
  });

  it("closes registration once the event's own start time has passed, even with no deadline and unlimited capacity", () => {
    // Safety net: REGISTRATION_OPEN can only reach ONGOING via REGISTRATION_CLOSED
    // (see packages/shared-types/src/lifecycle.ts), so an event with neither a
    // deadline nor a capacity cap must still close once its start time arrives, or it would never leave
    // REGISTRATION_OPEN at all.
    expect(
      decideTarget(
        base({
          status: EventStatus.REGISTRATION_OPEN,
          registrationDeadline: null,
          capacity: 0,
          waitingListEnabled: true,
          startsAt: PAST,
        }),
        NOW,
      ),
    ).toBe(EventStatus.REGISTRATION_CLOSED);
  });

  it("starts the event once startsAt has passed", () => {
    expect(decideTarget(base({ status: EventStatus.REGISTRATION_CLOSED, startsAt: PAST }), NOW)).toBe(
      EventStatus.ONGOING,
    );
  });

  it("does not start the event before startsAt", () => {
    expect(decideTarget(base({ status: EventStatus.REGISTRATION_CLOSED, startsAt: FUTURE }), NOW)).toBeNull();
  });

  it("auto-completes once endsAt + autoCompleteAfterMinutes has passed", () => {
    const endsAt = new Date(NOW.getTime() - 10 * 60_000); // 10 min ago
    expect(
      decideTarget(base({ status: EventStatus.ONGOING, endsAt, autoCompleteAfterMinutes: 5 }), NOW),
    ).toBe(EventStatus.COMPLETED);
  });

  it("does not auto-complete before endsAt + autoCompleteAfterMinutes", () => {
    const endsAt = new Date(NOW.getTime() - 2 * 60_000); // 2 min ago
    expect(
      decideTarget(base({ status: EventStatus.ONGOING, endsAt, autoCompleteAfterMinutes: 30 }), NOW),
    ).toBeNull();
  });

  it.each([EventStatus.DRAFT, EventStatus.COMPLETED, EventStatus.CANCELLED, EventStatus.ARCHIVED])(
    "never drives a decision for terminal/manual state %s",
    (status) => {
      expect(decideTarget(base({ status, startsAt: PAST, endsAt: PAST, registrationOpensAt: PAST }), NOW)).toBeNull();
    },
  );
});
