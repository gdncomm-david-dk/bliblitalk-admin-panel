import { describe, it, expect } from "vitest";
import request from "supertest";
import { createApp } from "../../../app";

describe("my events", () => {
  const app = createApp();

  it("requires auth", async () => {
    const res = await request(app).get("/api/public/me/events");
    expect(res.status).toBe(401);
  });

  it("returns the user's registrations with status flags", async () => {
    const agent = request.agent(app);
    await agent
      .post("/api/auth/login")
      .send({ email: "demo@gdn-commerce.com", password: "password123" });
    const res = await agent.get("/api/public/me/events");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
    const item = res.body[0];
    expect(item).toHaveProperty("event");
    expect(item).toHaveProperty("status");
    expect(item).toHaveProperty("attendance");
    expect(item).toHaveProperty("certificateAvailable");
    expect(item).toHaveProperty("speedDatingCompleted");
  });
});
