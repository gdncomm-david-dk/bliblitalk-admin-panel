import { describe, it, expect } from "vitest";
import { Role } from "@repo/shared-types";
import { toSessionClaims } from "./claims";

/**
 * bliblitalk-user-fe's review Finding 16. The old implementation defaulted a missing or
 * malformed `role` to PARTICIPANT and a missing `tokenVersion` to 0, which quietly
 * manufactured a valid session out of a token that never carried one.
 */
const valid = { sub: "usr_1", email: "sinta@example.com", role: Role.PARTICIPANT, tokenVersion: 3 };

describe("toSessionClaims", () => {
  it("accepts a well-formed payload unchanged", () => {
    expect(toSessionClaims(valid)).toEqual(valid);
  });

  it("rejects a non-object payload", () => {
    for (const v of [null, undefined, "string", 42, []]) {
      expect(toSessionClaims(v)).toBeNull();
    }
  });

  it("rejects a missing or non-string subject or email", () => {
    expect(toSessionClaims({ ...valid, sub: undefined })).toBeNull();
    expect(toSessionClaims({ ...valid, email: 7 })).toBeNull();
  });

  it("rejects an absent role instead of assuming PARTICIPANT", () => {
    const { role: _role, ...noRole } = valid;
    expect(toSessionClaims(noRole)).toBeNull();
  });

  it("rejects a role that is not in the enum", () => {
    expect(toSessionClaims({ ...valid, role: "SUPER_ADMIN_X" })).toBeNull();
    expect(toSessionClaims({ ...valid, role: 1 })).toBeNull();
  });

  /**
   * The sharpest case: `tokenVersion: 0` is a legitimate value — it is what every user who
   * has never logged out carries. Defaulting to it meant a token with no such claim compared
   * equal to their current version and survived the SEC-007 revocation check.
   */
  it("rejects an absent tokenVersion rather than defaulting it to a value that matches a real user", () => {
    const { tokenVersion: _tv, ...noVersion } = valid;
    expect(toSessionClaims(noVersion)).toBeNull();
  });

  it("rejects a non-integer or non-numeric tokenVersion", () => {
    expect(toSessionClaims({ ...valid, tokenVersion: "3" })).toBeNull();
    expect(toSessionClaims({ ...valid, tokenVersion: 3.5 })).toBeNull();
    expect(toSessionClaims({ ...valid, tokenVersion: NaN })).toBeNull();
  });

  it("still accepts tokenVersion 0 when the claim is actually present", () => {
    expect(toSessionClaims({ ...valid, tokenVersion: 0 })?.tokenVersion).toBe(0);
  });
});
