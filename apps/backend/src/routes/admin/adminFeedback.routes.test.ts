import { describe, it, expect, beforeEach, afterAll } from "vitest";
import request from "supertest";
import bcrypt from "bcryptjs";
import { createApp } from "../../app";
import { prisma } from "../../db/client";

const TEST_SLUG = "admin-feedback-test-event";
const TEST_EMAIL = "admin-feedback-test@example.com";
let eventId: string;

const BASE_FEEDBACK = {
  overallRating: 8,
  topicRating: 8,
  qnaRating: 8,
  contentRating: 8,
  speakerRating: 8,
  venueRating: 8,
  timingRating: 8,
  npsScore: 9,
};

async function purge() {
  await prisma.feedback.deleteMany({ where: { event: { slug: TEST_SLUG } } });
  await prisma.registration.deleteMany({ where: { event: { slug: TEST_SLUG } } });
  await prisma.event.deleteMany({ where: { slug: TEST_SLUG } });
  await prisma.user.deleteMany({ where: { email: TEST_EMAIL } });
}

// Integration — requires a running, seeded Postgres.
describe("admin feedback aggregate", () => {
  const app = createApp();

  beforeEach(async () => {
    await purge();
    const event = await prisma.event.create({
      data: {
        slug: TEST_SLUG,
        title: "Admin Feedback Test Event",
        description: "test",
        category: { connect: { name: "Technology" } },
        location: "Online",
        startsAt: new Date(),
        endsAt: new Date(),
        capacity: 10,
        status: "PUBLISHED",
        enableFeedback: true,
      },
    });
    eventId = event.id;
    const user = await prisma.user.create({
      data: {
        email: TEST_EMAIL,
        name: "Admin Feedback Test User",
        passwordHash: bcrypt.hashSync("password123", 10),
      },
    });
    const registration = await prisma.registration.create({
      data: { userId: user.id, eventId, status: "REGISTERED", attendance: "PRESENT" },
    });
    await prisma.feedback.create({
      data: {
        registrationId: registration.id,
        userId: user.id,
        eventId,
        ...BASE_FEEDBACK,
        comments: "The speaker was excellent and the venue was comfortable.",
      },
    });
  });

  afterAll(purge);

  async function loginAs(email: string) {
    const agent = request.agent(app);
    await agent.post("/api/auth/login").send({ email, password: "password123" });
    return agent;
  }

  it("requires auth", async () => {
    const res = await request(app).get(`/api/admin/events/${eventId}/feedback`);
    expect(res.status).toBe(401);
  });

  it("returns aggregated dimension averages, NPS rate and star distribution", async () => {
    const agent = await loginAs("superadmin@gdn-commerce.com");
    const res = await agent.get(`/api/admin/events/${eventId}/feedback`);
    expect(res.status).toBe(200);
    expect(res.body.responses).toBe(1);
    expect(res.body.completionRate).toBe(100);
    expect(res.body.averages.overall).toBe(8);
    expect(res.body.recommendationRate).toBe(100);
    expect(res.body.starDistribution).toHaveLength(5);
    expect(res.body.starDistribution[0].stars).toBe(5);
    expect(res.body.wordCloud.length).toBeGreaterThan(0);
    expect(res.body.comments).toHaveLength(1);
  });
});

describe("admin registration open/close toggle", () => {
  const app = createApp();

  beforeEach(async () => {
    await purge();
    const event = await prisma.event.create({
      data: {
        slug: TEST_SLUG,
        title: "Admin Feedback Test Event",
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
  });

  afterAll(purge);

  async function loginAsSuperAdmin() {
    const agent = request.agent(app);
    await agent.post("/api/auth/login").send({ email: "superadmin@gdn-commerce.com", password: "password123" });
    return agent;
  }

  // Under the 8-state transition table (packages/shared-types/src/lifecycle.ts),
  // "close registration" (-> REGISTRATION_CLOSED) is only legal from REGISTRATION_OPEN,
  // and "open/reopen registration" (-> REGISTRATION_OPEN) is legal from PUBLISHED or
  // REGISTRATION_CLOSED. The fixture event starts PUBLISHED, so registration must be
  // opened before it can be closed.
  it("opens, closes, then reopens registration", async () => {
    const agent = await loginAsSuperAdmin();

    const opened = await agent.post(`/api/admin/events/${eventId}/open-registration`);
    expect(opened.status).toBe(200);
    expect(opened.body.status).toBe("REGISTRATION_OPEN");

    const closed = await agent.post(`/api/admin/events/${eventId}/close-registration`);
    expect(closed.status).toBe(200);
    expect(closed.body.status).toBe("REGISTRATION_CLOSED");

    const reopened = await agent.post(`/api/admin/events/${eventId}/open-registration`);
    expect(reopened.status).toBe(200);
    expect(reopened.body.status).toBe("REGISTRATION_OPEN");
  });

  it("refuses to close registration when it isn't open for registration", async () => {
    await prisma.event.update({ where: { id: eventId }, data: { status: "DRAFT" } });
    const agent = await loginAsSuperAdmin();
    const res = await agent.post(`/api/admin/events/${eventId}/close-registration`);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("INVALID_TRANSITION");
  });
});
