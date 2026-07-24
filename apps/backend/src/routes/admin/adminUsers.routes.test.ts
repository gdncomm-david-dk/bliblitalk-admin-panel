import { describe, it, expect } from "vitest";
import request from "supertest";
import { createApp } from "../../app";

describe("admin users", () => {
  const app = createApp();

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
    const res = await agent.get("/api/admin/users");
    expect(res.status).toBe(200);
    // Seed creates exactly 3 users: 1 participant (demo) + super admin + event admin.
    expect(res.body.total).toBe(3);
    const emails = res.body.items.map((u: { email: string }) => u.email);
    expect(emails).toContain("demo@gdn-commerce.com");
    expect(emails).toContain("eventadmin@gdn-commerce.com");
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
});
