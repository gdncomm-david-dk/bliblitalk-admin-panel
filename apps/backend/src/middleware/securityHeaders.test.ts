import { describe, expect, it } from "vitest";
import request from "supertest";
import express from "express";
import { createApp } from "../app";
import { createSecurityHeaders, uploadsNoSniff } from "./securityHeaders";

function buildTestApp() {
  const app = express();
  app.use(createSecurityHeaders());
  app.get("/probe", (_req, res) => res.json({ ok: true }));
  return app;
}

/** Parses `a 'self'; b 'none'` into { a: "a 'self'", b: "b 'none'" }. */
function directives(csp: string): Record<string, string> {
  return Object.fromEntries(
    csp
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => [part.split(/\s+/)[0], part]),
  );
}

describe("createSecurityHeaders", () => {
  it("sets a CSP that blocks inline script but allows inline style", async () => {
    const res = await request(buildTestApp()).get("/probe");
    const csp = directives(res.headers["content-security-policy"] ?? "");

    // The whole point of the policy: injected <script> and injected style behave differently,
    // and only the second one is tolerated.
    expect(csp["script-src"]).toBe("script-src 'self'");
    expect(csp["script-src"]).not.toContain("unsafe-inline");
    expect(csp["style-src"]).toContain("'unsafe-inline'");
  });

  it("denies framing and plugin content, and pins the base URI and form targets", async () => {
    const res = await request(buildTestApp()).get("/probe");
    const csp = directives(res.headers["content-security-policy"] ?? "");

    expect(csp["frame-ancestors"]).toBe("frame-ancestors 'none'");
    expect(csp["object-src"]).toBe("object-src 'none'");
    expect(csp["base-uri"]).toBe("base-uri 'self'");
    expect(csp["form-action"]).toBe("form-action 'self'");
  });

  it("allows external https images — admin-entered banner/thumbnail URLs are not same-origin", async () => {
    const res = await request(buildTestApp()).get("/probe");
    const csp = directives(res.headers["content-security-policy"] ?? "");

    expect(csp["img-src"]).toContain("https:");
    // http: images stay blocked — mixed content is exactly what the relaxation must not buy.
    expect(csp["img-src"]).not.toContain("http:");
  });

  it("sets nosniff and a referrer policy, and leaves HSTS to the gateway", async () => {
    const res = await request(buildTestApp()).get("/probe");

    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
    expect(res.headers["strict-transport-security"]).toBeUndefined();
  });
});

describe("uploadsNoSniff", () => {
  it("marks uploaded files as non-sniffable regardless of their declared type", async () => {
    const app = express();
    app.use("/api/uploads", uploadsNoSniff, (_req, res) => res.type("image/gif").send("<html>"));

    const res = await request(app).get("/api/uploads/anything.gif");
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
  });
});

describe("createApp", () => {
  it("serves the policy on real responses and never advertises the framework", async () => {
    const res = await request(createApp()).get("/api/health");

    expect(res.status).toBe(200);
    expect(res.headers["content-security-policy"]).toContain("frame-ancestors 'none'");
    expect(res.headers["x-powered-by"]).toBeUndefined();
  });

  it("still restricts a 404, which never reaches a router", async () => {
    const res = await request(createApp()).get("/definitely-not-a-route");

    expect(res.status).toBe(404);
    // Express's finalhandler writes its own `default-src 'none'` over ours on the error page.
    // Strictly tighter than our policy, so it is left alone — but the header must be there,
    // which is what actually gets checked.
    expect(res.headers["content-security-policy"]).toContain("'none'");
    expect(res.headers["x-powered-by"]).toBeUndefined();
  });
});
