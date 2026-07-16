import { describe, it, expect, beforeEach, afterAll } from "vitest";
import request from "supertest";
import { createApp } from "../../app";
import { prisma } from "../../db/client";

const TEST_SLUG_PREFIX = "admin-crud-test-";

async function purgeSyntheticEvents() {
  await prisma.event.deleteMany({ where: { slug: { startsWith: TEST_SLUG_PREFIX } } });
}

function validPayload(overrides: Record<string, unknown> = {}) {
  const future = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
  return {
    title: `Admin CRUD Test Event ${Date.now()}`,
    description: "test",
    category: "Technology",
    location: "Online",
    startsAt: future,
    endsAt: future,
    capacity: 100,
    ...overrides,
  };
}

// Integration — requires a running, seeded Postgres.
describe("admin events CRUD", () => {
  const app = createApp();

  beforeEach(purgeSyntheticEvents);
  afterAll(purgeSyntheticEvents);

  async function loginAs(email: string) {
    const agent = request.agent(app);
    await agent.post("/api/auth/login").send({ email, password: "password123" });
    return agent;
  }

  it("requires auth", async () => {
    const res = await request(app).get("/api/admin/events");
    expect(res.status).toBe(401);
  });

  it("rejects participants (no permission)", async () => {
    const agent = await loginAs("demo@gdn-commerce.com");
    const res = await agent.get("/api/admin/events");
    expect(res.status).toBe(403);
  });

  it("creates a draft event with an auto-generated slug", async () => {
    const agent = await loginAs("superadmin@gdn-commerce.com");
    const res = await agent
      .post("/api/admin/events")
      .send(validPayload({ title: `${TEST_SLUG_PREFIX}Create Flow` }));
    expect(res.status).toBe(201);
    expect(res.body.status).toBe("DRAFT");
    expect(res.body.slug).toBe(`${TEST_SLUG_PREFIX.toLowerCase()}create-flow`);
  });

  it("rejects an incomplete payload with 422", async () => {
    const agent = await loginAs("superadmin@gdn-commerce.com");
    const res = await agent.post("/api/admin/events").send({ title: "Missing fields" });
    expect(res.status).toBe(422);
  });

  it("updates a field via PATCH", async () => {
    const agent = await loginAs("superadmin@gdn-commerce.com");
    const created = await agent
      .post("/api/admin/events")
      .send(validPayload({ slug: `${TEST_SLUG_PREFIX}patch-me` }));
    const res = await agent
      .patch(`/api/admin/events/${created.body.id}`)
      .send({ capacity: 250 });
    expect(res.status).toBe(200);
    expect(res.body.capacity).toBe(250);
  });

  it("publishes a draft; publishing an already-published event is an idempotent no-op", async () => {
    const agent = await loginAs("superadmin@gdn-commerce.com");
    const created = await agent
      .post("/api/admin/events")
      .send(validPayload({ slug: `${TEST_SLUG_PREFIX}publish-me` }));

    const published = await agent.post(`/api/admin/events/${created.body.id}/publish`);
    expect(published.status).toBe(200);
    expect(published.body.status).toBe("PUBLISHED");

    // transitionEvent treats same-status as a no-op (not an error) — see
    // apps/backend/src/lib/lifecycle/transitionEvent.ts.
    const again = await agent.post(`/api/admin/events/${created.body.id}/publish`);
    expect(again.status).toBe(200);
    expect(again.body.status).toBe("PUBLISHED");
  });

  it("rejects publishing an event that can no longer legally reach PUBLISHED", async () => {
    const agent = await loginAs("superadmin@gdn-commerce.com");
    const created = await agent
      .post("/api/admin/events")
      .send(validPayload({ slug: `${TEST_SLUG_PREFIX}publish-cancelled` }));
    await agent.post(`/api/admin/events/${created.body.id}/publish`);
    await agent.post(`/api/admin/events/${created.body.id}/cancel`);

    const res = await agent.post(`/api/admin/events/${created.body.id}/publish`);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("INVALID_TRANSITION");
  });

  it("cancels a published event", async () => {
    const agent = await loginAs("superadmin@gdn-commerce.com");
    const created = await agent
      .post("/api/admin/events")
      .send(validPayload({ slug: `${TEST_SLUG_PREFIX}cancel-me` }));
    await agent.post(`/api/admin/events/${created.body.id}/publish`);

    const res = await agent.post(`/api/admin/events/${created.body.id}/cancel`);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("CANCELLED");
  });

  it("manual status override now enforces the transition table", async () => {
    const agent = await loginAs("superadmin@gdn-commerce.com");
    const created = await agent
      .post("/api/admin/events")
      .send(validPayload({ slug: `${TEST_SLUG_PREFIX}manual-status` }));

    // A draft has never gone through /publish, so DRAFT -> COMPLETED is illegal per
    // the transition table — the manual override now routes through transitionEvent
    // too, so it's rejected exactly like POST /transition would reject it.
    const res = await agent
      .patch(`/api/admin/events/${created.body.id}/status`)
      .send({ status: "COMPLETED" });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("INVALID_TRANSITION");

    // A legal forced jump still works.
    const legal = await agent
      .patch(`/api/admin/events/${created.body.id}/status`)
      .send({ status: "PUBLISHED" });
    expect(legal.status).toBe(200);
    expect(legal.body.status).toBe("PUBLISHED");
  });

  it("rejects an invalid status value on the manual override", async () => {
    const agent = await loginAs("superadmin@gdn-commerce.com");
    const created = await agent
      .post("/api/admin/events")
      .send(validPayload({ slug: `${TEST_SLUG_PREFIX}manual-status-invalid` }));

    const res = await agent
      .patch(`/api/admin/events/${created.body.id}/status`)
      .send({ status: "NOT_A_REAL_STATUS" });
    expect(res.status).toBe(422);
  });

  it("rejects participants from the manual status override (no permission)", async () => {
    const admin = await loginAs("superadmin@gdn-commerce.com");
    const created = await admin
      .post("/api/admin/events")
      .send(validPayload({ slug: `${TEST_SLUG_PREFIX}manual-status-forbidden` }));

    const participant = await loginAs("demo@gdn-commerce.com");
    const res = await participant
      .patch(`/api/admin/events/${created.body.id}/status`)
      .send({ status: "PUBLISHED" });
    expect(res.status).toBe(403);
  });

  it("deletes a draft event with no registrations", async () => {
    const agent = await loginAs("superadmin@gdn-commerce.com");
    const created = await agent
      .post("/api/admin/events")
      .send(validPayload({ slug: `${TEST_SLUG_PREFIX}delete-me` }));

    const res = await agent.delete(`/api/admin/events/${created.body.id}`);
    expect(res.status).toBe(204);

    const check = await agent.get(`/api/admin/events/${created.body.id}`);
    expect(check.status).toBe(404);
  });

  it("refuses to delete a published event", async () => {
    const agent = await loginAs("superadmin@gdn-commerce.com");
    const created = await agent
      .post("/api/admin/events")
      .send(validPayload({ slug: `${TEST_SLUG_PREFIX}no-delete` }));
    await agent.post(`/api/admin/events/${created.body.id}/publish`);

    const res = await agent.delete(`/api/admin/events/${created.body.id}`);
    expect(res.status).toBe(400);
  });

  it("scopes an event admin's list + access to its assigned events only", async () => {
    const eventAgent = await loginAs("eventadmin@gdn-commerce.com");
    const list = await eventAgent.get("/api/admin/events");
    expect(list.status).toBe(200);
    expect(list.body.length).toBe(2);

    const notAssigned = await prisma.event.findFirstOrThrow({
      where: { slug: "love-hate-work-relationship" },
    });
    const res = await eventAgent.get(`/api/admin/events/${notAssigned.id}`);
    expect(res.status).toBe(403);
  });

  it("attaches and replaces speakers via speakerIds", async () => {
    const agent = await loginAs("superadmin@gdn-commerce.com");
    const s1 = await agent.post("/api/admin/speakers").send({ name: `${TEST_SLUG_PREFIX}speaker-1` });
    const s2 = await agent.post("/api/admin/speakers").send({ name: `${TEST_SLUG_PREFIX}speaker-2` });

    const created = await agent
      .post("/api/admin/events")
      .send(validPayload({ slug: `${TEST_SLUG_PREFIX}with-speakers`, speakerIds: [s1.body.id] }));
    expect(created.status).toBe(201);
    expect(created.body.speakers.map((s: { id: string }) => s.id)).toEqual([s1.body.id]);

    // Full-replace: s2 in, s1 out.
    const patched = await agent
      .patch(`/api/admin/events/${created.body.id}`)
      .send({ speakerIds: [s2.body.id] });
    expect(patched.status).toBe(200);
    expect(patched.body.speakers.map((s: { id: string }) => s.id)).toEqual([s2.body.id]);

    await prisma.speaker.deleteMany({ where: { name: { startsWith: TEST_SLUG_PREFIX } } });
  });

  it("transitions via POST /transition and writes history", async () => {
    const agent = await loginAs("superadmin@gdn-commerce.com");
    const created = await agent.post("/api/admin/events").send(validPayload({ slug: `${TEST_SLUG_PREFIX}transition-me` }));
    const res = await agent.post(`/api/admin/events/${created.body.id}/transition`).send({ to: "PUBLISHED", reason: "go" });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("PUBLISHED");
    expect(typeof res.body.statusChangedAt).toBe("string");
    expect(res.body.isOverdue).toBe(false);
  });

  it("rejects an illegal transition with 409 + allowed list", async () => {
    const agent = await loginAs("superadmin@gdn-commerce.com");
    const created = await agent.post("/api/admin/events").send(validPayload({ slug: `${TEST_SLUG_PREFIX}bad-transition` }));
    // PATCH /:id/status is now guarded by the same transition table (DRAFT -> COMPLETED
    // is illegal), so this test seeds the precondition directly rather than going through
    // the now-guarded HTTP override — it exercises transitionEvent's 409 response, not the
    // (now impossible) illegal-jump-via-status path.
    await prisma.event.update({ where: { id: created.body.id }, data: { status: "COMPLETED" } });
    const res = await agent.post(`/api/admin/events/${created.body.id}/transition`).send({ to: "REGISTRATION_OPEN" });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("INVALID_TRANSITION");
    expect(res.body.error.details.allowed).toContain("ARCHIVED");
  });

  it("returns the new lifecycle fields on GET", async () => {
    const agent = await loginAs("superadmin@gdn-commerce.com");
    const created = await agent.post("/api/admin/events").send(validPayload({ slug: `${TEST_SLUG_PREFIX}dto-fields`, selectionMode: "CURATED" }));
    const res = await agent.get(`/api/admin/events/${created.body.id}`);
    expect(res.body.selectionMode).toBe("CURATED");
    expect(res.body).toHaveProperty("registrationOpensAt");
    expect(res.body).toHaveProperty("nextAutoTransition");
  });

  it("returns the status history for an event, newest first", async () => {
    const agent = await loginAs("superadmin@gdn-commerce.com");
    const created = await agent.post("/api/admin/events").send(validPayload({ slug: `${TEST_SLUG_PREFIX}history` }));
    await agent.post(`/api/admin/events/${created.body.id}/transition`).send({ to: "PUBLISHED", reason: "go live" });
    await agent.post(`/api/admin/events/${created.body.id}/transition`).send({ to: "REGISTRATION_OPEN" });

    const res = await agent.get(`/api/admin/events/${created.body.id}/history`);
    expect(res.status).toBe(200);
    expect(res.body.length).toBe(2);
    expect(res.body[0].toStatus).toBe("REGISTRATION_OPEN");
    expect(res.body[0].fromStatus).toBe("PUBLISHED");
    expect(res.body[1].toStatus).toBe("PUBLISHED");
    expect(res.body[1].reason).toBe("go live");
    expect(res.body[1].actorType).toBe("ADMIN");
  });

  it("404s for a nonexistent event's history", async () => {
    const agent = await loginAs("superadmin@gdn-commerce.com");
    const res = await agent.get("/api/admin/events/does-not-exist/history");
    expect(res.status).toBe(404);
  });

  it("scopes history access to the event admin's assigned events", async () => {
    const eventAgent = await loginAs("eventadmin@gdn-commerce.com");
    const notAssigned = await prisma.event.findFirstOrThrow({
      where: { slug: "love-hate-work-relationship" },
    });
    const res = await eventAgent.get(`/api/admin/events/${notAssigned.id}/history`);
    expect(res.status).toBe(403);
  });
});
