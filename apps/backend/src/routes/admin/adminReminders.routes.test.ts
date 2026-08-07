import { describe, it, expect, beforeEach, afterAll } from "vitest";
import request from "supertest";
import { createApp } from "../../app";
import { prisma } from "../../db/client";
import { sweepDueReminders } from "./adminReminders.service";

const TEST_SLUG = "admin-reminders-test-event";
const TEST_EMAIL_DOMAIN = "admin-reminders-test.example.com";
let eventId: string;
let shortlistedUserId: string;
let registeredUserId: string;
let rejectedUserId: string;
let cancelledUserId: string;

async function purge() {
  await prisma.eventReminder.deleteMany({ where: { event: { slug: TEST_SLUG } } });
  await prisma.registration.deleteMany({ where: { event: { slug: TEST_SLUG } } });
  await prisma.event.deleteMany({ where: { slug: TEST_SLUG } });
  await prisma.user.deleteMany({ where: { email: { endsWith: TEST_EMAIL_DOMAIN } } });
}

function future(minutes: number): string {
  return new Date(Date.now() + minutes * 60 * 1000).toISOString();
}

// Integration — requires a running, seeded Postgres.
describe("admin reminders", () => {
  const app = createApp();

  beforeEach(async () => {
    await purge();
    const event = await prisma.event.create({
      data: {
        slug: TEST_SLUG,
        title: "Reminders Test Event",
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

    const [shortlisted, registered, rejected, cancelled] = await Promise.all([
      prisma.user.create({
        data: { email: `shortlisted@${TEST_EMAIL_DOMAIN}`, name: "Shortlisted" },
      }),
      prisma.user.create({
        data: { email: `registered@${TEST_EMAIL_DOMAIN}`, name: "Registered" },
      }),
      prisma.user.create({
        data: { email: `rejected@${TEST_EMAIL_DOMAIN}`, name: "Rejected" },
      }),
      prisma.user.create({
        data: { email: `cancelled@${TEST_EMAIL_DOMAIN}`, name: "Cancelled" },
      }),
    ]);
    shortlistedUserId = shortlisted.id;
    registeredUserId = registered.id;
    rejectedUserId = rejected.id;
    cancelledUserId = cancelled.id;

    await Promise.all([
      prisma.registration.create({
        data: { userId: shortlistedUserId, eventId, status: "SHORTLISTED" },
      }),
      prisma.registration.create({
        data: { userId: registeredUserId, eventId, status: "REGISTERED" },
      }),
      prisma.registration.create({ data: { userId: rejectedUserId, eventId, status: "REJECTED" } }),
      prisma.registration.create({
        data: { userId: cancelledUserId, eventId, status: "CANCELLED" },
      }),
    ]);
  });

  afterAll(purge);

  // Apps Gateway authenticates at the edge and forwards the signed-in user’s email in
  // X-User-Id, so there is no login request to make. supertest’s agent applies .set()
  // headers to every request it sends — the same "stays signed in" behaviour the session
  // cookie used to give this helper.
  function loginAs(email: string) {
    return request.agent(app).set("X-User-Id", email);
  }

  it("requires auth to list reminders", async () => {
    const res = await request(app).get(`/api/admin/events/${eventId}/reminders`);
    expect(res.status).toBe(401);
  });

  it("rejects Talent Acquisition (no event:update permission)", async () => {
    const agent = loginAs("hrta@gdn-commerce.com");
    const res = await agent.get(`/api/admin/events/${eventId}/reminders`);
    expect(res.status).toBe(403);
  });

  it("creates a CUSTOM reminder with just subject/bodyHtml", async () => {
    const agent = loginAs("superadmin@gdn-commerce.com");
    const res = await agent.post(`/api/admin/events/${eventId}/reminders`).send({
      sendAt: future(60),
      subject: "Don't forget!",
      bodyHtml: "<p>See you there</p>",
    });
    expect(res.status).toBe(201);
    expect(res.body.kind).toBe("CUSTOM");
    expect(res.body.status).toBe("PENDING");
    expect(res.body.subjectNotShortlisted).toBeNull();
  });

  it("rejects a reminder scheduled in the past", async () => {
    const agent = loginAs("superadmin@gdn-commerce.com");
    const res = await agent.post(`/api/admin/events/${eventId}/reminders`).send({
      sendAt: future(-10),
      subject: "Too late",
      bodyHtml: "<p>oops</p>",
    });
    expect(res.status).toBe(400);
  });

  it("rejects a SHORTLIST_RESULT reminder missing the not-shortlisted message", async () => {
    const agent = loginAs("superadmin@gdn-commerce.com");
    const res = await agent.post(`/api/admin/events/${eventId}/reminders`).send({
      kind: "SHORTLIST_RESULT",
      sendAt: future(60),
      subject: "You're in!",
      bodyHtml: "<p>Congrats</p>",
    });
    expect(res.status).toBe(422);
  });

  it("creates a SHORTLIST_RESULT reminder with both messages", async () => {
    const agent = loginAs("superadmin@gdn-commerce.com");
    const res = await agent.post(`/api/admin/events/${eventId}/reminders`).send({
      kind: "SHORTLIST_RESULT",
      sendAt: future(60),
      subject: "You're in!",
      bodyHtml: "<p>Congrats, you're shortlisted</p>",
      subjectNotShortlisted: "Thanks for applying",
      bodyHtmlNotShortlisted: "<p>Not this time, sorry</p>",
    });
    expect(res.status).toBe(201);
    expect(res.body.kind).toBe("SHORTLIST_RESULT");
    expect(res.body.subjectNotShortlisted).toBe("Thanks for applying");
  });

  it("cancels a pending reminder", async () => {
    const agent = loginAs("superadmin@gdn-commerce.com");
    const created = await agent.post(`/api/admin/events/${eventId}/reminders`).send({
      sendAt: future(60),
      subject: "Cancel me",
      bodyHtml: "<p>x</p>",
    });
    const res = await agent.delete(`/api/admin/events/${eventId}/reminders/${created.body.id}`);
    expect(res.status).toBe(204);
  });

  it("refuses to cancel a reminder that already sent", async () => {
    const agent = loginAs("superadmin@gdn-commerce.com");
    const created = await agent.post(`/api/admin/events/${eventId}/reminders`).send({
      sendAt: future(60),
      subject: "Already sent",
      bodyHtml: "<p>x</p>",
    });
    await prisma.eventReminder.update({ where: { id: created.body.id }, data: { status: "SENT" } });
    const res = await agent.delete(`/api/admin/events/${eventId}/reminders/${created.body.id}`);
    expect(res.status).toBe(400);
  });

  describe("sweepDueReminders", () => {
    it("sends a CUSTOM reminder only to SHORTLISTED registrants", async () => {
      const reminder = await prisma.eventReminder.create({
        data: {
          eventId,
          kind: "CUSTOM",
          sendAt: new Date(Date.now() - 60 * 1000),
          subject: "Starting soon",
          bodyHtml: "<p>see you there</p>",
          status: "PENDING",
        },
      });

      await sweepDueReminders();

      const updated = await prisma.eventReminder.findUniqueOrThrow({ where: { id: reminder.id } });
      expect(updated.status).toBe("SENT");
      expect(updated.recipientCount).toBe(1);
    });

    it("sends a SHORTLIST_RESULT reminder to every still-active registrant, excluding CANCELLED", async () => {
      const reminder = await prisma.eventReminder.create({
        data: {
          eventId,
          kind: "SHORTLIST_RESULT",
          sendAt: new Date(Date.now() - 60 * 1000),
          subject: "You're in!",
          bodyHtml: "<p>Congrats</p>",
          subjectNotShortlisted: "Thanks for applying",
          bodyHtmlNotShortlisted: "<p>Not this time</p>",
          status: "PENDING",
        },
      });

      await sweepDueReminders();

      const updated = await prisma.eventReminder.findUniqueOrThrow({ where: { id: reminder.id } });
      expect(updated.status).toBe("SENT");
      // SHORTLISTED + REGISTERED + REJECTED = 3; CANCELLED is excluded.
      expect(updated.recipientCount).toBe(3);
    });

    it("leaves a reminder not yet due untouched", async () => {
      const reminder = await prisma.eventReminder.create({
        data: {
          eventId,
          kind: "CUSTOM",
          sendAt: new Date(Date.now() + 60 * 60 * 1000),
          subject: "Not yet",
          bodyHtml: "<p>x</p>",
          status: "PENDING",
        },
      });

      await sweepDueReminders();

      const updated = await prisma.eventReminder.findUniqueOrThrow({ where: { id: reminder.id } });
      expect(updated.status).toBe("PENDING");
    });
  });
});
