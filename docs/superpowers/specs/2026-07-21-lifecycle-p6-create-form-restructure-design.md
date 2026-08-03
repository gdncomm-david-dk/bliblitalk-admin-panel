# P6 — Create/Edit Event Form Restructure — Design Spec

## Goal

The admin's "New Event" form ([`EventFormPage.tsx`](../../../apps/frontend/src/pages/events/EventFormPage.tsx))
is a flat, single-card list of fields. It also under-exposes the data model: three fields the
backend has fully supported for phases now — hero/thumbnail images, speakers, `registrationOpensAt`,
and `selectionMode` — are simply not on the form, and one behavior flag (`waitingListEnabled`) is
sent but has no control (silently always `true` on create). P6 restructures the create form into
three intention-revealing sections — **Identity / Schedule / Behavior** — and surfaces the missing
fields, and brings the Event Workspace's Overview edit tab
([`OverviewTab.tsx`](../../../apps/frontend/src/pages/events/workspace/OverviewTab.tsx)) to parity so
every field that can be set at creation can also be edited afterward.

**Exit criterion (from the roadmap):** the create form is grouped into Identity / Schedule /
Behavior only; operational/participant concerns are not on the form (already true — they live in the
lifecycle-gated Participants views); and `selectionMode` + `registrationOpensAt` are settable at both
create and edit time.

## Context: what research found

- **The backend is already complete for P6.** `AdminEventInput`
  ([`schemas.ts:371-410`](../../../packages/shared-types/src/schemas.ts)) already accepts
  `bannerUrl`, `thumbnailUrl`, `speakerIds`, `selectionMode`, and `registrationOpensAt`. Prisma has
  `selectionMode SelectionMode @default(FCFS)` (`schema.prisma:125`), `registrationOpensAt DateTime?`
  (`schema.prisma:137`), and an index `@@index([status, registrationOpensAt])` (`schema.prisma:166`)
  that the P2 scheduler already uses to drive the auto `PUBLISHED → REGISTRATION_OPEN` boundary. P6
  touches **no backend/schema code**.
- **The create form** (`EventFormPage.tsx`) currently surfaces: title, subtitle, category (combobox,
  added in P5), location, venue, description, startsAt, endsAt, registrationDeadline, capacity, and
  four behavior checkboxes (showRemainingSeats, hasSpeedDating, enableCertificate, enableFeedback).
  Its `FormState`/`EMPTY`/payload include `waitingListEnabled` (default `true`) but render **no
  control** for it, so a create can never turn it off. It is a flat `space-y-4` form inside one card.
- **The edit form** (`OverviewTab.tsx`) already contains every UI pattern P6 needs to mirror: the
  speaker combobox with inline "+ Create new speaker" → `SpeakerFormModal` (`OverviewTab.tsx:270-333`),
  two `ImageUploadField`s for banner + thumbnail (`OverviewTab.tsx:334-349`), and the same category
  combobox. But it is **also** a flat form, and it does **not** send `selectionMode`,
  `registrationOpensAt`, `waitingListEnabled`, `hasSpeedDating`, `enableCertificate`, or
  `enableFeedback` in its PATCH payload (`OverviewTab.tsx:167-183`) — so those are currently
  un-editable after creation. P6's parity work makes `selectionMode` and `registrationOpensAt`
  editable there. (The module toggles hasSpeedDating/enableCertificate/enableFeedback live on the
  Settings tab and are out of scope here — see Non-goals.)
- **No shared form-section component exists** anywhere in `apps/frontend/src` (grep for
  `FormSection`/`SectionCard`/`form-section` returns nothing). P6 introduces the section layout
  **inline** in each form (per the scope decision below), not as a shared component.
- **`ImageUploadField`** is the reuse-ready uploader: props `label`, `value`, `onChange(url)`,
  `aspect`, `helpText` (`OverviewTab.tsx:334-349`).
- **Blu form styling in use today:** fields use the shared `FIELD_CLASS`/`TEXTAREA_CLASS` (defined
  locally in `EventFormPage.tsx:7-9`, and shared from `workspace/fieldStyles.ts` for the workspace
  tabs), inside a `rounded-2xl border border-line bg-white p-6` card. Section headers elsewhere use
  `text-sm font-semibold text-ink` (e.g. `OverviewTab.tsx:209`).

## Decisions (locked with the owner)

1. **Scope = create + edit parity, inline sections, no shared-component extraction.** The **create
   form** (`EventFormPage`) is one form and gets the full three-section layout. The **edit
   experience is split across two workspace tabs** — Overview (identity + schedule + speakers/images)
   and [Settings](../../../apps/frontend/src/pages/events/workspace/SettingsTab.tsx) (capacity,
   waiting list, show-remaining-seats, certificate, feedback, display config) — so "parity" means the
   two genuinely un-editable-after-creation fields (`registrationOpensAt`, `selectionMode`) become
   editable in the tab that already owns their concern, **without duplicating any control across
   tabs**. Section markup and combobox blocks are duplicated inline across files — **accepted**. (The
   shared-component refactor — `<FormSection>`, `<CategoryCombobox>`, `<SpeakerCombobox>` — was
   explicitly declined to keep P6 focused.)
2. **Behavior controls are decoupled.** `selectionMode` becomes an explicit control; `showRemainingSeats`
   is reworded to a pure display toggle; `waitingListEnabled` gets a visible control on the create
   form. This realizes roadmap decision #6 (`selectionMode` and `showRemainingSeats` are separate
   concerns).
3. **Location/Venue belong to Identity.** Schedule stays purely the four datetimes, which keeps a
   clean mapping to the lifecycle scheduler's timeline.
4. **Client-side datetime ordering is enforced (block submit).** Where each value is present, the form
   blocks submit with inline errors unless
   `registrationOpensAt ≤ registrationDeadline ≤ startsAt < endsAt`. The backend/scheduler remain the
   final guard; this is a friendly pre-check.

## Design

### Section layout (create form)

The three sections below are the **create form** (`EventFormPage`). The edit side reuses the same
Identity/Schedule grouping and controls but split across the Overview and Settings tabs — see
**New-field wiring** below.

Three stacked sections. Each is a small header — a `text-sm font-semibold text-ink` title plus an
optional one-line `text-xs text-muted` helper — above the existing
`rounded-2xl border border-line bg-white p-6` card holding that section's fields. Rendered inline in
each file (no new component).

#### ① Identity — *what the event is and its content*
- Title (required), Subtitle
- Category (required; existing combobox + inline "+ Create new category")
- Description (required)
- Hero Banner + Thumbnail (`ImageUploadField` ×2, side by side; aspect `16/9` and `4/3`)
- Speakers (existing combobox + inline "+ Create new speaker")
- Location (required), Venue

#### ② Schedule — *the timeline the lifecycle scheduler acts on*
- Starts At (required), Ends At (required)
- **Registration Opens At** *(new)* — `datetime-local`, optional; empty → `null`. Helper text:
  "When registration auto-opens after publishing. Leave blank to open immediately on publish."
- Registration Deadline — `datetime-local`, optional (existing)

#### ③ Behavior — *how registration and modules operate*
- Capacity (number, min 0)
- **Selection Mode** *(new)* — radio group, default `FCFS`:
  - `First-come-first-served` — registrations are auto-approved up to capacity.
  - `Curated (admin shortlists)` — registrations wait for admin shortlisting.
- ☑ **Show remaining seat count to participants** — reworded `showRemainingSeats` (display only; the
  old "unchecked = shortlist-only" parenthetical is removed now that Selection Mode owns that meaning).
- ☑ **Enable waiting list when full** — `waitingListEnabled` (new visible control on the create form;
  default checked).
- ☑ Enable Speed Dating · ☑ Enable Certificate · ☑ Enable Feedback (unchanged behavior flags, create
  form only — see Non-goals for why these stay off the Overview edit tab).

### New-field wiring

**Create form (`EventFormPage`):**
- Extend `FormState`/`EMPTY` with `bannerUrl: ""`, `thumbnailUrl: ""`, `speakers: []`,
  `registrationOpensAt: ""`, `selectionMode: "FCFS"`.
- Add the speaker combobox + `SpeakerFormModal` wiring and the two `ImageUploadField`s, mirroring
  `OverviewTab.tsx:270-349`.
- Extend the submit payload with: `bannerUrl: form.bannerUrl || null`,
  `thumbnailUrl: form.thumbnailUrl || null`, `speakerIds: form.speakers.map(s => s.id)`,
  `registrationOpensAt: form.registrationOpensAt ? new Date(...).toISOString() : null`,
  `selectionMode: form.selectionMode`, and keep `waitingListEnabled: form.waitingListEnabled` (now
  driven by the new checkbox).

**Edit side — Overview tab (`OverviewTab`):** owns identity + schedule.
- Group the existing fields under **Identity** and **Schedule** section headers (no Behavior section —
  Settings owns behavior; adding one here would duplicate Settings' controls).
- Extend `FormState`/`fromEvent()` with `registrationOpensAt` (from `toInputDateTime(e.registrationOpensAt)`)
  and add the Schedule "Registration Opens At" field.
- Extend the PATCH payload with `registrationOpensAt`; call `validateEventDates` in `onSubmit`.
- Capacity stays where it is today (Overview already edits it; that pre-existing Overview/Settings
  capacity overlap is out of scope).

**Edit side — Settings tab (`SettingsTab`):** owns behavior.
- Add an explicit **Selection Mode** radio (FCFS / Curated), extending its local state + PATCH payload
  with `selectionMode` (hydrated from `event.selectionMode`).
- Replace the conflated "Shortlist required (hides remaining-seats counter…)" checkbox
  (`SettingsTab.tsx:19,75-77` — currently `shortlistRequired = !showRemainingSeats`) with a direct
  **"Show remaining seat count to participants"** display toggle bound to `showRemainingSeats`. This
  applies the same decouple (Decision #2) on the edit side.
- Leave capacity / waiting list / certificate / feedback / display config unchanged.

`EventDTO` **already exposes** both new fields — `selectionMode: z.nativeEnum(SelectionMode)`
(`schemas.ts:236`) and `registrationOpensAt: z.string().nullable()` (`schemas.ts:237`) — so both tabs
hydrate directly with no DTO/mapper change. P6 is strictly frontend-only.

### Client-side datetime validation

A pure helper (e.g. `validateEventDates(form): string | null`) returns the first ordering violation
message or `null`. Called in `onSubmit` before building the payload; on violation, set the error and
abort (do not call the API). Rules, each applied only when both operands are present:
- `registrationOpensAt ≤ registrationDeadline`
- `registrationDeadline ≤ startsAt`
- `registrationOpensAt ≤ startsAt`
- `startsAt < endsAt`

The same helper is used by both forms.

## Non-goals (explicitly out of scope)

- **No backend/schema/DTO/mapper changes and no migration.** `AdminEventInput` accepts every field
  and `EventDTO` already exposes them; P6 is strictly frontend (two form files + one validation
  helper + its unit test).
- **No shared-component extraction** (declined in Decision #1).
- **The lifecycle action bar, publish/transition flow, and Participants/ops views** are untouched.
- **No control is duplicated across workspace tabs.** Behavior fields (capacity, waiting list,
  show-remaining-seats, certificate, feedback, `selectionMode`) live on the Settings tab; schedule +
  identity live on the Overview tab. `registrationOpensAt` is added to Overview (Schedule);
  `selectionMode` is added to Settings (behavior). Neither is added to both.
- **Module toggles** (hasSpeedDating/enableCertificate/enableFeedback) keep their current homes — on
  the create form and the Settings tab — and are not moved onto the Overview tab.

## Verification

- **Unit:** `validateEventDates` covers each ordering rule (pass + fail) and the all-empty case.
- **Typecheck:** `pnpm --filter @repo/frontend exec tsc --noEmit` clean.
- **Browser (admin :5184, backend :4001):** create an event exercising every new field (upload
  banner/thumbnail, attach a speaker, set registrationOpensAt, pick Curated), confirm it persists and
  the created event's detail/workspace reflect all values; open the **Overview tab** and confirm
  `registrationOpensAt` is pre-filled and editable and the Identity/Schedule sections render; open the
  **Settings tab** and confirm the `selectionMode` radio is pre-filled and the "Show remaining seat
  count" toggle reflects `showRemainingSeats` (round-trips correctly); trigger the datetime validation
  on both the create form and the Overview tab by entering an out-of-order date and confirm submit is
  blocked with an inline message.
- **Portal (:5183) sanity:** confirm a Curated event with "show remaining seats" off still renders
  correctly (no regression to the P4 badge/seat-visibility behavior).
