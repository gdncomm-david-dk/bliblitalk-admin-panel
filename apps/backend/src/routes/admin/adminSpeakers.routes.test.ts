import { describe, it, expect, beforeEach, afterAll } from "vitest";
import request from "supertest";
import { createApp } from "../../app";
import { prisma } from "../../db/client";

const TEST_PREFIX = "Speaker CRUD Test ";

async function purgeSyntheticSpeakers() {
  await prisma.speaker.deleteMany({ where: { name: { startsWith: TEST_PREFIX } } });
}

// Integration — requires a running, seeded Postgres.
describe("admin speakers CRUD", () => {
  const app = createApp();

  beforeEach(purgeSyntheticSpeakers);
  afterAll(purgeSyntheticSpeakers);

  // Apps Gateway authenticates at the edge and forwards the signed-in user’s email in
  // X-User-Id, so there is no login request to make. supertest’s agent applies .set()
  // headers to every request it sends — the same "stays signed in" behaviour the session
  // cookie used to give this helper.
  function loginAs(email: string) {
    return request.agent(app).set("X-User-Id", email);
  }

  it("requires auth", async () => {
    const res = await request(app).get("/api/admin/speakers");
    expect(res.status).toBe(401);
  });

  it("rejects Talent Acquisition (no event:update permission)", async () => {
    const agent = loginAs("hrta@gdn-commerce.com");
    const res = await agent.get("/api/admin/speakers");
    expect(res.status).toBe(403);
  });

  it("creates a speaker with full profile and lists it with eventCount 0", async () => {
    const agent = loginAs("superadmin@gdn-commerce.com");
    const created = await agent.post("/api/admin/speakers").send({
      name: `${TEST_PREFIX}Jane`,
      title: "VP Engineering",
      company: "Blibli",
      bioShort: "Short bio",
      credentials: ["10y engineering", "Speaker at TechConf"],
      featured: true,
    });
    expect(created.status).toBe(201);
    expect(created.body.name).toBe(`${TEST_PREFIX}Jane`);
    expect(created.body.featured).toBe(true);
    expect(created.body.eventCount).toBe(0);

    const list = await agent.get(`/api/admin/speakers?q=${encodeURIComponent(TEST_PREFIX)}`);
    expect(list.status).toBe(200);
    expect(list.body.some((s: { id: string }) => s.id === created.body.id)).toBe(true);
  });

  it("rejects a nameless speaker with 422", async () => {
    const agent = loginAs("superadmin@gdn-commerce.com");
    const res = await agent.post("/api/admin/speakers").send({ title: "No name" });
    expect(res.status).toBe(422);
  });

  it("updates a speaker via PATCH", async () => {
    const agent = loginAs("superadmin@gdn-commerce.com");
    const created = await agent.post("/api/admin/speakers").send({ name: `${TEST_PREFIX}Patch` });
    const res = await agent
      .patch(`/api/admin/speakers/${created.body.id}`)
      .send({ company: "GDN", featured: true });
    expect(res.status).toBe(200);
    expect(res.body.company).toBe("GDN");
    expect(res.body.featured).toBe(true);
  });

  it("deletes a speaker", async () => {
    const agent = loginAs("superadmin@gdn-commerce.com");
    const created = await agent.post("/api/admin/speakers").send({ name: `${TEST_PREFIX}Delete` });
    const res = await agent.delete(`/api/admin/speakers/${created.body.id}`);
    expect(res.status).toBe(204);
    const gone = await prisma.speaker.findUnique({ where: { id: created.body.id } });
    expect(gone).toBeNull();
  });

  it("404s on updating a missing speaker", async () => {
    const agent = loginAs("superadmin@gdn-commerce.com");
    const res = await agent.patch("/api/admin/speakers/nonexistent-id").send({ name: "X" });
    expect(res.status).toBe(404);
  });
});
