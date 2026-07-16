# P3 — Admin FE Lifecycle UI — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the admin frontend's raw 8-option status `<select>` with semantic, pre-gated lifecycle action buttons backed by the same transition table the backend enforces; surface the `EventStatusHistory` audit trail in a new History tab; show an overdue banner with a one-click "End Event Now" shortcut; fix the four related stale spots (`statusColor.ts`'s incomplete 8-state maps, `isEventLive`'s missing `ONGOING` case, `EventsListPage.tsx`'s stale filter pills, `SettingsTab.tsx`'s duplicated registration-legality check).

**Architecture:** `apps/backend/src/lib/lifecycle/transitions.ts` (`ALLOWED_TRANSITIONS`/`allowedFrom`/`canTransition`) moves verbatim into `packages/shared-types/src/lifecycle.ts` so both the backend (enforcement) and the admin frontend (which button to render) import the exact same table — no independently-maintained copy. A new `GET /admin/events/:id/history` endpoint exposes the existing (already-populated, currently-unread) `EventStatusHistory` table. Three new frontend components (`LifecycleActionBar`, `EndEventDialog`, `OverdueBanner`) plus one new tab (`HistoryTab`) replace the old `<select>` in `EventWorkspacePage.tsx`. Every write goes through the existing `POST /:id/transition` endpoint — no new backend write paths.

**Tech Stack:** Express + Prisma + Postgres (backend, Vitest + Supertest against a real seeded DB); Vite + React 19 + Tailwind ("Blu" tokens) + Zustand (admin frontend, **no test runner configured** — see Global Constraints).

Spec: `docs/superpowers/specs/2026-07-17-lifecycle-p3-admin-fe-design.md`

## Global Constraints

- Every event-status write must go through `transitionEvent()` (directly, or via `POST /:id/transition`) — never mutate `event.status` outside it. This plan adds zero new write paths; every new frontend action calls the existing `POST /admin/events/:id/transition`.
- The admin frontend (`apps/frontend`) has **no test runner** (`package.json` has only `lint`/`typecheck` scripts, no `vitest`/`@testing-library` dependency, zero existing `.test.tsx` files). Every frontend task's automated gate is `pnpm --filter @repo/frontend typecheck` (`tsc --noEmit`) — there is no unit-test step to write for frontend tasks. Manual browser verification happens once, holistically, in the final task.
- The backend (`apps/backend`) and now `packages/shared-types` use Vitest + Supertest against a real, already-seeded local Postgres (`localhost:5432`, portable install — see the `local-postgres-setup` memory if it's down). Run `pnpm --filter <pkg> test` for a fast single-package loop; `pnpm test` (turbo, all packages) is the final regression gate.
- This repo's shared `tsconfig` sets `noUncheckedIndexedAccess: true` — any array/object dynamic indexing types as `T | undefined`. Prefer restructuring over non-null assertions where the value is genuinely optional.
- Match existing Blu Tailwind conventions exactly: `rounded-2xl border border-line bg-white p-5` for cards, `rounded-full` for buttons/badges, `text-ink`/`text-muted`/`text-status-red`/`text-status-orange` for text, `bg-primary`/`hover:bg-primary-dark` for primary actions. No new design tokens.
- Commit after each task using this repo's existing style: `type(scope): short imperative summary` (e.g. `feat(shared-types): move transition table out of backend`).
- `EventStatus` in `@repo/shared-types` is a `const` object + string-union type (`packages/shared-types/src/enums.ts`), **not** a TypeScript `enum` — `EventStatus.PUBLISHED` is a plain string value, and object keys like `{ [EventStatus.PUBLISHED]: "Publish" }` work as ordinary computed string keys.

---

### Task 1: Move the transition table into `packages/shared-types`

**Files:**
- Create: `packages/shared-types/src/lifecycle.ts`
- Create: `packages/shared-types/src/lifecycle.test.ts`
- Modify: `packages/shared-types/src/index.ts`
- Modify: `packages/shared-types/package.json`
- Modify: `apps/backend/src/lib/lifecycle/transitionEvent.ts`
- Delete: `apps/backend/src/lib/lifecycle/transitions.ts`
- Delete: `apps/backend/src/lib/lifecycle/transitions.test.ts`

**Interfaces:**
- Produces: `ALLOWED_TRANSITIONS: Record<EventStatus, EventStatus[]>`, `allowedFrom(from: EventStatus): EventStatus[]`, `canTransition(from: EventStatus, to: EventStatus): boolean` — all exported from `@repo/shared-types` (previously backend-only, from `./transitions`). Every later task that needs the transition table (Task 4's `LifecycleActionBar`) imports it from `@repo/shared-types`.

- [ ] **Step 1: Add vitest to `packages/shared-types` (it currently has none)**

`packages/shared-types/package.json` currently has `"test": "echo \"no tests\" && exit 0"` and no `vitest` dependency — this package has never had a real test before. Edit it to match `packages/shared-utils/package.json`'s shape exactly:

```json
{
  "name": "@repo/shared-types",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "src/index.ts",
  "types": "src/index.ts",
  "exports": {
    ".": "./src/index.ts"
  },
  "scripts": {
    "lint": "eslint src",
    "test": "vitest run"
  },
  "dependencies": {
    "zod": "^3.23.0"
  },
  "devDependencies": {
    "@repo/eslint-config": "workspace:*",
    "@repo/tsconfig": "workspace:*",
    "eslint": "^8.57.0",
    "typescript": "^5.5.0",
    "vitest": "^2.0.0"
  }
}
```

Then install so pnpm links the new dependency:

```bash
pnpm install
```

- [ ] **Step 2: Write the failing test at its new location**

Create `packages/shared-types/src/lifecycle.test.ts` — same 6 assertions as the backend's current `transitions.test.ts`, but importing `EventStatus` from the local `./enums` (relative, since this file now lives inside the package that defines it) instead of the package alias `@repo/shared-types`:

```ts
import { describe, it, expect } from "vitest";
import { EventStatus } from "./enums";
import { canTransition, allowedFrom, ALLOWED_TRANSITIONS } from "./lifecycle";

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

- [ ] **Step 3: Run it to verify it fails**

```bash
pnpm --filter @repo/shared-types test
```
Expected: FAIL — `./lifecycle` has no exports yet (module not found).

- [ ] **Step 4: Write `lifecycle.ts`**

Create `packages/shared-types/src/lifecycle.ts` — identical logic to the backend's current `transitions.ts`, with the only change being the `EventStatus` import path (relative `./enums` instead of the package's own alias, since this file now lives inside `@repo/shared-types` itself):

```ts
import { EventStatus } from "./enums";

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

- [ ] **Step 5: Export it from the package**

Edit `packages/shared-types/src/index.ts`:

```ts
export * from "./enums";
export * from "./schemas";
export * from "./lifecycle";
```

- [ ] **Step 6: Run the test to verify it passes**

```bash
pnpm --filter @repo/shared-types test
```
Expected: PASS (6/6).

- [ ] **Step 7: Delete the old backend copy**

```bash
git rm apps/backend/src/lib/lifecycle/transitions.ts apps/backend/src/lib/lifecycle/transitions.test.ts
```

- [ ] **Step 8: Update the one backend consumer**

Edit `apps/backend/src/lib/lifecycle/transitionEvent.ts` — merge `allowedFrom`/`canTransition` into the existing `@repo/shared-types` import and drop the now-deleted local import:

```ts
import { EventStatus, allowedFrom, canTransition } from "@repo/shared-types";
import type { EventDisplayConfig } from "@repo/shared-types";
import { prisma } from "../../db/client";
import { AppError } from "../../middleware/error";
import { logger } from "../../logger";
```

(Delete the old `import { allowedFrom, canTransition } from "./transitions";` line entirely — the rest of the file is unchanged.)

- [ ] **Step 9: Run the backend regression suite + typecheck**

```bash
pnpm --filter @repo/backend test
pnpm --filter @repo/backend typecheck
```
Expected: both green — this is a pure relocation, no behavior change. (`grep -rn "from \"./transitions\"" apps/backend/src` should now return nothing.)

Note: `@repo/shared-types` has no `tsconfig.json`/`typecheck` script of its own — `pnpm --filter @repo/shared-types typecheck` does not exist as a command and will fail with "Missing script". `lifecycle.ts` is fully type-checked as part of `@repo/backend typecheck` above, since `transitionEvent.ts` imports it (TS type-checks every file reached through an import chain, not just the named symbols). This matches the pre-existing convention for this package — do not add a tsconfig/typecheck script; that would be scope creep beyond this task.

- [ ] **Step 10: Commit**

```bash
git add packages/shared-types apps/backend/src/lib/lifecycle/transitionEvent.ts pnpm-lock.yaml
git commit -m "feat(shared-types): move the event transition table out of the backend

So the admin frontend can import the exact same ALLOWED_TRANSITIONS table
the backend enforces, instead of maintaining an independent copy."
```

---

### Task 2: Backend — `GET /admin/events/:id/history`

**Files:**
- Modify: `apps/backend/src/lib/shared/mappers.ts`
- Modify: `apps/backend/src/routes/admin/adminEvents.service.ts`
- Modify: `apps/backend/src/routes/admin/adminEvents.routes.ts`
- Test: `apps/backend/src/routes/admin/adminEvents.routes.test.ts`

**Interfaces:**
- Consumes: `EventStatusHistoryDTO` (already exists, `packages/shared-types/src/schemas.ts:152-162`); `AppError` (`apps/backend/src/middleware/error.ts`, `new AppError(code, message, status, details?)`); `requireEventAccess("id")` (`apps/backend/src/middleware/eventScope.ts`).
- Produces: `toEventStatusHistoryDTO(h: EventStatusHistory): EventStatusHistoryDTO` (mapper); `listEventHistory(id: string): Promise<EventStatusHistoryDTO[]>` (service, 404s if the event doesn't exist); route `GET /admin/events/:id/history`.

- [ ] **Step 1: Write the failing tests**

Append to `apps/backend/src/routes/admin/adminEvents.routes.test.ts`, right after the existing `"returns the new lifecycle fields on GET"` test (before the closing `});` of the `describe` block):

```ts
  it("returns the status history for an event, newest first", async () => {
    const agent = await loginAs("superadmin@gdn-commerce.com");
    const created = await agent.post("/api/admin/events").send(validPayload({ slug: `${TEST_SLUG_PREFIX}history` }));
    await agent.post(`/api/admin/events/${created.body.id}/transition`).send({ to: "PUBLISHED", reason: "go live" });
    await agent.post(`/api/admin/events/${created.body.id}/transition`).send({ to: "REGISTRATION_OPEN" });

    const res = await agent.get(`/api/admin/events/${created.body.id}/history`);
    expect(res.status).toBe(200);
    expect(res.body.length).toBe(2);
    expect(res.body[0].toStatus).toBe("REGISTRATION_OPEN");
    expect(res.body[0].fromStatus).toBe("PUBLISHED");
    expect(res.body[1].toStatus).toBe("PUBLISHED");
    expect(res.body[1].reason).toBe("go live");
    expect(res.body[1].actorType).toBe("ADMIN");
  });

  it("404s for a nonexistent event's history", async () => {
    const agent = await loginAs("superadmin@gdn-commerce.com");
    const res = await agent.get("/api/admin/events/does-not-exist/history");
    expect(res.status).toBe(404);
  });

  it("scopes history access to the event admin's assigned events", async () => {
    const eventAgent = await loginAs("eventadmin@gdn-commerce.com");
    const notAssigned = await prisma.event.findFirstOrThrow({
      where: { slug: "love-hate-work-relationship" },
    });
    const res = await eventAgent.get(`/api/admin/events/${notAssigned.id}/history`);
    expect(res.status).toBe(403);
  });
```

- [ ] **Step 2: Run to verify they fail**

```bash
pnpm --filter @repo/backend test -- adminEvents.routes.test.ts
```
Expected: FAIL — `GET /:id/history` doesn't exist yet (404/`Cannot GET`, not a real 404 body shape — the new tests will get a route-not-found response).

- [ ] **Step 3: Add the mapper**

Edit `apps/backend/src/lib/shared/mappers.ts` — add `EventStatusHistory` to the `@prisma/client` type import, `EventStatusHistoryDTO` to the `@repo/shared-types` type import, and a new mapper function (placed after `toEventDTO`, before `toAnnouncementDTO`):

```ts
import type {
  Announcement,
  Certificate,
  Event,
  EventStatusHistory,
  Feedback,
  Registration,
  Speaker,
  SpeedDatingRegistration,
} from "@prisma/client";
import type {
  AgendaItemDTO,
  AnnouncementDTO,
  CertificateDTO,
  DiscussionPointDTO,
  EventDisplayConfig,
  EventDTO,
  EventStatusHistoryDTO,
  FaqItemDTO,
  LearningPointDTO,
  MyEventDTO,
  NextAutoTransition,
  SpeakerDTO,
} from "@repo/shared-types";
```

```ts
export function toEventStatusHistoryDTO(h: EventStatusHistory): EventStatusHistoryDTO {
  return {
    id: h.id,
    fromStatus: h.fromStatus,
    toStatus: h.toStatus,
    actorType: h.actorType as "ADMIN" | "SYSTEM",
    actorId: h.actorId,
    reason: h.reason,
    sideEffectsStatus: h.sideEffectsStatus as "PENDING" | "DONE" | "FAILED" | "NONE",
    createdAt: h.createdAt.toISOString(),
  };
}
```

- [ ] **Step 4: Add the service function**

Edit `apps/backend/src/routes/admin/adminEvents.service.ts` — add `EventStatusHistoryDTO` to the `@repo/shared-types` type import and `toEventStatusHistoryDTO` to the mappers import:

```ts
import type {
  AdminEventInput,
  AdminEventUpdateInput,
  EventDisplayConfig,
  EventDTO,
  EventStatusHistoryDTO,
  Role,
} from "@repo/shared-types";
import { isEventScoped } from "@repo/auth";
import { prisma } from "../../db/client";
import { AppError } from "../../middleware/error";
import { eventInclude } from "../public/events/events.service";
import { toEventDTO, toEventStatusHistoryDTO } from "../../lib/shared/mappers";
import { transitionEvent } from "../../lib/lifecycle/transitionEvent";
```

Add the function right after `getAdminEvent` (mirrors `getEventFeedback`'s existence-check pattern in `apps/backend/src/routes/admin/adminFeedback.service.ts:42-44`):

```ts
export async function listEventHistory(id: string): Promise<EventStatusHistoryDTO[]> {
  const event = await prisma.event.findUnique({ where: { id } });
  if (!event) throw new AppError("NOT_FOUND", "Event not found", 404);
  const rows = await prisma.eventStatusHistory.findMany({
    where: { eventId: id },
    orderBy: { createdAt: "desc" },
  });
  return rows.map(toEventStatusHistoryDTO);
}
```

- [ ] **Step 5: Add the route**

Edit `apps/backend/src/routes/admin/adminEvents.routes.ts` — add `listEventHistory` to the service import:

```ts
import {
  cancelAdminEvent,
  closeAdminEventRegistration,
  createAdminEvent,
  deleteAdminEvent,
  getAdminEvent,
  listAdminEvents,
  listEventHistory,
  openAdminEventRegistration,
  publishAdminEvent,
  setAdminEventStatus,
  updateAdminEvent,
} from "./adminEvents.service";
```

Add the route right after the `GET /:id` block (after line 60's closing `);`, before the `POST /` block):

```ts
// GET /admin/events/:id/history
adminEventsRoutes.get(
  "/:id/history",
  requireAuth,
  requirePermission(Permission.EVENT_READ),
  requireEventAccess("id"),
  async (req, res, next) => {
    try {
      res.json(await listEventHistory(req.params.id!));
    } catch (err) {
      next(err);
    }
  },
);
```

- [ ] **Step 6: Run the tests to verify they pass**

```bash
pnpm --filter @repo/backend test -- adminEvents.routes.test.ts
```
Expected: PASS (all tests in the file, including the 3 new ones).

- [ ] **Step 7: Run the full backend suite + typecheck**

```bash
pnpm --filter @repo/backend test
pnpm --filter @repo/backend typecheck
```
Expected: all green.

- [ ] **Step 8: Commit**

```bash
git add apps/backend/src/lib/shared/mappers.ts apps/backend/src/routes/admin/adminEvents.service.ts apps/backend/src/routes/admin/adminEvents.routes.ts apps/backend/src/routes/admin/adminEvents.routes.test.ts
git commit -m "feat(backend): add GET /admin/events/:id/history

Exposes the existing EventStatusHistory audit trail, currently populated
by every transitionEvent() call but read by nothing."
```

---

### Task 3: `shared-utils` — complete the 8-state maps, fix `isEventLive`, add `formatTimeAgo`

**Files:**
- Modify: `packages/shared-utils/src/statusColor.ts`
- Modify: `packages/shared-utils/src/statusColor.test.ts`
- Modify: `packages/shared-utils/src/date.ts`
- Create: `packages/shared-utils/src/date.test.ts`

**Interfaces:**
- Produces: `statusColor`/`statusLabel`/`isEventLive`/`getEventDisplayStatus` (unchanged signatures, corrected data); `formatTimeAgo(iso: string | Date): string` — new, consumed by Task 5's `OverdueBanner`.

Note on scope: the design spec described this as "4 missing states," but `CANCELLED` already has an entry in both maps (shared with `RegistrationStatus.CANCELLED`, which happens to use the identical string) — the real gap is 3 states: `REGISTRATION_OPEN`, `ONGOING`, `ARCHIVED`.

- [ ] **Step 1: Write the failing tests**

Edit `packages/shared-utils/src/statusColor.test.ts` — add `isEventLive` to the import, and three new test blocks:

```ts
import { describe, it, expect } from "vitest";
import { statusColor, statusLabel, isEventLive } from "./statusColor";
```

Add after the existing `"maps event statuses"` test (inside the `describe("statusColor", ...)` block):

```ts
  it("maps the newly-added 8-state event statuses", () => {
    expect(statusColor("REGISTRATION_OPEN")).toBe("blue");
    expect(statusColor("ONGOING")).toBe("red");
    expect(statusColor("ARCHIVED")).toBe("orange");
  });
```

Add after the existing `"humanizes known statuses"` test (inside the `describe("statusLabel", ...)` block):

```ts
  it("humanizes the newly-added 8-state event statuses", () => {
    expect(statusLabel("REGISTRATION_OPEN")).toBe("Registration Open");
    expect(statusLabel("ONGOING")).toBe("Ongoing");
    expect(statusLabel("ARCHIVED")).toBe("Archived");
  });
```

Add a new top-level `describe` block at the end of the file:

```ts
describe("isEventLive", () => {
  it("is true for ONGOING within the event window", () => {
    const now = Date.now();
    expect(
      isEventLive({
        status: "ONGOING",
        startsAt: new Date(now - 1000).toISOString(),
        endsAt: new Date(now + 1000).toISOString(),
      }),
    ).toBe(true);
  });

  it("is false for ONGOING outside the event window", () => {
    const now = Date.now();
    expect(
      isEventLive({
        status: "ONGOING",
        startsAt: new Date(now - 10000).toISOString(),
        endsAt: new Date(now - 1000).toISOString(),
      }),
    ).toBe(false);
  });

  it("is false for a status that never counts as live", () => {
    const now = Date.now();
    expect(
      isEventLive({
        status: "COMPLETED",
        startsAt: new Date(now - 1000).toISOString(),
        endsAt: new Date(now + 1000).toISOString(),
      }),
    ).toBe(false);
  });
});
```

Create `packages/shared-utils/src/date.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import dayjs from "dayjs";
import { formatTimeAgo } from "./date";

describe("formatTimeAgo", () => {
  it("shows minutes for under an hour", () => {
    expect(formatTimeAgo(dayjs().subtract(5, "minute").toISOString())).toBe("5 minutes ago");
  });

  it("shows hours for under a day", () => {
    expect(formatTimeAgo(dayjs().subtract(3, "hour").toISOString())).toBe("3 hours ago");
  });

  it("shows days for a day or more", () => {
    expect(formatTimeAgo(dayjs().subtract(2, "day").toISOString())).toBe("2 days ago");
  });

  it("uses singular units", () => {
    expect(formatTimeAgo(dayjs().subtract(1, "hour").toISOString())).toBe("1 hour ago");
  });
});
```

- [ ] **Step 2: Run to verify they fail**

```bash
pnpm --filter @repo/shared-utils test
```
Expected: FAIL — the 3 new statuses fall through to defaults (`statusColor("ONGOING")` returns `"blue"` not `"red"`, etc.), `isEventLive` returns `false` for `ONGOING`, and `formatTimeAgo` doesn't exist.

- [ ] **Step 3: Fix `statusColor.ts`**

Replace the full contents of `packages/shared-utils/src/statusColor.ts`:

```ts
// Single source of truth for status → Blu color mapping.
// Upcoming/Registered = Blue, Completed = Green, Waiting = Orange, Rejected = Red, Shortlisted = Purple.

export type BluColor = "blue" | "green" | "orange" | "red" | "purple";

export const STATUS_COLOR: Record<string, BluColor> = {
  // Registration statuses
  REGISTERED: "blue",
  WAITING: "orange",
  REJECTED: "red",
  SHORTLISTED: "purple",
  CANCELLED: "red",
  // Attendance
  PRESENT: "green",
  ABSENT: "red",
  // Event statuses
  DRAFT: "orange",
  PUBLISHED: "blue",
  REGISTRATION_OPEN: "blue",
  REGISTRATION_CLOSED: "orange",
  ONGOING: "red",
  COMPLETED: "green",
  ARCHIVED: "orange",
  // Derived, not a real EventStatus — see isEventLive().
  LIVE: "red",
  // Legacy alias
  UPCOMING: "blue",
};

export function statusColor(status: string): BluColor {
  return STATUS_COLOR[status] ?? "blue";
}

const LABELS: Record<string, string> = {
  REGISTERED: "Registered",
  WAITING: "Waiting list",
  REJECTED: "Rejected",
  SHORTLISTED: "Shortlisted",
  CANCELLED: "Cancelled",
  PRESENT: "Present",
  ABSENT: "Absent",
  DRAFT: "Draft",
  PUBLISHED: "Upcoming",
  REGISTRATION_OPEN: "Registration Open",
  REGISTRATION_CLOSED: "Registration closed",
  ONGOING: "Ongoing",
  COMPLETED: "Completed",
  ARCHIVED: "Archived",
  LIVE: "Live Now",
  UPCOMING: "Upcoming",
};

export function statusLabel(status: string): string {
  return LABELS[status] ?? status;
}

/**
 * Whether an event is currently happening (now is within [startsAt, endsAt]).
 * Purely a display concern — the stored EventStatus doesn't change while live;
 * it still flips PUBLISHED/REGISTRATION_CLOSED/ONGOING -> COMPLETED only once endsAt
 * passes (see the API's sweepEventLifecycle scheduler). ONGOING is included here
 * because the scheduler walks REGISTRATION_CLOSED -> ONGOING at startsAt — without
 * it, an event the scheduler has already advanced would stop showing as live.
 */
export function isEventLive(event: { status: string; startsAt: string | Date; endsAt: string | Date }): boolean {
  if (event.status !== "PUBLISHED" && event.status !== "REGISTRATION_CLOSED" && event.status !== "ONGOING") {
    return false;
  }
  const now = Date.now();
  return now >= new Date(event.startsAt).getTime() && now <= new Date(event.endsAt).getTime();
}

/** Display-only status: swaps in the synthetic "LIVE" status while the event is happening. */
export function getEventDisplayStatus(event: {
  status: string;
  startsAt: string | Date;
  endsAt: string | Date;
}): string {
  return isEventLive(event) ? "LIVE" : event.status;
}
```

- [ ] **Step 4: Add `formatTimeAgo` to `date.ts`**

Edit `packages/shared-utils/src/date.ts` — add after the existing two functions:

```ts
/** Coarse "N unit ago" for a past timestamp, e.g. "5 minutes ago", "3 hours ago", "2 days ago". */
export function formatTimeAgo(iso: string | Date): string {
  const then = dayjs(iso);
  const minutes = dayjs().diff(then, "minute");
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  const hours = dayjs().diff(then, "hour");
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = dayjs().diff(then, "day");
  return `${days} day${days === 1 ? "" : "s"} ago`;
}
```

- [ ] **Step 5: Run to verify all pass**

```bash
pnpm --filter @repo/shared-utils test
```
Expected: PASS, all files.

- [ ] **Step 6: Typecheck via a consumer**

`@repo/shared-utils` has no `tsconfig.json`/`typecheck` script of its own (same pre-existing situation as `@repo/shared-types` — don't add one, that's scope creep beyond this task). It's type-checked as part of whichever app imports it, which pulls in every file reached through `src/index.ts`'s `export *` chain, including the new `formatTimeAgo`:

```bash
pnpm --filter @repo/backend typecheck
pnpm --filter @repo/frontend typecheck
```
Expected: both clean.

- [ ] **Step 7: Commit**

```bash
git add packages/shared-utils
git commit -m "fix(shared-utils): complete 8-state status maps, fix isEventLive for ONGOING, add formatTimeAgo

STATUS_COLOR/LABELS were missing REGISTRATION_OPEN/ONGOING/ARCHIVED; isEventLive
never counted a scheduler-advanced ONGOING event as live. formatTimeAgo is new,
for the P3 overdue banner."
```

---

### Task 4: Frontend — `EndEventDialog` + `LifecycleActionBar`

**Files:**
- Create: `apps/frontend/src/components/EndEventDialog.tsx`
- Create: `apps/frontend/src/components/LifecycleActionBar.tsx`

**Interfaces:**
- Consumes: `allowedFrom`, `EventStatus` (`@repo/shared-types`, from Task 1); `api`, `ApiRequestError` (`apps/frontend/src/services/api.ts`); `useToastStore` (`apps/frontend/src/store/toastStore.ts`); `TEXTAREA_CLASS` (`apps/frontend/src/pages/events/workspace/fieldStyles.ts`).
- Produces: `EndEventDialog({ eventId: string; onClose: () => void; onConfirmed: () => void })` — self-contained modal that POSTs the transition itself. `LifecycleActionBar({ event: EventDTO; onChanged: () => void })` — renders exactly the legal action buttons for `event.status`. Both consumed by Task 5 (`OverdueBanner`) and Task 7 (`EventWorkspacePage`).

No automated test step (no frontend test runner — see Global Constraints). Gate is typecheck; behavior is verified in Task 10's browser walkthrough.

- [ ] **Step 1: Create `EndEventDialog.tsx`**

```tsx
import { useState, type FormEvent } from "react";
import { EventStatus } from "@repo/shared-types";
import { api, ApiRequestError } from "../services/api";
import { TEXTAREA_CLASS } from "../pages/events/workspace/fieldStyles";

interface EndEventDialogProps {
  eventId: string;
  onClose: () => void;
  onConfirmed: () => void;
}

export function EndEventDialog({ eventId, onClose, onConfirmed }: EndEventDialogProps) {
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await api.post(`/admin/events/${eventId}/transition`, {
        to: EventStatus.COMPLETED,
        ...(reason.trim() ? { reason: reason.trim() } : {}),
      });
      onConfirmed();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.apiError.message : "Failed to end the event.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl bg-white p-6" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-base font-bold text-ink">End Event Now?</h2>
        <p className="mt-1 text-sm text-muted">
          This marks the event as completed immediately, before its scheduled end time.
        </p>

        {error && <p className="mt-3 text-sm font-medium text-status-red">{error}</p>}

        <form onSubmit={onSubmit} className="mt-4 space-y-4">
          <div>
            <label className="mb-1 block text-xs font-semibold text-muted">Reason (optional)</label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className={TEXTAREA_CLASS}
              placeholder="e.g. Speaker had to leave early"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-full border border-line px-5 py-2 text-sm font-medium text-muted transition-colors hover:border-primary hover:text-primary"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="rounded-full bg-primary px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-primary-dark disabled:opacity-60"
            >
              {submitting ? "Ending…" : "End Event"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create `LifecycleActionBar.tsx`**

```tsx
import { useState } from "react";
import { allowedFrom, EventStatus } from "@repo/shared-types";
import type { EventDTO } from "@repo/shared-types";
import { api, ApiRequestError } from "../services/api";
import { useToastStore } from "../store/toastStore";
import { EndEventDialog } from "./EndEventDialog";

const TARGET_LABEL: Partial<Record<EventStatus, string>> = {
  [EventStatus.PUBLISHED]: "Publish",
  [EventStatus.REGISTRATION_OPEN]: "Open Registration",
  [EventStatus.REGISTRATION_CLOSED]: "Close Registration",
  [EventStatus.CANCELLED]: "Cancel",
  [EventStatus.COMPLETED]: "End Event",
  [EventStatus.ARCHIVED]: "Archive",
};

const SUCCESS_MESSAGE: Partial<Record<EventStatus, string>> = {
  [EventStatus.PUBLISHED]: "Event published.",
  [EventStatus.REGISTRATION_OPEN]: "Registration opened.",
  [EventStatus.REGISTRATION_CLOSED]: "Registration closed.",
  [EventStatus.CANCELLED]: "Event cancelled.",
  [EventStatus.ARCHIVED]: "Event archived.",
};

// Cancel and Archive are irreversible with no dedicated confirm-modal pattern in this
// codebase (Delete fires immediately with none at all) — a plain window.confirm() is
// the lightest guard that's still better than firing on the first click. End Event
// (-> COMPLETED) always opens the fuller EndEventDialog instead, since it has an
// optional reason field worth a proper modal.
const CONFIRM_TARGETS: EventStatus[] = [EventStatus.CANCELLED, EventStatus.ARCHIVED];

export function LifecycleActionBar({ event, onChanged }: { event: EventDTO; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  const [endEventOpen, setEndEventOpen] = useState(false);
  const showToast = useToastStore((s) => s.show);

  async function fire(to: EventStatus) {
    setBusy(true);
    try {
      await api.post(`/admin/events/${event.id}/transition`, { to });
      showToast(SUCCESS_MESSAGE[to] ?? "Event updated.");
      onChanged();
    } catch (err) {
      if (err instanceof ApiRequestError && err.status === 409) {
        const now = (err.apiError.details as { from?: string } | undefined)?.from;
        showToast(`This event already moved to ${now ?? "a different status"} — refreshed.`, "error");
        onChanged();
      } else {
        showToast(err instanceof ApiRequestError ? err.apiError.message : "Failed to update event status.", "error");
      }
    } finally {
      setBusy(false);
    }
  }

  function onClickTarget(to: EventStatus) {
    if (to === EventStatus.COMPLETED) {
      setEndEventOpen(true);
      return;
    }
    if (CONFIRM_TARGETS.includes(to) && !window.confirm(`${TARGET_LABEL[to]} this event?`)) return;
    fire(to);
  }

  // allowedFrom is the same table transitionEvent() enforces server-side — COMPLETED
  // only ever appears here when event.status is ONGOING, since that's the only state
  // with COMPLETED as a legal target. No extra "only from ONGOING" guard needed.
  const targets = allowedFrom(event.status);

  return (
    <>
      <div className="flex flex-wrap gap-2">
        {targets.map((to) => (
          <button
            key={to}
            onClick={() => onClickTarget(to)}
            disabled={busy}
            className="flex h-9 items-center gap-1.5 rounded-lg border border-white/30 bg-white/10 px-3 text-sm font-medium text-white transition-colors hover:bg-white/20 disabled:opacity-50"
          >
            {TARGET_LABEL[to] ?? to}
          </button>
        ))}
      </div>
      {endEventOpen && (
        <EndEventDialog
          eventId={event.id}
          onClose={() => setEndEventOpen(false)}
          onConfirmed={() => {
            setEndEventOpen(false);
            showToast("Event ended.");
            onChanged();
          }}
        />
      )}
    </>
  );
}
```

- [ ] **Step 3: Typecheck**

```bash
pnpm --filter @repo/frontend typecheck
```
Expected: clean (both files are new and self-contained; nothing imports them yet).

- [ ] **Step 4: Commit**

```bash
git add apps/frontend/src/components/EndEventDialog.tsx apps/frontend/src/components/LifecycleActionBar.tsx
git commit -m "feat(admin-fe): add EndEventDialog + LifecycleActionBar

Semantic, pre-gated lifecycle action buttons (allowedFrom-driven) to replace
the raw status <select>, plus the End Event confirm dialog they share with
the overdue banner."
```

---

### Task 5: Frontend — `OverdueBanner`

**Files:**
- Create: `apps/frontend/src/components/OverdueBanner.tsx`

**Interfaces:**
- Consumes: `formatTimeAgo` (`@repo/shared-utils`, from Task 3); `EndEventDialog` (from Task 4); `useToastStore`.
- Produces: `OverdueBanner({ event: EventDTO; onChanged: () => void })` — renders `null` unless `event.isOverdue`. Consumed by Task 7 (`EventWorkspacePage`).

- [ ] **Step 1: Create `OverdueBanner.tsx`**

```tsx
import { useState } from "react";
import { formatTimeAgo } from "@repo/shared-utils";
import type { EventDTO } from "@repo/shared-types";
import { useToastStore } from "../store/toastStore";
import { EndEventDialog } from "./EndEventDialog";

export function OverdueBanner({ event, onChanged }: { event: EventDTO; onChanged: () => void }) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const showToast = useToastStore((s) => s.show);

  if (!event.isOverdue) return null;

  return (
    <>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-status-orange/30 bg-amber-50 px-5 py-3 text-sm">
        <p className="font-medium text-status-orange">
          Ended {formatTimeAgo(event.endsAt)} — will auto-complete shortly.
        </p>
        <button
          onClick={() => setDialogOpen(true)}
          className="rounded-full border border-status-orange/40 px-3 py-1.5 text-xs font-semibold text-status-orange transition-colors hover:bg-status-orange/10"
        >
          End Event Now
        </button>
      </div>
      {dialogOpen && (
        <EndEventDialog
          eventId={event.id}
          onClose={() => setDialogOpen(false)}
          onConfirmed={() => {
            setDialogOpen(false);
            showToast("Event ended.");
            onChanged();
          }}
        />
      )}
    </>
  );
}
```

- [ ] **Step 2: Typecheck**

```bash
pnpm --filter @repo/frontend typecheck
```
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add apps/frontend/src/components/OverdueBanner.tsx
git commit -m "feat(admin-fe): add OverdueBanner

Shows 'Ended N ago — will auto-complete shortly' with an inline End Event
Now shortcut when event.isOverdue."
```

---

### Task 6: Frontend — `HistoryTab`

**Files:**
- Create: `apps/frontend/src/pages/events/workspace/HistoryTab.tsx`

**Interfaces:**
- Consumes: `GET /admin/events/:id/history` (from Task 2); `StatusBadge` (`apps/frontend/src/components/StatusBadge.tsx`); `api`, `ApiRequestError`.
- Produces: `HistoryTab({ eventId: string })`. Consumed by Task 7 (`EventWorkspacePage`'s tab switch).

- [ ] **Step 1: Create `HistoryTab.tsx`**

```tsx
import { useEffect, useState } from "react";
import dayjs from "dayjs";
import type { EventStatusHistoryDTO } from "@repo/shared-types";
import { api, ApiRequestError } from "../../../services/api";
import { StatusBadge } from "../../../components/StatusBadge";

export function HistoryTab({ eventId }: { eventId: string }) {
  const [history, setHistory] = useState<EventStatusHistoryDTO[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<EventStatusHistoryDTO[]>(`/admin/events/${eventId}/history`)
      .then(setHistory)
      .catch((err) => {
        setError(err instanceof ApiRequestError ? err.apiError.message : "Failed to load status history.");
      });
  }, [eventId]);

  if (error) return <p className="text-sm font-medium text-status-red">{error}</p>;
  if (!history) return <p className="text-sm text-muted">Loading history…</p>;

  return (
    <div className="rounded-2xl border border-line bg-white p-5">
      <p className="text-sm font-semibold text-ink">Status History</p>
      {history.length === 0 ? (
        <p className="mt-3 text-sm text-muted">No status changes yet.</p>
      ) : (
        <div className="mt-3 divide-y divide-line">
          {history.map((h) => (
            <div key={h.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
              <div className="flex items-center gap-2">
                {h.fromStatus && <StatusBadge status={h.fromStatus} />}
                {h.fromStatus && <span className="text-xs text-muted">→</span>}
                <StatusBadge status={h.toStatus} />
                <span className="text-xs text-muted">{h.actorType === "ADMIN" ? "by admin" : "by system"}</span>
              </div>
              <div className="text-right">
                <p className="text-xs text-muted">{dayjs(h.createdAt).format("D MMM YYYY · HH:mm")}</p>
                {h.reason && <p className="mt-0.5 text-xs text-ink/70">&ldquo;{h.reason}&rdquo;</p>}
                {(h.sideEffectsStatus === "PENDING" || h.sideEffectsStatus === "FAILED") && (
                  <p className="mt-0.5 text-xs text-status-orange">
                    side effects: {h.sideEffectsStatus.toLowerCase()}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

```bash
pnpm --filter @repo/frontend typecheck
```
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add apps/frontend/src/pages/events/workspace/HistoryTab.tsx
git commit -m "feat(admin-fe): add HistoryTab

Renders the event's EventStatusHistory audit trail, newest first, mirroring
FeedbackTab's Recent Comments card idiom."
```

---

### Task 7: Frontend — wire it all into `EventWorkspacePage`

**Files:**
- Modify: `apps/frontend/src/pages/events/EventWorkspacePage.tsx`

**Interfaces:**
- Consumes: `LifecycleActionBar` (Task 4), `OverdueBanner` (Task 5), `HistoryTab` (Task 6).
- Produces: the hero no longer renders a raw `<select>`; a `"history"` tab exists.

- [ ] **Step 1: Replace the full file contents**

Replace `apps/frontend/src/pages/events/EventWorkspacePage.tsx` in full:

```tsx
import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import dayjs from "dayjs";
import type { EventDTO } from "@repo/shared-types";
import { getEventDisplayStatus, isEventLive, statusLabel } from "@repo/shared-utils";
import { api, ApiRequestError } from "../../services/api";
import {
  AwardIcon,
  BellIcon,
  CalendarIcon,
  CheckCircleIcon,
  ChevronDownIcon,
  ClockIcon,
  EditIcon,
  EyeIcon,
  FileIcon,
  GridIcon,
  HeartIcon,
  MapPinIcon,
  MessageSquareIcon,
  MoreVerticalIcon,
  SettingsIcon,
  StarIcon,
  UsersIcon,
} from "../../components/icons";
import { LifecycleActionBar } from "../../components/LifecycleActionBar";
import { OverdueBanner } from "../../components/OverdueBanner";
import { OverviewTab } from "./workspace/OverviewTab";
import { ParticipantsTab } from "./workspace/ParticipantsTab";
import { ShortlistTab } from "./workspace/ShortlistTab";
import { AttendanceTab } from "./workspace/AttendanceTab";
import { SpeedDatingTab } from "./workspace/SpeedDatingTab";
import { CertificatesTab } from "./workspace/CertificatesTab";
import { FeedbackTab } from "./workspace/FeedbackTab";
import { RemindersTab } from "./workspace/RemindersTab";
import { EventContentTab } from "./workspace/EventContentTab";
import { SettingsTab } from "./workspace/SettingsTab";
import { HistoryTab } from "./workspace/HistoryTab";

const PORTAL_BASE = import.meta.env.VITE_PORTAL_BASE_URL ?? "http://localhost:5173";

const TABS = [
  { key: "overview", label: "Overview", icon: GridIcon },
  { key: "participants", label: "Participants", icon: UsersIcon },
  { key: "shortlist", label: "Shortlist", icon: StarIcon },
  { key: "attendance", label: "Attendance", icon: CheckCircleIcon },
  { key: "speed-dating", label: "Speed Dating", icon: HeartIcon },
  { key: "certificates", label: "Certificates", icon: AwardIcon },
  { key: "feedback", label: "Feedback", icon: MessageSquareIcon },
  { key: "reminders", label: "Reminders", icon: BellIcon },
  { key: "content", label: "Event Content", icon: FileIcon },
  { key: "settings", label: "Settings", icon: SettingsIcon },
  { key: "history", label: "History", icon: ClockIcon },
] as const;
type TabKey = (typeof TABS)[number]["key"];

function MoreMenu({ event, onDelete }: { event: EventDTO; onDelete: () => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  if (event.status !== "DRAFT") return null;

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex h-9 items-center gap-1.5 rounded-lg border border-white/30 bg-white/10 px-3 text-sm font-medium text-white transition-colors hover:bg-white/20"
      >
        <MoreVerticalIcon width={16} height={16} />
        More
        <ChevronDownIcon width={14} height={14} />
      </button>
      {open && (
        <div className="absolute right-0 top-[calc(100%+6px)] z-40 w-48 overflow-hidden rounded-xl border border-line bg-white py-1 text-left shadow-soft">
          <button
            onClick={() => {
              setOpen(false);
              onDelete();
            }}
            className="block w-full px-4 py-2 text-sm font-medium text-status-red hover:bg-surface"
          >
            Delete
          </button>
        </div>
      )}
    </div>
  );
}

export function EventWorkspacePage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [event, setEvent] = useState<EventDTO | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const tabParam = searchParams.get("tab") as TabKey | null;
  const tab: TabKey = tabParam && TABS.some((t) => t.key === tabParam) ? tabParam : "overview";

  const reload = () => {
    if (!id) return;
    api
      .get<EventDTO>(`/admin/events/${id}`)
      .then(setEvent)
      .catch((err) => {
        setError(err instanceof ApiRequestError ? err.apiError.message : "Failed to load event.");
      });
  };

  useEffect(reload, [id]);

  function setTab(next: TabKey) {
    setSearchParams(next === "overview" ? {} : { tab: next });
  }

  async function onDelete() {
    if (!event) return;
    setActionError(null);
    try {
      await api.delete(`/admin/events/${event.id}`);
      navigate("/events", { replace: true });
    } catch (err) {
      setActionError(err instanceof ApiRequestError ? err.apiError.message : "Failed to delete event.");
    }
  }

  if (!id) return null;
  if (error) return <p className="text-sm font-medium text-status-red">{error}</p>;
  if (!event) return <p className="text-sm text-muted">Loading event workspace…</p>;

  const visibleTabs = TABS.filter((t) => t.key !== "speed-dating" || event.hasSpeedDating);
  const speaker = event.speakers.find((s) => s.featured) ?? event.speakers[0];

  return (
    <div>
      <button onClick={() => navigate("/events")} className="text-xs font-semibold text-muted hover:text-ink">
        ← Back to Event Management
      </button>

      {actionError && <p className="mt-3 text-sm font-medium text-status-red">{actionError}</p>}

      {/* Hero banner */}
      <div
        className="relative mt-3 overflow-hidden rounded-2xl bg-gradient-to-br from-[#0B3D91] to-[#1E63D0] p-8 text-white"
        style={
          event.bannerUrl
            ? {
                backgroundImage: `linear-gradient(to bottom right, rgba(11,61,145,0.88), rgba(30,99,208,0.88)), url(${event.bannerUrl})`,
                backgroundSize: "cover",
                backgroundPosition: "center",
              }
            : undefined
        }
      >
        <div className="pointer-events-none absolute -right-10 -top-16 h-56 w-56 rounded-full bg-white/10 blur-2xl" />
        <div className="pointer-events-none absolute -bottom-16 right-24 h-40 w-40 rounded-full bg-purple-300/20 blur-2xl" />

        <div className="relative flex flex-wrap items-start justify-between gap-6">
          <div className="max-w-xl">
            <div className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-xs font-semibold">
              <span
                className={`h-1.5 w-1.5 shrink-0 rounded-full ${isEventLive(event) ? "bg-status-red" : "bg-status-green"}`}
              />
              {statusLabel(getEventDisplayStatus(event))}
            </div>

            <div className="mt-2.5">
              <LifecycleActionBar event={event} onChanged={reload} />
            </div>

            <h1 className="mt-3 text-2xl font-extrabold leading-tight sm:text-3xl">{event.title}</h1>
            {event.subtitle && <p className="mt-1.5 text-sm text-white/80">{event.subtitle}</p>}

            <div className="mt-4 flex flex-wrap items-center gap-4 text-sm text-white/90">
              <span className="flex items-center gap-1.5">
                <CalendarIcon width={16} height={16} />
                {dayjs(event.startsAt).format("D MMMM YYYY (dddd)")}
              </span>
              <span className="flex items-center gap-1.5">
                <ClockIcon width={16} height={16} />
                {dayjs(event.startsAt).format("hh.mm A")} - {dayjs(event.endsAt).format("hh.mm A")} WIB
              </span>
              {event.location && (
                <span className="flex items-center gap-1.5">
                  <MapPinIcon width={16} height={16} />
                  {event.location}
                </span>
              )}
            </div>

            {(event.category || event.tags.length > 0) && (
              <div className="mt-3 flex flex-wrap gap-2">
                {event.category && (
                  <span className="rounded-full bg-white/15 px-3 py-1 text-xs font-semibold">{event.category}</span>
                )}
                {event.tags
                  .filter((t) => t !== event.category)
                  .map((t) => (
                    <span key={t} className="rounded-full bg-white/15 px-3 py-1 text-xs font-semibold">
                      {t}
                    </span>
                  ))}
              </div>
            )}
          </div>

          <div className="flex flex-col items-end gap-4">
            <div className="flex gap-2">
              <button
                onClick={() => setTab("overview")}
                className="flex h-9 items-center gap-1.5 rounded-lg bg-white px-3 text-sm font-semibold text-primary transition-colors hover:bg-white/90"
              >
                <EditIcon width={15} height={15} />
                Edit Event
              </button>
              <a
                href={`${PORTAL_BASE}/events/${event.slug}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex h-9 items-center gap-1.5 rounded-lg border border-white/30 bg-white/10 px-3 text-sm font-medium text-white transition-colors hover:bg-white/20"
              >
                <EyeIcon width={15} height={15} />
                Preview Event
              </a>
              <MoreMenu event={event} onDelete={onDelete} />
            </div>

            {speaker && (
              <div className="flex items-end gap-3 text-right">
                <div className="max-w-[200px]">
                  <p className="text-xs text-white/60">Speaker:</p>
                  <p className="font-semibold text-blue-200">{speaker.name}</p>
                  {(speaker.title || speaker.company) && (
                    <p className="mt-0.5 text-xs leading-snug text-white/70">
                      {speaker.title}
                      {speaker.title && speaker.company ? ", " : ""}
                      {speaker.company}
                    </p>
                  )}
                </div>
                {speaker.avatarUrl ? (
                  <img
                    src={speaker.avatarUrl}
                    alt={speaker.name}
                    className="h-20 w-20 shrink-0 rounded-2xl border border-white/20 object-cover"
                  />
                ) : (
                  <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-2xl bg-white/10 text-2xl font-bold text-white">
                    {speaker.name.charAt(0).toUpperCase()}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      <OverdueBanner event={event} onChanged={reload} />

      {/* Tabs */}
      <div className="mt-5 flex gap-1 overflow-x-auto border-b border-line">
        {visibleTabs.map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex items-center gap-1.5 whitespace-nowrap border-b-2 px-4 py-2.5 text-sm transition-colors ${
                tab === t.key
                  ? "border-primary font-semibold text-primary"
                  : "border-transparent font-medium text-muted hover:text-ink"
              }`}
            >
              <Icon width={16} height={16} />
              {t.label}
            </button>
          );
        })}
      </div>

      <div className="mt-6">
        {tab === "overview" && <OverviewTab event={event} onSaved={reload} />}
        {tab === "participants" && <ParticipantsTab eventId={event.id} />}
        {tab === "shortlist" && <ShortlistTab eventId={event.id} />}
        {tab === "attendance" && <AttendanceTab event={event} onChanged={reload} />}
        {tab === "speed-dating" && <SpeedDatingTab eventId={event.id} />}
        {tab === "certificates" && <CertificatesTab event={event} />}
        {tab === "feedback" && <FeedbackTab eventId={event.id} />}
        {tab === "reminders" && <RemindersTab eventId={event.id} />}
        {tab === "content" && <EventContentTab event={event} onSaved={reload} />}
        {tab === "settings" && <SettingsTab event={event} onSaved={reload} />}
        {tab === "history" && <HistoryTab eventId={event.id} />}
      </div>
    </div>
  );
}
```

(Note: `AttendanceTab`'s prop is `onChanged` per the original file — unchanged from before; every other prop wiring is identical to the pre-P3 file except the removed status `<select>`/`onChangeStatus`/`changingStatus`/`STATUS_OPTIONS`/`EventStatus` import and the additions called out above.)

- [ ] **Step 2: Typecheck**

```bash
pnpm --filter @repo/frontend typecheck
```
Expected: clean — this is the step that would catch a prop-name mismatch (e.g. `AttendanceTab`'s actual prop name) against the real component signatures.

- [ ] **Step 3: Commit**

```bash
git add apps/frontend/src/pages/events/EventWorkspacePage.tsx
git commit -m "feat(admin-fe): wire LifecycleActionBar/OverdueBanner/HistoryTab into Event Workspace

Removes the raw 8-option status <select> — the hero now shows a plain status
pill plus only the buttons legal from the event's current state."
```

---

### Task 8: Frontend — fold the registration toggle into `LifecycleActionBar`

**Files:**
- Modify: `apps/frontend/src/pages/events/workspace/SettingsTab.tsx`

**Interfaces:**
- Consumes: nothing new (this task only removes code now made redundant by Task 7's `LifecycleActionBar`, which already renders "Open Registration"/"Close Registration" buttons whenever they're legal).

- [ ] **Step 1: Replace the full file contents**

Replace `apps/frontend/src/pages/events/workspace/SettingsTab.tsx` in full — removes the "Registration" card, `onToggleRegistration`, `canToggleRegistration`, and `togglingRegistration` state (now redundant with `LifecycleActionBar`'s Open/Close Registration buttons in the hero):

```tsx
import { useState } from "react";
import type { AdminEventInput, EventDisplayConfig, EventDTO } from "@repo/shared-types";
import { api, ApiRequestError } from "../../../services/api";
import { useToastStore } from "../../../store/toastStore";
import { FIELD_CLASS } from "./fieldStyles";

const DISPLAY_TOGGLES: { key: keyof EventDisplayConfig; label: string }[] = [
  { key: "pastEvent", label: "Display as Past Event" },
  { key: "speaker", label: "Display Speaker" },
  { key: "gallery", label: "Display Gallery" },
  { key: "keyTakeaways", label: "Display Key Takeaways" },
  { key: "recording", label: "Display Recording" },
  { key: "certificate", label: "Display Certificate" },
];

export function SettingsTab({ event, onSaved }: { event: EventDTO; onSaved: () => void }) {
  const [capacity, setCapacity] = useState(String(event.capacity));
  const [waitingListEnabled, setWaitingListEnabled] = useState(event.waitingListEnabled);
  const [shortlistRequired, setShortlistRequired] = useState(!event.showRemainingSeats);
  const [enableCertificate, setEnableCertificate] = useState(event.enableCertificate);
  const [enableFeedback, setEnableFeedback] = useState(event.enableFeedback);
  const [displayConfig, setDisplayConfig] = useState<EventDisplayConfig>(event.displayConfig);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const showToast = useToastStore((s) => s.show);

  function toggleDisplay(key: keyof EventDisplayConfig, value: boolean) {
    setDisplayConfig((prev) => ({ ...prev, [key]: value }));
  }

  async function onSave() {
    setError(null);
    setSaving(true);
    try {
      const payload: Partial<AdminEventInput> = {
        capacity: Number(capacity) || 0,
        waitingListEnabled,
        showRemainingSeats: !shortlistRequired,
        enableCertificate,
        enableFeedback,
        displayConfig,
      };
      await api.patch<EventDTO>(`/admin/events/${event.id}`, payload);
      showToast("Settings saved successfully.");
      onSaved();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.apiError.message : "Failed to save settings.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-line bg-white p-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-semibold text-muted">Capacity</label>
            <input
              type="number"
              min={0}
              value={capacity}
              onChange={(e) => setCapacity(e.target.value)}
              className={FIELD_CLASS}
            />
          </div>
        </div>

        <div className="mt-4 space-y-2">
          <label className="flex items-center gap-2 text-sm text-ink">
            <input type="checkbox" checked={waitingListEnabled} onChange={(e) => setWaitingListEnabled(e.target.checked)} />
            Waitlist enabled
          </label>
          <label className="flex items-center gap-2 text-sm text-ink">
            <input type="checkbox" checked={shortlistRequired} onChange={(e) => setShortlistRequired(e.target.checked)} />
            Shortlist required (hides remaining-seats counter, every registrant waits for review)
          </label>
          <label className="flex items-center gap-2 text-sm text-ink">
            <input type="checkbox" checked={enableCertificate} onChange={(e) => setEnableCertificate(e.target.checked)} />
            Certificate enabled
          </label>
          <label className="flex items-center gap-2 text-sm text-ink">
            <input type="checkbox" checked={enableFeedback} onChange={(e) => setEnableFeedback(e.target.checked)} />
            Feedback enabled (required before certificate download)
          </label>
        </div>
      </div>

      <div className="rounded-2xl border border-line bg-white p-5">
        <p className="text-sm font-semibold text-ink">Display in Past Events</p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {DISPLAY_TOGGLES.map((t) => (
            <label key={t.key} className="flex items-center gap-2 text-sm text-ink">
              <input
                type="checkbox"
                checked={displayConfig[t.key]}
                onChange={(e) => toggleDisplay(t.key, e.target.checked)}
              />
              {t.label}
            </label>
          ))}
        </div>
      </div>

      {error && <p className="text-sm font-medium text-status-red">{error}</p>}

      <button
        onClick={onSave}
        disabled={saving}
        className="rounded-full bg-primary px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-primary-dark disabled:opacity-60"
      >
        {saving ? "Saving…" : "Save"}
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

```bash
pnpm --filter @repo/frontend typecheck
```
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add apps/frontend/src/pages/events/workspace/SettingsTab.tsx
git commit -m "refactor(admin-fe): remove SettingsTab's duplicated registration toggle

Open/Close Registration now live only in LifecycleActionBar (hero), which
already reads the same allowedFrom table instead of a hand-maintained check."
```

---

### Task 9: Frontend — fix `EventsListPage`'s stale filter pills

**Files:**
- Modify: `apps/frontend/src/pages/events/EventsListPage.tsx`

**Interfaces:**
- Consumes: nothing new. `ONGOING` is now a real, scheduler-maintained status (P2), so the old timestamp-window synthetic check for "ongoing" is replaced by a direct status match; "upcoming" remains a synthetic grouping (any of `PUBLISHED`/`REGISTRATION_OPEN`/`REGISTRATION_CLOSED` — scheduled but not yet started).

- [ ] **Step 1: Replace the filter types, titles, pills, and matcher**

Edit `apps/frontend/src/pages/events/EventsListPage.tsx` — replace lines 10-45 (the `StatusFilter` type through `matchesFilter`):

```ts
type StatusFilter =
  | "DRAFT"
  | "PUBLISHED"
  | "REGISTRATION_OPEN"
  | "REGISTRATION_CLOSED"
  | "ONGOING"
  | "COMPLETED"
  | "CANCELLED"
  | "ARCHIVED"
  | "upcoming";

const FILTER_TITLES: Record<StatusFilter, string> = {
  DRAFT: "Draft Events",
  PUBLISHED: "Published Events",
  REGISTRATION_OPEN: "Registration Open",
  REGISTRATION_CLOSED: "Registration Closed",
  ONGOING: "Ongoing Events",
  COMPLETED: "Completed Events",
  CANCELLED: "Cancelled Events",
  ARCHIVED: "Archived Events",
  upcoming: "Upcoming Events",
};

const STATUS_PILLS: { value: StatusFilter | null; label: string }[] = [
  { value: null, label: "All" },
  { value: "DRAFT", label: "Draft" },
  { value: "upcoming", label: "Upcoming" },
  { value: "ONGOING", label: "Ongoing" },
  { value: "COMPLETED", label: "Completed" },
  { value: "CANCELLED", label: "Cancelled" },
  { value: "ARCHIVED", label: "Archived" },
];

function matchesFilter(e: EventDTO, filter: StatusFilter | null): boolean {
  if (!filter) return true;
  if (filter === "upcoming") {
    return e.status === "PUBLISHED" || e.status === "REGISTRATION_OPEN" || e.status === "REGISTRATION_CLOSED";
  }
  return e.status === filter;
}
```

The `dayjs` import (line 3) stays — it's still used later in the file for `dayjs(e.startsAt).format(...)` in the table row.

- [ ] **Step 2: Typecheck**

```bash
pnpm --filter @repo/frontend typecheck
```
Expected: clean. (If `dayjs` shows as unused, it isn't — double check the table row at the bottom of the file still calls `dayjs(e.startsAt).format("D MMM YYYY")`.)

- [ ] **Step 3: Commit**

```bash
git add apps/frontend/src/pages/events/EventsListPage.tsx
git commit -m "fix(admin-fe): update event list filter pills to the real 8-state model

REGISTRATION_OPEN/ONGOING/ARCHIVED events previously fell out of every pill
except All; Ongoing was a timestamp-window guess instead of the real
scheduler-maintained status; the old 'Archived' pill actually filtered on
CANCELLED."
```

---

### Task 10: Final verification

**Files:** none (verification only).

- [ ] **Step 1: Full regression + typechecks**

```bash
pnpm --filter @repo/backend test
pnpm --filter @repo/shared-types test
pnpm --filter @repo/shared-utils test
pnpm --filter @repo/backend typecheck
pnpm --filter @repo/frontend typecheck
```
Expected: all green. (`@repo/shared-types` and `@repo/shared-utils` have no `typecheck` script of their own — they're covered transitively by the two typecheck commands above, per Tasks 1 and 3.)

- [ ] **Step 2: Start the backend + admin frontend dev servers**

Use whatever this environment's standing dev-server mechanism is (per project memory: `.claude/launch.json` configs / `scripts/dev-bliblitalk-admin-*.cmd`) to get the backend on :4001 and the admin frontend on :5184 (or whatever ports `.claude/launch.json` currently defines — check it, since it's been modified recently per this session's git status).

- [ ] **Step 3: Manual browser walkthrough — full DRAFT → Publish → Open Registration → Close Registration → End Event flow**

In the browser preview, open an existing DRAFT test event's workspace (or create one):
1. Confirm the hero shows a plain status pill (no dropdown) reading "Draft" and a **Publish** button (no other lifecycle buttons — DRAFT's only legal manual targets are `PUBLISHED`/`CANCELLED`, and Cancel isn't rendered as a separate button from `TARGET_LABEL`... actually it is: confirm both **Publish** and **Cancel** appear).
2. Click **Publish** → confirm the pill updates to "Upcoming", the button set changes to **Open Registration** + **Cancel**, and a toast reads "Event published."
3. Click **Open Registration** → confirm the pill/buttons update to **Close Registration** + **Cancel**, toast reads "Registration opened."
4. Click **Close Registration** → confirm buttons become **Open Registration** (reopen) + **Cancel**, toast reads "Registration closed."
5. Open the **History** tab → confirm 3 rows appear, newest first, each showing the correct `from → to` badges and "by admin".
6. Manually set the event's `startsAt`/`endsAt` in the DB to a past window and its `isOverdue` flag to `true` (or wait for a real overdue event if one exists in seed data) → reload the workspace → confirm the `OverdueBanner` renders below the hero with correct "Ended N ago" text and an **End Event Now** button.
7. Click **End Event Now** → fill an optional reason → confirm → confirm the dialog closes, a toast reads "Event ended.", the pill shows "Completed", and the History tab now shows the `ONGOING → COMPLETED` row with the reason text.
8. Click **Archive** → confirm the `window.confirm()` guard appears; confirming it → pill shows "Archived", no lifecycle buttons remain (ARCHIVED has no legal targets).
9. Go to the Events list page → confirm the new "Ongoing"/"Archived" pills exist and filter correctly, and the old mislabeled "Archived → CANCELLED" pill is gone.
10. Take a screenshot of the hero mid-flow (step 3 or 4) and of the History tab as proof.

- [ ] **Step 4: Report**

Summarize what was verified (or any deviation found and fixed) — this is the last step before treating P3 as complete and moving to `superpowers:finishing-a-development-branch`.
