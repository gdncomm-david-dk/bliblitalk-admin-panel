import { describe, it, expect, beforeEach, afterAll } from "vitest";
import request from "supertest";
import { createApp } from "../../../app";
import { prisma } from "../../../db/client";

// Slugs the demo user self-registers for below. Cleared before each run so the
// suite is idempotent (re-runnable without reseeding).
const SELF_REG_SLUGS = ["ai-in-everyday-work"];
// Synthetic events/users created by tests below use these prefixes.
const TEST_SLUG_PREFIXES = ["capacity-test-", "speed-dating-test-", "reg-open-test-"];

async function purgeSyntheticData() {
  const events = await prisma.event.findMany({
    where: { OR: TEST_SLUG_PREFIXES.map((p) => ({ slug: { startsWith: p } })) },
    select: { id: true },
  });
  const eventIds = events.map((e) => e.id);
  if (eventIds.length) {
    const regs = await prisma.registration.findMany({
      where: { eventId: { in: eventIds } },
      select: { id: true },
    });
    const regIds = regs.map((r) => r.id);
    if (regIds.length) {
      await prisma.speedDatingRegistration.deleteMany({ where: { registrationId: { in: regIds } } });
      await prisma.registration.deleteMany({ where: { id: { in: regIds } } });
    }
    await prisma.event.deleteMany({ where: { id: { in: eventIds } } });
  }
  await prisma.user.deleteMany({ where: { email: { startsWith: "filler-" } } });
}

// Integration — requires a running, seeded Postgres.
describe("events", () => {
  const app = createApp();

  beforeEach(async () => {
    await purgeSyntheticData();
    const demo = await prisma.user.findUnique({ where: { email: "demo@gdn-commerce.com" } });
    if (!demo) return;
    const regs = await prisma.registration.findMany({
      where: { userId: demo.id, event: { slug: { in: SELF_REG_SLUGS } } },
      select: { id: true },
    });
    const ids = regs.map((r) => r.id);
    if (ids.length === 0) return;
    await prisma.speedDatingRegistration.deleteMany({ where: { registrationId: { in: ids } } });
    await prisma.registration.deleteMany({ where: { id: { in: ids } } });
  });

  afterAll(purgeSyntheticData);

  it("lists upcoming events", async () => {
    const res = await request(app).get("/api/public/events?status=upcoming");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body[0]).toHaveProperty("slug");
    expect(res.body[0]).toHaveProperty("speakers");
  });

  it("returns 404 for an unknown slug", async () => {
    const res = await request(app).get("/api/public/events/does-not-exist");
    expect(res.status).toBe(404);
  });

  it("rejects an invalid status filter with 422", async () => {
    const res = await request(app).get("/api/public/events?status=BOGUS");
    expect(res.status).toBe(422);
  });

  it("requires auth to register", async () => {
    const res = await request(app).post("/api/public/events/ai-in-everyday-work/register").send({});
    expect(res.status).toBe(401);
  });

  it("registers, then rejects a duplicate registration", async () => {
    const agent = request.agent(app);
    await agent.post("/api/auth/login").send({ email: "demo@gdn-commerce.com", password: "password123" });

    const res = await agent.post("/api/public/events/ai-in-everyday-work/register").send({});
    expect(res.status).toBe(201);
    expect(res.body.status).toBe("REGISTERED");
    expect(res.body.event.slug).toBe("ai-in-everyday-work");

    const dup = await agent.post("/api/public/events/ai-in-everyday-work/register").send({});
    expect(dup.status).toBe(409);
  });

  it("creates a speed-dating registration when opted in", async () => {
    // Own PUBLISHED event with speed dating and a future deadline, so the test does
    // not depend on seed date freshness.
    const future = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    const sdEvent = await prisma.event.create({
      data: {
        slug: `speed-dating-test-${Date.now()}`,
        title: "Speed Dating Test Event",
        description: "test",
        category: { connect: { name: "Technology" } },
        location: "Online",
        startsAt: future,
        endsAt: future,
        capacity: 50,
        status: "PUBLISHED",
        hasSpeedDating: true,
        registrationDeadline: future,
      },
    });

    const agent = request.agent(app);
    await agent.post("/api/auth/login").send({ email: "demo@gdn-commerce.com", password: "password123" });

    const res = await agent.post(`/api/public/events/${sdEvent.slug}/register`).send({ joinSpeedDating: true });
    expect(res.status).toBe(201);

    const row = await prisma.registration.findUnique({
      where: { id: res.body.id },
      include: { speedDating: true },
    });
    expect(row?.speedDating).not.toBeNull();
  });

  it("keeps a REGISTRATION_OPEN event visible on the portal and registerable", async () => {
    // The new lifecycle's registerable state. It must behave like PUBLISHED for the
    // portal listing and the register guard, or opening registration would hide the
    // event and block sign-ups.
    const future = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    const openEvent = await prisma.event.create({
      data: {
        slug: `reg-open-test-${Date.now()}`,
        title: "Registration Open Test Event",
        description: "test",
        category: { connect: { name: "Technology" } },
        location: "Online",
        startsAt: future,
        endsAt: future,
        capacity: 50,
        status: "REGISTRATION_OPEN",
        registrationDeadline: future,
      },
    });

    const list = await request(app).get("/api/public/events");
    expect(list.status).toBe(200);
    expect(list.body.some((e: { slug: string }) => e.slug === openEvent.slug)).toBe(true);

    const agent = request.agent(app);
    await agent.post("/api/auth/login").send({ email: "demo@gdn-commerce.com", password: "password123" });
    const res = await agent.post(`/api/public/events/${openEvent.slug}/register`).send({});
    expect(res.status).toBe(201);
    expect(res.body.status).toBe("REGISTERED");
  });

  it("auto-waitlists once capacity is full", async () => {
    const fullEvent = await prisma.event.create({
      data: {
        slug: `capacity-test-${Date.now()}`,
        title: "Capacity Test Event",
        description: "test",
        category: { connect: { name: "Technology" } },
        location: "Online",
        startsAt: new Date(),
        endsAt: new Date(),
        capacity: 1,
        status: "PUBLISHED",
      },
    });
    const filler = await prisma.user.create({
      data: { email: `filler-${Date.now()}@gdn-commerce.com`, name: "Filler", passwordHash: "x" },
    });
    await prisma.registration.create({
      data: { userId: filler.id, eventId: fullEvent.id, status: "REGISTERED" },
    });

    const agent = request.agent(app);
    await agent.post("/api/auth/login").send({ email: "demo@gdn-commerce.com", password: "password123" });
    const res = await agent.post(`/api/public/events/${fullEvent.slug}/register`).send({});
    expect(res.status).toBe(201);
    expect(res.body.status).toBe("WAITING");
  });
});
