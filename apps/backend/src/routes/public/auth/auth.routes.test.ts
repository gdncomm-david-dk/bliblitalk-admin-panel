import { describe, it, expect, beforeEach, afterAll } from "vitest";
import request from "supertest";
import { createApp } from "../../../app";
import { prisma } from "../../../db/client";

const REG_EMAIL = "signup-test@example.com";

async function purgeSignupUser() {
  await prisma.user.deleteMany({ where: { email: REG_EMAIL } });
}

// Integration tests — require a running, seeded Postgres:
//   pnpm run db:up && pnpm run db:seed
describe("auth", () => {
  const app = createApp();

  beforeEach(purgeSignupUser);
  afterAll(purgeSignupUser);

  it("rejects bad credentials", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "demo@gdn-commerce.com", password: "wrong" });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("INVALID_CREDENTIALS");
  });

  it("logs in, returns the user (with role), and sets a session cookie", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "demo@gdn-commerce.com", password: "password123" });
    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe("demo@gdn-commerce.com");
    expect(res.body.user.role).toBe("PARTICIPANT");
    const cookie = res.headers["set-cookie"]?.[0] ?? "";
    expect(cookie).toContain("blibli_talk_session");
    expect(cookie.toLowerCase()).toContain("httponly");
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

  it("registers an email participant (with password), sets a session, then can log in", async () => {
    const agent = request.agent(app);
    const res = await agent.post("/api/auth/register").send({
      fullName: "Signup Tester",
      email: REG_EMAIL,
      password: "supersecret",
      phone: "+62 812 3456 7890",
      institution: "Test University",
      role: "Student",
      yearsOfExperience: "1-3 years",
    });
    expect(res.status).toBe(201);
    expect(res.body.user.email).toBe(REG_EMAIL);
    expect(res.body.user.role).toBe("PARTICIPANT");
    expect(res.body.user.institution).toBe("Test University");

    // Session is live and the chosen password works for password login.
    const me = await agent.get("/api/auth/me");
    expect(me.status).toBe(200);
    const login = await request(app)
      .post("/api/auth/login")
      .send({ email: REG_EMAIL, password: "supersecret" });
    expect(login.status).toBe(200);
  });

  it("rejects email registration without a password (422) and duplicates (409)", async () => {
    const noPw = await request(app).post("/api/auth/register").send({
      fullName: "No Password",
      email: REG_EMAIL,
      phone: "+62 811 1111 1111",
    });
    expect(noPw.status).toBe(422);

    await request(app).post("/api/auth/register").send({
      fullName: "First",
      email: REG_EMAIL,
      password: "supersecret",
      phone: "+62 811 1111 1111",
    });
    const dup = await request(app).post("/api/auth/register").send({
      fullName: "Second",
      email: REG_EMAIL,
      password: "supersecret",
      phone: "+62 822 2222 2222",
    });
    expect(dup.status).toBe(409);
    expect(dup.body.error.code).toBe("EMAIL_TAKEN");
  });

  it("mock Google sign-in signs in a known account", async () => {
    const res = await request(app)
      .post("/api/auth/google")
      .send({ email: "demo@gdn-commerce.com", name: "User External" });
    expect(res.status).toBe(200);
    expect(res.body.registered).toBe(true);
    expect(res.body.user.email).toBe("demo@gdn-commerce.com");
    expect(res.headers["set-cookie"]?.[0] ?? "").toContain("blibli_talk_session");
  });

  it("mock Google sign-in reports an unknown account for registration", async () => {
    const res = await request(app)
      .post("/api/auth/google")
      .send({ email: REG_EMAIL, name: "New Google User" });
    expect(res.status).toBe(200);
    expect(res.body.registered).toBe(false);
    expect(res.body.profile.email).toBe(REG_EMAIL);
  });

  it("registers a Google participant without a password", async () => {
    const res = await request(app).post("/api/auth/register").send({
      fullName: "Google Person",
      email: REG_EMAIL,
      provider: "google",
      phone: "+62 813 0000 0000",
    });
    expect(res.status).toBe(201);
    expect(res.body.user.email).toBe(REG_EMAIL);
    // Google account cannot password-login (no usable hash).
    const login = await request(app)
      .post("/api/auth/login")
      .send({ email: REG_EMAIL, password: "anything" });
    expect(login.status).toBe(401);
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
      .send({ email: REG_EMAIL, name: "New Microsoft User" });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("NO_ADMIN_ACCOUNT");
  });
});
