import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    /**
     * Run test files one at a time.
     *
     * This suite is an integration suite: every file talks to the same local Postgres, and
     * nothing gives a file its own schema or database. Vitest's default is to run files in
     * parallel worker threads, which means several files insert, transition and purge rows in
     * one shared `Event` table at the same time.
     *
     * That is not merely untidy — it makes assertions wrong. `lib/lifecycle/lifecycleBackfill.test.ts`
     * asserts invariants over the *whole* table ("every non-DRAFT event has at least one
     * EventStatusHistory row"), and six other files create events directly with
     * `prisma.event.create`, bypassing the lifecycle service that writes those history rows. Under
     * parallel execution the invariant test observes another file's half-built events and fails
     * correctly on data that was never meant to be in scope. The same shared-state race is the
     * most likely source of the intermittent 500 from `adminDashboard.routes.test.ts`, whose
     * handler aggregates over every event and registration in the database.
     *
     * The assertions are right; the isolation was missing. Serialising the files is the fix that
     * keeps the invariant test genuinely global — narrowing it to ignore other files' rows would
     * delete the only check that the whole table is consistent. The cost is wall-clock: the suite
     * runs longer, which is the correct trade for a suite whose results can be trusted.
     */
    fileParallelism: false,
  },
});
