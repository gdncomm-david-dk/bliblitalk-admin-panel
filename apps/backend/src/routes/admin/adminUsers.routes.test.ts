import { describe, it, expect, afterAll } from "vitest";
import request from "supertest";
import { createApp } from "../../app";
import { prisma } from "../../db/client";

const SEC007_EMAIL = "sec007-role-change-test@example.com";

describe("admin users", () => {
  const app = createApp();

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email: SEC007_EMAIL } });
  });

  it("requires auth", async () => {
    const res = await request(app).get("/api/admin/users");
    expect(res.status).toBe(401);
  });

  it("rejects participants (no permission)", async () => {
    const agent = request.agent(app);
    await agent
      .post("/api/auth/login")
      .send({ email: "demo@gdn-commerce.com", password: "password123" });
    const res = await agent.get("/api/admin/users");
    expect(res.status).toBe(403);
  });

  it("returns every user in the system for a super admin (platform-wide)", async () => {
    const agent = request.agent(app);
    await agent
      .post("/api/auth/login")
      .send({ email: "superadmin@gdn-commerce.com", password: "password123" });
    const res = await agent.get("/api/admin/users?pageSize=100");
    expect(res.status).toBe(200);
    // Seed creates at least 3 users: 1 participant (demo) + super admin + event admin.
    // Not an exact count — other test files create/remove their own users concurrently
    // against this same shared dev DB, so the platform-wide total can briefly exceed it.
    expect(res.body.total).toBeGreaterThanOrEqual(3);
    const emails = res.body.items.map((u: { email: string }) => u.email);
    expect(emails).toContain("demo@gdn-commerce.com");
    expect(emails).toContain("eventadmin@gdn-commerce.com");
    expect(emails).toContain("superadmin@gdn-commerce.com");
  });

  it("SEC-008: scopes an event admin to users registered on that admin's own events", async () => {
    const agent = request.agent(app);
    await agent
      .post("/api/auth/login")
      .send({ email: "eventadmin@gdn-commerce.com", password: "password123" });
    const res = await agent.get("/api/admin/users");
    expect(res.status).toBe(200);
    // Event admin owns exactly 2 events; only the demo participant has a registration on
    // either of them, and staff accounts (super admin, event admin itself) have none — an
    // event admin must never see the platform-wide user list.
    expect(res.body.total).toBe(1);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].email).toBe("demo@gdn-commerce.com");
  });

  it("SEC-007: changing a user's role revokes their already-issued session", async () => {
    const superAgent = request.agent(app);
    await superAgent
      .post("/api/auth/login")
      .send({ email: "superadmin@gdn-commerce.com", password: "password123" });

    const created = await superAgent.post("/api/admin/users").send({
      name: "SEC-007 Test",
      email: SEC007_EMAIL,
      password: "supersecret1",
      role: "VIEWER",
    });
    expect(created.status).toBe(201);

    const login = await request(app)
      .post("/api/auth/login")
      .send({ email: SEC007_EMAIL, password: "supersecret1" });
    expect(login.status).toBe(200);
    const setCookieHeader = (login.headers["set-cookie"] as unknown as string[])[0]!;
    const cookie = setCookieHeader.split(";")[0]!;

    const stillValid = await request(app).get("/api/auth/me").set("Cookie", cookie);
    expect(stillValid.status).toBe(200);

    const roleChange = await superAgent
      .patch(`/api/admin/users/${created.body.id}/role`)
      .send({ role: "EVENT_ADMIN" });
    expect(roleChange.status).toBe(200);

    const afterRoleChange = await request(app).get("/api/auth/me").set("Cookie", cookie);
    expect(afterRoleChange.status).toBe(401);
  });
});
