import { describe, expect, it } from "vitest";
import { resolveJwtSecret } from "./config";

describe("resolveJwtSecret", () => {
  it("throws in production when ADMIN_JWT_SECRET is unset", () => {
    expect(() => resolveJwtSecret({ NODE_ENV: "production" })).toThrow(/ADMIN_JWT_SECRET/);
  });

  it("throws in production for a known placeholder value", () => {
    expect(() =>
      resolveJwtSecret({ NODE_ENV: "production", ADMIN_JWT_SECRET: "dev-only-change-me" }),
    ).toThrow(/ADMIN_JWT_SECRET/);
  });

  it("throws in production for a secret shorter than 32 characters", () => {
    expect(() => resolveJwtSecret({ NODE_ENV: "production", ADMIN_JWT_SECRET: "short" })).toThrow(
      /ADMIN_JWT_SECRET/,
    );
  });

  it("accepts a sufficiently long, non-placeholder secret in production", () => {
    const secret = "a".repeat(40);
    expect(resolveJwtSecret({ NODE_ENV: "production", ADMIN_JWT_SECRET: secret })).toBe(secret);
  });

  it("falls back to the dev placeholder outside production when unset", () => {
    expect(resolveJwtSecret({ NODE_ENV: "development" })).toBe("dev-only-change-me");
  });

  it("uses an explicit secret outside production when provided", () => {
    expect(
      resolveJwtSecret({ NODE_ENV: "development", ADMIN_JWT_SECRET: "my-dev-secret" }),
    ).toBe("my-dev-secret");
  });
});
