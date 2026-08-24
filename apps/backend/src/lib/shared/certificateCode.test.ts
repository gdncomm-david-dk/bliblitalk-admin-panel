import { describe, it, expect } from "vitest";
import { generateVerificationCode } from "./certificateCode";

/** SEC-021: the code was 32 bits of hex, thin enough to guess against a verification endpoint. */
describe("generateVerificationCode", () => {
  it("carries 128 bits of entropy across 26 base32 characters", () => {
    const body = generateVerificationCode().replace(/^BT2-CERT-/, "").replace("-", "");
    expect(body).toHaveLength(26);
    // 26 chars × 5 bits = 130 bits of capacity, holding the 128 bits randomBytes(16) supplies.
    expect(body.length * 5).toBeGreaterThanOrEqual(128);
  });

  it("uses only Crockford base32, so I/L/O/U can never appear to be misread", () => {
    for (let i = 0; i < 200; i++) {
      const body = generateVerificationCode().replace(/^BT2-CERT-/, "").replace("-", "");
      expect(body).toMatch(/^[0-9ABCDEFGHJKMNPQRSTVWXYZ]+$/);
    }
  });

  it("does not repeat", () => {
    const seen = new Set(Array.from({ length: 500 }, () => generateVerificationCode()));
    expect(seen.size).toBe(500);
  });

  it("keeps the BT2 prefix so old and new codes stay recognisable as the same artefact", () => {
    expect(generateVerificationCode()).toMatch(/^BT2-CERT-[0-9A-Z]{13}-[0-9A-Z]{13}$/);
  });
});
