import { describe, it, expect, beforeEach, afterAll } from "vitest";
import request from "supertest";
import { createApp } from "../../app";
import { prisma } from "../../db/client";

const TEST_PREFIX = "Category CRUD Test ";

async function purgeSyntheticCategories() {
  await prisma.eventCategory.deleteMany({ where: { name: { startsWith: TEST_PREFIX } } });
}

// Integration — requires a running, seeded Postgres.
describe("admin categories CRUD", () => {
  const app = createApp();

  beforeEach(purgeSyntheticCategories);
  afterAll(purgeSyntheticCategories);

  async function loginAs(email: string) {
    const agent = request.agent(app);
    await agent.post("/api/auth/login").send({ email, password: "password123" });
    return agent;
  }

  it("requires auth", async () => {
    const res = await request(app).get("/api/admin/categories");
    expect(res.status).toBe(401);
  });

  it("rejects a viewer (no permission)", async () => {
    const agent = await loginAs("viewer@gdn-commerce.com");
    const res = await agent.get("/api/admin/categories");
    expect(res.status).toBe(403);
  });

  it("creates a category and lists it with eventCount 0", async () => {
    const agent = await loginAs("superadmin@gdn-commerce.com");
    const created = await agent.post("/api/admin/categories").send({ name: `${TEST_PREFIX}Robotics` });
    expect(created.status).toBe(201);
    expect(created.body.name).toBe(`${TEST_PREFIX}Robotics`);
    expect(created.body.isActive).toBe(true);
    expect(created.body.eventCount).toBe(0);

    const list = await agent.get(`/api/admin/categories?q=${encodeURIComponent(TEST_PREFIX)}`);
    expect(list.status).toBe(200);
    expect(list.body.some((c: { id: string }) => c.id === created.body.id)).toBe(true);
  });

  it("rejects a nameless category with 422", async () => {
    const agent = await loginAs("superadmin@gdn-commerce.com");
    const res = await agent.post("/api/admin/categories").send({});
    expect(res.status).toBe(422);
  });

  it("rejects a duplicate name (case-insensitive) with 409", async () => {
    const agent = await loginAs("superadmin@gdn-commerce.com");
    await agent.post("/api/admin/categories").send({ name: `${TEST_PREFIX}Duplicate` });
    const res = await agent.post("/api/admin/categories").send({ name: `${TEST_PREFIX}duplicate` });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("DUPLICATE_CATEGORY");
  });

  it("updates a category via PATCH, rejecting a rename to a duplicate", async () => {
    const agent = await loginAs("superadmin@gdn-commerce.com");
    const a = await agent.post("/api/admin/categories").send({ name: `${TEST_PREFIX}A` });
    const b = await agent.post("/api/admin/categories").send({ name: `${TEST_PREFIX}B` });

    const renamed = await agent
      .patch(`/api/admin/categories/${a.body.id}`)
      .send({ name: `${TEST_PREFIX}A Renamed` });
    expect(renamed.status).toBe(200);
    expect(renamed.body.name).toBe(`${TEST_PREFIX}A Renamed`);

    const clash = await agent
      .patch(`/api/admin/categories/${b.body.id}`)
      .send({ name: `${TEST_PREFIX}A Renamed` });
    expect(clash.status).toBe(409);
    expect(clash.body.error.code).toBe("DUPLICATE_CATEGORY");
  });

  it("404s on updating a missing category", async () => {
    const agent = await loginAs("superadmin@gdn-commerce.com");
    const res = await agent.patch("/api/admin/categories/nonexistent-id").send({ name: "X" });
    expect(res.status).toBe(404);
  });

  it("hard-blocks deletion when an upcoming event still uses the category", async () => {
    const agent = await loginAs("superadmin@gdn-commerce.com");
    const category = await agent.post("/api/admin/categories").send({ name: `${TEST_PREFIX}InUse` });
    const future = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    const event = await agent.post("/api/admin/events").send({
      title: `${TEST_PREFIX}Event`,
      description: "test",
      categoryId: category.body.id,
      location: "Online",
      startsAt: future,
      endsAt: future,
      capacity: 10,
    });
    expect(event.status).toBe(201);

    const res = await agent.delete(`/api/admin/categories/${category.body.id}`);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("CATEGORY_IN_USE");

    // Cleanup — the event fixture isn't purged by purgeSyntheticCategories.
    await prisma.event.delete({ where: { id: event.body.id } });
  });

  it("soft-deletes (deactivates) a category with no upcoming events", async () => {
    const agent = await loginAs("superadmin@gdn-commerce.com");
    const category = await agent.post("/api/admin/categories").send({ name: `${TEST_PREFIX}Unused` });
    const res = await agent.delete(`/api/admin/categories/${category.body.id}`);
    expect(res.status).toBe(204);

    const row = await prisma.eventCategory.findUnique({ where: { id: category.body.id } });
    expect(row).not.toBeNull();
    expect(row!.isActive).toBe(false);
  });

  it("excludes inactive categories from the default list, includes them with includeInactive=true", async () => {
    const agent = await loginAs("superadmin@gdn-commerce.com");
    const category = await agent
      .post("/api/admin/categories")
      .send({ name: `${TEST_PREFIX}ToggleVisibility` });
    await agent.delete(`/api/admin/categories/${category.body.id}`);

    const defaultList = await agent.get(`/api/admin/categories?q=${encodeURIComponent(TEST_PREFIX)}`);
    expect(defaultList.body.some((c: { id: string }) => c.id === category.body.id)).toBe(false);

    const withInactive = await agent.get(
      `/api/admin/categories?q=${encodeURIComponent(TEST_PREFIX)}&includeInactive=true`,
    );
    expect(withInactive.body.some((c: { id: string }) => c.id === category.body.id)).toBe(true);
  });
});
