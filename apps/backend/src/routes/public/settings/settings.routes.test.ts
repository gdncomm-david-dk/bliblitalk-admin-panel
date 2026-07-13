import { describe, it, expect } from "vitest";
import request from "supertest";
import { createApp } from "../../../app";

describe("site settings", () => {
  const app = createApp();

  it("returns the contact email", async () => {
    const res = await request(app).get("/api/public/site-settings");
    expect(res.status).toBe(200);
    expect(res.body.contactEmail).toMatch(/@/);
  });
});
