# P7 — Lifecycle Backfill & Reconciliation — Design Spec

## Goal

P1's own migration comment (`20260716060555_lifecycle_engine/migration.sql:1`) says outright: *"no
data remap here — P7 handles that."* That promise has been outstanding since P1. Concretely, every
`Event` row that existed before the 8-state engine (P1) shipped has **zero `EventStatusHistory` rows**
and a `statusChangedAt` that reflects whatever moment a migration happened to run, not any real
transition. P7 closes that gap: it makes every non-`DRAFT` event's status and audit trail internally
consistent, and it does so deterministically — no admin-reviewed reconciliation report — because this
system currently has no real production data, only seed/test fixtures with a known, code-derivable
correct answer.

**Exit criterion (adapted from the roadmap for the greenfield reality):** every non-`DRAFT` `Event` has
at least one `EventStatusHistory` row, and no event is stuck in `PUBLISHED` when its own recorded
`registrationOpensAt` has already passed (or was never set). Verified by a permanent regression test,
not a human-reviewed report.

## Context: what research found

- **The literal deferred work.** `20260716060555_lifecycle_engine/migration.sql` expanded `EventStatus`
  from 5 to 8 values and carried every existing row's status over **unchanged** — it explicitly did not
  attempt to split old `PUBLISHED` (which meant "registration open" under the old 5-state model) into
  the new model's `PUBLISHED` (not yet open) / `REGISTRATION_OPEN` / `REGISTRATION_CLOSED`. It also
  defaulted every existing row's new `statusChangedAt` column to `CURRENT_TIMESTAMP` (i.e., whenever
  that migration happened to run) and created zero `EventStatusHistory` rows for pre-existing events.
- **A real, live gap — but not a live bug.** 6 events in `seed.ts` are created directly with
  `status: "PUBLISHED"` and no `registrationOpensAt` (it was dormant/unwired until P6). The P2
  scheduler's `decideTarget` (`scheduleDecisions.ts:37-40`) only advances `PUBLISHED → REGISTRATION_OPEN`
  when `registrationOpensAt` is non-null and has passed — so these 6 events are **permanently stuck**:
  the scheduler can never auto-progress them through the rest of the lifecycle (no auto-close, no
  auto-`ONGOING`, no auto-`COMPLETED`). This is not user-facing today: the public registration guard
  (`events.service.ts:63-69`) already accepts `PUBLISHED` as registerable and treats a null
  `registrationOpensAt` as "already open." The bug is in the **status badge and lifecycle history**,
  not registration itself.
- **All 6 are safe to correct uniformly.** Each has `startsAt` in the future relative to "today," and
  each already has `publishedAt = 2026-05-01T09:00:00` set via a `seed.ts` `updateMany` (line ~449-452).
  None has a passed `registrationDeadline`. So the single correct target for all 6 is
  `REGISTRATION_OPEN`, with `statusChangedAt = publishedAt` — registration opens immediately on
  publish when `registrationOpensAt` is unset, exactly matching the create-form's own documented
  semantics ("Leave blank to open immediately on publish").
- **3 more seed events are seeded directly as `COMPLETED`** (`breaking`, `kartini`, `loveHate`) — no
  status correction needed (terminal state), but same audit-trail gap: zero history, `statusChangedAt`
  = seed-run time. `resolveCompletedSideEffects`'s real effects (`isOverdue=false`,
  `displayConfig.pastEvent=true`) are already true via schema defaults
  (`isOverdue Boolean @default(false)`, `displayConfig` JSON default includes `"pastEvent":true`) — so
  these rows are already side-effect-consistent; only the history row and `statusChangedAt` are missing.
- **`seed.ts` wipes and recreates every event on every run** (`prisma.event.deleteMany()` at the top).
  So a migration-only fix to the *current* physical rows in the shared dev DB is transient — this
  project's established workflow runs `migrate reset`/reseed after nearly every phase, which would
  silently undo a migration-only fix. The durable fix has to live in `seed.ts` itself.
- **`transitionEvent.ts`** is the reference for the exact literal values a real history row uses:
  `actorType: "SYSTEM"`, `sideEffectsStatus: hasSideEffects ? "PENDING" : "NONE"` where
  `hasSideEffects = (to === COMPLETED)`, resolving to `"DONE"`/`"FAILED"` post-commit. A synthetic
  backfill row for a `COMPLETED` event should read `"DONE"` (the effects are already true, per above)
  — `"NONE"` would falsely claim `COMPLETED` never has side effects, contradicting the real engine.
- **IDs are client-generated** (`@default(cuid())` on `EventStatusHistory.id` — not a DB-level default),
  so raw SQL must supply explicit ID literals, matching P5's migration precedent
  (`'cat_legacy_' || md5(...)`). This migration uses `'histbf_' || e.id` (event IDs are already unique,
  and each event gets at most one backfill row ever, guarded by `NOT EXISTS`).

## Decisions (locked with the owner)

1. **No admin-reviewed reconciliation report/UI.** The roadmap's original P7 envisioned a
   human-reviewed report before auto-fixing ambiguous real production data. There is no such data —
   confirmed greenfield/seed-only. Building that workflow now would be solving a problem that doesn't
   exist. P7 backfills deterministically instead.
2. **Both a migration and a `seed.ts` fix**, mirroring P5's exact structure. The migration is general
   (targets any historyless non-`DRAFT` row by a `NOT EXISTS` condition, not hardcoded event IDs) so it
   fixes whatever is in the DB *right now* and remains correct if this codebase is ever deployed with
   real accumulated data before P7 gets a second chance. The `seed.ts` fix is what makes local dev
   self-consistent across every future reseed — without it, the very next `pnpm seed` recreates the
   exact same gap the migration just closed.
3. **The "reconciliation report" becomes a permanent regression test**, not a one-time script or an
   admin-facing screen: assert the invariant *every non-`DRAFT` `Event` has ≥1 `EventStatusHistory`
   row* against the seeded test DB. This is the automated, durable stand-in for the roadmap's "zero
   mismatches" exit criterion — it also catches any future bug that creates a non-`DRAFT` event bypassing
   `transitionEvent()`.

## Design

### 1. Migration — general backfill

New migration (general — not hardcoded to specific event slugs), applied to any `Event` row that is
`status != 'DRAFT'` and has zero `EventStatusHistory` rows:

**Step A — correct `PUBLISHED` rows that should already be open.** Promote to `REGISTRATION_OPEN` only
when `registrationOpensAt IS NULL` or has already passed — a `PUBLISHED` row with a genuine *future*
`registrationOpensAt` is already correct and must be left alone (it will auto-advance via the P2
scheduler when its time comes):

```sql
UPDATE "Event" e
SET status = 'REGISTRATION_OPEN'
WHERE status = 'PUBLISHED'
  AND (e."registrationOpensAt" IS NULL OR e."registrationOpensAt" <= CURRENT_TIMESTAMP)
  AND NOT EXISTS (SELECT 1 FROM "EventStatusHistory" h WHERE h."eventId" = e.id);
```

**Step B — backfill `statusChangedAt`** using each status's own natural boundary condition (mirroring
`scheduleDecisions.ts`'s own transition rules — not an arbitrary "now"):

```sql
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
```

**Step C — insert one synthetic history row per affected event** (`fromStatus = NULL`, matching the
roadmap's "one synthetic history row per event"):

```sql
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

Steps B and C must run *after* Step A so they see the corrected status, and must run in this exact
order within one migration file (each step's `NOT EXISTS` guard is what keeps this migration safe to
reason about — no event is touched twice).

### 2. `seed.ts` fix

- Change the 6 events currently seeded with `status: "PUBLISHED"` to `status: "REGISTRATION_OPEN"`.
- Fix the `publishedAt` backfill `updateMany`'s `where: { status: "PUBLISHED" }` (line ~449) to
  `where: { status: "REGISTRATION_OPEN" }` — after the change above, no seed event is ever literally
  `"PUBLISHED"`, so the old clause would silently match zero rows.
- After all events are created (and the `publishedAt`/other post-creation `updateMany` calls run), add
  one block that inserts the same synthetic `EventStatusHistory` row (via `prisma.eventStatusHistory.
  createMany`) for the 6 corrected `REGISTRATION_OPEN` events and the 3 `COMPLETED` events (`breaking`,
  `kartini`, `loveHate`), and sets each event's `statusChangedAt` to match — same values as the
  migration's Step B/C, computed in TypeScript from each event's own fields (`publishedAt` for the
  `REGISTRATION_OPEN` ones; `endsAt + autoCompleteAfterMinutes` for the `COMPLETED` ones, using the
  schema default of 2880 minutes since none of these events overrides it).

### 3. Permanent regression test

Add a test (co-located with the lifecycle suite, e.g. `apps/backend/src/lib/lifecycle/`) that, after
seeding, queries for any `Event` with `status != 'DRAFT'` and zero related `EventStatusHistory` rows,
and asserts the result set is empty. This is the exit criterion made durable — it runs on every
`pnpm --filter @repo/backend test`, not just once.

## Non-goals

- No admin-facing reconciliation report/review UI (Decision #1).
- No change to `transitionEvent`, `decideTarget`, or any other lifecycle-engine code — P7 only backfills
  data, it does not change how future transitions are decided or recorded.
- No change to any frontend — this phase is backend/migration/seed only.
- The 3 `COMPLETED` seed events' `startsAt`/`endsAt` being in the future relative to "today" (an
  existing, deliberate seed-data choice for demo/certificate-download test fixtures, per the seed
  file's own comment "Attended (past) events registered by the demo user") is untouched — P7 corrects
  status/history consistency, not calendar-date realism of unrelated seed fixtures.

## Verification

- **Unit/integration:** the new regression test (Section 3) passes against freshly-seeded data.
- **Isolated migration test:** mirroring P5's `_p5_backfill_test.ts` pattern — reconstruct the relevant
  columns in temp tables inside a rolled-back transaction, seed a `PUBLISHED`-with-null-`registrationOpensAt`
  row, a `PUBLISHED`-with-future-`registrationOpensAt` row (must NOT be promoted), and a `COMPLETED` row,
  run the exact migration SQL, and assert: the first row is now `REGISTRATION_OPEN`; the second is still
  `PUBLISHED`; all three got exactly one history row with the correct `sideEffectsStatus`.
- **Full backend suite:** `pnpm --filter @repo/backend test` — expect the existing 154 tests plus the
  new regression test, all green.
- **Browser sanity (admin :5184):** after `migrate reset` + reseed, open the Events list and confirm the
  6 previously-`PUBLISHED` events now show a "Registration Open" pill, and open one's workspace History
  tab and confirm a single `backfill` row appears (actor SYSTEM).
