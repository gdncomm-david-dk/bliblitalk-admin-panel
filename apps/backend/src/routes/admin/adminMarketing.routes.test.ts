import { describe, it, expect } from "vitest";
import request from "supertest";
import { createApp } from "../../app";

/**
 * SEC-030 — who may reach the marketing surface at all.
 *
 * Only read routes are driven here. The send route is deliberately left alone: it hands a real
 * body to the SMTP transport, and a test that mails anyone is worse than the gap it covers. What
 * matters for the finding is the permission boundary, and every marketing route sits behind the
 * same `requirePermission(MARKETING_MANAGE)`, so proving it on one proves it on all seven.
 */
describe("admin marketing access", () => {
  const app = createApp();

  function loginAs(email: string) {
    return request.agent(app).set("X-User-Id", email);
  }

  it("requires auth", async () => {
    const res = await request(app).get("/api/admin/marketing/contacts");
    expect(res.status).toBe(401);
  });

  // Owner decision, 2026-08-14: campaigns go out from noreply@blibli.com to an audience that can
  // be every participant, so the grant is narrower than the rest of the CMS.
  it("refuses Talent Acquisition, which no longer holds marketing:manage", async () => {
    const agent = loginAs("hrta@gdn-commerce.com");

    expect((await agent.get("/api/admin/marketing/contacts")).status).toBe(403);
    expect((await agent.get("/api/admin/marketing/campaigns")).status).toBe(403);

    // The rest of the role is untouched — this is a narrowing, not a demotion.
    expect((await agent.get("/api/admin/users")).status).toBe(200);
  });

  it("allows a super admin and an event admin", async () => {
    for (const email of ["superadmin@gdn-commerce.com", "eventadmin@gdn-commerce.com"]) {
      const res = await loginAs(email).get("/api/admin/marketing/contacts");
      expect(res.status, `${email} should reach the marketing surface`).toBe(200);
    }
  });
});
