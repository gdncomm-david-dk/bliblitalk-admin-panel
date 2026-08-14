import { describe, it, expect, vi } from "vitest";
import type { Request, Response } from "express";
import request from "supertest";
import { Role } from "@repo/shared-types";
import { requireRole, USER_ID_HEADER } from "./requireAuth";
import { AppError } from "./error";
import { createApp } from "../app";

function run(role: Role | undefined, allowed: Role[]) {
  const req = { userRole: role } as Request;
  const res = {} as Response;
  const next = vi.fn();
  requireRole(allowed)(req, res, next);
  return next.mock.calls[0]?.[0] as AppError | undefined;
}

describe("requireRole", () => {
  it("passes through when the role is allowed", () => {
    const err = run(Role.SUPER_ADMIN, [Role.SUPER_ADMIN, Role.EVENT_ADMIN]);
    expect(err).toBeUndefined();
  });

  it("401s when unauthenticated (no role on the request)", () => {
    const err = run(undefined, [Role.SUPER_ADMIN]);
    expect(err).toBeInstanceOf(AppError);
    expect(err?.status).toBe(401);
  });

  it("403s when the role is not permitted", () => {
    const err = run(Role.PARTICIPANT, [Role.SUPER_ADMIN, Role.EVENT_ADMIN]);
    expect(err).toBeInstanceOf(AppError);
    expect(err?.status).toBe(403);
    expect(err?.code).toBe("FORBIDDEN");
  });
});

// Integration — requires a running, seeded Postgres (same convention as the route tests).
describe("requireAuth (Apps Gateway identity)", () => {
  const app = createApp();

  it("401s when the gateway header is absent", async () => {
    const res = await request(app).get("/api/me");
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("UNAUTHORIZED");
  });

  it("401s on an empty header value rather than treating it as a user", async () => {
    const res = await request(app).get("/api/me").set(USER_ID_HEADER, "");
    expect(res.status).toBe(401);
  });

  it("resolves the User row by email and admits an admin", async () => {
    const res = await request(app).get("/api/me").set(USER_ID_HEADER, "superadmin@gdn-commerce.com");
    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe("superadmin@gdn-commerce.com");
    expect(res.body.user.role).toBe("SUPER_ADMIN");
  });

  // 403, deliberately not 401: the gateway has already authenticated this person, so a 401
  // would send the browser back to a login page it can complete instantly — a redirect loop.
  it("403s a real user who holds no Admin CMS role", async () => {
    const res = await request(app).get("/api/me").set(USER_ID_HEADER, "demo@gdn-commerce.com");
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("NO_ADMIN_ACCOUNT");
  });

  it("403s an email with no account at all, giving nothing away about which it was", async () => {
    const res = await request(app).get("/api/me").set(USER_ID_HEADER, "nobody-here@gdn-commerce.com");
    expect(res.status).toBe(403);
  });

  // Review Finding 16: account creation lowercases the address, this lookup did not, so an
  // identity provider forwarding the address as the user typed it produced a spurious 403.
  it("resolves the account whatever case the gateway forwards the address in", async () => {
    const res = await request(app)
      .get("/api/me")
      .set(USER_ID_HEADER, "SuperAdmin@GDN-Commerce.com");
    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe("superadmin@gdn-commerce.com");
  });

  it("tolerates surrounding whitespace in the forwarded header", async () => {
    const res = await request(app).get("/api/me").set(USER_ID_HEADER, "  superadmin@gdn-commerce.com  ");
    expect(res.status).toBe(200);
  });
});
