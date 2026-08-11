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
        category: { connect: { name: "Technology" } },
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
      data: { email: TEST_EMAIL, name: "Cert Test User" },
    });
    presentUserId = user.id;
    await prisma.registration.create({
      data: { userId: presentUserId, eventId, status: "REGISTERED", attendance: "PRESENT" },
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

  it("requires auth", async () => {
    const res = await request(app).get(`/api/admin/events/${eventId}/certificates`);
    expect(res.status).toBe(401);
  });

  it("starts with no certificates issued", async () => {
    const agent = loginAs("superadmin@gdn-commerce.com");
    const res = await agent.get(`/api/admin/events/${eventId}/certificates`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it("generates a certificate for a PRESENT attendee, then is idempotent", async () => {
    const agent = loginAs("superadmin@gdn-commerce.com");
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

  // The sequential idempotence above was always satisfied by the in-memory Set, so it never
  // covered a second writer arriving after that Set was read. This one does, and it is the
  // assertion that actually discriminates the fix: before Certificate gained
  // @@unique([userId, eventId]) the database accepted this insert, and the attendee ended up
  // holding two certificates with two different verification codes.
  it("rejects a second certificate for the same attendee and event at the database level", async () => {
    const agent = loginAs("superadmin@gdn-commerce.com");
    await agent.post(`/api/admin/events/${eventId}/certificates/generate`);

    await expect(
      prisma.certificate.create({
        data: { userId: presentUserId, eventId, verificationCode: "BT2-CERT-DUPLICATE-TEST" },
      }),
    ).rejects.toMatchObject({ code: "P2002" });

    expect(await prisma.certificate.count({ where: { eventId } })).toBe(1);
  });

  // Weaker than it looks, and deliberately kept anyway. Two in-process requests do not
  // reliably interleave between the Set read and the insert, so this passes with or without
  // the P2002 catch — it is a concurrency smoke test for the invariant (still 200, still one
  // row), not proof that the catch fires. The catch guards a cross-process collision with
  // bliblitalk-user-fe's self-service issuance, which this suite cannot stage: it runs one
  // process and the codebase deliberately uses no mocking. The database constraint asserted
  // above is the part that is genuinely pinned down.
  it("stays consistent when two bulk-issue requests are sent together", async () => {
    const agent = loginAs("superadmin@gdn-commerce.com");
    const [a, b] = await Promise.all([
      agent.post(`/api/admin/events/${eventId}/certificates/generate`),
      agent.post(`/api/admin/events/${eventId}/certificates/generate`),
    ]);

    // Both requests succeed — losing the race is not an error for the caller.
    expect(a.status).toBe(200);
    expect(b.status).toBe(200);
    // ...and `generated` counts rows actually inserted, so the two sum to the single row written.
    expect(a.body.generated + b.body.generated).toBe(1);
    expect(await prisma.certificate.count({ where: { eventId } })).toBe(1);
  });

  it("refuses to generate certificates when the event has them disabled", async () => {
    await prisma.event.update({ where: { id: eventId }, data: { enableCertificate: false } });
    const agent = loginAs("superadmin@gdn-commerce.com");
    const res = await agent.post(`/api/admin/events/${eventId}/certificates/generate`);
    expect(res.status).toBe(400);
  });

  it("rejects Talent Acquisition (no certificate:manage permission)", async () => {
    const agent = loginAs("hrta@gdn-commerce.com");
    const res = await agent.get(`/api/admin/events/${eventId}/certificates`);
    expect(res.status).toBe(403);
  });

  it("blocks an event admin not assigned to this event", async () => {
    const agent = loginAs("eventadmin@gdn-commerce.com");
    const res = await agent.get(`/api/admin/events/${eventId}/certificates`);
    expect(res.status).toBe(403);
  });
});
