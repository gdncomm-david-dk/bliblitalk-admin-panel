import { describe, it, expect } from "vitest";
import request from "supertest";
import pino from "pino";
import express from "express";
import { createApp, createRequestLogger } from "./app";
import { logger } from "./logger";

describe("app", () => {
  it("GET /health returns ok", async () => {
    const res = await request(createApp()).get("/api/health");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
  });

  // This app issues no cookie of its own any more, but Apps Gateway's SSO cookie is still
  // sent on every same-origin request and lands in req.headers.cookie — so the redaction
  // these two tests pin down matters more after the migration, not less.
  it("never writes a request's session cookie to the logs", async () => {
    const secretSessionValue = "topsecret-session-jwt-9f3e";
    const chunks: string[] = [];
    const captured = { write: (chunk: string) => chunks.push(chunk) };
    const testLogger = pino({ level: logger.level }, captured);

    const app = express();
    // Same middleware factory createApp() uses in production, just with a capturing logger.
    app.use(createRequestLogger(testLogger));
    app.get("/probe", (_req, res) => res.json({ ok: true }));

    await request(app).get("/probe").set("Cookie", `blibli_talk_session=${secretSessionValue}`);

    const output = chunks.join("");
    expect(output).not.toContain(secretSessionValue);
    expect(output).toContain("[Redacted]");
  });

  it("SEC-006: never writes a response's session cookie (Set-Cookie) to the logs", async () => {
    const secretSessionValue = "topsecret-response-cookie-4d2b";
    const chunks: string[] = [];
    const captured = { write: (chunk: string) => chunks.push(chunk) };
    const testLogger = pino({ level: logger.level }, captured);

    const app = express();
    app.use(createRequestLogger(testLogger));
    app.get("/probe", (_req, res) => {
      res.cookie("blibli_talk_session", secretSessionValue, { httpOnly: true });
      res.json({ ok: true });
    });

    await request(app).get("/probe");

    const output = chunks.join("");
    expect(output).not.toContain(secretSessionValue);
    expect(output).toContain("[Redacted]");
  });

  // Must match the `limit` in createAdminApiRateLimiter (rateLimit.ts) — the test drives the
  // real ceiling rather than a guess. Since the Apps Gateway migration the limiter guards
  // /api/admin (the gateway is what stops unauthenticated traffic); it is a blast-radius cap,
  // not an auth control, which is why the ceiling is generous.
  const ADMIN_API_LIMIT = 600;

  it("SEC-005 follow-up: rate limit buckets by the real client IP behind the documented single-hop proxy", async () => {
    const app = createApp();

    // No X-User-Id, so every one of these is refused by requireAuth before touching the DB.
    for (let i = 0; i < ADMIN_API_LIMIT; i++) {
      const res = await request(app).get("/api/admin/dashboard").set("X-Forwarded-For", "203.0.113.1");
      expect(res.status).toBe(401);
    }
    await request(app).get("/api/admin/dashboard").set("X-Forwarded-For", "203.0.113.1").expect(429);

    // A different client IP behind the same proxy must get its own bucket, not share
    // the exhausted one — proves trust proxy is actually keying off X-Forwarded-For
    // rather than the proxy's own socket address.
    const otherClient = await request(app).get("/api/admin/dashboard").set("X-Forwarded-For", "203.0.113.2");
    expect(otherClient.status).toBe(401);
  }, 60000);
});
