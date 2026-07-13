import { describe, it, expect } from "vitest";
import { Role } from "@repo/shared-types";
import { prisma } from "../db/client";
import { canAccessEvent } from "./eventScope";

// Integration — requires a running, seeded Postgres.
describe("canAccessEvent", () => {
  it("scopes EVENT_ADMIN to assigned events only", async () => {
    const admin = await prisma.user.findUniqueOrThrow({
      where: { email: "eventadmin@gdn-commerce.com" },
    });
    const assigned = await prisma.event.findUniqueOrThrow({
      where: { slug: "not-lost-in-translation" },
    });
    const other = await prisma.event.findUniqueOrThrow({
      where: { slug: "love-hate-work-relationship" },
    });

    expect(await canAccessEvent(Role.EVENT_ADMIN, admin.id, assigned.id)).toBe(true);
    expect(await canAccessEvent(Role.EVENT_ADMIN, admin.id, other.id)).toBe(false);
  });

  it("lets non-scoped roles (SUPER_ADMIN) access any event", async () => {
    const other = await prisma.event.findUniqueOrThrow({
      where: { slug: "love-hate-work-relationship" },
    });
    expect(await canAccessEvent(Role.SUPER_ADMIN, "anyone", other.id)).toBe(true);
  });
});
