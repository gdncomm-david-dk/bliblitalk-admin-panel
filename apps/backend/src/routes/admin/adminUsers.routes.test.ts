import { describe, it, expect, afterAll } from "vitest";
import request from "supertest";
import { createApp } from "../../app";
import { prisma } from "../../db/client";

const SEC007_EMAIL = "sec007-role-change-test@example.com";
const NO_CREDENTIAL_EMAIL = "gateway-no-credential-test@example.com";
// Never created while the ROLE_MANAGE guard holds; purged anyway so a regression that does
// create it cannot leave a stray admin account behind in the shared dev database.
const ESCALATION_ATTEMPT_EMAIL = "hrta-escalation-attempt@example.com";

describe("admin users", () => {
  const app = createApp();

  afterAll(async () => {
    await prisma.user.deleteMany({
      where: { email: { in: [SEC007_EMAIL, NO_CREDENTIAL_EMAIL, ESCALATION_ATTEMPT_EMAIL] } },
    });
  });

  // Apps Gateway authenticates at the edge and forwards the signed-in user's email in
  // X-User-Id, so there is no login request to make. supertest's agent applies .set()
  // headers to every request it sends — the same "stays signed in" behaviour the session
  // cookie used to give these tests.
  function loginAs(email: string) {
    return request.agent(app).set("X-User-Id", email);
  }

  it("requires auth", async () => {
    const res = await request(app).get("/api/admin/users");
    expect(res.status).toBe(401);
  });

  // This used to assert GET /users against a VIEWER. With that tier retired (2026-08-06) every
  // remaining Admin CMS role holds USER_MANAGE, so listing users is no longer deniable to any of
  // them — there is no subject left for that assertion. The permission boundary worth guarding is
  // now ROLE_MANAGE, which only SUPER_ADMIN holds, so this drives a ROLE_MANAGE route instead.
  it("rejects Talent Acquisition from provisioning an admin (no role:manage permission)", async () => {
    const res = await loginAs("hrta@gdn-commerce.com")
      .post("/api/admin/users")
      .send({ name: "Should Not Exist", email: ESCALATION_ATTEMPT_EMAIL, role: "EVENT_ADMIN" });
    expect(res.status).toBe(403);
  });

  it("returns every user in the system for a super admin (platform-wide)", async () => {
    const res = await loginAs("superadmin@gdn-commerce.com").get("/api/admin/users?pageSize=100");
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
    const res = await loginAs("eventadmin@gdn-commerce.com").get("/api/admin/users");
    expect(res.status).toBe(200);
    // Event admin owns exactly 2 events; only the demo participant has a registration on
    // either of them, and staff accounts (super admin, event admin itself) have none — an
    // event admin must never see the platform-wide user list.
    expect(res.body.total).toBe(1);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].email).toBe("demo@gdn-commerce.com");
  });

  // SEC-007 originally asserted the whole round trip here: log in, change the role, watch the
  // already-issued cookie stop working. Half of that no longer belongs to this app — it issues
  // no session at all since the Apps Gateway migration. What it still owns is the trigger, so
  // that is what this asserts. The other half (requireAuth rejecting a token whose tokenVersion
  // claim is stale) is tested in bliblitalk-user-fe, which does still issue sessions and is
  // where a revoked token would actually be presented.
  it("SEC-007: changing a user's role bumps tokenVersion, revoking any session already issued", async () => {
    const superAgent = loginAs("superadmin@gdn-commerce.com");

    const created = await superAgent.post("/api/admin/users").send({
      name: "SEC-007 Test",
      email: SEC007_EMAIL,
      role: "HR_TA",
    });
    expect(created.status).toBe(201);

    const before = await prisma.user.findUniqueOrThrow({
      where: { id: created.body.id },
      select: { tokenVersion: true },
    });

    const roleChange = await superAgent
      .patch(`/api/admin/users/${created.body.id}/role`)
      .send({ role: "EVENT_ADMIN" });
    expect(roleChange.status).toBe(200);

    const after = await prisma.user.findUniqueOrThrow({
      where: { id: created.body.id },
      select: { tokenVersion: true },
    });
    expect(after.tokenVersion).toBe(before.tokenVersion + 1);
  });

  it("provisioning an admin stores no credential — the gateway authenticates them", async () => {
    const created = await loginAs("superadmin@gdn-commerce.com").post("/api/admin/users").send({
      name: "Gateway No-Credential Test",
      email: NO_CREDENTIAL_EMAIL,
      role: "HR_TA",
    });
    expect(created.status).toBe(201);

    const row = await prisma.user.findUniqueOrThrow({
      where: { id: created.body.id },
      select: { passwordHash: true },
    });
    expect(row.passwordHash).toBeNull();
  });
});
