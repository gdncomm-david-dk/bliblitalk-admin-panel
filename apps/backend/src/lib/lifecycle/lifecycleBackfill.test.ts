import { describe, it, expect } from "vitest";
import { EventStatus } from "@repo/shared-types";
import { prisma } from "../../db/client";

// These two assertions scan the whole database rather than a fixture of their own, because
// what they guard is a property of the *real* rows the backfill migration produced.
//
// That makes them race with any test file that is mid-flight in another vitest worker.
// `transitionEvent.test.ts` in particular creates events directly at a non-DRAFT status
// (deliberately — it is testing the transition machinery, so it must not go through it to
// set up), which means those rows genuinely have no history row for as long as they exist.
// Seeing one is not an invariant violation, it is someone else's fixture caught in the act.
//
// So the scans skip rows whose slug carries a known test-fixture prefix. This does not weaken
// the invariant: every excluded slug is created and deleted inside a single test file, and no
// row the migration touched can ever match one of these prefixes.
const FIXTURE_SLUG_PREFIXES = ["lifecycle-txn-test-", "lifecycle-sweep-test-", "admin-crud-test-", "p4-shortlist-badge-"];
const notAFixture = { NOT: FIXTURE_SLUG_PREFIXES.map((prefix) => ({ slug: { startsWith: prefix } })) };

describe("lifecycle backfill invariant", () => {
  it("every non-DRAFT event has at least one EventStatusHistory row", async () => {
    const historyless = await prisma.event.findMany({
      where: {
        ...notAFixture,
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
        ...notAFixture,
        status: EventStatus.PUBLISHED,
        OR: [{ registrationOpensAt: null }, { registrationOpensAt: { lte: new Date() } }],
      },
      select: { id: true, slug: true },
    });

    expect(stuck).toEqual([]);
  });
});
