import { describe, it, expect, afterEach, afterAll } from "vitest";
import request from "supertest";
import bcrypt from "bcryptjs";
import { createApp } from "../../app";
import { config } from "../../config";
import { prisma } from "../../db/client";

const LOGOUT_TEST_EMAIL = "sec007-logout-test@example.com";

// Integration tests — require a running, seeded Postgres:
//   pnpm run db:up && pnpm run db:seed
describe("auth", () => {
  const app = createApp();

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email: LOGOUT_TEST_EMAIL } });
  });

  it("rejects bad credentials", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "superadmin@gdn-commerce.com", password: "wrong" });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("INVALID_CREDENTIALS");
  });

  it("logs in, returns the user (with role), and sets a session cookie", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "superadmin@gdn-commerce.com", password: "password123" });
    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe("superadmin@gdn-commerce.com");
    expect(res.body.user.role).toBe("SUPER_ADMIN");
    const cookie = res.headers["set-cookie"]?.[0] ?? "";
    expect(cookie).toContain("blibli_talk_session");
    expect(cookie.toLowerCase()).toContain("httponly");
  });

  // Repo-split decision 4: admin auth is admin-only now — a participant account is rejected
  // the same as "not found", not merely absent from a separate admin-only route set. Mirrors
  // the equivalent population-split fix on bliblitalk-user-fe's public backend (Phase 3).
  it("rejects a participant account logging in via the admin backend", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "demo@gdn-commerce.com", password: "password123" });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("INVALID_CREDENTIALS");
  });

  it("returns the role from /auth/me for an admin user", async () => {
    const agent = request.agent(app);
    await agent
      .post("/api/auth/login")
      .send({ email: "superadmin@gdn-commerce.com", password: "password123" });
    const res = await agent.get("/api/auth/me");
    expect(res.status).toBe(200);
    expect(res.body.user.role).toBe("SUPER_ADMIN");
  });

  it("returns 422 on invalid payload", async () => {
    const res = await request(app).post("/api/auth/login").send({ email: "not-an-email" });
    expect(res.status).toBe(422);
  });

  it("requires auth for /auth/me", async () => {
    const res = await request(app).get("/api/auth/me");
    expect(res.status).toBe(401);
  });

  it("mock Microsoft sign-in signs in a known admin account", async () => {
    const res = await request(app)
      .post("/api/auth/microsoft")
      .send({ email: "superadmin@gdn-commerce.com", name: "Super Admin" });
    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe("superadmin@gdn-commerce.com");
    expect(res.body.user.role).toBe("SUPER_ADMIN");
    expect(res.headers["set-cookie"]?.[0] ?? "").toContain("blibli_talk_session");
  });

  it("mock Microsoft sign-in rejects a non-admin account", async () => {
    const res = await request(app)
      .post("/api/auth/microsoft")
      .send({ email: "demo@gdn-commerce.com", name: "User External" });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("NO_ADMIN_ACCOUNT");
  });

  it("mock Microsoft sign-in rejects an unknown account (no self-registration)", async () => {
    const res = await request(app)
      .post("/api/auth/microsoft")
      .send({ email: "no-such-account@example.com", name: "New Microsoft User" });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("NO_ADMIN_ACCOUNT");
  });

  it("SEC-007: logout revokes the session — the same cookie is rejected afterward", async () => {
    // A disposable admin user, not one of the shared seed accounts (superadmin/eventadmin):
    // this suite runs its files in parallel against one live Postgres, and every other admin
    // route test file logs in as those two accounts repeatedly — bumping their tokenVersion
    // here via logout would race and intermittently 401 an unrelated file's in-flight session.
    await prisma.user.create({
      data: {
        email: LOGOUT_TEST_EMAIL,
        name: "SEC-007 Logout Test",
        role: "SUPER_ADMIN",
        passwordHash: await bcrypt.hash("password123", 10),
      },
    });

    const login = await request(app)
      .post("/api/auth/login")
      .send({ email: LOGOUT_TEST_EMAIL, password: "password123" });
    const setCookieHeader = (login.headers["set-cookie"] as unknown as string[])[0]!;
    const cookie = setCookieHeader.split(";")[0]!;

    const stillValid = await request(app).get("/api/auth/me").set("Cookie", cookie);
    expect(stillValid.status).toBe(200);

    await request(app).post("/api/auth/logout").set("Cookie", cookie);

    const afterLogout = await request(app).get("/api/auth/me").set("Cookie", cookie);
    expect(afterLogout.status).toBe(401);
  });
});

describe("SEC-001: the mock Microsoft provider is blocked in production", () => {
  afterEach(() => {
    config.isProd = false;
  });

  it("blocks /api/auth/microsoft once NODE_ENV=production", async () => {
    config.isProd = true;
    const prodApp = createApp();
    const res = await request(prodApp)
      .post("/api/auth/microsoft")
      .send({ email: "superadmin@gdn-commerce.com", name: "Super Admin" });
    expect(res.status).toBe(404);
  });

  it("still allows the mock provider once isProd is false again", async () => {
    config.isProd = true;
    config.isProd = false; // exercise the toggle back before asserting normal behavior
    const devApp = createApp();
    const res = await request(devApp)
      .post("/api/auth/microsoft")
      .send({ email: "superadmin@gdn-commerce.com", name: "Super Admin" });
    expect(res.status).toBe(200);
  });
});
