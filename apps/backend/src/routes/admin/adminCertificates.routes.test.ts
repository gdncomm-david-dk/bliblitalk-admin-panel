import { describe, it, expect, beforeEach, afterAll } from "vitest";
import request from "supertest";
import { createApp } from "../../app";
import { prisma } from "../../db/client";

const TEST_SLUG = "admin-certificates-test-event";
const TEST_EMAIL = "admin-certificates-test@example.com";
let eventId: string;
let presentUserId: string;

async function purge() {
  await prisma.certificate.deleteMany({ where: { event: { slug: TEST_SLUG } } });
  await prisma.registration.deleteMany({ where: { event: { slug: TEST_SLUG } } });
  await prisma.event.deleteMany({ where: { slug: TEST_SLUG } });
  await prisma.user.deleteMany({ where: { email: TEST_EMAIL } });
}

// Integration — requires a running, seeded Postgres.
describe("admin certificates", () => {
  const app = createApp();

  beforeEach(async () => {
    await purge();
    const event = await prisma.event.create({
      data: {
        slug: TEST_SLUG,
        title: "Certificates Test Event",
        description: "test",
        category: "Technology",
        location: "Online",
        startsAt: new Date(),
        endsAt: new Date(),
        capacity: 10,
        status: "COMPLETED",
        enableCertificate: true,
      },
    });
    eventId = event.id;
    const user = await prisma.user.create({
      data: { email: TEST_EMAIL, name: "Cert Test User", passwordHash: "x" },
    });
    presentUserId = user.id;
    await prisma.registration.create({
      data: { userId: presentUserId, eventId, status: "REGISTERED", attendance: "PRESENT" },
    });
  });

  afterAll(purge);

  async function loginAs(email: string) {
    const agent = request.agent(app);
    await agent.post("/api/auth/login").send({ email, password: "password123" });
    return agent;
  }

  it("requires auth", async () => {
    const res = await request(app).get(`/api/admin/events/${eventId}/certificates`);
    expect(res.status).toBe(401);
  });

  it("starts with no certificates issued", async () => {
    const agent = await loginAs("superadmin@gdn-commerce.com");
    const res = await agent.get(`/api/admin/events/${eventId}/certificates`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it("generates a certificate for a PRESENT attendee, then is idempotent", async () => {
    const agent = await loginAs("superadmin@gdn-commerce.com");
    const first = await agent.post(`/api/admin/events/${eventId}/certificates/generate`);
    expect(first.status).toBe(200);
    expect(first.body.generated).toBe(1);
    expect(first.body.certificates[0].userEmail).toBe(TEST_EMAIL);
    expect(first.body.certificates[0].verificationCode).toMatch(/^BT2-CERT-/);

    const second = await agent.post(`/api/admin/events/${eventId}/certificates/generate`);
    expect(second.status).toBe(200);
    expect(second.body.generated).toBe(0);
    expect(second.body.certificates.length).toBe(1);
  });

  it("refuses to generate certificates when the event has them disabled", async () => {
    await prisma.event.update({ where: { id: eventId }, data: { enableCertificate: false } });
    const agent = await loginAs("superadmin@gdn-commerce.com");
    const res = await agent.post(`/api/admin/events/${eventId}/certificates/generate`);
    expect(res.status).toBe(400);
  });

  it("rejects participants (no permission)", async () => {
    const agent = await loginAs("demo@gdn-commerce.com");
    const res = await agent.get(`/api/admin/events/${eventId}/certificates`);
    expect(res.status).toBe(403);
  });

  it("blocks an event admin not assigned to this event", async () => {
    const agent = await loginAs("eventadmin@gdn-commerce.com");
    const res = await agent.get(`/api/admin/events/${eventId}/certificates`);
    expect(res.status).toBe(403);
  });
});
