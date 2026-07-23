import { describe, it, expect } from "vitest";
import { EventStatus } from "@repo/shared-types";
import { prisma } from "../../db/client";

describe("lifecycle backfill invariant", () => {
  it("every non-DRAFT event has at least one EventStatusHistory row", async () => {
    const historyless = await prisma.event.findMany({
      where: {
        status: { not: EventStatus.DRAFT },
        statusHistory: { none: {} },
      },
      select: { id: true, slug: true, status: true },
    });

    expect(historyless).toEqual([]);
  });

  it("no PUBLISHED event has a null or already-passed registrationOpensAt", async () => {
    const stuck = await prisma.event.findMany({
      where: {
        status: EventStatus.PUBLISHED,
        OR: [{ registrationOpensAt: null }, { registrationOpensAt: { lte: new Date() } }],
      },
      select: { id: true, slug: true },
    });

    expect(stuck).toEqual([]);
  });
});
