import { describe, expect, it } from "vitest";
import request from "supertest";
import express from "express";
import { createAuthRateLimiter } from "./rateLimit";

function buildTestApp() {
  const app = express();
  app.use(createAuthRateLimiter());
  app.get("/probe", (_req, res) => res.json({ ok: true }));
  return app;
}

describe("createAuthRateLimiter", () => {
  it("allows requests under the limit and blocks the request that exceeds it", async () => {
    const app = buildTestApp();

    for (let i = 0; i < 50; i++) {
      const res = await request(app).get("/probe");
      expect(res.status).toBe(200);
    }

    const blocked = await request(app).get("/probe");
    expect(blocked.status).toBe(429);
    expect(blocked.body.code).toBe("TOO_MANY_REQUESTS");
    expect(blocked.headers["ratelimit-limit"]).toBeDefined();
  }, 20000);

  it("gives each app instance its own independent limit (no shared state across apps)", async () => {
    const appA = buildTestApp();
    const appB = buildTestApp();

    for (let i = 0; i < 50; i++) {
      const res = await request(appA).get("/probe");
      expect(res.status).toBe(200);
    }
    await request(appA).get("/probe").expect(429);

    // A fresh app must not inherit appA's exhausted count.
    const freshRes = await request(appB).get("/probe");
    expect(freshRes.status).toBe(200);
  }, 20000);
});
