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
});
