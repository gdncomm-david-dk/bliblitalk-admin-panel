import { describe, it, expect, beforeEach, afterAll } from "vitest";
import request from "supertest";
import { createApp } from "../../../app";
import { prisma } from "../../../db/client";

// Synthetic speakers created below use an "AAA-" name prefix so they sort first
// and land within the endpoint's take-limit; purged so the suite is idempotent.
const TEST_NAME_PREFIX = "AAA-pubspeaker-test-";

async function purgeSyntheticSpeakers() {
  await prisma.speaker.deleteMany({ where: { name: { startsWith: TEST_NAME_PREFIX } } });
}

// Integration — requires a running, seeded Postgres.
describe("public speakers", () => {
  const app = createApp();

  beforeEach(purgeSyntheticSpeakers);
  afterAll(purgeSyntheticSpeakers);

  it("returns featured speakers with the public DTO shape", async () => {
    const featured = await prisma.speaker.create({
      data: { name: `${TEST_NAME_PREFIX}featured`, title: "Keynote", company: "Blibli", featured: true },
    });

    const res = await request(app).get("/api/public/speakers");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);

    // A DTO, not the raw row.
    const first = res.body[0];
    expect(first).toHaveProperty("id");
    expect(first).toHaveProperty("name");
    expect(first).toHaveProperty("featured");

    // With at least one featured speaker present, the endpoint returns the
    // featured-only set: our speaker is in it and every returned row is featured.
    expect(res.body.some((s: { id: string }) => s.id === featured.id)).toBe(true);
    expect(res.body.every((s: { featured: boolean }) => s.featured === true)).toBe(true);
  });
});
