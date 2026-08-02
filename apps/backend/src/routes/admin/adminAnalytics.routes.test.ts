import { describe, it, expect } from "vitest";
import request from "supertest";
import { createApp } from "../../app";

// Integration — requires a running, seeded Postgres.
describe("admin analytics", () => {
  const app = createApp();

  async function loginAs(email: string) {
    const agent = request.agent(app);
    await agent.post("/api/auth/login").send({ email, password: "password123" });
    return agent;
  }

  it("requires auth", async () => {
    const res = await request(app).get("/api/admin/analytics");
    expect(res.status).toBe(401);
  });

  it("rejects an HR admin without analytics access (no permission)", async () => {
    const agent = await loginAs("hrta@gdn-commerce.com");
    const res = await agent.get("/api/admin/analytics");
    expect(res.status).toBe(403);
  });

  it("returns platform-wide analytics for a super admin", async () => {
    const agent = await loginAs("superadmin@gdn-commerce.com");
    const res = await agent.get("/api/admin/analytics");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.eventsByCategory)).toBe(true);
    expect(Array.isArray(res.body.registrationsByStatus)).toBe(true);
    expect(Array.isArray(res.body.eventAttendance)).toBe(true);
    expect(res.body.eventsByCategory.length).toBeGreaterThan(0);
    expect(res.body.topEventsByRegistrations.length).toBeLessThanOrEqual(5);
  });

  it("scopes analytics to an event admin's assigned events", async () => {
    const superAgent = await loginAs("superadmin@gdn-commerce.com");
    const eventAgent = await loginAs("eventadmin@gdn-commerce.com");

    const superRes = await superAgent.get("/api/admin/analytics");
    const eventRes = await eventAgent.get("/api/admin/analytics");

    expect(eventRes.status).toBe(200);
    expect(eventRes.body.eventAttendance.length).toBe(2);
    expect(eventRes.body.eventAttendance.length).toBeLessThanOrEqual(
      superRes.body.eventAttendance.length,
    );
  });
});
