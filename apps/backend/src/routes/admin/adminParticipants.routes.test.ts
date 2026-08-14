import { describe, it, expect, beforeEach, afterAll } from "vitest";
import request from "supertest";
import { createApp } from "../../app";
import { prisma } from "../../db/client";

const TEST_SLUG = "admin-participants-test-event";
let eventId: string;
let userId: string;

async function purge() {
  // Audit rows have no FK to Event by design (an audit row a cascade can delete is not an audit
  // row), so the export tests' rows have to be swept by hand or they outlive the fixture.
  if (eventId) await prisma.auditLog.deleteMany({ where: { targetId: eventId } });
  await prisma.registration.deleteMany({ where: { event: { slug: TEST_SLUG } } });
  await prisma.event.deleteMany({ where: { slug: TEST_SLUG } });
  await prisma.user.deleteMany({ where: { email: "admin-participants-test@example.com" } });
}

// Integration — requires a running, seeded Postgres.
describe("admin participants", () => {
  const app = createApp();

  beforeEach(async () => {
    await purge();
    const event = await prisma.event.create({
      data: {
        slug: TEST_SLUG,
        title: "Participants Test Event",
        description: "test",
        category: { connect: { name: "Technology" } },
        location: "Online",
        startsAt: new Date(),
        endsAt: new Date(),
        capacity: 10,
        status: "PUBLISHED",
      },
    });
    eventId = event.id;
    const user = await prisma.user.create({
      data: {
        email: "admin-participants-test@example.com",
        name: "Participant Test",
      },
    });
    userId = user.id;
    await prisma.registration.create({
      data: { userId, eventId, status: "REGISTERED" },
    });
  });

  afterAll(purge);

  // Apps Gateway authenticates at the edge and forwards the signed-in user’s email in
  // X-User-Id, so there is no login request to make. supertest’s agent applies .set()
  // headers to every request it sends — the same "stays signed in" behaviour the session
  // cookie used to give this helper.
  function loginAs(email: string) {
    return request.agent(app).set("X-User-Id", email);
  }

  async function getRegistrationId(): Promise<string> {
    const reg = await prisma.registration.findFirstOrThrow({ where: { userId, eventId } });
    return reg.id;
  }

  it("requires auth to list registrations", async () => {
    const res = await request(app).get(`/api/admin/events/${eventId}/registrations`);
    expect(res.status).toBe(401);
  });

  it("lists registrations for an event with user info", async () => {
    const agent = loginAs("superadmin@gdn-commerce.com");
    const res = await agent.get(`/api/admin/events/${eventId}/registrations`);
    expect(res.status).toBe(200);
    expect(res.body.length).toBe(1);
    expect(res.body[0].userEmail).toBe("admin-participants-test@example.com");
    expect(res.body[0].status).toBe("REGISTERED");
  });

  it("shortlists a registration", async () => {
    const agent = loginAs("superadmin@gdn-commerce.com");
    const regId = await getRegistrationId();
    const res = await agent.post(`/api/admin/registrations/${regId}/shortlist`);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("SHORTLISTED");
    expect(res.body.shortlistedAt).not.toBeNull();
  });

  it("rejects a registration", async () => {
    const agent = loginAs("superadmin@gdn-commerce.com");
    const regId = await getRegistrationId();
    const res = await agent.post(`/api/admin/registrations/${regId}/reject`);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("REJECTED");
  });

  it("refuses to shortlist an already-rejected registration", async () => {
    const agent = loginAs("superadmin@gdn-commerce.com");
    const regId = await getRegistrationId();
    await agent.post(`/api/admin/registrations/${regId}/reject`);
    const res = await agent.post(`/api/admin/registrations/${regId}/shortlist`);
    expect(res.status).toBe(400);
  });

  it("reverts a shortlisted registration back to waiting", async () => {
    const agent = loginAs("superadmin@gdn-commerce.com");
    const regId = await getRegistrationId();
    await agent.post(`/api/admin/registrations/${regId}/shortlist`);
    const res = await agent.post(`/api/admin/registrations/${regId}/waitlist`);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("WAITING");
    expect(res.body.shortlistedAt).toBeNull();
  });

  it("checks in a registration, recording attendance and a check-in time", async () => {
    const agent = loginAs("superadmin@gdn-commerce.com");
    const regId = await getRegistrationId();
    const res = await agent.post(`/api/admin/registrations/${regId}/check-in`);
    expect(res.status).toBe(200);
    expect(res.body.attendance).toBe("PRESENT");
  });

  it("marks a registration absent", async () => {
    const agent = loginAs("superadmin@gdn-commerce.com");
    const regId = await getRegistrationId();
    const res = await agent.post(`/api/admin/registrations/${regId}/mark-absent`);
    expect(res.status).toBe(200);
    expect(res.body.attendance).toBe("ABSENT");
  });

  it("refuses to record attendance for a rejected registration", async () => {
    const agent = loginAs("superadmin@gdn-commerce.com");
    const regId = await getRegistrationId();
    await agent.post(`/api/admin/registrations/${regId}/reject`);
    const res = await agent.post(`/api/admin/registrations/${regId}/check-in`);
    expect(res.status).toBe(400);
  });

  // SEC-011 — the per-event participant export.
  describe("participant export", () => {
    async function assignEventAdmin() {
      await prisma.event.update({
        where: { id: eventId },
        data: { admins: { connect: { email: "eventadmin@gdn-commerce.com" } } },
      });
    }

    async function latestExportAudit() {
      return prisma.auditLog.findFirst({
        where: { action: "EVENT_PARTICIPANT_EXPORT", targetId: eventId },
        orderBy: { createdAt: "desc" },
      });
    }

    it("requires auth", async () => {
      const res = await request(app).get(`/api/admin/events/${eventId}/registrations/export`);
      expect(res.status).toBe(401);
    });

    // The point of the whole finding: this admin can open the participants list for this event
    // — it is assigned to them — and still cannot take a copy of it away.
    it("refuses an event admin who *is* assigned to the event", async () => {
      await assignEventAdmin();
      const agent = loginAs("eventadmin@gdn-commerce.com");

      const list = await agent.get(`/api/admin/events/${eventId}/registrations`);
      expect(list.status).toBe(200);

      const res = await agent.get(`/api/admin/events/${eventId}/registrations/export`);
      expect(res.status).toBe(403);
      expect(await latestExportAudit()).toBeNull();
    });

    it("serves a CSV to Talent Acquisition and records who took it", async () => {
      const res = await loginAs("hrta@gdn-commerce.com").get(
        `/api/admin/events/${eventId}/registrations/export`,
      );
      expect(res.status).toBe(200);
      expect(res.headers["content-type"]).toMatch(/text\/csv/);
      expect(res.headers["content-disposition"]).toMatch(/attachment; filename="participants-/);
      // Quoted, because toCsv quotes every field — that is the SEC-026 formula-injection guard.
      expect(res.text).toContain('"Name","Email","Company"');
      expect(res.text).toContain("admin-participants-test@example.com");

      const audit = await latestExportAudit();
      expect(audit?.actorEmail).toBe("hrta@gdn-commerce.com");
      expect(audit?.actorRole).toBe("HR_TA");
      expect(audit?.targetType).toBe("Event");
      expect(audit?.rowCount).toBe(1);
    });

    // Holding registrant:export is not a way around event scoping. Talent Acquisition is not
    // event-scoped, so an EVENT_ADMIN with the permission is the case to prove — it cannot be
    // constructed through the RBAC matrix, so this drives the other half: an unassigned admin
    // is refused before any row is read.
    it("still enforces event scope for an admin who is not on the event", async () => {
      const res = await loginAs("eventadmin@gdn-commerce.com").get(
        `/api/admin/events/${eventId}/registrations/export`,
      );
      expect(res.status).toBe(403);
      expect(await latestExportAudit()).toBeNull();
    });
  });

  it("blocks an event admin not assigned to this event", async () => {
    const agent = loginAs("eventadmin@gdn-commerce.com");
    const list = await agent.get(`/api/admin/events/${eventId}/registrations`);
    expect(list.status).toBe(403);

    const regId = await getRegistrationId();
    const shortlist = await agent.post(`/api/admin/registrations/${regId}/shortlist`);
    expect(shortlist.status).toBe(403);
  });
});
