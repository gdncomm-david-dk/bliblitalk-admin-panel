import { describe, it, expect, beforeEach, afterAll } from "vitest";
import request from "supertest";
import { DEFAULT_TESTIMONIALS_SETTINGS } from "@repo/shared-types";
import { createApp } from "../../app";
import { prisma } from "../../db/client";

const KEY = "landing_testimonials";

// Deleting the row (rather than writing a "clean" value) is what restores the real default:
// the service falls back to DEFAULT_TESTIMONIALS_SETTINGS whenever the key is unset.
async function clearTestimonials() {
  await prisma.moduleSettings.deleteMany({ where: { key: KEY } });
}

// Integration — requires a running, seeded Postgres.
describe("admin landing testimonials settings", () => {
  const app = createApp();

  beforeEach(clearTestimonials);
  afterAll(clearTestimonials);

  function loginAs(email: string) {
    return request.agent(app).set("X-User-Id", email);
  }

  it("requires auth", async () => {
    const res = await request(app).get("/api/admin/settings/testimonials");
    expect(res.status).toBe(401);
  });

  it("rejects an event admin (no settings:manage)", async () => {
    const agent = loginAs("eventadmin@gdn-commerce.com");
    expect((await agent.get("/api/admin/settings/testimonials")).status).toBe(403);
    expect((await agent.put("/api/admin/settings/testimonials").send({ items: [] })).status).toBe(
      403,
    );
  });

  it("falls back to the shipped copy when the key has never been set", async () => {
    const agent = loginAs("superadmin@gdn-commerce.com");
    const res = await agent.get("/api/admin/settings/testimonials");
    expect(res.status).toBe(200);
    expect(res.body).toEqual(DEFAULT_TESTIMONIALS_SETTINGS);
  });

  it("saves an arbitrary number of testimonials and reads them back in order", async () => {
    const agent = loginAs("superadmin@gdn-commerce.com");
    // Deliberately more than the three that ship — "add as many as you want" is the feature.
    const items = Array.from({ length: 7 }, (_, i) => ({
      quote: `Quote number ${i + 1}`,
      name: `Person ${i + 1}`,
      meta: i % 2 === 0 ? `Role ${i + 1}` : "",
    }));

    const saved = await agent.put("/api/admin/settings/testimonials").send({ items });
    expect(saved.status).toBe(200);
    expect(saved.body.items).toEqual(items);

    const reread = await agent.get("/api/admin/settings/testimonials");
    expect(reread.body.items).toEqual(items);
  });

  it("replaces the whole list rather than merging into it", async () => {
    const agent = loginAs("superadmin@gdn-commerce.com");
    await agent
      .put("/api/admin/settings/testimonials")
      .send({ items: [{ quote: "First", name: "A", meta: "" }] });

    const second = await agent
      .put("/api/admin/settings/testimonials")
      .send({ items: [{ quote: "Second", name: "B", meta: "" }] });

    expect(second.body.items).toHaveLength(1);
    expect(second.body.items[0].quote).toBe("Second");
  });

  it("accepts an empty list, which puts the landing page back on its fallback copy", async () => {
    const agent = loginAs("superadmin@gdn-commerce.com");
    const res = await agent.put("/api/admin/settings/testimonials").send({ items: [] });
    expect(res.status).toBe(200);
    expect(res.body.items).toEqual([]);
  });

  it("rejects a blank quote or name with 422", async () => {
    const agent = loginAs("superadmin@gdn-commerce.com");

    const blankQuote = await agent
      .put("/api/admin/settings/testimonials")
      .send({ items: [{ quote: "", name: "A", meta: "" }] });
    expect(blankQuote.status).toBe(422);

    const blankName = await agent
      .put("/api/admin/settings/testimonials")
      .send({ items: [{ quote: "Q", name: "", meta: "" }] });
    expect(blankName.status).toBe(422);

    // A rejected save must not have written anything.
    expect(await prisma.moduleSettings.findUnique({ where: { key: KEY } })).toBeNull();
  });
});
