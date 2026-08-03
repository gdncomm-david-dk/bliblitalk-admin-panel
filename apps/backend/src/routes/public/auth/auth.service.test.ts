import { describe, it, expect } from "vitest";
import jwt from "jsonwebtoken";
import { config } from "../../../config";
import { verifyToken } from "./auth.service";

describe("auth.service", () => {
  it("SEC-020: rejects a token signed with an algorithm other than HS256", () => {
    const forged = jwt.sign(
      { sub: "user-1", email: "attacker@example.com", role: "SUPER_ADMIN", tokenVersion: 0 },
      config.jwtSecret,
      { algorithm: "HS384" },
    );

    expect(verifyToken(forged)).toBeNull();
  });
});
