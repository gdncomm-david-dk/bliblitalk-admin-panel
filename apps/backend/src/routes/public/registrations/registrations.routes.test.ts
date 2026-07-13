import { describe, it, expect } from "vitest";
import request from "supertest";
import { createApp } from "../../../app";

// Integration — requires a running, seeded Postgres.
describe("registrations", () => {
  const app = createApp();

  it("requires auth", async () => {
    const res = await request(app).post("/api/public/me/registrations/does-not-exist/cancel");
    expect(res.status).toBe(401);
  });

  it("returns 404 for an unknown registration id", async () => {
    const agent = request.agent(app);
    await agent.post("/api/auth/login").send({ email: "demo@gdn-commerce.com", password: "password123" });
    const res = await agent.post("/api/public/me/registrations/does-not-exist/cancel");
    expect(res.status).toBe(404);
  });

  it("registers then cancels, surfacing as CANCELLED", async () => {
    const agent = request.agent(app);
    await agent.post("/api/auth/login").send({ email: "demo@gdn-commerce.com", password: "password123" });

    const reg = await agent.post("/api/public/events/future-of-work-skills/register").send({});
    expect(reg.status).toBe(201);

    const cancelled = await agent.post(`/api/public/me/registrations/${reg.body.id}/cancel`);
    expect(cancelled.status).toBe(200);
    expect(cancelled.body.status).toBe("CANCELLED");

    const again = await agent.post(`/api/public/me/registrations/${reg.body.id}/cancel`);
    expect(again.status).toBe(400);
  });
});
