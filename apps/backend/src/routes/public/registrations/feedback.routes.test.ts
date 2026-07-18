import { describe, it, expect, beforeEach, afterAll } from "vitest";
import request from "supertest";
import bcrypt from "bcryptjs";
import { createApp } from "../../../app";
import { prisma } from "../../../db/client";

const TEST_SLUG = "feedback-test-event";
const TEST_EMAIL = "feedback-test@example.com";
let eventId: string;
let userId: string;
let registrationId: string;

const VALID_FEEDBACK = {
  overallRating: 9,
  topicRating: 8,
  qnaRating: 8,
  contentRating: 9,
  speakerRating: 10,
  venueRating: 7,
  timingRating: 6,
  npsScore: 9,
  takeaway: "Great session",
  topicsWanted: null,
  speakerWanted: null,
  comments: null,
};

async function purge() {
  await prisma.feedback.deleteMany({ where: { event: { slug: TEST_SLUG } } });
  await prisma.certificate.deleteMany({ where: { event: { slug: TEST_SLUG } } });
  await prisma.registration.deleteMany({ where: { event: { slug: TEST_SLUG } } });
  await prisma.event.deleteMany({ where: { slug: TEST_SLUG } });
  await prisma.user.deleteMany({ where: { email: TEST_EMAIL } });
}

// Integration — requires a running, seeded Postgres.
describe("portal feedback + certificate download", () => {
  const app = createApp();

  beforeEach(async () => {
    await purge();
    const event = await prisma.event.create({
      data: {
        slug: TEST_SLUG,
        title: "Feedback Test Event",
        description: "test",
        category: { connect: { name: "Technology" } },
        location: "Online",
        startsAt: new Date(),
        endsAt: new Date(),
        capacity: 10,
        status: "COMPLETED",
        enableCertificate: true,
        enableFeedback: true,
      },
    });
    eventId = event.id;
    const user = await prisma.user.create({
      data: {
        email: TEST_EMAIL,
        name: "Feedback Test User",
        passwordHash: bcrypt.hashSync("password123", 10),
      },
    });
    userId = user.id;
    const registration = await prisma.registration.create({
      data: { userId, eventId, status: "REGISTERED", attendance: "PENDING" },
    });
    registrationId = registration.id;
  });

  afterAll(purge);

  async function loginAsTestUser() {
    const agent = request.agent(app);
    await agent.post("/api/auth/login").send({ email: TEST_EMAIL, password: "password123" });
    return agent;
  }

  it("requires auth for feedback submission", async () => {
    const res = await request(app).post(`/api/public/me/registrations/${registrationId}/feedback`).send(VALID_FEEDBACK);
    expect(res.status).toBe(401);
  });

  it("rejects feedback before attendance is marked PRESENT", async () => {
    const agent = await loginAsTestUser();
    const res = await agent.post(`/api/public/me/registrations/${registrationId}/feedback`).send(VALID_FEEDBACK);
    expect(res.status).toBe(400);
  });

  it("rejects certificate download before attendance and before a certificate exists", async () => {
    const agent = await loginAsTestUser();
    const res = await agent.get(`/api/public/me/registrations/${registrationId}/certificate`);
    expect(res.status).toBe(400);
  });

  it("accepts feedback once PRESENT, then blocks a duplicate submission", async () => {
    await prisma.registration.update({ where: { id: registrationId }, data: { attendance: "PRESENT" } });
    const agent = await loginAsTestUser();

    const first = await agent.post(`/api/public/me/registrations/${registrationId}/feedback`).send(VALID_FEEDBACK);
    expect(first.status).toBe(201);
    expect(first.body.feedbackSubmitted).toBe(true);

    const second = await agent.post(`/api/public/me/registrations/${registrationId}/feedback`).send(VALID_FEEDBACK);
    expect(second.status).toBe(400);
  });

  it("gates certificate download until feedback is submitted, then serves it", async () => {
    await prisma.registration.update({ where: { id: registrationId }, data: { attendance: "PRESENT" } });
    await prisma.certificate.create({
      data: { userId, eventId, verificationCode: "BT2-CERT-FEEDBACK-TEST" },
    });
    const agent = await loginAsTestUser();

    const blocked = await agent.get(`/api/public/me/registrations/${registrationId}/certificate`);
    expect(blocked.status).toBe(400);

    await agent.post(`/api/public/me/registrations/${registrationId}/feedback`).send(VALID_FEEDBACK);
    const allowed = await agent.get(`/api/public/me/registrations/${registrationId}/certificate`);
    expect(allowed.status).toBe(200);
    expect(allowed.headers["content-type"]).toBe("application/pdf");
    expect(allowed.headers["content-disposition"]).toContain("BT2-CERT-FEEDBACK-TEST");
    expect(Buffer.isBuffer(allowed.body)).toBe(true);
    expect(allowed.body.subarray(0, 5).toString()).toBe("%PDF-");
  });
});
