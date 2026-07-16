# P1 — Event Lifecycle Transition Engine + History + API — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace scattered, unguarded event-status writes with one server-enforced 8-state lifecycle: a single `transitionEvent` service that validates every transition against one table, writes status + an audit-history row atomically, and is the sole code path allowed to mutate `event.status`.

**Architecture:** Extend the Prisma `EventStatus` enum from 5→8 states, add a `SelectionMode` enum, lifecycle columns, and an `EventStatusHistory` table (one migration, following the repo's enum-rebuild precedent). A pure, DB-free transition table + validator (`lib/lifecycle/transitions.ts`) is unit-tested exhaustively; `transitionEvent(...)` wraps it with the atomic status+history write and post-commit side-effects. All existing writers (publish/close/open/cancel/manual-override) and the completion sweep are refactored to call it. A new admin-only `POST /admin/events/:id/transition` becomes the sole HTTP write path; `EventDTO` gains `statusChangedAt`, `isOverdue`, `selectionMode`, `registrationOpensAt`, and `nextAutoTransition`.

**Tech Stack:** Express + Prisma (Postgres 15) on Node 22, TypeScript, Zod (shared-types), Vitest + Supertest (integration tests against a running seeded Postgres). Repo: `D:\BlibliTalk-2.0\bliblitalk-admin`.

## Global Constraints

- All paths relative to `D:\BlibliTalk-2.0\bliblitalk-admin`. Run pnpm from repo root.
- **Naming:** follow existing conventions, NOT the PRD's raw snake_case. Prisma models are PascalCase (`EventStatusHistory`), columns camelCase (`statusChangedAt`, `isOverdue`, `selectionMode`). The PRD's `event_status_history`/`status_changed_at` are illustrative only.
- **Durations:** store grace/auto-complete as integer **minutes** (`gracePeriodMinutes Int @default(120)`, `autoCompleteAfterMinutes Int @default(2880)`) — Prisma has no clean `interval` mapping. Defaults = PRD's 2h / 48h.
- **8 states (final enum order):** `DRAFT, PUBLISHED, REGISTRATION_OPEN, REGISTRATION_CLOSED, ONGOING, COMPLETED, CANCELLED, ARCHIVED`.
- **SelectionMode:** `FCFS, CURATED`. Backfill in-migration: `showRemainingSeats = false ⇒ CURATED`, else `FCFS`.
- **P1 does NOT remap existing event data** to the new states (existing `PUBLISHED` rows stay `PUBLISHED`) — that's P7's backfill. P1 only extends the enum and adds the engine.
- **P1 does NOT build the scheduler** (that's P2). `completeExpiredEvents` keeps its current trigger points but routes its status write through `transitionEvent` so the "only writer" invariant holds now.
- `transitionEvent` is the ONLY function permitted to write `event.status`. No other `prisma.event.update({ data: { status } })` may remain after Task 5.
- Enums live in `packages/shared-types/src/enums.ts` and MUST stay byte-identical to the Prisma enum. Zod schemas in `packages/shared-types/src/schemas.ts`. `validate(schema)` middleware replaces `req.body` with the parsed result.
- `AppError(code, message, status, details?)` from `apps/backend/src/middleware/error.ts`. Permission gates from `@repo/auth`.
- Test harness: Vitest + Supertest against a running seeded Postgres (already up on :5432). Seeded admin `superadmin@gdn-commerce.com` / `password123`; participant `demo@gdn-commerce.com` / `password123`. Conventions per `apps/backend/src/routes/admin/adminEvents.routes.test.ts` (purge synthetic rows by slug prefix in `beforeEach`/`afterAll`).
- Commit after each task; conventional-commit messages; never `--no-verify`.

---

### Task 1: Prisma schema + migration (enum→8, SelectionMode, lifecycle columns, history table)

**Files:**
- Modify: `apps/backend/src/db/prisma/schema.prisma`
- Create: `apps/backend/src/db/prisma/migrations/<timestamp>_lifecycle_engine/migration.sql` (via `prisma migrate dev`)

**Interfaces:**
- Produces: Prisma models — `Event.status` now an 8-value enum; new `Event` fields `statusChangedAt: DateTime`, `isOverdue: Boolean`, `gracePeriodMinutes: Int`, `autoCompleteAfterMinutes: Int`, `selectionMode: SelectionMode`; new `EventStatusHistory` model; new `SelectionMode` enum. Prisma client regenerated so `prisma.eventStatusHistory` exists.

- [ ] **Step 1: Edit the Prisma schema — extend the EventStatus enum**

In `apps/backend/src/db/prisma/schema.prisma`, replace the existing `enum EventStatus { … }` (currently 5 values at ~line 26) with:

```prisma
enum EventStatus {
  DRAFT
  PUBLISHED
  REGISTRATION_OPEN
  REGISTRATION_CLOSED
  ONGOING
  COMPLETED
  CANCELLED
  ARCHIVED
}

enum SelectionMode {
  FCFS
  CURATED
}
```

- [ ] **Step 2: Add lifecycle columns + relation to the Event model**

In the `Event` model, add these fields (place them near `status`):

```prisma
  statusChangedAt          DateTime          @default(now())
  isOverdue                Boolean           @default(false)
  gracePeriodMinutes       Int               @default(120)
  autoCompleteAfterMinutes Int               @default(2880)
  selectionMode            SelectionMode     @default(FCFS)
  statusHistory            EventStatusHistory[]
```

- [ ] **Step 3: Add the EventStatusHistory model**

Add at the end of the models section:

```prisma
model EventStatusHistory {
  id                String       @id @default(cuid())
  event             Event        @relation(fields: [eventId], references: [id], onDelete: Cascade)
  eventId           String
  fromStatus        EventStatus?
  toStatus          EventStatus
  actorType         String       // "ADMIN" | "SYSTEM"
  actorId           String?
  reason            String?
  sideEffectsStatus String       @default("PENDING") // PENDING | DONE | FAILED | NONE
  createdAt         DateTime     @default(now())

  @@index([eventId, createdAt])
}
```

- [ ] **Step 4: Generate the migration**

The backend dev server (`tsx watch`) holds the Prisma engine DLL open on Windows and will block generation. First stop it if running: find the PID with `netstat -ano | grep :4001` and `taskkill //PID <pid> //F`. Then:

Run: `pnpm --filter @repo/backend exec prisma migrate dev --schema=src/db/prisma/schema.prisma --name lifecycle_engine`
Expected: a new migration folder is created and applies cleanly; Prisma client regenerates.

- [ ] **Step 5: Hand-edit the generated migration SQL for the enum rebuild + backfill**

Prisma's autogenerated enum-extension may fail inside a transaction. Replace the enum-alteration part of the generated `migration.sql` with the transaction-safe rebuild (mirrors `20260709080000_lifecycle_states/migration.sql`). Ensure the file contains:

```sql
-- Rebuild EventStatus 5 -> 8 (all existing values carry over unchanged; no data remap here — P7 handles that)
ALTER TYPE "EventStatus" RENAME TO "EventStatus_old";
CREATE TYPE "EventStatus" AS ENUM ('DRAFT','PUBLISHED','REGISTRATION_OPEN','REGISTRATION_CLOSED','ONGOING','COMPLETED','CANCELLED','ARCHIVED');
ALTER TABLE "Event" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "Event" ALTER COLUMN "status" TYPE "EventStatus" USING ("status"::text::"EventStatus");
ALTER TABLE "Event" ALTER COLUMN "status" SET DEFAULT 'DRAFT';
DROP TYPE "EventStatus_old";

-- New SelectionMode enum + column, backfilled from the legacy showRemainingSeats proxy
CREATE TYPE "SelectionMode" AS ENUM ('FCFS','CURATED');
ALTER TABLE "Event" ADD COLUMN "selectionMode" "SelectionMode" NOT NULL DEFAULT 'FCFS';
UPDATE "Event" SET "selectionMode" = 'CURATED' WHERE "showRemainingSeats" = false;

-- Lifecycle columns
ALTER TABLE "Event" ADD COLUMN "statusChangedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "Event" ADD COLUMN "isOverdue" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Event" ADD COLUMN "gracePeriodMinutes" INTEGER NOT NULL DEFAULT 120;
ALTER TABLE "Event" ADD COLUMN "autoCompleteAfterMinutes" INTEGER NOT NULL DEFAULT 2880;
```

(Keep whatever `CREATE TABLE "EventStatusHistory"` + index Prisma generated; only the enum block needs the manual rename-rebuild treatment.)

Re-apply: `pnpm --filter @repo/backend exec prisma migrate reset --schema=src/db/prisma/schema.prisma --force --skip-seed` then `… migrate dev` again is NOT needed if the edited file already applied. If you edited after applying, run `prisma migrate reset --force` then `prisma migrate deploy` then re-seed with `pnpm --filter @repo/backend exec prisma db seed` (seed script path is in package.json). Confirm the seed still succeeds.

- [ ] **Step 6: Verify client + typecheck**

Run: `pnpm --filter @repo/backend exec prisma generate --schema=src/db/prisma/schema.prisma && pnpm --filter @repo/backend typecheck`
Expected: PASS. (Typecheck may surface that `enums.ts` is now out of sync — that's expected and fixed in Task 2; if it blocks, proceed to Task 2 and typecheck at the end of Task 2. Note this in your report rather than editing enums.ts here.)

- [ ] **Step 7: Commit**

```bash
git add apps/backend/src/db/prisma/schema.prisma apps/backend/src/db/prisma/migrations
git commit -m "feat(db): 8-state EventStatus, SelectionMode, lifecycle columns, EventStatusHistory"
```

---

### Task 2: shared-types — enums, DTOs, transition input, EventDTO additions

**Files:**
- Modify: `packages/shared-types/src/enums.ts`
- Modify: `packages/shared-types/src/schemas.ts`

**Interfaces:**
- Consumes: Task 1's Prisma enum values.
- Produces: `EventStatus` (8 values) + `SelectionMode` in `enums.ts`; in `schemas.ts` — `EventStatusHistoryDTO`, `TransitionEventInput` (`{ to: EventStatus, reason?: string }`), `NextAutoTransition` (`{ to: EventStatus, at: string } | null`), and `EventDTO` extended with `statusChangedAt: string`, `isOverdue: boolean`, `selectionMode: SelectionMode`, `registrationOpensAt: string | null`, `nextAutoTransition: NextAutoTransition`.

- [ ] **Step 1: Extend the EventStatus const + add SelectionMode**

In `packages/shared-types/src/enums.ts`, replace the `EventStatus` object (currently 5 keys at line 21) with all 8, and add `SelectionMode`:

```ts
export const EventStatus = {
  DRAFT: "DRAFT",
  PUBLISHED: "PUBLISHED",
  REGISTRATION_OPEN: "REGISTRATION_OPEN",
  REGISTRATION_CLOSED: "REGISTRATION_CLOSED",
  ONGOING: "ONGOING",
  COMPLETED: "COMPLETED",
  CANCELLED: "CANCELLED",
  ARCHIVED: "ARCHIVED",
} as const;
export type EventStatus = (typeof EventStatus)[keyof typeof EventStatus];

export const SelectionMode = {
  FCFS: "FCFS",
  CURATED: "CURATED",
} as const;
export type SelectionMode = (typeof SelectionMode)[keyof typeof SelectionMode];
```

(Keep the existing `export type EventStatus = ...` pattern — match whatever the file already does for the other enums.)

- [ ] **Step 2: Add the new Zod schemas + extend EventDTO**

In `packages/shared-types/src/schemas.ts`:

Add near the other DTOs:

```ts
export const NextAutoTransition = z
  .object({ to: z.nativeEnum(EventStatus), at: z.string() })
  .nullable();
export type NextAutoTransition = z.infer<typeof NextAutoTransition>;

export const EventStatusHistoryDTO = z.object({
  id: z.string(),
  fromStatus: z.nativeEnum(EventStatus).nullable(),
  toStatus: z.nativeEnum(EventStatus),
  actorType: z.enum(["ADMIN", "SYSTEM"]),
  actorId: z.string().nullable(),
  reason: z.string().nullable(),
  sideEffectsStatus: z.enum(["PENDING", "DONE", "FAILED", "NONE"]),
  createdAt: z.string(),
});
export type EventStatusHistoryDTO = z.infer<typeof EventStatusHistoryDTO>;

export const TransitionEventInput = z.object({
  to: z.nativeEnum(EventStatus),
  reason: z.string().optional(),
});
export type TransitionEventInput = z.infer<typeof TransitionEventInput>;
```

Ensure `SelectionMode` is imported alongside `EventStatus` at the top of `schemas.ts` (from `./enums`).

Extend the `EventDTO` object (currently ends ~line 175) with:

```ts
  statusChangedAt: z.string(),
  isOverdue: z.boolean(),
  selectionMode: z.nativeEnum(SelectionMode),
  registrationOpensAt: z.string().nullable(),
  nextAutoTransition: NextAutoTransition,
```

Also add `selectionMode` and `registrationOpensAt` to `AdminEventInput` (so create/update can set them):

```ts
  selectionMode: z.nativeEnum(SelectionMode).optional(),
  registrationOpensAt: z.string().optional().nullable(),
```

- [ ] **Step 3: Typecheck both apps**

Run: `pnpm --filter @repo/backend typecheck && pnpm --filter @repo/frontend typecheck`
Expected: backend may now report errors in the mapper (`toEventDTO` missing new required fields) and in `adminEvents.service.ts` — those are fixed in Task 5. If so, the frontend typecheck should still pass; note the backend errors as expected-and-deferred-to-Task-5 in your report. If you can make `toEventDTO` compile by adding the fields now without the nextAutoTransition logic, prefer to leave it for Task 5 to keep tasks clean. Report the exact remaining errors.

- [ ] **Step 4: Commit**

```bash
git add packages/shared-types/src/enums.ts packages/shared-types/src/schemas.ts
git commit -m "feat(shared-types): 8-state enum, SelectionMode, history + transition DTOs, EventDTO lifecycle fields"
```

---

### Task 3: Pure transition table + validator (no DB) with exhaustive unit tests

**Files:**
- Create: `apps/backend/src/lib/lifecycle/transitions.ts`
- Test: `apps/backend/src/lib/lifecycle/transitions.test.ts`

**Interfaces:**
- Consumes: `EventStatus` from `@repo/shared-types`.
- Produces:
  - `ALLOWED_TRANSITIONS: Record<EventStatus, EventStatus[]>`
  - `canTransition(from: EventStatus, to: EventStatus): boolean`
  - `allowedFrom(from: EventStatus): EventStatus[]`

- [ ] **Step 1: Write the failing test**

Create `apps/backend/src/lib/lifecycle/transitions.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { EventStatus } from "@repo/shared-types";
import { canTransition, allowedFrom, ALLOWED_TRANSITIONS } from "./transitions";

describe("event lifecycle transition table", () => {
  it("allows the core happy-path transitions", () => {
    expect(canTransition(EventStatus.DRAFT, EventStatus.PUBLISHED)).toBe(true);
    expect(canTransition(EventStatus.PUBLISHED, EventStatus.REGISTRATION_OPEN)).toBe(true);
    expect(canTransition(EventStatus.REGISTRATION_OPEN, EventStatus.REGISTRATION_CLOSED)).toBe(true);
    expect(canTransition(EventStatus.REGISTRATION_CLOSED, EventStatus.ONGOING)).toBe(true);
    expect(canTransition(EventStatus.ONGOING, EventStatus.COMPLETED)).toBe(true);
    expect(canTransition(EventStatus.COMPLETED, EventStatus.ARCHIVED)).toBe(true);
  });

  it("allows reopening a closed registration before the event starts", () => {
    expect(canTransition(EventStatus.REGISTRATION_CLOSED, EventStatus.REGISTRATION_OPEN)).toBe(true);
  });

  it("allows cancelling from every pre-completion state", () => {
    for (const s of [
      EventStatus.DRAFT,
      EventStatus.PUBLISHED,
      EventStatus.REGISTRATION_OPEN,
      EventStatus.REGISTRATION_CLOSED,
      EventStatus.ONGOING,
    ]) {
      expect(canTransition(s, EventStatus.CANCELLED)).toBe(true);
    }
  });

  it("rejects nonsensical transitions", () => {
    expect(canTransition(EventStatus.COMPLETED, EventStatus.REGISTRATION_OPEN)).toBe(false);
    expect(canTransition(EventStatus.CANCELLED, EventStatus.PUBLISHED)).toBe(false);
    expect(canTransition(EventStatus.ARCHIVED, EventStatus.DRAFT)).toBe(false);
    expect(canTransition(EventStatus.DRAFT, EventStatus.ONGOING)).toBe(false);
  });

  it("never lists a state as a transition to itself", () => {
    for (const s of Object.values(EventStatus)) {
      expect(allowedFrom(s)).not.toContain(s);
    }
  });

  it("has an entry for every one of the 8 states", () => {
    expect(Object.keys(ALLOWED_TRANSITIONS).sort()).toEqual(Object.values(EventStatus).sort());
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @repo/backend exec vitest run src/lib/lifecycle/transitions.test.ts`
Expected: FAIL — module `./transitions` does not exist.

- [ ] **Step 3: Implement the transition table**

Create `apps/backend/src/lib/lifecycle/transitions.ts`:

```ts
import { EventStatus } from "@repo/shared-types";

/**
 * Single source of truth for legal event-status transitions (PRD §2.2).
 * Auto vs manual triggering is decided by callers (scheduler vs admin action);
 * this table only encodes which (from -> to) pairs are legal at all.
 */
export const ALLOWED_TRANSITIONS: Record<EventStatus, EventStatus[]> = {
  [EventStatus.DRAFT]: [EventStatus.PUBLISHED, EventStatus.CANCELLED],
  [EventStatus.PUBLISHED]: [
    EventStatus.REGISTRATION_OPEN,
    EventStatus.CANCELLED,
  ],
  [EventStatus.REGISTRATION_OPEN]: [
    EventStatus.REGISTRATION_CLOSED,
    EventStatus.CANCELLED,
  ],
  [EventStatus.REGISTRATION_CLOSED]: [
    EventStatus.REGISTRATION_OPEN, // manual reopen before start
    EventStatus.ONGOING,
    EventStatus.CANCELLED,
  ],
  [EventStatus.ONGOING]: [EventStatus.COMPLETED, EventStatus.CANCELLED],
  [EventStatus.COMPLETED]: [EventStatus.ARCHIVED],
  [EventStatus.CANCELLED]: [EventStatus.ARCHIVED],
  [EventStatus.ARCHIVED]: [],
};

export function allowedFrom(from: EventStatus): EventStatus[] {
  return ALLOWED_TRANSITIONS[from] ?? [];
}

export function canTransition(from: EventStatus, to: EventStatus): boolean {
  return allowedFrom(from).includes(to);
}
```

> Note (reconciles with PRD §2.2): the PRD table omits a CANCELLED→ARCHIVED row but §2.1 makes ARCHIVED the terminal "hidden" state; allowing cancelled events to be archived so they leave user lists is consistent with that intent. Flag this in your report as a deliberate extension for the reviewer.

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @repo/backend exec vitest run src/lib/lifecycle/transitions.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/lib/lifecycle/transitions.ts apps/backend/src/lib/lifecycle/transitions.test.ts
git commit -m "feat(backend): pure event-lifecycle transition table + validator"
```

---

### Task 4: `transitionEvent` service — atomic status + history write, post-commit side-effects

**Files:**
- Create: `apps/backend/src/lib/lifecycle/transitionEvent.ts`
- Test: `apps/backend/src/lib/lifecycle/transitionEvent.test.ts`

**Interfaces:**
- Consumes: `canTransition`/`allowedFrom` (Task 3); `prisma` from `../../db/client`; `AppError` from `../../middleware/error`.
- Produces:
  ```ts
  type TransitionActor = { type: "ADMIN"; id: string } | { type: "SYSTEM" };
  async function transitionEvent(
    eventId: string,
    to: EventStatus,
    actor: TransitionActor,
    reason?: string,
  ): Promise<void>;
  ```
  Throws `AppError("NOT_FOUND", …, 404)` for a missing event and `AppError("INVALID_TRANSITION", …, 409, { from, to, allowed })` for an illegal transition. On success: `event.status` + `statusChangedAt` updated and exactly one `EventStatusHistory` row inserted in the same transaction.

- [ ] **Step 1: Write the failing integration test**

Create `apps/backend/src/lib/lifecycle/transitionEvent.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { EventStatus } from "@repo/shared-types";
import { prisma } from "../../db/client";
import { transitionEvent } from "./transitionEvent";
import { AppError } from "../../middleware/error";

const PREFIX = "lifecycle-txn-test-";

async function makeEvent(status: EventStatus) {
  const now = new Date();
  return prisma.event.create({
    data: {
      slug: `${PREFIX}${Date.now()}-${Math.round(now.getTime() % 100000)}`,
      title: "Lifecycle txn test",
      description: "x",
      category: "Technology",
      location: "Online",
      startsAt: new Date(now.getTime() + 86400000),
      endsAt: new Date(now.getTime() + 90000000),
      status,
    },
  });
}

async function cleanup() {
  const events = await prisma.event.findMany({ where: { slug: { startsWith: PREFIX } }, select: { id: true } });
  const ids = events.map((e) => e.id);
  if (ids.length) {
    await prisma.eventStatusHistory.deleteMany({ where: { eventId: { in: ids } } });
    await prisma.event.deleteMany({ where: { id: { in: ids } } });
  }
}

describe("transitionEvent", () => {
  beforeEach(cleanup);
  afterAll(cleanup);

  it("performs a legal transition and writes exactly one history row", async () => {
    const ev = await makeEvent(EventStatus.DRAFT);
    await transitionEvent(ev.id, EventStatus.PUBLISHED, { type: "ADMIN", id: "admin-1" }, "go live");

    const after = await prisma.event.findUnique({ where: { id: ev.id } });
    expect(after?.status).toBe(EventStatus.PUBLISHED);

    const history = await prisma.eventStatusHistory.findMany({ where: { eventId: ev.id } });
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({
      fromStatus: EventStatus.DRAFT,
      toStatus: EventStatus.PUBLISHED,
      actorType: "ADMIN",
      actorId: "admin-1",
      reason: "go live",
    });
  });

  it("advances statusChangedAt", async () => {
    const ev = await makeEvent(EventStatus.DRAFT);
    const before = ev.statusChangedAt.getTime();
    await new Promise((r) => setTimeout(r, 5));
    await transitionEvent(ev.id, EventStatus.PUBLISHED, { type: "SYSTEM" });
    const after = await prisma.event.findUnique({ where: { id: ev.id } });
    expect(after!.statusChangedAt.getTime()).toBeGreaterThan(before);
  });

  it("rejects an illegal transition with 409 and does not write history", async () => {
    const ev = await makeEvent(EventStatus.COMPLETED);
    await expect(
      transitionEvent(ev.id, EventStatus.REGISTRATION_OPEN, { type: "ADMIN", id: "admin-1" }),
    ).rejects.toMatchObject({ code: "INVALID_TRANSITION", status: 409 });
    const history = await prisma.eventStatusHistory.count({ where: { eventId: ev.id } });
    expect(history).toBe(0);
  });

  it("404s for a missing event", async () => {
    await expect(
      transitionEvent("does-not-exist", EventStatus.PUBLISHED, { type: "SYSTEM" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND", status: 404 });
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @repo/backend exec vitest run src/lib/lifecycle/transitionEvent.test.ts`
Expected: FAIL — `./transitionEvent` does not exist.

- [ ] **Step 3: Implement transitionEvent**

Create `apps/backend/src/lib/lifecycle/transitionEvent.ts`:

```ts
import { EventStatus } from "@repo/shared-types";
import { prisma } from "../../db/client";
import { AppError } from "../../middleware/error";
import { allowedFrom, canTransition } from "./transitions";

export type TransitionActor = { type: "ADMIN"; id: string } | { type: "SYSTEM" };

/**
 * The ONLY code path allowed to mutate event.status. Validates against the
 * transition table, then writes the new status + statusChangedAt and one
 * EventStatusHistory row in a single transaction. Side effects (P1 has none yet;
 * P2/P3 add certificate unlock, no-show finalization, cancellation email) run
 * AFTER commit and update sideEffectsStatus — a failed side effect never leaves
 * the status itself inconsistent.
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

  const from = event.status as EventStatus;
  if (from === to) return; // idempotent no-op — scheduler may re-evaluate a boundary

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
        sideEffectsStatus: "NONE", // P1 has no side effects yet; P2/P3 set PENDING and resolve
      },
    }),
  ]);

  // Post-commit side effects land here in later phases (idempotent, update sideEffectsStatus).
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @repo/backend exec vitest run src/lib/lifecycle/transitionEvent.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/lib/lifecycle/transitionEvent.ts apps/backend/src/lib/lifecycle/transitionEvent.test.ts
git commit -m "feat(backend): transitionEvent — atomic status+history writer, sole status mutator"
```

---

### Task 5: Route existing writers through the engine + `POST /transition` + EventDTO mapper

**Files:**
- Modify: `apps/backend/src/routes/admin/adminEvents.service.ts` (refactor 5 writers)
- Modify: `apps/backend/src/routes/public/events/events.service.ts` (`completeExpiredEvents` routes through engine)
- Modify: `apps/backend/src/routes/admin/adminEvents.routes.ts` (add `POST /:id/transition`)
- Modify: `apps/backend/src/lib/shared/mappers.ts` (`toEventDTO` new fields + `nextAutoTransition`)
- Modify: `apps/backend/src/routes/admin/adminEvents.service.ts` create/update (persist `selectionMode`, `registrationOpensAt`)
- Test: `apps/backend/src/routes/admin/adminEvents.routes.test.ts` (extend)

**Interfaces:**
- Consumes: `transitionEvent`, `TransitionActor` (Task 4); `allowedFrom` (Task 3); `EventDTO` new fields (Task 2).
- Produces: `POST /api/admin/events/:id/transition { to, reason? }` (gated `EVENT_PUBLISH`); `toEventDTO` emits `statusChangedAt`, `isOverdue`, `selectionMode`, `registrationOpensAt`, `nextAutoTransition`.

- [ ] **Step 1: Write the failing integration tests**

Append to `apps/backend/src/routes/admin/adminEvents.routes.test.ts` (reuses existing `loginAs`, `validPayload`, `TEST_SLUG_PREFIX`):

```ts
  it("transitions via POST /transition and writes history", async () => {
    const agent = await loginAs("superadmin@gdn-commerce.com");
    const created = await agent.post("/api/admin/events").send(validPayload({ slug: `${TEST_SLUG_PREFIX}transition-me` }));
    const res = await agent.post(`/api/admin/events/${created.body.id}/transition`).send({ to: "PUBLISHED", reason: "go" });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("PUBLISHED");
    expect(typeof res.body.statusChangedAt).toBe("string");
    expect(res.body.isOverdue).toBe(false);
  });

  it("rejects an illegal transition with 409 + allowed list", async () => {
    const agent = await loginAs("superadmin@gdn-commerce.com");
    const created = await agent.post("/api/admin/events").send(validPayload({ slug: `${TEST_SLUG_PREFIX}bad-transition` }));
    await agent.patch(`/api/admin/events/${created.body.id}/status`).send({ status: "COMPLETED" });
    const res = await agent.post(`/api/admin/events/${created.body.id}/transition`).send({ to: "REGISTRATION_OPEN" });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("INVALID_TRANSITION");
    expect(res.body.error.details.allowed).toContain("ARCHIVED");
  });

  it("returns the new lifecycle fields on GET", async () => {
    const agent = await loginAs("superadmin@gdn-commerce.com");
    const created = await agent.post("/api/admin/events").send(validPayload({ slug: `${TEST_SLUG_PREFIX}dto-fields`, selectionMode: "CURATED" }));
    const res = await agent.get(`/api/admin/events/${created.body.id}`);
    expect(res.body.selectionMode).toBe("CURATED");
    expect(res.body).toHaveProperty("registrationOpensAt");
    expect(res.body).toHaveProperty("nextAutoTransition");
  });
```

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm --filter @repo/backend exec vitest run src/routes/admin/adminEvents.routes.test.ts -t "transition"`
Expected: FAIL — no `/transition` route; DTO lacks new fields.

- [ ] **Step 3: Extend `toEventDTO` in `mappers.ts`**

Add a small helper above `toEventDTO` and the new fields inside it. The `EventWithRelations` type must include the new columns (they come from `prisma.event` automatically). Add:

```ts
import { EventStatus, type NextAutoTransition } from "@repo/shared-types";

/**
 * Display-only hint for the FE: the next time-based transition the scheduler
 * (P2) will make and when. P1 computes it from timestamps for the FE countdown;
 * it never drives the badge (the badge mirrors stored status + isOverdue).
 */
function computeNextAutoTransition(e: {
  status: EventStatus;
  registrationOpensAt: Date | null;
  registrationDeadline: Date | null;
  startsAt: Date;
  endsAt: Date;
}): NextAutoTransition {
  switch (e.status) {
    case EventStatus.PUBLISHED:
      return e.registrationOpensAt
        ? { to: EventStatus.REGISTRATION_OPEN, at: e.registrationOpensAt.toISOString() }
        : null;
    case EventStatus.REGISTRATION_OPEN:
      return e.registrationDeadline
        ? { to: EventStatus.REGISTRATION_CLOSED, at: e.registrationDeadline.toISOString() }
        : null;
    case EventStatus.REGISTRATION_CLOSED:
      return { to: EventStatus.ONGOING, at: e.startsAt.toISOString() };
    case EventStatus.ONGOING:
      return { to: EventStatus.COMPLETED, at: e.endsAt.toISOString() };
    default:
      return null;
  }
}
```

Inside the `toEventDTO` return object, add:

```ts
    statusChangedAt: e.statusChangedAt.toISOString(),
    isOverdue: e.isOverdue,
    selectionMode: e.selectionMode,
    registrationOpensAt: e.registrationOpensAt?.toISOString() ?? null,
    nextAutoTransition: computeNextAutoTransition(e),
```

(Confirm `EventWithRelations` picks up `statusChangedAt`, `isOverdue`, `selectionMode`, `registrationOpensAt` — since it's `Event & {...}`, they're included automatically after `prisma generate`.)

- [ ] **Step 4: Refactor the 5 writers in `adminEvents.service.ts` to call `transitionEvent`**

Replace each writer's `prisma.event.update({ data: { status … } })` with a `transitionEvent(...)` call, then re-read via `getAdminEvent(id)` to return the DTO. Keep each function's pre-checks (required-fields for publish; already-cancelled guard becomes redundant but harmless). Example for `publishAdminEvent` (apply the analogous change to `closeAdminEventRegistration`, `openAdminEventRegistration`, `cancelAdminEvent`, `setAdminEventStatus`):

```ts
import { transitionEvent } from "../../lib/lifecycle/transitionEvent";

export async function publishAdminEvent(id: string, actorId: string): Promise<EventDTO> {
  const existing = await prisma.event.findUnique({ where: { id } });
  if (!existing) throw new AppError("NOT_FOUND", "Event not found", 404);
  const missing = REQUIRED_FOR_PUBLISH.filter((f) => !existing[f as keyof typeof existing]);
  if (missing.length > 0) {
    throw new AppError("INCOMPLETE_EVENT", `Missing required fields: ${missing.join(", ")}`, 422);
  }
  await transitionEvent(id, EventStatus.PUBLISHED, { type: "ADMIN", id: actorId });
  return getAdminEvent(id);
}
```

Notes:
- `setAdminEventStatus(id, status, actorId)` now routes its forced status through `transitionEvent` — the "unguarded override" becomes guarded (its test that forces DRAFT→COMPLETED will now 409; UPDATE that test, see Step 6). This is the intended tightening (FR-1.1/FR-1.2).
- Thread `actorId` (the admin's `req.userId`) into each service call; update `adminEvents.routes.ts` call sites to pass `req.userId!`.
- `publishedAt`: keep setting it. Do it as a separate `prisma.event.update({ where:{id}, data:{ publishedAt } })` AFTER the transition when moving to PUBLISHED and `publishedAt` is null. (It's not a status write, so it's allowed.)

- [ ] **Step 5: Route `completeExpiredEvents` through the engine**

In `events.service.ts`, change the per-event update inside `completeExpiredEvents` to call `transitionEvent(event.id, EventStatus.COMPLETED, { type: "SYSTEM" })` (for the status change), then do the `displayConfig.pastEvent` flip as a separate non-status update. Guard so only currently-completable states are sweeped (its query already filters to PUBLISHED/REGISTRATION_CLOSED; add REGISTRATION_OPEN and ONGOING to the query `in` list so newly-reachable live states also complete). Wrap each `transitionEvent` call in try/catch logging so one bad row doesn't abort the sweep.

- [ ] **Step 6: Add the `POST /:id/transition` route + fix the override test**

In `adminEvents.routes.ts`, add (after the existing `/:id/status` route):

```ts
import { TransitionEventInput } from "@repo/shared-types";

adminEventsRoutes.post(
  "/:id/transition",
  requireAuth,
  requirePermission(Permission.EVENT_PUBLISH),
  requireEventAccess("id"),
  validate(TransitionEventInput),
  async (req, res, next) => {
    try {
      const { to, reason } = req.body as TransitionEventInput;
      await transitionEvent(req.params.id!, to, { type: "ADMIN", id: req.userId! }, reason);
      res.json(await getAdminEvent(req.params.id!));
    } catch (err) {
      next(err);
    }
  },
);
```

Import `transitionEvent` and `getAdminEvent` in the routes file. Update the pre-existing test `"manually overrides status, bypassing the publish lifecycle's own guardrails"` (adminEvents.routes.test.ts ~line 104): it currently asserts DRAFT→COMPLETED via `/status` returns 200. Since the override is now guarded, change it to assert a **legal** forced transition still works (e.g. DRAFT→PUBLISHED via `/status` → 200) OR that the illegal DRAFT→COMPLETED now returns 409. Pick the 409 assertion and rename the test to `"manual status override now enforces the transition table"`.

- [ ] **Step 7: Run the full event test file + typecheck**

Run: `pnpm --filter @repo/backend exec vitest run src/routes/admin/adminEvents.routes.test.ts && pnpm --filter @repo/backend typecheck && pnpm --filter @repo/frontend typecheck`
Expected: all PASS.

- [ ] **Step 8: Verify `transitionEvent` is the only status writer**

Run: `grep -rn "status:" apps/backend/src --include=*.ts | grep -i "prisma.event.update\|data: {" ` then manually confirm no `prisma.event.update` anywhere sets `status` except inside `transitionEvent`. Report the grep result.

- [ ] **Step 9: Commit**

```bash
git add apps/backend/src
git commit -m "feat(backend): route all status writes through transitionEvent + POST /transition + EventDTO lifecycle fields"
```

---

## Self-review notes (author)

- **Spec coverage (P1 slice of the PRD):** FR-1.1 (sole writer) → Tasks 4+5; FR-1.2 (409 + allowed) → Tasks 3+4+5; FR-1.3 (atomic history) → Task 4; FR-1.4 (side-effects post-commit, `sideEffectsStatus`) → Task 4 scaffold (`NONE` in P1; real effects P2/P3); FR-3.1 (history table shape) → Tasks 1+2; FR-5.2 (`POST /transition`, admin-only) → Task 5; FR-5.1 partial (`status_changed_at`, `is_overdue`, `next_auto_transition` on DTO) → Tasks 2+5; §5 data model → Task 1; decision #6 (`selectionMode` + backfill) → Task 1; decision #5 (`registrationOpensAt` wired) → Tasks 2+5.
- **Deferred to later phases (intentionally not in P1):** scheduler & real overdue/auto-complete (P2); admin History panel UI + End-Event/overdue banner (P3); FR-3.2 read endpoint for history can be added in P3 when the panel needs it.
- **Known adaptation to flag to reviewers:** PRD SQL is snake_case/`interval`; we use the repo's camelCase + integer-minutes. And CANCELLED→ARCHIVED is added beyond the PRD table (consistent with ARCHIVED being the terminal hidden state).
