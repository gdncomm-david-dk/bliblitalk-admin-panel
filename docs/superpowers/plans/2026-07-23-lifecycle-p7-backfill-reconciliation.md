# P7 — Lifecycle Backfill & Reconciliation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the gap P1's migration left open — give every non-`DRAFT` `Event` at least one `EventStatusHistory` row, promote any `PUBLISHED` event whose registration should already be open, and make both fixes durable across every future `seed.ts` reseed.

**Architecture:** A general SQL migration (three ordered steps: promote stuck `PUBLISHED` rows → backfill `statusChangedAt` → insert one synthetic history row per historyless non-`DRAFT` event) fixes whatever is in the DB right now. A matching `seed.ts` edit (6 event `status` literals + a synthetic-history insert block) keeps local dev self-consistent across every future `prisma db seed`. A permanent Vitest regression test makes the exit criterion durable.

**Tech Stack:** Prisma (raw SQL migration), PostgreSQL, TypeScript, Vitest + the existing `prisma` client test harness (`apps/backend/src/db/client.ts`).

## Global Constraints

- The migration must be **general** — driven by `NOT EXISTS (SELECT 1 FROM "EventStatusHistory" ...)`, never hardcoded event IDs or slugs.
- Steps must run in this exact order in one migration file: A (promote) → B (backfill `statusChangedAt`) → C (insert history). B and C must see A's corrected status.
- A synthetic history row uses `fromStatus = NULL`, `actorType = 'SYSTEM'`, `actorId = NULL`, `reason = 'backfill'`, `id = 'histbf_' || <eventId>`.
- `sideEffectsStatus` for a synthetic `COMPLETED` row is `'DONE'` (its real side effects — `isOverdue=false`, `displayConfig.pastEvent=true` — are already true via schema defaults); every other status uses `'NONE'`.
- No change to `transitionEvent.ts`, `scheduleDecisions.ts`, `sweepEventLifecycle.ts`, or any frontend code — P7 is backfill/migration/seed only.
- `seed.ts`'s 3 `COMPLETED` fixture events (`breaking`, `kartini`, `loveHate`) and their future-relative-to-today `startsAt` are a deliberate, pre-existing fixture design — do not touch their dates.

---

### Task 1: Migration — general lifecycle backfill

**Files:**
- Create: `apps/backend/src/db/prisma/migrations/20260723070000_lifecycle_backfill/migration.sql`

**Interfaces:**
- Consumes: existing `Event` columns (`status`, `registrationOpensAt`, `publishedAt`, `registrationDeadline`, `startsAt`, `endsAt`, `autoCompleteAfterMinutes`, `statusChangedAt`) and `EventStatusHistory` table — both already exist from P1 (`20260716060555_lifecycle_engine`).
- Produces: nothing consumed by later tasks in this plan (Task 2/3 are independent of the migration's exact file path) — this task is verified standalone via `prisma migrate dev` and the manual check in Step 4.

- [ ] **Step 1: Write the migration file**

Create `apps/backend/src/db/prisma/migrations/20260723070000_lifecycle_backfill/migration.sql`:

```sql
-- P7: backfill lifecycle status + history for events that predate the P1 engine
-- (or were seeded directly with a non-DRAFT status). General — matches any
-- historyless non-DRAFT row, not specific event IDs. Runs in three ordered
-- steps: A must run before B/C so they see the corrected status.

-- Step A: promote PUBLISHED rows whose registration should already be open.
-- A PUBLISHED row with a genuine future registrationOpensAt is already
-- correct and is left alone — it will auto-advance via the P2 scheduler.
UPDATE "Event" e
SET status = 'REGISTRATION_OPEN'
WHERE status = 'PUBLISHED'
  AND (e."registrationOpensAt" IS NULL OR e."registrationOpensAt" <= CURRENT_TIMESTAMP)
  AND NOT EXISTS (SELECT 1 FROM "EventStatusHistory" h WHERE h."eventId" = e.id);

-- Step B: backfill statusChangedAt using each status's own natural boundary
-- (mirrors scheduleDecisions.ts's own transition rules, not an arbitrary "now").
UPDATE "Event" e
SET "statusChangedAt" = CASE e.status
  WHEN 'REGISTRATION_OPEN' THEN COALESCE(e."publishedAt", CURRENT_TIMESTAMP)
  WHEN 'REGISTRATION_CLOSED' THEN COALESCE(e."registrationDeadline", e."startsAt")
  WHEN 'ONGOING' THEN e."startsAt"
  WHEN 'COMPLETED' THEN e."endsAt" + (e."autoCompleteAfterMinutes" * INTERVAL '1 minute')
  ELSE CURRENT_TIMESTAMP
END
WHERE e.status != 'DRAFT'
  AND NOT EXISTS (SELECT 1 FROM "EventStatusHistory" h WHERE h."eventId" = e.id);

-- Step C: insert one synthetic history row per affected event (fromStatus
-- is NULL because there is no real prior transition to record).
INSERT INTO "EventStatusHistory"
  (id, "eventId", "fromStatus", "toStatus", "actorType", "actorId", "reason", "sideEffectsStatus", "createdAt")
SELECT
  'histbf_' || e.id,
  e.id,
  NULL,
  e.status,
  'SYSTEM',
  NULL,
  'backfill',
  CASE WHEN e.status = 'COMPLETED' THEN 'DONE' ELSE 'NONE' END,
  e."statusChangedAt"
FROM "Event" e
WHERE e.status != 'DRAFT'
  AND NOT EXISTS (SELECT 1 FROM "EventStatusHistory" h WHERE h."eventId" = e.id);
```

- [ ] **Step 2: Verify the migration SQL against a throwaway scenario (not committed)**

This is a manual, uncommitted sanity check — not a repo file. `psql` is not installed in this environment, so use Prisma's own `db execute`, which runs a `.sql` file directly against the dev DB and honors any `BEGIN`/`ROLLBACK` inside it. Write the scratch file to the scratchpad directory (outside the repo), e.g. `C:\Users\david.dk\AppData\Local\Temp\claude\...\scratchpad\p7-migration-check.sql`, with this content:

```sql
BEGIN;

INSERT INTO "Event" (id, slug, title, description, location, "startsAt", "endsAt", capacity, status, "registrationOpensAt", "categoryId")
VALUES
  ('p7test_null_open', 'p7test-null-open', 'x', 'x', 'x', now() + interval '10 day', now() + interval '10 day 2 hour', 10, 'PUBLISHED', NULL, (SELECT id FROM "EventCategory" LIMIT 1)),
  ('p7test_future_open', 'p7test-future-open', 'x', 'x', 'x', now() + interval '10 day', now() + interval '10 day 2 hour', 10, 'PUBLISHED', now() + interval '5 day', (SELECT id FROM "EventCategory" LIMIT 1)),
  ('p7test_completed', 'p7test-completed', 'x', 'x', 'x', now() - interval '10 day', now() - interval '10 day' + interval '2 hour', 10, 'COMPLETED', NULL, (SELECT id FROM "EventCategory" LIMIT 1));

-- paste Steps A/B/C from migration.sql here, unmodified

SELECT id, status FROM "Event" WHERE id LIKE 'p7test_%';
-- expect: p7test_null_open -> REGISTRATION_OPEN, p7test_future_open -> PUBLISHED (unchanged), p7test_completed -> COMPLETED

SELECT "eventId", "fromStatus", "toStatus", "sideEffectsStatus" FROM "EventStatusHistory" WHERE "eventId" LIKE 'p7test_%';
-- expect: exactly 3 rows, fromStatus NULL for all, sideEffectsStatus 'DONE' for p7test_completed and 'NONE' for the other two

ROLLBACK;
```

```bash
pnpm --filter @repo/backend exec prisma db execute --schema=src/db/prisma/schema.prisma --file="<scratchpad-path>/p7-migration-check.sql"
```

Confirm the three expectations above via a second command (Prisma prints the executed statements but not `SELECT` results to stdout in older CLI versions — if the `SELECT` output isn't visible, re-run the same file's contents through `pnpm exec prisma studio` while the transaction is still relevant, or simply trust the `ROLLBACK` and re-verify post-seed in Task 2 Step 5 instead, which checks the same invariant against real data). Then delete the scratch `.sql` file — it is a one-time check, matching how P5's migration correctness was verified (not a committed test file).

- [ ] **Step 3: Apply the migration to the dev DB**

The file is already hand-written, so don't use `migrate dev --name` (which would scaffold a second folder). Apply it directly with the project's migrate script:

```bash
pnpm --filter @repo/backend migrate
```

Expected: Prisma detects `20260723070000_lifecycle_backfill` as a pending migration matching an existing folder and applies it (no drift warning, since the folder + `migration.sql` already exist and match the naming convention). Confirm output ends with `Your database is now in sync with your schema.`

- [ ] **Step 4: Spot-check the live dev DB**

Write a throwaway verification script to the scratchpad directory (not the repo) — e.g. `<scratchpad-path>/p7-check.ts`:

```ts
import { prisma } from "D:/BlibliTalk-2.0/bliblitalk-admin/apps/backend/src/db/client";

async function main() {
  const rows = await prisma.event.findMany({
    where: { status: { not: "DRAFT" } },
    select: { id: true, status: true, _count: { select: { statusHistory: true } } },
  });
  console.log(rows.filter((r) => r._count.statusHistory === 0));
  await prisma.$disconnect();
}
main();
```

```bash
pnpm --filter @repo/backend exec tsx "<scratchpad-path>/p7-check.ts"
```
Expected: empty array (every non-DRAFT event now has ≥1 history row). Delete the scratch file once confirmed.

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/db/prisma/migrations/20260723070000_lifecycle_backfill
git commit -m "feat(lifecycle): backfill migration for historyless non-DRAFT events"
```

---

### Task 2: `seed.ts` fix — durable across every reseed

**Files:**
- Modify: `apps/backend/src/db/prisma/seed.ts`

**Interfaces:**
- Consumes: nothing from Task 1 (independent — this task edits seed fixtures, Task 1 edits a migration; both converge on the same invariant).
- Produces: nothing consumed by Task 3 (Task 3's regression test queries whatever is in the seeded DB after `pnpm --filter @repo/backend seed` runs, regardless of which task last touched the fixtures).

- [ ] **Step 1: Change the 6 `PUBLISHED` event literals to `REGISTRATION_OPEN`**

In `apps/backend/src/db/prisma/seed.ts`, six `status: "PUBLISHED"` lines become `status: "REGISTRATION_OPEN"`. Each occurs inside a distinct event's `data:` block — use `replace_all` is not safe here since the string `"PUBLISHED"` is unique per line only in context, so edit each occurrence individually by its surrounding block:

1. Line 115 (`notLost`, slug `not-lost-in-translation`):
```ts
      status: "PUBLISHED",
      hasSpeedDating: true,
      featured: true,
      registrationDeadline: t("2026-08-11T23:59:00"),
```
→
```ts
      status: "REGISTRATION_OPEN",
      hasSpeedDating: true,
      featured: true,
      registrationDeadline: t("2026-08-11T23:59:00"),
```

2. Line 264 (`learning`, slug `learning-how-to-learn`):
```ts
      capacity: 150,
      status: "PUBLISHED",
      ...defaultMeta(learningStartsAt),
      speakers: { connect: [{ id: lilyane.id }, { id: josephine.id }] },
```
→
```ts
      capacity: 150,
      status: "REGISTRATION_OPEN",
      ...defaultMeta(learningStartsAt),
      speakers: { connect: [{ id: lilyane.id }, { id: josephine.id }] },
```

3. Line 283 (`ai`, slug `ai-in-everyday-work`):
```ts
      capacity: 200,
      status: "PUBLISHED",
      ...defaultMeta(aiStartsAt),
      speakers: { connect: [{ id: rangga.id }] },
```
→
```ts
      capacity: 200,
      status: "REGISTRATION_OPEN",
      ...defaultMeta(aiStartsAt),
      speakers: { connect: [{ id: rangga.id }] },
```

4. Line 302 (slug `building-influence-as-a-leader`):
```ts
      capacity: 150,
      status: "PUBLISHED",
      recommended: true,
      // Shortlist-only: seat count hidden; every registrant waits to be shortlisted.
      showRemainingSeats: false,
```
→
```ts
      capacity: 150,
      status: "REGISTRATION_OPEN",
      recommended: true,
      // Shortlist-only: seat count hidden; every registrant waits to be shortlisted.
      showRemainingSeats: false,
```

5. Line 322 (slug `future-of-work-skills`):
```ts
      capacity: 500,
      status: "PUBLISHED",
      recommended: true,
      ...defaultMeta(futureOfWorkStartsAt),
```
→
```ts
      capacity: 500,
      status: "REGISTRATION_OPEN",
      recommended: true,
      ...defaultMeta(futureOfWorkStartsAt),
```

6. Line 339 (slug `mindset-for-continuous-growth`):
```ts
      capacity: 150,
      status: "PUBLISHED",
      recommended: true,
      ...defaultMeta(mindsetStartsAt),
```
→
```ts
      capacity: 150,
      status: "REGISTRATION_OPEN",
      recommended: true,
      ...defaultMeta(mindsetStartsAt),
```

- [ ] **Step 2: Retarget the `publishedAt` backfill `updateMany`**

Around line 449, find:
```ts
  await prisma.event.updateMany({
    where: { status: "PUBLISHED" },
    data: { publishedAt: t("2026-05-01T09:00:00") },
  });
```
Change to:
```ts
  await prisma.event.updateMany({
    where: { status: "REGISTRATION_OPEN" },
    data: { publishedAt: t("2026-05-01T09:00:00") },
  });
```

- [ ] **Step 3: Add the synthetic history-backfill block**

Immediately after the block from Step 2 (still before the `// Demo the seat-visibility toggle` comment), insert:

```ts
  // ---- Lifecycle backfill: one synthetic EventStatusHistory row per non-DRAFT
  // seed event, mirroring the P7 migration's Steps B/C so local dev stays
  // consistent across every reseed (seed.ts wipes and recreates all events).
  const registrationOpenEvents = await prisma.event.findMany({
    where: { status: "REGISTRATION_OPEN" },
    select: { id: true, publishedAt: true },
  });
  const completedEvents = await prisma.event.findMany({
    where: { status: "COMPLETED" },
    select: { id: true, endsAt: true, autoCompleteAfterMinutes: true },
  });

  for (const e of registrationOpenEvents) {
    await prisma.event.update({
      where: { id: e.id },
      data: { statusChangedAt: e.publishedAt ?? new Date() },
    });
  }
  for (const e of completedEvents) {
    await prisma.event.update({
      where: { id: e.id },
      data: { statusChangedAt: dayjs(e.endsAt).add(e.autoCompleteAfterMinutes, "minute").toDate() },
    });
  }

  await prisma.eventStatusHistory.createMany({
    data: [
      ...registrationOpenEvents.map((e) => ({
        id: `histbf_${e.id}`,
        eventId: e.id,
        fromStatus: null,
        toStatus: "REGISTRATION_OPEN",
        actorType: "SYSTEM",
        actorId: null,
        reason: "backfill",
        sideEffectsStatus: "NONE",
        createdAt: e.publishedAt ?? new Date(),
      })),
      ...completedEvents.map((e) => ({
        id: `histbf_${e.id}`,
        eventId: e.id,
        fromStatus: null,
        toStatus: "COMPLETED",
        actorType: "SYSTEM",
        actorId: null,
        reason: "backfill",
        sideEffectsStatus: "DONE",
        createdAt: dayjs(e.endsAt).add(e.autoCompleteAfterMinutes, "minute").toDate(),
      })),
    ],
  });
```

This queries by status rather than by named const, so it correctly covers all 6 `REGISTRATION_OPEN` events (including the 3 created without being bound to a `const`, e.g. `building-influence-as-a-leader`) and all 3 `COMPLETED` events (`breaking`, `kartini`, `loveHate`), with no hardcoded event list to keep in sync.

- [ ] **Step 4: Update the seed completion log line**

The final `console.log` (currently `"Seed complete: 3 users (1 participant + super/event admin), 10 speakers, 9 events, 4 registrations, 3 certificates, 1 speed-dating, 2 announcements"`) does not mention status/history counts and needs no change — leave it as-is.

- [ ] **Step 5: Reseed and verify**

```bash
pnpm --filter @repo/backend exec prisma migrate reset --force --schema=src/db/prisma/schema.prisma
```

Expected: migration `20260723070000_lifecycle_backfill` applies (a no-op against the freshly-migrated-but-empty schema, since Step A/B/C's `WHERE` clauses match zero rows before seeding), then `seed.ts` runs automatically (the `seed` entry in `prisma`'s config triggers on reset). Confirm the log line prints and the command exits 0.

Then verify the seeded data directly with a throwaway script in the scratchpad directory — e.g. `<scratchpad-path>/p7-seed-check.ts`:
```ts
import { prisma } from "D:/BlibliTalk-2.0/bliblitalk-admin/apps/backend/src/db/client";

async function main() {
  const open = await prisma.event.count({ where: { status: "PUBLISHED" } });
  const history = await prisma.eventStatusHistory.count();
  console.log({ stillPublished: open, historyRows: history });
  await prisma.$disconnect();
}
main();
```
```bash
pnpm --filter @repo/backend exec tsx "<scratchpad-path>/p7-seed-check.ts"
```
Expected: `{ stillPublished: 0, historyRows: 9 }` (6 `REGISTRATION_OPEN` + 3 `COMPLETED` = 9 non-DRAFT events, each with exactly one row). Delete the scratch file once confirmed.

- [ ] **Step 6: Commit**

```bash
git add apps/backend/src/db/prisma/seed.ts
git commit -m "feat(lifecycle): seed REGISTRATION_OPEN events + backfill history on every reseed"
```

---

### Task 3: Permanent regression test

**Files:**
- Create: `apps/backend/src/lib/lifecycle/lifecycleBackfill.test.ts`

**Interfaces:**
- Consumes: `prisma` client from `../../db/client` (same import path as `transitionEvent.test.ts`), `EventStatus` from `@repo/shared-types`.
- Produces: nothing consumed by later tasks — this is the terminal regression test for P7's exit criterion.

- [ ] **Step 1: Write the failing test**

```ts
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
```

The back-relation field is confirmed as `statusHistory` (`schema.prisma:126`: `statusHistory EventStatusHistory[]`) — no adjustment needed.

- [ ] **Step 2: Run test to verify it currently passes (this is backfill verification, not TDD red/green)**

Run: `pnpm --filter @repo/backend test -- lifecycleBackfill`

Expected: **PASS**, 2/2 — because Task 1 (migration, applied to the dev DB in Task 1 Step 3) and Task 2 (seed fix, applied in Task 2 Step 5) already closed the gap this test checks. Unlike a typical TDD cycle, this test is written *after* the fix lands and its job is to freeze the invariant going forward, not to drive new implementation.

If it fails, the most likely cause is running the test against a database that predates Task 1's migration or Task 2's reseed — re-run `pnpm --filter @repo/backend exec prisma migrate reset --force --schema=src/db/prisma/schema.prisma` (which applies migrations then reseeds) and retry before treating this as a real regression.

- [ ] **Step 3: Commit**

```bash
git add apps/backend/src/lib/lifecycle/lifecycleBackfill.test.ts
git commit -m "test(lifecycle): permanent regression test for backfill invariant"
```

---

### Task 4: Final verification

**Files:** none (verification only).

- [ ] **Step 1: Full backend suite**

```bash
pnpm --filter @repo/backend test
```

Expected: all tests pass, including the 2 new tests from Task 3. Note the total count before/after in your final report (the spec's baseline was 154 pre-P7; confirm the new total is that count + 2).

- [ ] **Step 2: Full typecheck**

```bash
pnpm --filter @repo/backend typecheck
```

Expected: no errors. This catches any Prisma-generated-client type mismatch from the `seed.ts` `createMany` payload (e.g. if `fromStatus` needs an explicit `EventStatus | null` cast rather than a bare `null` literal — if `tsc` complains, add `as EventStatus | null` to the `fromStatus: null` lines in Task 2 Step 3's block and re-run).

- [ ] **Step 3: Browser sanity check on admin :5184**

Start the dev servers (backend :4001 + admin FE :5184) and open the Events list.

1. Confirm the 6 previously-`PUBLISHED` events (slugs: `not-lost-in-translation`, `learning-how-to-learn`, `ai-in-everyday-work`, `building-influence-as-a-leader`, `future-of-work-skills`, `mindset-for-continuous-growth`) now show a **"Registration Open"** status pill, not "Published".
2. Open one of them (e.g. `not-lost-in-translation`) into its Event Workspace, go to the **History** tab, and confirm exactly one entry appears: actor **SYSTEM**, reason **backfill**, transitioning to REGISTRATION_OPEN.
3. Open one of the 3 `COMPLETED` events (e.g. `kartini-masa-gitu`) and confirm its History tab also shows exactly one `backfill` entry (actor SYSTEM, toStatus COMPLETED).

- [ ] **Step 4: Report**

Summarize: test count before/after, typecheck result, and the 3 browser-check confirmations above.

---

## Self-Review Notes

- **Spec coverage:** Design §1 (migration Steps A/B/C) → Task 1. Design §2 (seed.ts fix) → Task 2. Design §3 (permanent regression test) → Task 3. Verification section (full suite, browser sanity) → Task 4. The design's "isolated migration test" verification item is folded into Task 1 Step 2 as an uncommitted manual check, matching how P5's equivalent check was actually done (no committed `_p5_backfill_test.ts` file exists in this repo — confirmed via `git log` before writing this plan).
- **Placeholder scan:** no TBD/TODO; every step has complete, runnable code or an exact command.
- **Type consistency:** `EventStatus`, `fromStatus`/`toStatus`/`actorType`/`sideEffectsStatus` field names match `schema.prisma`'s `EventStatusHistory` model (`actorType`/`sideEffectsStatus` are plain `String`, not Prisma enums — confirmed by reading `schema.prisma:316-329`). Task 3's back-relation field name (`statusHistory`) confirmed at `schema.prisma:126`.
