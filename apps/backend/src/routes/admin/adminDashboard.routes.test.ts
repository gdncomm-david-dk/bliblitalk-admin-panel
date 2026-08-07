import { describe, it, expect } from "vitest";
import request from "supertest";
import { createApp } from "../../app";

describe("admin dashboard", () => {
  const app = createApp();

  // Apps Gateway authenticates at the edge and forwards the signed-in user's email in
  // X-User-Id, so there is no login request to make. supertest's agent applies .set()
  // headers to every request it sends — the same "stays signed in" behaviour the session
  // cookie used to give these tests.
  function loginAs(email: string) {
    return request.agent(app).set("X-User-Id", email);
  }

  it("requires auth", async () => {
    const res = await request(app).get("/api/admin/dashboard");
    expect(res.status).toBe(401);
  });

  it("returns the full dashboard payload for a super admin (platform-wide)", async () => {
    const agent = loginAs("superadmin@gdn-commerce.com");
    const res = await agent.get("/api/admin/dashboard");
    expect(res.status).toBe(200);
    expect(res.body.stats).toHaveProperty("totalEvents");
    expect(res.body.stats).toHaveProperty("attendanceRate");
    expect(res.body.stats.totalEvents).toBeGreaterThan(0);
    expect(Array.isArray(res.body.recentRegistrations)).toBe(true);
    expect(Array.isArray(res.body.upcomingCalendar)).toBe(true);
  });

  it("scopes totals to assigned events for an event admin", async () => {
    const superAgent = loginAs("superadmin@gdn-commerce.com");
    const eventAgent = loginAs("eventadmin@gdn-commerce.com");

    const superRes = await superAgent.get("/api/admin/dashboard");
    const eventRes = await eventAgent.get("/api/admin/dashboard");

    expect(eventRes.status).toBe(200);
    // Event Admin is assigned exactly 2 events in the seed; must never see more
    // than the platform-wide total the super admin sees.
    expect(eventRes.body.stats.totalEvents).toBe(2);
    expect(eventRes.body.stats.totalEvents).toBeLessThanOrEqual(superRes.body.stats.totalEvents);
  });
});
