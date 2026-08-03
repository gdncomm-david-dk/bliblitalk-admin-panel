import { describe, expect, it } from "vitest";
import { resolveSeedPassword } from "./seedConfig";

describe("resolveSeedPassword", () => {
  it("throws when SEED_ADMIN_PASSWORD is not set", () => {
    expect(() => resolveSeedPassword({})).toThrow(/SEED_ADMIN_PASSWORD/);
  });

  it("throws when SEED_ADMIN_PASSWORD is empty", () => {
    expect(() => resolveSeedPassword({ SEED_ADMIN_PASSWORD: "" })).toThrow(/SEED_ADMIN_PASSWORD/);
  });

  it("returns the configured password when set", () => {
    expect(resolveSeedPassword({ SEED_ADMIN_PASSWORD: "local-dev-pw" })).toBe("local-dev-pw");
  });
});
