import { describe, expect, it } from "vitest";
import request from "supertest";
import express from "express";
import { createAdminApiRateLimiter } from "./rateLimit";

/** Must match the `limit` in rateLimit.ts — the test asserts the real ceiling, not a guess. */
const LIMIT = 600;

function buildTestApp() {
  const app = express();
  app.use(createAdminApiRateLimiter());
  app.get("/probe", (_req, res) => res.json({ ok: true }));
  return app;
}

describe("createAdminApiRateLimiter", () => {
  it("allows requests under the limit and blocks the request that exceeds it", async () => {
    const app = buildTestApp();

    for (let i = 0; i < LIMIT; i++) {
      const res = await request(app).get("/probe");
      expect(res.status).toBe(200);
    }

    const blocked = await request(app).get("/probe");
    expect(blocked.status).toBe(429);
    expect(blocked.body.code).toBe("TOO_MANY_REQUESTS");
    expect(blocked.headers["ratelimit-limit"]).toBeDefined();
  }, 30000);

  it("gives each app instance its own independent limit (no shared state across apps)", async () => {
    const appA = buildTestApp();
    const appB = buildTestApp();

    for (let i = 0; i < LIMIT; i++) {
      const res = await request(appA).get("/probe");
      expect(res.status).toBe(200);
    }
    await request(appA).get("/probe").expect(429);

    // A fresh app must not inherit appA's exhausted count.
    const freshRes = await request(appB).get("/probe");
    expect(freshRes.status).toBe(200);
  }, 30000);
});
