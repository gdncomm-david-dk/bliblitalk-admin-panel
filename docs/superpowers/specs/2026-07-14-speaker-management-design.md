# Speaker Management — Design

## Context

Today, nobody can create or edit a `Speaker` record, or attach one to an `Event`, anywhere in the Admin CMS. This wasn't obvious from the outside because the *read* side works perfectly: the participant portal (`bliblitalk-user-fe`) already renders speaker name/title/company/photo/short-bio on event detail pages, event cards, and the dashboard, all sourced from a `SpeakerDTO` that the backend already returns on every event read. The only place a "speaker" name appears in the Admin CMS is a read-only display in the Event Workspace header banner (picking whichever attached speaker has `featured: true`, or the first one). There is no admin API to write speakers, and no UI anywhere to type or pick one.

The request: build a dedicated **Speaker Management** page so speakers are created/edited once, in one place, and event editing pulls speaker names from that list instead of (hypothetically) retyping them per event.

## Current state (verified by direct code exploration)

- **Schema** (`apps/backend/src/db/prisma/schema.prisma`) already has a complete `Speaker` model in a many-to-many relation with `Event`:
  ```prisma
  model Speaker {
    id          String   @id @default(cuid())
    name        String
    title       String?
    company     String?
    bioShort    String?
    bioLong     String?
    credentials String[] @default([])
    avatarUrl   String?
    featured    Boolean  @default(false)
    events      Event[]  @relation("EventSpeakers")
  }
  ```
  `Event.speakers Speaker[] @relation("EventSpeakers")` — implicit join table `_EventSpeakers`, already migrated.
- **`SpeakerDTO`** (`packages/shared-types/src/schemas.ts:56-67`) mirrors the model exactly and is already part of `EventDTO.speakers`.
- **Read side**: `eventInclude` (`apps/backend/src/routes/public/events/events.service.ts`) includes `speakers: true` and is reused by every event-reading service (admin events, my-events, registrations, dashboard). `toSpeakerDTO` (`apps/backend/src/lib/shared/mappers.ts`) maps it.
- **Write side**: `AdminEventInput`/`AdminEventUpdateInput` (`packages/shared-types/src/schemas.ts:289-330`) have **no speaker field at all**. `createAdminEvent`/`updateAdminEvent` (`apps/backend/src/routes/admin/adminEvents.service.ts`) never touch the `speakers` relation. The only place `Speaker` rows are created today is the seed script.
- **Admin frontend**: no input field for speakers exists anywhere. The only two references are a read-only banner display in `EventWorkspacePage.tsx` and a `Display Speaker` boolean visibility toggle in `SettingsTab.tsx` (controls whether the section renders on the public past-event page — not speaker content itself).
- **No existing picker/combobox/multi-select component** in the admin frontend to build on. The closest reusable pattern is the repeatable add/remove list used for `learningPoints`/`galleryImages` in `EventContentTab.tsx` (local array state, `+ Add` / `×` remove, single PATCH on save).
- **Participant portal** (`bliblitalk-user-fe/apps/frontend/src/components/SpeakerCard.tsx`) already renders `name`, `title`, `company`, `avatarUrl`, `bioShort` — a strong reason to keep the new admin CRUD writing to exactly this shape rather than inventing a parallel one.

**Conclusion: this is a purely additive build.** No schema migration is needed — only a write API and two pieces of admin UI.

## Goals

1. A global "Speaker Management" page where SUPER_ADMIN/EVENT_ADMIN can create, edit, search, and delete speakers, with the full profile the schema already supports (photo, title, company, short/long bio, credentials, featured flag).
2. A way to attach/detach speakers from a specific event, from within that event's workspace, without leaving the page.
3. Both surfaces write to the exact same `Speaker` model/`SpeakerDTO` shape the participant portal already consumes — no parallel data shape.

## Non-goals (out of scope for this pass)

- Per-event "featured" speaker (the schema's `featured` flag is global to the speaker, not per-event-assignment — this pass keeps that existing behavior as-is, doesn't redesign it).
- A rich tag-editor UI for `credentials` — v1 uses a simple comma-separated text input, parsed to `string[]` on save.
- Bulk import/export of speakers.

## Alternatives considered

- **A — Fully separate**: dedicated Speaker Management page for all CRUD; event workspace only *picks* from existing speakers (no inline creation). Rejected: forces a context-switch to create a speaker discovered mid-event-edit.
- **B — Inline-only**: no dedicated page; event workspace's speaker field doubles as create+attach. Rejected: contradicts the explicit ask for a dedicated management page, and gives no central place to fix/browse speakers shared across many events.
- **C — Hybrid (chosen)**: dedicated Speaker Management page for full CRUD, *and* the event workspace's attach picker also offers "+ Create new speaker" inline, reusing the exact same form modal component from both entry points. Best of both, and reuse means it isn't meaningfully more code than A.

## Detailed design

### 1. Backend — new Speaker CRUD API

New files: `apps/backend/src/routes/admin/adminSpeakers.routes.ts`, `adminSpeakers.service.ts`.

- `GET /admin/speakers?q=<search>` — list all speakers, optional case-insensitive name search (`contains`), for the picker's typeahead and the management page's table.
- `POST /admin/speakers` — create. Body: `CreateSpeakerInput` (new Zod schema in `packages/shared-types/src/schemas.ts`): `{ name: string (min 1), title?, company?, bioShort?, bioLong?, credentials?: string[] (default []), avatarUrl?, featured?: boolean (default false) }`.
- `PATCH /admin/speakers/:id` — update. Body: `CreateSpeakerInput.partial()`.
- `DELETE /admin/speakers/:id` — delete. See error handling below for the attached-events case.

All four routes gated on `Permission.EVENT_UPDATE` (already held by SUPER_ADMIN and EVENT_ADMIN; correctly withheld from HR_TA/VIEWER, who are read-only on event content). No new permission needed.

**Existing endpoint change**: `AdminEventUpdateInput` (and `AdminEventInput`) gets a new optional field `speakerIds?: string[]`. In `updateAdminEvent`/`createAdminEvent`, when present, the Prisma `data` object includes `speakers: { set: speakerIds.map((id) => ({ id })) }` (`set`, not `connect`, so removing an id from the array detaches it — full replace semantics matching how `learningPoints`/`galleryImages` already work as full-array replace-on-save).

### 2. Admin frontend — new "Speakers" page (`/speakers`)

New page `apps/frontend/src/pages/speakers/SpeakersPage.tsx`, new route in `App.tsx`, new sidebar entry in `AdminShell.tsx`'s `NAV` array:
```ts
{ to: "/speakers", label: "Speakers", icon: MicIcon, permission: Permission.EVENT_UPDATE }
```
(placed directly after `/events` "Event Management").

Page layout: search input + table (avatar thumbnail, name, title/company, Featured badge, attached-event count, edit/delete actions) + "+ Add Speaker" button. Create/edit share one modal component, `SpeakerFormModal.tsx`, with fields: photo (reusing the existing `ImageUploadField` component — same one used for event banner/thumbnail), name, title, company, short bio (single line), long bio (textarea), credentials (comma-separated text input, split/joined on save/load), Featured (checkbox).

### 3. Event Workspace — attach speakers to an event

Added to the **Overview tab** (`apps/frontend/src/pages/events/workspace/OverviewTab.tsx`) — not the Event Content tab. Overview already owns the event's core identity fields (title, banner/thumbnail via `ImageUploadField`, description, dates) and its own PATCH-on-save flow; "who's presenting" belongs with the event's core identity, while Event Content is reserved for ancillary content (learning points, gallery).

New "Speakers" section: a type-to-search input against `GET /admin/speakers?q=`, results shown in a dropdown, click to attach (rendered as removable chips below, avatar + name). If the search finds no match, a "+ Create new speaker" option opens the same `SpeakerFormModal` from step 2 inline; on save, the newly created speaker is immediately attached as a chip. The attached speaker id list is tracked in the tab's local form state (alongside the existing fields) and included as `speakerIds` in the same PATCH the tab already issues on Save — no separate save action.

### 4. Error handling

`DELETE /admin/speakers/:id`: if the speaker has any attached events (`_count.events > 0`), the API still allows the delete (Prisma's implicit many-to-many relation auto-detaches on delete — no FK violation), but the admin frontend shows a confirmation dialog first: *"[Name] is attached to N event(s). Deleting will remove them from those events too. Continue?"* — a soft warning, not a hard block, consistent with how other destructive actions (e.g. participant rejection) are confirmed elsewhere in this admin.

### 5. Verification plan

1. `pnpm --filter @repo/backend typecheck` and `pnpm --filter @repo/frontend typecheck` in `bliblitalk-admin` (no migration needed — schema unchanged).
2. Live browser verification: create a speaker with a photo in the new Speakers page, attach it to an existing event from that event's Overview tab, then confirm (in `bliblitalk-user-fe`) it renders correctly on the event detail page's `SpeakerCard`, the event's dashboard card, and the landing page's featured hero (wherever `SpeakerDTO` is already consumed) — using this session's established `javascript_tool`/`get_page_text`/`read_network_requests` verification pattern (the `computer` screenshot tool has been unreliable this session).
3. Delete-confirmation flow: verify deleting a speaker attached to an event shows the warning and correctly detaches on confirm.
