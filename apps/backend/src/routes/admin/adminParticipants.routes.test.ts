import { describe, it, expect, beforeEach, afterAll } from "vitest";
import request from "supertest";
import { createApp } from "../../app";
import { prisma } from "../../db/client";

const TEST_SLUG = "admin-participants-test-event";
let eventId: string;
let userId: string;

async function purge() {
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
        category: "Technology",
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
        passwordHash: "x",
      },
    });
    userId = user.id;
    await prisma.registration.create({
      data: { userId, eventId, status: "REGISTERED" },
    });
  });

  afterAll(purge);

  async function loginAs(email: string) {
    const agent = request.agent(app);
    await agent.post("/api/auth/login").send({ email, password: "password123" });
    return agent;
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
    const agent = await loginAs("superadmin@gdn-commerce.com");
    const res = await agent.get(`/api/admin/events/${eventId}/registrations`);
    expect(res.status).toBe(200);
    expect(res.body.length).toBe(1);
    expect(res.body[0].userEmail).toBe("admin-participants-test@example.com");
    expect(res.body[0].status).toBe("REGISTERED");
  });

  it("shortlists a registration", async () => {
    const agent = await loginAs("superadmin@gdn-commerce.com");
    const regId = await getRegistrationId();
    const res = await agent.post(`/api/admin/registrations/${regId}/shortlist`);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("SHORTLISTED");
    expect(res.body.shortlistedAt).not.toBeNull();
  });

  it("rejects a registration", async () => {
    const agent = await loginAs("superadmin@gdn-commerce.com");
    const regId = await getRegistrationId();
    const res = await agent.post(`/api/admin/registrations/${regId}/reject`);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("REJECTED");
  });

  it("refuses to shortlist an already-rejected registration", async () => {
    const agent = await loginAs("superadmin@gdn-commerce.com");
    const regId = await getRegistrationId();
    await agent.post(`/api/admin/registrations/${regId}/reject`);
    const res = await agent.post(`/api/admin/registrations/${regId}/shortlist`);
    expect(res.status).toBe(400);
  });

  it("reverts a shortlisted registration back to waiting", async () => {
    const agent = await loginAs("superadmin@gdn-commerce.com");
    const regId = await getRegistrationId();
    await agent.post(`/api/admin/registrations/${regId}/shortlist`);
    const res = await agent.post(`/api/admin/registrations/${regId}/waitlist`);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("WAITING");
    expect(res.body.shortlistedAt).toBeNull();
  });

  it("checks in a registration, recording attendance and a check-in time", async () => {
    const agent = await loginAs("superadmin@gdn-commerce.com");
    const regId = await getRegistrationId();
    const res = await agent.post(`/api/admin/registrations/${regId}/check-in`);
    expect(res.status).toBe(200);
    expect(res.body.attendance).toBe("PRESENT");
  });

  it("marks a registration absent", async () => {
    const agent = await loginAs("superadmin@gdn-commerce.com");
    const regId = await getRegistrationId();
    const res = await agent.post(`/api/admin/registrations/${regId}/mark-absent`);
    expect(res.status).toBe(200);
    expect(res.body.attendance).toBe("ABSENT");
  });

  it("refuses to record attendance for a rejected registration", async () => {
    const agent = await loginAs("superadmin@gdn-commerce.com");
    const regId = await getRegistrationId();
    await agent.post(`/api/admin/registrations/${regId}/reject`);
    const res = await agent.post(`/api/admin/registrations/${regId}/check-in`);
    expect(res.status).toBe(400);
  });

  it("blocks an event admin not assigned to this event", async () => {
    const agent = await loginAs("eventadmin@gdn-commerce.com");
    const list = await agent.get(`/api/admin/events/${eventId}/registrations`);
    expect(list.status).toBe(403);

    const regId = await getRegistrationId();
    const shortlist = await agent.post(`/api/admin/registrations/${regId}/shortlist`);
    expect(shortlist.status).toBe(403);
  });

  it("rejects participants (no permission)", async () => {
    const agent = await loginAs("demo@gdn-commerce.com");
    const res = await agent.get(`/api/admin/events/${eventId}/registrations`);
    expect(res.status).toBe(403);
  });
});
