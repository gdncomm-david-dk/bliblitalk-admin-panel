# P2 — Scheduler + Overdue + Auto-Complete — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the legacy time-based `completeExpiredEvents` sweep (P1's one documented direct-status-writer exception) with a real, multi-pod-safe, self-healing scheduler that drives every time-based lifecycle boundary — registration open/close, event start, auto-complete, and the overdue flag — exclusively through `transitionEvent`, on a 60-second cadence.

**Architecture:** A pure decision function (`decideTarget`, no DB access, exhaustively unit-tested) decides which single boundary an event is due for, given its current fields and the current time. An orchestrating sweep (`sweepEventLifecycle`, mirroring the shipped `sweepDueReminders` idiom exactly) fetches all boundary candidates in one query (capacity resolved via a filtered `_count`, no N+1), then drives each one through `transitionEvent` in a bounded intra-tick cascade so a multi-boundary backlog (e.g. after downtime) catches up in a single tick. `transitionEvent` itself gets a compare-and-swap hardening — this is the one change to the already-shipped P1 engine — so that scheduler ticks (and, once this ever runs on >1 replica, concurrent ticks) can never double-write a transition or double-write history. The legacy `completeExpiredEvents` sweep and its inline read-boundary calls are deleted entirely; the new scheduler is the sole time-based driver.

**Tech Stack:** Express + Prisma (Postgres 15) on Node 22, TypeScript, Zod (shared-types), Vitest + Supertest. Repo: `D:\BlibliTalk-2.0\bliblitalk-admin`.

## Design provenance

This plan was synthesized from a research + design-panel pass (4 parallel code researchers, 3 independent scheduler-architecture proposals, 2 independent adversarial judges — a 3rd judge call errored and was excluded) rather than authored from a single first pass. Both judges independently ranked the same design first: a lock-free scheduler that relies entirely on `transitionEvent`'s own re-read-and-validate semantics as its concurrency guard (no advisory locks, no `FOR UPDATE SKIP LOCKED`, no lease columns) — it best fits this stack (single Postgres 15, Prisma 6, today a single Express process) and most closely mirrors the shipped `sweepDueReminders` pattern. Both judges converged on one required hardening to make it airtight for the day this ever runs on >1 replica: turn `transitionEvent`'s unconditional `event.update` into a status-guarded `event.updateMany` (compare-and-swap), writing history only when it actually wins — closing the one real gap (a duplicate `EventStatusHistory` row if two callers race) with zero added locks or infrastructure. Task 2 below delivers that hardening as a real, tested change, not a deferred note.

**One correction to the winning design, made during planning, not by the panel:** the winning proposal's boundary logic for `REGISTRATION_OPEN -> REGISTRATION_CLOSED` only fires on deadline-passed or capacity-full. Tracing the P1 transition table (`transitions.ts`) shows `REGISTRATION_OPEN` can reach `ONGOING` *only* via `REGISTRATION_CLOSED` — so an event with no `registrationDeadline` set, unlimited `capacity`, or `waitingListEnabled=true` would never leave `REGISTRATION_OPEN`, even long after it ends. The one *losing* proposal (the `FOR UPDATE SKIP LOCKED` design) had independently spotted this and included a "start-time safety net" arm; neither judge flagged its absence in the winner. This plan grafts that arm into `decideTarget`'s `REGISTRATION_OPEN` case (Task 3) and into the candidate query (Task 4). Flagging this for the reviewer: it is a real behavioral addition beyond the roadmap's literal "deadline OR capacity" wording, and beyond what either judge explicitly approved — it is required for the state machine to be livable at all.

## Global Constraints

- All paths relative to `D:\BlibliTalk-2.0\bliblitalk-admin`. Run pnpm from repo root.
- `transitionEvent` (in `apps/backend/src/lib/lifecycle/transitionEvent.ts`) remains the ONLY function permitted to write `event.status`. `isOverdue` is a boolean column, not a status — it may be written directly by the scheduler via a plain idempotent `UPDATE`, exactly as P1's now-removed `completeExpiredEvents` did.
- The scheduler NEVER wraps a batch of `transitionEvent` calls in an outer `prisma.$transaction` — it calls it once per event in a sequential `await` loop (mirrors `sweepDueReminders`'s per-row loop; `transitionEvent` already owns its own transaction and runs on the module-level `prisma` client, so nesting would not join it anyway).
- All boundary time comparisons in one sweep tick use a single Postgres-sourced `now()` (not `new Date()` in Node), so multi-pod clock skew can never make two pods disagree on whether a boundary passed.
- Capacity checks reuse the EXACT existing rule from `events.service.ts:139` (`registerForEvent`): `capacity > 0 && registeredCount >= capacity` (capacity `0` = unlimited), counting only `RegistrationStatus.REGISTERED` rows. Decision #2 (roadmap): `waitingListEnabled=false` + full ⇒ auto-close; `waitingListEnabled=true` ⇒ stay open and keep waitlisting.
- No new Event columns or tables — P1 already added every column this scheduler reads (`registrationOpensAt`, `registrationDeadline`, `startsAt`, `endsAt`, `gracePeriodMinutes`, `autoCompleteAfterMinutes`, `isOverdue`, `capacity`, `waitingListEnabled`). This phase is index-only at the schema level.
- Structured logging follows the existing pino convention app-wide: `logger.<level>({ ...context }, "message string")` (object first, message second). Per-candidate failures are isolated with try/catch and logged, never allowed to abort the rest of the sweep (mirrors `sweepDueReminders`'s per-row isolation, but WITH logging — the existing reminder sweep's bare `catch {}` with no logging is a known wart in that file; this scheduler must not repeat it).
- `AppError(code, message, status, details?)` from `apps/backend/src/middleware/error.ts`. Test harness: Vitest + Supertest against the running seeded Postgres (`localhost:5432`); purge synthetic rows by slug prefix in `beforeEach`/`afterAll`, following `apps/backend/src/lib/lifecycle/transitionEvent.test.ts`'s existing `PREFIX`/`makeEvent`/`cleanup` conventions.
- On Windows, a running `tsx watch` backend dev server (port 4001) holds the Prisma engine DLL open and blocks `prisma generate`/`migrate`. Before any Prisma CLI command: `netstat -ano | grep :4001` then `taskkill //PID <pid> //F` if something is listening.
- Commit after each task; conventional-commit messages; never `--no-verify`.

---

### Task 1: Migration — supporting indexes for scheduler queries

**Files:**
- Modify: `apps/backend/src/db/prisma/schema.prisma`
- Create: `apps/backend/src/db/prisma/migrations/<timestamp>_lifecycle_scheduler_indexes/migration.sql` (via `prisma migrate dev`)

**Interfaces:**
- Produces: five new composite indexes so the scheduler's candidate-detection query and the capacity re-check stay index-backed as event/registration volume grows. No column or table changes — purely additive.

- [ ] **Step 1: Add indexes to the Event model**

In `apps/backend/src/db/prisma/schema.prisma`, the `Event` model currently ends with:

```prisma
  admins               User[]         @relation("EventAdmins")
  reminders            EventReminder[]
}
```

Change it to:

```prisma
  admins               User[]         @relation("EventAdmins")
  reminders            EventReminder[]

  @@index([status, registrationOpensAt])
  @@index([status, registrationDeadline])
  @@index([status, startsAt])
  @@index([status, endsAt])
}
```

(These four back the scheduler's per-boundary `WHERE status = ... AND <timestamp> <= now()` predicates in Task 4.)

- [ ] **Step 2: Add an index to the Registration model**

The `Registration` model currently ends with:

```prisma
  @@unique([userId, eventId])
}
```

Change it to:

```prisma
  @@unique([userId, eventId])
  @@index([eventId, status])
}
```

(This backs the `REGISTERED`-seat count used both by `registerForEvent`'s existing capacity check and by the scheduler's `stillFull` re-check in Task 4 — today that count runs with no supporting index.)

- [ ] **Step 3: Generate the migration**

Stop any running dev server holding the Prisma engine DLL first: `netstat -ano | grep :4001` then `taskkill //PID <pid> //F` if one is listed.

Run: `pnpm --filter @repo/backend exec prisma migrate dev --schema=src/db/prisma/schema.prisma --name lifecycle_scheduler_indexes`
Expected: a new migration folder is created and applies cleanly (plain `CREATE INDEX` statements — no data migration, no `USING` casts, no locking concerns at this project's scale); Prisma client regenerates.

- [ ] **Step 4: Verify the migration applies cleanly from scratch**

Prove the migration file is correct independent of the already-migrated dev database, by deploying the full migration history to a throwaway scratch database (do NOT run `prisma migrate reset` against the seeded dev database — it is blocked by this environment's destructive-action guard and is not needed here anyway):

```bash
# from apps/backend, using the same DATABASE_URL host/creds but a different db name
BASEURL=$(grep '^DATABASE_URL=' .env | sed 's/^DATABASE_URL=//; s/"//g')
SCRATCH=$(echo "$BASEURL" | sed -E 's#/[a-zA-Z0-9_]+(\?|$)#/blibli_p2_scratch\1#')
DATABASE_URL="$SCRATCH" pnpm exec prisma migrate deploy --schema=src/db/prisma/schema.prisma
```
Expected: `All migrations have been successfully applied.` (every prior migration plus this new one, in order, against an empty database).

Then verify the five indexes exist and drop the scratch database:

```bash
cat > _verify_indexes.mjs <<'EOF'
import { PrismaClient } from "@prisma/client";
const p = new PrismaClient({ datasources: { db: { url: process.env.SCRATCH } } });
const rows = await p.$queryRawUnsafe(
  `SELECT indexname FROM pg_indexes WHERE tablename IN ('Event','Registration') ORDER BY indexname;`,
);
console.log(rows.map((r) => r.indexname).join("\n"));
await p.$disconnect();
EOF
SCRATCH="$SCRATCH" node _verify_indexes.mjs
ADMIN=$(echo "$BASEURL" | sed -E 's#/[a-zA-Z0-9_]+(\?|$)#/postgres\1#')
cat > _drop_scratch.mjs <<'EOF'
import { PrismaClient } from "@prisma/client";
const p = new PrismaClient({ datasources: { db: { url: process.env.ADMIN } } });
await p.$executeRawUnsafe('DROP DATABASE IF EXISTS blibli_p2_scratch;');
await p.$disconnect();
EOF
ADMIN="$ADMIN" node _drop_scratch.mjs
rm -f _verify_indexes.mjs _drop_scratch.mjs
```
Expected: the output list includes four `Event_status_*_idx`-style names and one `Registration_eventId_status_idx`-style name (Prisma's default naming), alongside the pre-existing indexes; the scratch DB is then dropped, leaving no trace.

- [ ] **Step 5: Typecheck**

Run: `pnpm --filter @repo/backend typecheck`
Expected: PASS (an index-only migration changes no generated types in a way that affects application code).

- [ ] **Step 6: Commit**

```bash
git add apps/backend/src/db/prisma/schema.prisma apps/backend/src/db/prisma/migrations
git commit -m "feat(db): supporting indexes for the P2 lifecycle scheduler"
```

---

### Task 2: Harden `transitionEvent` — compare-and-swap + COMPLETED side effects

**Files:**
- Modify: `apps/backend/src/lib/lifecycle/transitionEvent.ts`
- Modify: `apps/backend/src/lib/lifecycle/transitionEvent.test.ts` (add tests; the 5 existing tests must keep passing unmodified)

**Interfaces:**
- Consumes: unchanged — `allowedFrom`/`canTransition` from `./transitions`; `prisma` from `../../db/client`; `AppError` from `../../middleware/error`.
- Produces: `transitionEvent`'s public signature and NOT_FOUND/idempotent-no-op/409 behavior for a single, non-racing caller are UNCHANGED. New behavior: (a) under a race, the loser gets an honest idempotent-success or a fresh 409 instead of either a silent false-success or a duplicate history row; (b) reaching `COMPLETED` runs post-commit side effects (clear `isOverdue`, flip `displayConfig.pastEvent`) tracked via `EventStatusHistory.sideEffectsStatus` (`PENDING` → `DONE`/`FAILED`), realizing the "P2/P3 set PENDING and resolve" comment P1 already left in this file.

- [ ] **Step 1: Read the current file**

Confirm you're starting from exactly this (it should match `apps/backend/src/lib/lifecycle/transitionEvent.ts` on `main` today):

```ts
import { EventStatus } from "@repo/shared-types";
import { prisma } from "../../db/client";
import { AppError } from "../../middleware/error";
import { allowedFrom, canTransition } from "./transitions";

export type TransitionActor = { type: "ADMIN"; id: string } | { type: "SYSTEM" };

export async function transitionEvent(
  eventId: string,
  to: EventStatus,
  actor: TransitionActor,
  reason?: string,
): Promise<void> {
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    select: { id: true, status: true },
  });
  if (!event) throw new AppError("NOT_FOUND", "Event not found", 404);

  const from = event.status;
  if (from === to) return;

  if (!canTransition(from, to)) {
    throw new AppError(
      "INVALID_TRANSITION",
      `Cannot transition event from ${from} to ${to}`,
      409,
      { from, to, allowed: allowedFrom(from) },
    );
  }

  await prisma.$transaction([
    prisma.event.update({
      where: { id: eventId },
      data: { status: to, statusChangedAt: new Date() },
    }),
    prisma.eventStatusHistory.create({
      data: {
        eventId,
        fromStatus: from,
        toStatus: to,
        actorType: actor.type,
        actorId: actor.type === "ADMIN" ? actor.id : null,
        reason: reason ?? null,
        sideEffectsStatus: "NONE",
      },
    }),
  ]);
}
```

If your working copy differs, STOP and report — do not proceed against an unexpected base.

- [ ] **Step 2: Write the failing race tests (RED)**

Add these two tests to `apps/backend/src/lib/lifecycle/transitionEvent.test.ts`, inside the existing `describe("transitionEvent", ...)` block, after the existing 5 tests (keep the file's existing imports, `PREFIX`, `makeEvent`, `cleanup` exactly as they are):

```ts
  it("resolves a concurrent race for the same target with exactly one history row (CAS)", async () => {
    const ev = await makeEvent(EventStatus.DRAFT);
    const results = await Promise.allSettled([
      transitionEvent(ev.id, EventStatus.PUBLISHED, { type: "SYSTEM" }),
      transitionEvent(ev.id, EventStatus.PUBLISHED, { type: "ADMIN", id: "admin-1" }),
    ]);
    expect(results[0].status).toBe("fulfilled");
    expect(results[1].status).toBe("fulfilled");

    const after = await prisma.event.findUnique({ where: { id: ev.id } });
    expect(after?.status).toBe(EventStatus.PUBLISHED);

    const history = await prisma.eventStatusHistory.count({ where: { eventId: ev.id } });
    expect(history).toBe(1);
  });

  it("gives the losing racer an honest 409 when a concurrent call reached a different target", async () => {
    const ev = await makeEvent(EventStatus.ONGOING);
    const results = await Promise.allSettled([
      transitionEvent(ev.id, EventStatus.COMPLETED, { type: "SYSTEM" }),
      transitionEvent(ev.id, EventStatus.CANCELLED, { type: "ADMIN", id: "admin-1" }),
    ]);

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected") as PromiseRejectedResult[];
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason).toMatchObject({ code: "INVALID_TRANSITION", status: 409 });

    const history = await prisma.eventStatusHistory.count({ where: { eventId: ev.id } });
    expect(history).toBe(1);
  });

  it("runs COMPLETED side effects: clears isOverdue and flips displayConfig.pastEvent", async () => {
    const ev = await prisma.event.create({
      data: {
        slug: `${PREFIX}${Date.now()}-completed-fx`,
        title: "Lifecycle txn test",
        description: "x",
        category: "Technology",
        location: "Online",
        startsAt: new Date(Date.now() - 200000),
        endsAt: new Date(Date.now() - 100000),
        status: EventStatus.ONGOING,
        isOverdue: true,
        displayConfig: {
          pastEvent: false,
          speaker: true,
          gallery: true,
          keyTakeaways: true,
          recording: true,
          certificate: true,
        },
      },
    });

    await transitionEvent(ev.id, EventStatus.COMPLETED, { type: "SYSTEM" });

    const after = await prisma.event.findUnique({ where: { id: ev.id } });
    expect(after?.status).toBe(EventStatus.COMPLETED);
    expect(after?.isOverdue).toBe(false);
    expect((after?.displayConfig as Record<string, unknown>).pastEvent).toBe(true);
    expect((after?.displayConfig as Record<string, unknown>).speaker).toBe(true);

    const history = await prisma.eventStatusHistory.findFirst({ where: { eventId: ev.id } });
    expect(history?.sideEffectsStatus).toBe("DONE");
  });
```

Note: these tests are written to hold regardless of whether the two concurrent calls in the first two tests actually interleave their reads (a real race) or run fully sequentially — either ordering produces the same observable outcome (see the plan's design-provenance note above for why). They are not flaky by construction.

- [ ] **Step 3: Run the new tests to verify they fail**

Run: `pnpm --filter @repo/backend exec vitest run src/lib/lifecycle/transitionEvent.test.ts`
Expected: the 5 existing tests PASS; the 3 new tests FAIL (the race tests fail because the current unconditional `update` lets both writers commit, so history count is 2 instead of 1 and/or the "loser" never gets a 409; the side-effects test fails because `isOverdue` and `displayConfig.pastEvent` are never touched by the current code).

- [ ] **Step 4: Implement the hardened `transitionEvent`**

Replace the full contents of `apps/backend/src/lib/lifecycle/transitionEvent.ts` with:

```ts
import { EventStatus } from "@repo/shared-types";
import type { EventDisplayConfig } from "@repo/shared-types";
import { prisma } from "../../db/client";
import { AppError } from "../../middleware/error";
import { logger } from "../../logger";
import { allowedFrom, canTransition } from "./transitions";

export type TransitionActor = { type: "ADMIN"; id: string } | { type: "SYSTEM" };

/**
 * The ONLY code path allowed to mutate event.status. Validates against the
 * transition table, then writes the new status + statusChangedAt and one
 * EventStatusHistory row in a single transaction, using a status-guarded
 * compare-and-swap (updateMany WHERE id AND status=from) so a concurrent
 * racer that read the same stale status can never both commit — the loser's
 * write matches zero rows and creates no history (no double-audit). This is
 * what makes it safe for the P2 scheduler to run on N sweep replicas, or to
 * race a concurrent admin action, without ever corrupting the audit trail.
 *
 * COMPLETED side effects (clearing isOverdue, flipping displayConfig.pastEvent)
 * run AFTER commit, tracked via sideEffectsStatus (PENDING -> DONE|FAILED) on
 * the history row — a failed side effect never leaves the status write itself
 * inconsistent.
 */
export async function transitionEvent(
  eventId: string,
  to: EventStatus,
  actor: TransitionActor,
  reason?: string,
): Promise<void> {
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    select: { id: true, status: true },
  });
  if (!event) throw new AppError("NOT_FOUND", "Event not found", 404);

  const from = event.status;
  if (from === to) return; // idempotent no-op — scheduler may re-evaluate a boundary

  if (!canTransition(from, to)) {
    throw new AppError(
      "INVALID_TRANSITION",
      `Cannot transition event from ${from} to ${to}`,
      409,
      { from, to, allowed: allowedFrom(from) },
    );
  }

  const hasSideEffects = to === EventStatus.COMPLETED;

  const historyId = await prisma.$transaction(async (tx) => {
    const result = await tx.event.updateMany({
      where: { id: eventId, status: from },
      data: { status: to, statusChangedAt: new Date() },
    });
    if (result.count === 0) return null; // lost the race — status moved under us

    const history = await tx.eventStatusHistory.create({
      data: {
        eventId,
        fromStatus: from,
        toStatus: to,
        actorType: actor.type,
        actorId: actor.type === "ADMIN" ? actor.id : null,
        reason: reason ?? null,
        sideEffectsStatus: hasSideEffects ? "PENDING" : "NONE",
      },
    });
    return history.id;
  });

  if (historyId === null) {
    // Lost the race: give the caller an accurate outcome instead of a false
    // silent success. Idempotent if the racer reached the same target we
    // wanted; otherwise a fresh 409 reflecting the actual current status.
    const after = await prisma.event.findUnique({ where: { id: eventId }, select: { status: true } });
    if (!after) throw new AppError("NOT_FOUND", "Event not found", 404);
    if (after.status === to) return;
    throw new AppError(
      "INVALID_TRANSITION",
      `Cannot transition event from ${after.status} to ${to}`,
      409,
      { from: after.status, to, allowed: allowedFrom(after.status) },
    );
  }

  if (hasSideEffects) {
    await resolveCompletedSideEffects(eventId, historyId);
  }
}

/**
 * Post-commit side effects for reaching COMPLETED. Best-effort: a failure here
 * is logged and recorded on the history row, never thrown — the status
 * transition already committed and must not be rolled back by this.
 */
async function resolveCompletedSideEffects(eventId: string, historyId: string): Promise<void> {
  try {
    const event = await prisma.event.findUnique({ where: { id: eventId }, select: { displayConfig: true } });
    await prisma.event.update({
      where: { id: eventId },
      data: {
        isOverdue: false,
        displayConfig: { ...(event?.displayConfig as EventDisplayConfig), pastEvent: true },
      },
    });
    await prisma.eventStatusHistory.update({ where: { id: historyId }, data: { sideEffectsStatus: "DONE" } });
  } catch (err) {
    logger.error({ err, eventId }, "transitionEvent: failed to resolve COMPLETED side effects");
    await prisma.eventStatusHistory
      .update({ where: { id: historyId }, data: { sideEffectsStatus: "FAILED" } })
      .catch(() => {});
  }
}
```

- [ ] **Step 5: Run the full test file to verify GREEN**

Run: `pnpm --filter @repo/backend exec vitest run src/lib/lifecycle/transitionEvent.test.ts`
Expected: all 8 tests PASS (5 original + 3 new), output pristine.

- [ ] **Step 6: Regression-check the transition table tests too**

Run: `pnpm --filter @repo/backend exec vitest run src/lib/lifecycle/transitions.test.ts`
Expected: unaffected, 6/6 PASS (this file doesn't touch `transitionEvent.ts`, but confirm no accidental breakage).

- [ ] **Step 7: Typecheck**

Run: `pnpm --filter @repo/backend typecheck`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add apps/backend/src/lib/lifecycle/transitionEvent.ts apps/backend/src/lib/lifecycle/transitionEvent.test.ts
git commit -m "feat(backend): compare-and-swap transitionEvent + COMPLETED side effects"
```

---

### Task 3: Pure scheduling decision logic (`decideTarget`)

**Files:**
- Create: `apps/backend/src/lib/lifecycle/scheduleDecisions.ts`
- Test: `apps/backend/src/lib/lifecycle/scheduleDecisions.test.ts`

**Interfaces:**
- Consumes: `EventStatus` from `@repo/shared-types` only — no DB, no Prisma import. This mirrors P1's own split between the pure `transitions.ts` (validator) and the DB-touching `transitionEvent.ts` (engine).
- Produces:
  ```ts
  export type LifecycleCandidate = {
    status: EventStatus;
    registrationOpensAt: Date | null;
    registrationDeadline: Date | null;
    startsAt: Date;
    endsAt: Date;
    capacity: number;
    waitingListEnabled: boolean;
    autoCompleteAfterMinutes: number;
    registeredCount: number;
  };
  export function decideTarget(e: LifecycleCandidate, now: Date): EventStatus | null;
  ```
  Task 4's orchestrator maps a Prisma row's `_count.registrations` onto `registeredCount` and calls this.

- [ ] **Step 1: Write the failing tests (RED)**

Create `apps/backend/src/lib/lifecycle/scheduleDecisions.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { EventStatus } from "@repo/shared-types";
import { decideTarget, type LifecycleCandidate } from "./scheduleDecisions";

const NOW = new Date("2026-08-01T12:00:00Z");
const PAST = new Date("2026-07-01T00:00:00Z");
const FUTURE = new Date("2026-09-01T00:00:00Z");

function base(overrides: Partial<LifecycleCandidate>): LifecycleCandidate {
  return {
    status: EventStatus.PUBLISHED,
    registrationOpensAt: null,
    registrationDeadline: null,
    startsAt: FUTURE,
    endsAt: FUTURE,
    capacity: 0,
    waitingListEnabled: true,
    autoCompleteAfterMinutes: 2880,
    registeredCount: 0,
    ...overrides,
  };
}

describe("decideTarget", () => {
  it("opens registration once registrationOpensAt has passed", () => {
    expect(decideTarget(base({ status: EventStatus.PUBLISHED, registrationOpensAt: PAST }), NOW)).toBe(
      EventStatus.REGISTRATION_OPEN,
    );
  });

  it("does not open registration before registrationOpensAt", () => {
    expect(decideTarget(base({ status: EventStatus.PUBLISHED, registrationOpensAt: FUTURE }), NOW)).toBeNull();
  });

  it("never auto-opens when registrationOpensAt is unset", () => {
    expect(decideTarget(base({ status: EventStatus.PUBLISHED, registrationOpensAt: null }), NOW)).toBeNull();
  });

  it("closes registration once the deadline has passed", () => {
    expect(
      decideTarget(base({ status: EventStatus.REGISTRATION_OPEN, registrationDeadline: PAST }), NOW),
    ).toBe(EventStatus.REGISTRATION_CLOSED);
  });

  it("closes registration when full and the waitlist is disabled (decision #2, OFF)", () => {
    expect(
      decideTarget(
        base({
          status: EventStatus.REGISTRATION_OPEN,
          capacity: 5,
          registeredCount: 5,
          waitingListEnabled: false,
        }),
        NOW,
      ),
    ).toBe(EventStatus.REGISTRATION_CLOSED);
  });

  it("keeps registration open when full but the waitlist is enabled (decision #2, ON)", () => {
    expect(
      decideTarget(
        base({
          status: EventStatus.REGISTRATION_OPEN,
          capacity: 5,
          registeredCount: 5,
          waitingListEnabled: true,
        }),
        NOW,
      ),
    ).toBeNull();
  });

  it("treats capacity 0 as unlimited (never closes on capacity alone)", () => {
    expect(
      decideTarget(
        base({
          status: EventStatus.REGISTRATION_OPEN,
          capacity: 0,
          registeredCount: 999,
          waitingListEnabled: false,
        }),
        NOW,
      ),
    ).toBeNull();
  });

  it("closes registration once the event's own start time has passed, even with no deadline and unlimited capacity", () => {
    // Safety net: REGISTRATION_OPEN can only reach ONGOING via REGISTRATION_CLOSED
    // (see transitions.ts), so an event with neither a deadline nor a capacity cap
    // must still close once its start time arrives, or it would never leave
    // REGISTRATION_OPEN at all.
    expect(
      decideTarget(
        base({
          status: EventStatus.REGISTRATION_OPEN,
          registrationDeadline: null,
          capacity: 0,
          waitingListEnabled: true,
          startsAt: PAST,
        }),
        NOW,
      ),
    ).toBe(EventStatus.REGISTRATION_CLOSED);
  });

  it("starts the event once startsAt has passed", () => {
    expect(decideTarget(base({ status: EventStatus.REGISTRATION_CLOSED, startsAt: PAST }), NOW)).toBe(
      EventStatus.ONGOING,
    );
  });

  it("does not start the event before startsAt", () => {
    expect(decideTarget(base({ status: EventStatus.REGISTRATION_CLOSED, startsAt: FUTURE }), NOW)).toBeNull();
  });

  it("auto-completes once endsAt + autoCompleteAfterMinutes has passed", () => {
    const endsAt = new Date(NOW.getTime() - 10 * 60_000); // 10 min ago
    expect(
      decideTarget(base({ status: EventStatus.ONGOING, endsAt, autoCompleteAfterMinutes: 5 }), NOW),
    ).toBe(EventStatus.COMPLETED);
  });

  it("does not auto-complete before endsAt + autoCompleteAfterMinutes", () => {
    const endsAt = new Date(NOW.getTime() - 2 * 60_000); // 2 min ago
    expect(
      decideTarget(base({ status: EventStatus.ONGOING, endsAt, autoCompleteAfterMinutes: 30 }), NOW),
    ).toBeNull();
  });

  it.each([EventStatus.DRAFT, EventStatus.COMPLETED, EventStatus.CANCELLED, EventStatus.ARCHIVED])(
    "never drives a decision for terminal/manual state %s",
    (status) => {
      expect(decideTarget(base({ status, startsAt: PAST, endsAt: PAST, registrationOpensAt: PAST }), NOW)).toBeNull();
    },
  );
});
```

- [ ] **Step 2: Run to verify RED**

Run: `pnpm --filter @repo/backend exec vitest run src/lib/lifecycle/scheduleDecisions.test.ts`
Expected: FAIL — `./scheduleDecisions` does not exist.

- [ ] **Step 3: Implement `decideTarget`**

Create `apps/backend/src/lib/lifecycle/scheduleDecisions.ts`:

```ts
import { EventStatus } from "@repo/shared-types";

/**
 * Everything decideTarget needs to know about one event, decoupled from
 * Prisma's row shape so this logic is pure and fast to unit-test without a
 * database.
 */
export type LifecycleCandidate = {
  status: EventStatus;
  registrationOpensAt: Date | null;
  registrationDeadline: Date | null;
  startsAt: Date;
  endsAt: Date;
  capacity: number;
  waitingListEnabled: boolean;
  autoCompleteAfterMinutes: number;
  registeredCount: number;
};

/**
 * Given one event and the current time, decides the single next status it is
 * due for, or null if no boundary has been crossed. Pure — no DB access, no
 * side effects — so the scheduler's decision logic is exhaustively unit
 * tested independently of Postgres.
 *
 * REGISTRATION_OPEN's capacity rule mirrors the exact one already used at
 * registration time (events.service.ts: capacity>0 && count>=capacity;
 * capacity=0 means unlimited): decision #2 — waitlist OFF + full closes
 * registration; waitlist ON + full stays open and keeps waitlisting. It ALSO
 * closes once the event's own start time passes, regardless of deadline or
 * capacity — REGISTRATION_OPEN can only reach ONGOING via REGISTRATION_CLOSED
 * (see transitions.ts), so without this an event with no deadline and no
 * capacity cap would never leave REGISTRATION_OPEN at all.
 */
export function decideTarget(e: LifecycleCandidate, now: Date): EventStatus | null {
  switch (e.status) {
    case EventStatus.PUBLISHED:
      return e.registrationOpensAt !== null && e.registrationOpensAt <= now
        ? EventStatus.REGISTRATION_OPEN
        : null;

    case EventStatus.REGISTRATION_OPEN: {
      const deadlinePassed = e.registrationDeadline !== null && e.registrationDeadline <= now;
      const eventStarted = e.startsAt <= now;
      const full = e.capacity > 0 && e.registeredCount >= e.capacity;
      const closedByCapacity = full && !e.waitingListEnabled;
      return deadlinePassed || eventStarted || closedByCapacity ? EventStatus.REGISTRATION_CLOSED : null;
    }

    case EventStatus.REGISTRATION_CLOSED:
      return e.startsAt <= now ? EventStatus.ONGOING : null;

    case EventStatus.ONGOING: {
      const autoCompleteAt = new Date(e.endsAt.getTime() + e.autoCompleteAfterMinutes * 60_000);
      return autoCompleteAt <= now ? EventStatus.COMPLETED : null;
    }

    default:
      return null; // DRAFT/COMPLETED/CANCELLED/ARCHIVED: the scheduler never drives these
  }
}
```

- [ ] **Step 4: Run to verify GREEN**

Run: `pnpm --filter @repo/backend exec vitest run src/lib/lifecycle/scheduleDecisions.test.ts`
Expected: all 16 tests PASS, output pristine.

- [ ] **Step 5: Typecheck**

Run: `pnpm --filter @repo/backend typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/backend/src/lib/lifecycle/scheduleDecisions.ts apps/backend/src/lib/lifecycle/scheduleDecisions.test.ts
git commit -m "feat(backend): pure lifecycle boundary decision logic"
```

---

### Task 4: The scheduler (`sweepEventLifecycle`)

**Files:**
- Create: `apps/backend/src/lib/lifecycle/sweepEventLifecycle.ts`
- Test: `apps/backend/src/lib/lifecycle/sweepEventLifecycle.test.ts`

**Interfaces:**
- Consumes: `decideTarget`, `LifecycleCandidate` (Task 3); `transitionEvent`, `TransitionActor` (Task 2); `prisma`, `logger`, `AppError`.
- Produces: `export async function sweepEventLifecycle(): Promise<void>` — flags overdue events, fetches every boundary candidate in one query, and drives each through a bounded intra-tick cascade.

- [ ] **Step 1: Write the failing tests (RED)**

Create `apps/backend/src/lib/lifecycle/sweepEventLifecycle.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { EventStatus, RegistrationStatus } from "@repo/shared-types";
import { prisma } from "../../db/client";
import { sweepEventLifecycle } from "./sweepEventLifecycle";

const PREFIX = "lifecycle-sweep-test-";
const MIN = 60_000;

type EventOverrides = Partial<{
  status: EventStatus;
  registrationOpensAt: Date | null;
  registrationDeadline: Date | null;
  startsAt: Date;
  endsAt: Date;
  capacity: number;
  waitingListEnabled: boolean;
  autoCompleteAfterMinutes: number;
  gracePeriodMinutes: number;
  isOverdue: boolean;
}>;

async function makeEvent(overrides: EventOverrides) {
  const now = Date.now();
  return prisma.event.create({
    data: {
      slug: `${PREFIX}${now}-${Math.round(Math.random() * 100000)}`,
      title: "Lifecycle sweep test",
      description: "x",
      category: "Technology",
      location: "Online",
      startsAt: overrides.startsAt ?? new Date(now + 86400000),
      endsAt: overrides.endsAt ?? new Date(now + 90000000),
      status: overrides.status ?? EventStatus.PUBLISHED,
      registrationOpensAt: overrides.registrationOpensAt,
      registrationDeadline: overrides.registrationDeadline,
      capacity: overrides.capacity ?? 0,
      waitingListEnabled: overrides.waitingListEnabled ?? true,
      autoCompleteAfterMinutes: overrides.autoCompleteAfterMinutes ?? 2880,
      gracePeriodMinutes: overrides.gracePeriodMinutes ?? 120,
      isOverdue: overrides.isOverdue ?? false,
    },
  });
}

async function registerFiller(eventId: string, n: number) {
  for (let i = 0; i < n; i++) {
    const user = await prisma.user.create({
      data: { email: `${PREFIX}filler-${Date.now()}-${i}@gdn-commerce.com`, name: "Filler", passwordHash: "x" },
    });
    await prisma.registration.create({
      data: { userId: user.id, eventId, status: RegistrationStatus.REGISTERED },
    });
  }
}

async function cleanup() {
  const events = await prisma.event.findMany({ where: { slug: { startsWith: PREFIX } }, select: { id: true } });
  const ids = events.map((e) => e.id);
  if (ids.length) {
    await prisma.registration.deleteMany({ where: { eventId: { in: ids } } });
    await prisma.eventStatusHistory.deleteMany({ where: { eventId: { in: ids } } });
    await prisma.event.deleteMany({ where: { id: { in: ids } } });
  }
  await prisma.user.deleteMany({ where: { email: { startsWith: `${PREFIX}filler-` } } });
}

describe("sweepEventLifecycle", () => {
  beforeEach(cleanup);
  afterAll(cleanup);

  it("flags overdue ONGOING events past end+grace, idempotently", async () => {
    const ev = await makeEvent({
      status: EventStatus.ONGOING,
      endsAt: new Date(Date.now() - 10 * MIN),
      gracePeriodMinutes: 5,
    });
    await sweepEventLifecycle();
    let after = await prisma.event.findUnique({ where: { id: ev.id } });
    expect(after?.isOverdue).toBe(true);

    await sweepEventLifecycle(); // second tick — must not error or double-do anything
    after = await prisma.event.findUnique({ where: { id: ev.id } });
    expect(after?.isOverdue).toBe(true);
  });

  it("auto-opens registration once registrationOpensAt has passed", async () => {
    const ev = await makeEvent({
      status: EventStatus.PUBLISHED,
      registrationOpensAt: new Date(Date.now() - MIN),
      startsAt: new Date(Date.now() + 86400000),
      endsAt: new Date(Date.now() + 90000000),
    });
    await sweepEventLifecycle();
    const after = await prisma.event.findUnique({ where: { id: ev.id } });
    expect(after?.status).toBe(EventStatus.REGISTRATION_OPEN);
  });

  it("auto-closes registration at the deadline", async () => {
    const ev = await makeEvent({
      status: EventStatus.REGISTRATION_OPEN,
      registrationDeadline: new Date(Date.now() - MIN),
      startsAt: new Date(Date.now() + 86400000),
      endsAt: new Date(Date.now() + 90000000),
    });
    await sweepEventLifecycle();
    const after = await prisma.event.findUnique({ where: { id: ev.id } });
    expect(after?.status).toBe(EventStatus.REGISTRATION_CLOSED);
  });

  it("auto-closes registration when full and the waitlist is disabled", async () => {
    const ev = await makeEvent({
      status: EventStatus.REGISTRATION_OPEN,
      capacity: 1,
      waitingListEnabled: false,
      startsAt: new Date(Date.now() + 86400000),
      endsAt: new Date(Date.now() + 90000000),
    });
    await registerFiller(ev.id, 1);
    await sweepEventLifecycle();
    const after = await prisma.event.findUnique({ where: { id: ev.id } });
    expect(after?.status).toBe(EventStatus.REGISTRATION_CLOSED);
  });

  it("keeps registration open when full but the waitlist is enabled", async () => {
    const ev = await makeEvent({
      status: EventStatus.REGISTRATION_OPEN,
      capacity: 1,
      waitingListEnabled: true,
      startsAt: new Date(Date.now() + 86400000),
      endsAt: new Date(Date.now() + 90000000),
    });
    await registerFiller(ev.id, 1);
    await sweepEventLifecycle();
    const after = await prisma.event.findUnique({ where: { id: ev.id } });
    expect(after?.status).toBe(EventStatus.REGISTRATION_OPEN);
  });

  it("does not close a capacity-eligible event that is not actually full", async () => {
    const ev = await makeEvent({
      status: EventStatus.REGISTRATION_OPEN,
      capacity: 5,
      waitingListEnabled: false, // matches the broad detection arm...
      startsAt: new Date(Date.now() + 86400000),
      endsAt: new Date(Date.now() + 90000000),
    });
    await registerFiller(ev.id, 1); // ...but only 1 of 5 seats are taken
    await sweepEventLifecycle();
    const after = await prisma.event.findUnique({ where: { id: ev.id } });
    expect(after?.status).toBe(EventStatus.REGISTRATION_OPEN);
  });

  it("auto-closes registration once the event's own start time passes, even with no deadline or capacity cap", async () => {
    const ev = await makeEvent({
      status: EventStatus.REGISTRATION_OPEN,
      registrationDeadline: null,
      capacity: 0,
      waitingListEnabled: true,
      startsAt: new Date(Date.now() - MIN),
      endsAt: new Date(Date.now() + 90000000),
    });
    await sweepEventLifecycle();
    const after = await prisma.event.findUnique({ where: { id: ev.id } });
    expect(after?.status).toBe(EventStatus.REGISTRATION_CLOSED);
  });

  it("auto-starts an event once its start time has passed", async () => {
    const ev = await makeEvent({
      status: EventStatus.REGISTRATION_CLOSED,
      startsAt: new Date(Date.now() - MIN),
      endsAt: new Date(Date.now() + 90000000),
    });
    await sweepEventLifecycle();
    const after = await prisma.event.findUnique({ where: { id: ev.id } });
    expect(after?.status).toBe(EventStatus.ONGOING);
  });

  it("auto-completes an event once end+autoCompleteAfterMinutes has passed, running COMPLETED side effects", async () => {
    const ev = await makeEvent({
      status: EventStatus.ONGOING,
      startsAt: new Date(Date.now() - 3 * MIN),
      endsAt: new Date(Date.now() - 2 * MIN),
      autoCompleteAfterMinutes: 1,
      isOverdue: true,
    });
    await sweepEventLifecycle();
    const after = await prisma.event.findUnique({ where: { id: ev.id } });
    expect(after?.status).toBe(EventStatus.COMPLETED);
    expect(after?.isOverdue).toBe(false);
  });

  it("cascades a multi-boundary backlog through several states in one tick", async () => {
    const ev = await makeEvent({
      status: EventStatus.PUBLISHED,
      registrationOpensAt: new Date(Date.now() - 4 * MIN),
      registrationDeadline: new Date(Date.now() - 3 * MIN),
      startsAt: new Date(Date.now() - 2 * MIN),
      endsAt: new Date(Date.now() - MIN),
      autoCompleteAfterMinutes: 0,
    });
    await sweepEventLifecycle();
    const after = await prisma.event.findUnique({ where: { id: ev.id } });
    expect(after?.status).toBe(EventStatus.COMPLETED);

    const history = await prisma.eventStatusHistory.findMany({
      where: { eventId: ev.id },
      orderBy: { createdAt: "asc" },
    });
    expect(history.map((h) => h.toStatus)).toEqual([
      EventStatus.REGISTRATION_OPEN,
      EventStatus.REGISTRATION_CLOSED,
      EventStatus.ONGOING,
      EventStatus.COMPLETED,
    ]);
  });

  it("isolates a failure on one candidate from the rest of the sweep", async () => {
    const good = await makeEvent({
      status: EventStatus.REGISTRATION_CLOSED,
      startsAt: new Date(Date.now() - MIN),
      endsAt: new Date(Date.now() + 90000000),
    });
    const bad = await makeEvent({
      status: EventStatus.REGISTRATION_CLOSED,
      startsAt: new Date(Date.now() - MIN),
      endsAt: new Date(Date.now() + 90000000),
    });
    await prisma.event.delete({ where: { id: bad.id } }); // vanishes between fetch and processing

    await expect(sweepEventLifecycle()).resolves.not.toThrow();

    const after = await prisma.event.findUnique({ where: { id: good.id } });
    expect(after?.status).toBe(EventStatus.ONGOING);
  });
});
```

- [ ] **Step 2: Run to verify RED**

Run: `pnpm --filter @repo/backend exec vitest run src/lib/lifecycle/sweepEventLifecycle.test.ts`
Expected: FAIL — `./sweepEventLifecycle` does not exist.

- [ ] **Step 3: Implement the scheduler**

Create `apps/backend/src/lib/lifecycle/sweepEventLifecycle.ts`:

```ts
import { EventStatus, RegistrationStatus } from "@repo/shared-types";
import { prisma } from "../../db/client";
import { AppError } from "../../middleware/error";
import { logger } from "../../logger";
import { transitionEvent } from "./transitionEvent";
import { decideTarget, type LifecycleCandidate } from "./scheduleDecisions";

// DRAFT..ARCHIVED is at most 6 hops; bounds one candidate's intra-tick cascade so a
// pathological backlog can't make a single tick run unbounded.
const MAX_STEPS_PER_TICK = 6;

const CANDIDATE_SELECT = {
  id: true,
  status: true,
  registrationOpensAt: true,
  registrationDeadline: true,
  startsAt: true,
  endsAt: true,
  capacity: true,
  waitingListEnabled: true,
  autoCompleteAfterMinutes: true,
  _count: { select: { registrations: { where: { status: RegistrationStatus.REGISTERED } } } },
} as const;

type CandidateRow = {
  id: string;
  status: EventStatus;
  registrationOpensAt: Date | null;
  registrationDeadline: Date | null;
  startsAt: Date;
  endsAt: Date;
  capacity: number;
  waitingListEnabled: boolean;
  autoCompleteAfterMinutes: number;
  _count: { registrations: number };
};

function toLifecycleCandidate(row: CandidateRow): LifecycleCandidate {
  return {
    status: row.status,
    registrationOpensAt: row.registrationOpensAt,
    registrationDeadline: row.registrationDeadline,
    startsAt: row.startsAt,
    endsAt: row.endsAt,
    capacity: row.capacity,
    waitingListEnabled: row.waitingListEnabled,
    autoCompleteAfterMinutes: row.autoCompleteAfterMinutes,
    registeredCount: row._count.registrations,
  };
}

/**
 * Flips isOverdue for ONGOING events past end+grace. Not a status change, so
 * it bypasses transitionEvent by design — a plain, idempotent, set-based
 * UPDATE guarded by isOverdue=false is safe for any number of pods to run
 * concurrently, with nothing to double-write.
 */
async function flagOverdue(now: Date): Promise<void> {
  const rows = await prisma.$queryRaw<{ id: string }[]>`
    UPDATE "Event" SET "isOverdue" = true
    WHERE status = 'ONGOING' AND "isOverdue" = false
      AND "endsAt" + make_interval(mins => "gracePeriodMinutes") <= ${now}
    RETURNING id`;
  if (rows.length > 0) logger.info({ count: rows.length }, "flagged overdue events");
}

async function fetchCandidates(now: Date): Promise<CandidateRow[]> {
  return prisma.event.findMany({
    where: {
      OR: [
        { status: EventStatus.PUBLISHED, registrationOpensAt: { lte: now } },
        { status: EventStatus.REGISTRATION_OPEN, registrationDeadline: { lte: now } },
        { status: EventStatus.REGISTRATION_OPEN, startsAt: { lte: now } },
        // No time filter: an event can fill before its deadline. decideTarget's own
        // capacity check (fed by _count above) decides whether this row actually closes.
        { status: EventStatus.REGISTRATION_OPEN, waitingListEnabled: false, capacity: { gt: 0 } },
        { status: EventStatus.REGISTRATION_CLOSED, startsAt: { lte: now } },
        { status: EventStatus.ONGOING, endsAt: { lte: now } },
      ],
    },
    select: CANDIDATE_SELECT,
  });
}

/**
 * Re-counts REGISTERED seats for one event right before a capacity-driven
 * close, so a cancellation between tick-start detection and this call
 * correctly aborts the close. Deadline- and start-driven closes never call
 * this — a passed deadline or start time never un-passes.
 */
async function stillFull(eventId: string, capacity: number): Promise<boolean> {
  const registered = await prisma.registration.count({
    where: { eventId, status: RegistrationStatus.REGISTERED },
  });
  return registered >= capacity;
}

async function advanceOne(row: CandidateRow, now: Date): Promise<void> {
  let current = row;
  for (let step = 0; step < MAX_STEPS_PER_TICK; step++) {
    const candidate = toLifecycleCandidate(current);
    const to = decideTarget(candidate, now);
    if (!to) return;

    if (to === EventStatus.REGISTRATION_CLOSED && current.capacity > 0 && !current.waitingListEnabled) {
      const deadlineOrStartDriven =
        (current.registrationDeadline !== null && current.registrationDeadline <= now) ||
        current.startsAt <= now;
      if (!deadlineOrStartDriven && !(await stillFull(current.id, current.capacity))) return;
    }

    try {
      await transitionEvent(current.id, to, { type: "SYSTEM" }, "scheduler:auto-transition");
      logger.info({ eventId: current.id, from: current.status, to }, "auto-transitioned event");
    } catch (err) {
      if (err instanceof AppError && err.code === "INVALID_TRANSITION") {
        logger.debug({ eventId: current.id, to, err }, "auto-transition rejected — event already moved");
      } else {
        logger.error({ eventId: current.id, from: current.status, to, err }, "auto-transition failed");
      }
      return;
    }

    // Cascade: re-read fresh in case another boundary now applies within this same
    // tick (e.g. after downtime, both the deadline and the start time have passed).
    const refreshed = await prisma.event.findUnique({ where: { id: current.id }, select: CANDIDATE_SELECT });
    if (!refreshed) return;
    current = refreshed;
  }
}

export async function sweepEventLifecycle(): Promise<void> {
  const [{ now }] = await prisma.$queryRaw<{ now: Date }[]>`SELECT now() AS now`;

  await flagOverdue(now);

  const candidates = await fetchCandidates(now);
  for (const candidate of candidates) {
    try {
      await advanceOne(candidate, now);
    } catch (err) {
      logger.error({ err, eventId: candidate.id }, "lifecycle sweep failed for event");
    }
  }
}
```

Note on the "isolates a failure" test: `advanceOne` itself only calls `prisma.event.findUnique` (returns `null` gracefully) and `transitionEvent` (which throws a typed `AppError("NOT_FOUND", ...)` for a deleted row) — both paths are handled without throwing out of `advanceOne`, but the outer `sweepEventLifecycle`'s per-candidate try/catch is the actual safety net if anything unexpected still escapes, so the test's assertion (`resolves.not.toThrow()` + the good candidate still advancing) holds either way.

- [ ] **Step 4: Run to verify GREEN**

Run: `pnpm --filter @repo/backend exec vitest run src/lib/lifecycle/sweepEventLifecycle.test.ts`
Expected: all 10 tests PASS, output pristine.

- [ ] **Step 5: Regression-check the rest of the lifecycle suite**

Run: `pnpm --filter @repo/backend exec vitest run src/lib/lifecycle`
Expected: all tests across `transitions.test.ts`, `transitionEvent.test.ts`, `scheduleDecisions.test.ts`, `sweepEventLifecycle.test.ts` PASS.

- [ ] **Step 6: Typecheck**

Run: `pnpm --filter @repo/backend typecheck`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/backend/src/lib/lifecycle/sweepEventLifecycle.ts apps/backend/src/lib/lifecycle/sweepEventLifecycle.test.ts
git commit -m "feat(backend): sweepEventLifecycle — the P2 boundary scheduler"
```

---

### Task 5: Wire into index.ts; retire the legacy `completeExpiredEvents` sweep

**Files:**
- Modify: `apps/backend/src/index.ts`
- Modify: `apps/backend/src/routes/public/events/events.service.ts`
- Modify: `apps/backend/src/routes/admin/adminEvents.service.ts`
- Test: `apps/backend/src/routes/public/events/events.routes.test.ts` (regression run only — no new tests required; see Step 6)

**Interfaces:**
- Consumes: `sweepEventLifecycle` (Task 4).
- Produces: the 60-second scheduler tick running in the app process; `completeExpiredEvents`, `COMPLETION_GRACE_MS`, and all 6 of their call sites are deleted. `sweepEventLifecycle` becomes the sole time-based driver of `event.status`; `listEvents`/`getEventBySlug`/`listAdminEvents`/`getAdminEvent` no longer sweep on read (reads may now be up to 60s stale relative to a just-passed boundary — the roadmap's own stated freshness SLA for this phase).

- [ ] **Step 1: Wire the scheduler into `index.ts`**

Replace the full contents of `apps/backend/src/index.ts` with:

```ts
import path from "node:path";
import fs from "node:fs";
import express from "express";
import { createApp } from "./app";
import { config } from "./config";
import { logger } from "./logger";
import { sweepDueReminders } from "./routes/admin/adminReminders.service";
import { sweepEventLifecycle } from "./lib/lifecycle/sweepEventLifecycle";

const app = createApp();

function sweepReminders() {
  sweepDueReminders().catch((err) => logger.error({ err }, "Failed to sweep due reminders"));
}

function sweepLifecycle() {
  sweepEventLifecycle().catch((err) => logger.error({ err }, "Failed to sweep event lifecycle"));
}

sweepReminders();
sweepLifecycle();
setInterval(sweepReminders, 60 * 1000);
setInterval(sweepLifecycle, 60 * 1000);

// In production, serve the built admin FE (single fullstack container).
if (config.isProd) {
  const clientDir = path.resolve(process.cwd(), "../frontend/dist");
  if (fs.existsSync(clientDir)) {
    app.use(express.static(clientDir));
    app.get("*", (_req, res) => res.sendFile(path.join(clientDir, "index.html")));
    logger.info(`Serving admin frontend from ${clientDir}`);
  } else {
    logger.warn(`Admin frontend build not found at ${clientDir}`);
  }
}

app.listen(config.port, () => logger.info(`Blibli Talk Admin API listening on :${config.port}`));
```

(This removes the old `sweepExpiredEvents` wrapper + its 5-minute interval entirely, per this task's scope — the new 60s scheduler fully subsumes its job.)

- [ ] **Step 2: Remove `completeExpiredEvents` from `events.service.ts`**

In `apps/backend/src/routes/public/events/events.service.ts`:

Remove the now-unused `type EventDisplayConfig` from the import block at the top (it becomes unused once `completeExpiredEvents` is deleted):

```ts
import {
  EventStatus,
  RegistrationStatus,
  type PortalEventFilter,
  type MyEventDTO,
} from "@repo/shared-types";
```

Delete the `COMPLETION_GRACE_MS` constant and the entire `completeExpiredEvents` function (the block from the `// Small grace window...` comment through the closing `}` of the function).

Remove the inline calls in the two functions immediately below it:

```ts
export async function listEvents(filter?: PortalEventFilter) {
  return prisma.event.findMany({
    where: { status: { in: portalStatusWhere(filter) } },
    include: eventInclude,
    orderBy: { startsAt: "asc" },
  });
}

export async function getEventBySlug(slug: string) {
  return prisma.event.findUnique({
    where: { slug },
    include: eventInclude,
```

(i.e. delete the `await completeExpiredEvents();` line from each — leave the rest of each function body unchanged.)

- [ ] **Step 3: Remove `completeExpiredEvents` from `adminEvents.service.ts`**

In `apps/backend/src/routes/admin/adminEvents.service.ts`:

Change the import:

```ts
import { eventInclude } from "../public/events/events.service";
```

Remove the `await completeExpiredEvents();` line from both `listAdminEvents` and `getAdminEvent`.

Update the stale docstring on `setAdminEventStatus` (currently references the deleted sweep and claims "on the very next read", which is no longer true):

```ts
/**
 * Manual override: forces status to any value the admin picks, skipping the guided
 * actions' own domain checks (e.g. publish's required-fields check) — but, like every
 * other status write, it is validated against the transition table by transitionEvent,
 * which throws 409 INVALID_TRANSITION for an illegal jump. Note that a truly-expired
 * event forced back to an earlier status (e.g. PUBLISHED) will be walked forward again
 * by the sweepEventLifecycle scheduler within its next 60s tick — that's the scheduler's
 * intended time-based behavior, not a bug in this override.
 */
```

- [ ] **Step 4: Typecheck**

Run: `pnpm --filter @repo/backend typecheck`
Expected: PASS — confirms no leftover reference to `completeExpiredEvents`/`COMPLETION_GRACE_MS`/the now-unused `EventDisplayConfig` import anywhere.

- [ ] **Step 5: Grep-confirm no reference survives**

Run: `grep -rn "completeExpiredEvents\|COMPLETION_GRACE_MS" apps/backend/src`
Expected: no output.

- [ ] **Step 6: Regression-run the affected test suites**

Run: `pnpm --filter @repo/backend exec vitest run src/routes/public/events src/routes/admin/adminEvents.routes.test.ts src/lib/lifecycle`
Expected: all PASS. None of these suites relies on the removed sweep-on-read behavior (every test that touches a `COMPLETED` event sets `status: "COMPLETED"` directly at creation, not via the sweep) — this run is confirming that fact holds, not fixing anything.

- [ ] **Step 7: Full backend suite**

Run: `pnpm --filter @repo/backend exec vitest run`
Expected: all tests PASS (this is the first point in the plan where the complete, wired-together scheduler runs alongside every other existing suite).

- [ ] **Step 8: Both typechecks**

Run: `pnpm --filter @repo/backend typecheck && pnpm --filter @repo/frontend typecheck`
Expected: both PASS (the frontend never referenced the removed backend-only function, so this just re-confirms no accidental cross-contamination).

- [ ] **Step 9: Sole-writer re-verification**

Run: `grep -rn "prisma.event.update" apps/backend/src --include=*.ts | grep -v ".test.ts"`
Expected: hits only inside `transitionEvent.ts` (the CAS `updateMany`, plus the side-effects `update`), `adminEvents.service.ts` (non-status field updates: create/update/`ensurePublishedAt`), and `sweepEventLifecycle.ts`'s absence of any `event.update` (it only ever writes status via `transitionEvent` and `isOverdue` via the raw `flagOverdue` UPDATE) — no other file should touch `event.status`.

- [ ] **Step 10: Commit**

```bash
git add apps/backend/src/index.ts apps/backend/src/routes/public/events/events.service.ts apps/backend/src/routes/admin/adminEvents.service.ts
git commit -m "feat(backend): retire completeExpiredEvents — sweepEventLifecycle is now the sole time-based driver"
```

---

## Self-review notes (author)

- **Spec coverage vs the roadmap's P2 line** ("Boundary-based sweep... auto PUBLISHED->REGISTRATION_OPEN, REGISTRATION_OPEN->REGISTRATION_CLOSED (deadline OR capacity), REGISTRATION_CLOSED->ONGOING, overdue flag at end+grace, auto-COMPLETE at +48h. Pino structured logs. Exit: <=60s freshness; overdue never shows 'live'"): all 4 transitions → Tasks 3+4; overdue flag → Task 4 (`flagOverdue`); pino structured logs → Task 4 (matches existing `logger.<level>({...}, "msg")` convention); <=60s freshness → the 60s `setInterval` in Task 5, and the intra-tick cascade in Task 4 so a multi-boundary backlog doesn't need N separate ticks; "overdue never shows live" → Task 2's `resolveCompletedSideEffects` clears `isOverdue` on COMPLETED (so a completed event never carries a stale overdue flag into a state where "live" could be misread) plus the existing P1 DTO/mapper already renders `isOverdue` — this plan does not re-touch the mapper since P1 already shipped it correctly.
- **Deviation from the roadmap's literal "deadline OR capacity" line**, called out prominently above and in Task 3: added a start-time safety-net arm to `REGISTRATION_OPEN -> REGISTRATION_CLOSED`, without which the state machine has a livability gap (an event with no deadline and no capacity cap could never leave `REGISTRATION_OPEN`). This is a plan-author correction to a gap in the approved roadmap text itself, not an implementer's improvisation — flag it to the human the same way any roadmap-text conflict is flagged.
- **The one change to already-shipped P1 code** (Task 2's `transitionEvent.ts` hardening): both design-panel judges converged on this as necessary, not optional, framing it as "the ACTUAL delivered change, not a future step." It's additive-in-spirit (all 5 existing tests keep passing unmodified) and closes a real gap (duplicate history rows under a race) that P1's original array-form `$transaction` could not close.
- **Not in scope for P2** (deferred to later roadmap phases per their own stated scope): admin FE lifecycle UI and a visible history timeline (P3); the user-FE badge matrix and the Shortlisted-Only fix (P4); category taxonomy (P5); create-form restructure (P6); backfill/reconciliation of legacy-state events (P7). This plan touches backend scheduling only, as the roadmap's P2 line specifies.
