# P3 — Admin FE Lifecycle UI — Design Spec

## Goal

P1 and P2 (merged to `main`) built a server-side 8-state event lifecycle engine: `transitionEvent()` as the sole writer of `event.status`, a validated transition table, an `EventStatusHistory` audit trail, and a 60-second scheduler driving every time-based boundary. None of this is visible or actionable from the admin frontend yet — the Event Workspace page still shows a raw `<select>` offering all 8 statuses (relying entirely on the backend to reject illegal ones), has no view of the audit history, and has no signal when an event is overdue. P3 closes that gap: every lifecycle action in the admin FE becomes a semantic, pre-gated button backed by the same transition table the backend enforces, an admin can see an event's full status history, and an overdue event surfaces a visible banner with a one-click way to resolve it.

**Exit criterion (from the roadmap):** admin cannot trigger an invalid transition from the UI — every action button is only rendered when legal from the event's current status.

## Context: what research found

- The Event Workspace hero (`apps/frontend/src/pages/events/EventWorkspacePage.tsx`) has a status `<select>` populated with `Object.values(EventStatus)` (all 8, always), calling the manual-override endpoint `PATCH /:id/status`. No pre-validation; the UI just displays the backend's error message string on a 409, without reading the structured `{from, to, allowed}` detail the backend already returns.
- The registration open/close toggle (`apps/frontend/src/pages/events/workspace/SettingsTab.tsx`) hand-rolls its own legality check (`event.status === "PUBLISHED" || "REGISTRATION_OPEN" || "REGISTRATION_CLOSED"`) — a manually-maintained duplicate of the backend's transition table, already drifted once before (P1's history shows this exact class of bug).
- No frontend code calls `POST /:id/publish`, `POST /:id/cancel`, or `POST /:id/transition` at all today — those exist on the backend but are entirely unused by the UI.
- `EventStatusHistory` has no backend GET route and is completely unread by the frontend.
- `isOverdue`, `nextAutoTransition`, and `statusChangedAt` exist on `EventDTO` (imported live from `@repo/shared-types`, no frontend type duplication) but are rendered nowhere.
- `packages/shared-utils/src/statusColor.ts`'s `STATUS_COLOR`/`LABELS` maps predate the 8-state engine — `REGISTRATION_OPEN`, `ONGOING`, `CANCELLED`, `ARCHIVED` all fall through to unstyled defaults. Its `isEventLive`/`getEventDisplayStatus` functions only special-case `PUBLISHED`/`REGISTRATION_CLOSED`.
- `apps/frontend/src/pages/events/EventsListPage.tsx`'s status filter pills (`StatusFilter`, `matchesFilter`) are similarly stale — an event in `REGISTRATION_OPEN` or `ONGOING` falls out of both the "Upcoming" and "Ongoing" pills (still visible under "All").
- No `Timeline`/`Alert`/`Banner` component exists anywhere in the admin FE. The closest structural analogues: `FeedbackTab.tsx`'s "Recent Comments" card (`rounded-2xl border border-line bg-white p-5` wrapping `divide-y divide-line` rows, each showing actor + relative timestamp) and `RemindersTab.tsx`'s status-tagged table rows. `StatusBadge.tsx` is the existing reusable status-pill primitive. There's no dedicated design-system package — "Blu" is Tailwind tokens in `apps/frontend/tailwind.config.ts`, and `apps/frontend/src/components/` is a flat, unenforced convention folder.

## Decisions

1. **Shared transition table.** `apps/backend/src/lib/lifecycle/transitions.ts` (`ALLOWED_TRANSITIONS`, `allowedFrom`, `canTransition` — pure, only depends on `EventStatus`) moves to `packages/shared-types/src/lifecycle.ts`. The backend file is deleted; every backend import switches to `@repo/shared-types`. One definition, two consumers: the backend keeps enforcing it (correctness), the frontend imports the same table to decide which buttons to render (UX) — no independently-maintained copy on either side.
2. **Status control replaced by semantic action buttons.** The raw dropdown is removed. A new `LifecycleActionBar` renders only the buttons legal from `event.status` (via `allowedFrom`), each firing `POST /:id/transition` with a fixed target: **Publish**, **Open Registration**, **Close Registration**, **Cancel**, **End Event**, **Archive**. No free-form "set to any status" control remains in the UI.
3. **End Event flow.** Manually completes an `ONGOING` event early. Clicking it opens a confirm dialog (`EndEventDialog`) with an optional free-text reason field; confirming calls `POST /:id/transition {to: COMPLETED, reason}`. The reason (if given) is stored on the `EventStatusHistory` row and visible in the History tab.
4. **Overdue banner.** Renders in the Event Workspace hero only, when `event.isOverdue`. Text: "Ended {relative time} ago — will auto-complete shortly." Includes an inline **End Event Now** button that opens the same `EndEventDialog` used by the action bar.
5. **History tab.** A new tab in the Event Workspace (alongside the existing 10), fetching a new `GET /:id/history` endpoint, rendered as a card of newest-first rows (mirroring `FeedbackTab`'s Recent Comments idiom): `fromStatus → toStatus` with a `StatusBadge` per status, actor (admin name or "System"), reason (if present), and timestamp.
6. **Stale status-color/filter fixes included in P3.** `statusColor.ts`'s `STATUS_COLOR`/`LABELS` gain the 4 missing states (this is a hard prerequisite — the new action bar and history rows need to render badges for every state correctly). `EventsListPage.tsx`'s filter pills are updated to recognize the full 8-state model in the same pass, since it's the same root cause and file family.

## Architecture

**Backend:**
- `packages/shared-types/src/lifecycle.ts` (new) — `ALLOWED_TRANSITIONS`, `allowedFrom`, `canTransition`, moved verbatim from the backend.
- `apps/backend/src/lib/lifecycle/transitions.ts` — deleted; `transitions.test.ts` moves to `packages/shared-types` alongside the relocated source (or stays a backend-side import test — decided at plan time based on this repo's existing test-colocation convention).
- `apps/backend/src/lib/lifecycle/transitionEvent.ts`, `apps/backend/src/routes/admin/adminEvents.service.ts`, and any other backend consumer: import `allowedFrom`/`canTransition` from `@repo/shared-types` instead of the local file.
- New: `GET /api/admin/events/:id/history` in `adminEvents.routes.ts` + a `listEventHistory(eventId)` service function in `adminEvents.service.ts`, gated by the same `requireEventAccess("id")` middleware already used by sibling event-scoped reads. Returns `EventStatusHistoryDTO[]` (schema already exists in `shared-types`), ordered `createdAt desc`.

**Frontend — new/changed components:**
- `apps/frontend/src/components/LifecycleActionBar.tsx` (new) — takes `event: EventDTO` + a transition-dispatch callback; computes `allowedFrom(event.status)`, maps each legal target to its semantic button (a fixed target→label map: `PUBLISHED→"Publish"`, `REGISTRATION_OPEN→"Open Registration"`, `REGISTRATION_CLOSED→"Close Registration"`, `CANCELLED→"Cancel"`, `COMPLETED→"End Event"` (only when the *current* status is `ONGOING` — completion from other states is scheduler/system-only in practice, so this button only ever appears for the manual early-end case), `ARCHIVED→"Archive"`). Cancel and Archive get a lightweight `window.confirm()`-style guard before firing (this codebase has no existing confirm-modal pattern to reuse — today's Delete action fires immediately with no confirmation at all, which this spec does not change or attempt to retrofit); Complete (End Event) opens the fuller `EndEventDialog`, since it's the one action with an optional reason field worth a proper modal.
- `apps/frontend/src/components/EndEventDialog.tsx` (new) — confirm modal with optional reason textarea; used by both the action bar's End Event button and the overdue banner's shortcut.
- `apps/frontend/src/components/OverdueBanner.tsx` (new) — renders `null` unless `event.isOverdue`; computes "ended N {unit} ago" from `event.endsAt` (reuse or extend an existing relative-time helper if one exists in `shared-utils`, else add one).
- `apps/frontend/src/pages/events/workspace/HistoryTab.tsx` (new) — fetches `GET /:id/history`, renders the card-of-rows per the Decisions section.
- `apps/frontend/src/pages/events/EventWorkspacePage.tsx` — hero simplified: removes the raw `<select>` and its `onChangeStatus`/`STATUS_OPTIONS`; renders `OverdueBanner` + `LifecycleActionBar` instead. Adds `"history"` to the tab list.
- `apps/frontend/src/pages/events/workspace/SettingsTab.tsx` — registration open/close toggle's hand-rolled `canToggleRegistration` check removed; either folds into `LifecycleActionBar` entirely (recommended, avoids two places driving the same two actions) or, if Settings' placement is kept for its own reasons, calls `allowedFrom` instead of the hardcoded check. Decided at plan time by reading the full current tab layout.
- `packages/shared-utils/src/statusColor.ts` — `STATUS_COLOR`/`LABELS` extended with `REGISTRATION_OPEN`, `ONGOING`, `CANCELLED`, `ARCHIVED`. `isEventLive`'s stale comment (already partially fixed in P2's final commits) rechecked for accuracy against the shipped scheduler.
- `apps/frontend/src/pages/events/EventsListPage.tsx` — `StatusFilter`/`matchesFilter` updated to the real 8-state names.

**Data flow:** every write action in the new UI goes through one path: button → `POST /:id/transition {to, reason?}` → on success, refetch the event (existing pattern) → on 409, surface the backend's `details.allowed` in the error state (upgrade from today's flat message-only display) — though since buttons are pre-gated by the same table the backend enforces, a 409 here would only ever mean a race (another admin/the scheduler moved the event between page-load and click), not a UI bug; the error path exists for that honest-race case, not as the primary defense.

## Error handling

- A 409 on a supposedly-legal action (the race case above) re-fetches the event and shows a toast explaining the event moved to a new status "(now: X — refresh applied)", rather than a generic error string — the UI already has the data to be specific here.
- `EndEventDialog`'s submit is disabled while in-flight; on failure, the dialog stays open with the error shown inline instead of closing (matches existing modal conventions in this codebase, e.g. `SpeakerFormModal`).
- History tab: empty state ("No status changes yet" — every event has at least one history row once it leaves DRAFT, but a still-DRAFT event legitimately has zero).

## Testing

- **Shared package move:** `transitions.test.ts`'s existing assertions must all still pass from their new location — this is a pure relocation, not a rewrite.
- **Backend:** new test for `GET /:id/history` (permission-gated, ordering, shape) in `adminEvents.routes.test.ts`.
- **Frontend:** component-level tests (if this repo's frontend test conventions support them — checked at plan time) for `LifecycleActionBar` rendering exactly the legal-button set for a representative sample of statuses, and `OverdueBanner` rendering nothing when `isOverdue` is false.
- **Manual browser verification** (per this session's standing practice): drive the actual Event Workspace in the browser preview for at least one full flow (e.g. DRAFT → Publish → Open Registration → Close Registration → End Event) and confirm the button set, the History tab's rows, and the overdue banner (forced via a test event with a past `endsAt`) all render correctly.

## Out of scope for P3 (explicitly deferred)

- The user-facing portal's badge matrix and "Waiting for Shortlist" fix — P4.
- Category taxonomy, create-form restructure — P5/P6.
- Any reconciliation UI for a `PENDING` `sideEffectsStatus` left behind by a crash (flagged in P2's final review as a P3-adjacent idea) — not building a reconciliation surface now; the History tab shows `sideEffectsStatus` as a plain column value if `PENDING`/`FAILED`, but no dedicated "retry" action.
- `computeNextAutoTransition`'s known gap for the REGISTRATION_OPEN start-time safety-net path (flagged in P2's final review as P4 scope, since it's the portal countdown hint, not the admin FE) — untouched here.
