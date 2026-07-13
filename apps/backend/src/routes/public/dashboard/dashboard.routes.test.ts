import { describe, it, expect } from "vitest";
import request from "supertest";
import { createApp } from "../../../app";

describe("dashboard", () => {
  const app = createApp();

  it("requires auth", async () => {
    const res = await request(app).get("/api/public/me/dashboard");
    expect(res.status).toBe(401);
  });

  it("returns the full dashboard payload when authenticated", async () => {
    const agent = request.agent(app);
    await agent
      .post("/api/auth/login")
      .send({ email: "demo@gdn-commerce.com", password: "password123" });
    const res = await agent.get("/api/public/me/dashboard");
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("user");
    expect(res.body).toHaveProperty("stats");
    expect(res.body.stats).toHaveProperty("registered");
    expect(res.body).toHaveProperty("recommended");
    expect(res.body).toHaveProperty("upcomingEvents");
  });
});
