# P5 — Category Taxonomy — Design Spec

## Goal

Event `category` is currently a free-text `String` column — a plain `<input>` in both the
create form and the Event Workspace's Overview tab, validated only as non-empty. There is no
canonical list, no dedup, and the participant-facing portal (bliblitalk-user-fe) already
maintains its own separate, already-stale hardcoded list of category names for gradients and
filter tabs. P5 replaces the free-text field with a real `EventCategory` taxonomy: a managed,
de-duplicated set of category rows that admins create/edit/deactivate, with the event form
picking from it instead of typing it.

**Exit criterion (from the roadmap):** zero free-text categories in the data model; creating a
duplicate category name (any case) is rejected.

## Context: what research found

- `category` is a plain required `String` on `Event` (`schema.prisma:105`), created once in the
  initial migration and never touched since — no index, no FK, no default.
- Validation is `AdminEventInput.category: z.string().min(1)` (`packages/shared-types/src/schemas.ts:358`)
  — free text, no length cap, no whitelist. Both write paths
  (`adminEvents.service.ts` create at line 97, update at line 154) pass it through verbatim, no
  trim/normalization.
- `category` is in `REQUIRED_FOR_PUBLISH` (`adminEvents.service.ts:216-222`) — an event can't be
  published without one. This is preserved by the new required `categoryId` FK.
- No dropdown or filter exists anywhere in the admin frontend today. The only place distinct
  category values are read at all is an analytics `groupBy` (`adminAnalytics.service.ts:13`)
  powering a bar chart.
- The real data is small and clean: **5 distinct values** (`Leadership`, `Self Development`,
  `Technology`, `Career Growth`, `Design`) across all 9 seeded events plus 2 leftover manual test
  fixtures (both reusing `Leadership`) — confirmed identical in both `seed.ts` and the live local
  DB, with zero casing/whitespace drift. This is a clean moment to lock in a taxonomy.
- **The `Speaker` feature is the explicit reuse template**, but its actual precedent is simpler
  than the roadmap's phrasing implied: `adminSpeakers.routes.ts`/`.service.ts` do a **hard**
  `DELETE` (no `is_active` flag anywhere on `Speaker`), gated only by a client-side
  `window.confirm()` warning showing total event count (`SpeakersPage.tsx:40-53`) — no is-it-upcoming
  distinction, no server-side block. There's also no uniqueness constraint on speaker name at any
  layer. Category deletion intentionally diverges from this precedent (see Decisions #2) because a
  category is a controlled tag where duplicates and accidental loss of historical meaning matter
  in a way a person's name doesn't.
- The inline "+ Create new speaker" combobox (`OverviewTab.tsx:104-334`) is the UX template for
  the category picker: debounced 250ms search-as-you-type dropdown, a trailing
  "+ Create new speaker '{query}'" action that opens `SpeakerFormModal` with the field **empty**
  (the typed text is not carried over — admin retypes it).
- bliblitalk-user-fe (the portal) reads `category` as a plain string in 14 files, for two live
  purposes: poster-gradient color lookup (4 near-identical `posterGradient` maps in
  `DashboardEventCard.tsx`, `EventPosterCard.tsx`, `EventBanner.tsx`, `MyEventRow.tsx`) and
  category-tab filtering (`DashboardSections.tsx`'s `CategoryTabs`, `EventsSection.tsx`'s pills),
  each with its own hardcoded `CATEGORIES` array. That list is already wrong today — it's missing
  `"Career Growth"` and lists three categories (`"Business"`, `"Marketing"`, `"Health"`) nothing
  uses. This drift is pre-existing and independent of P5.

## Decisions

1. **Single-migration backfill, no approval UI.** Because the real data is 5 clean values with
   no ambiguity, the migration creates the 5 `EventCategory` rows, backfills every event's new
   `categoryId` by joining on the old string, then enforces `NOT NULL` and drops the legacy
   `category` column — all in one migration, done live (not the safer two-phase
   nullable-then-backfill-then-enforce split a large, already-live production table would need).
   No dedicated admin review/approval screen is built; the mapping is 1:1 and logged, not curated.
2. **Soft-delete with a hard block, diverging from the Speaker precedent.** `EventCategory` gets
   an `isActive` boolean. `DELETE /admin/categories/:id`:
   - If any event referencing the category is **not** `COMPLETED`/`CANCELLED`/`ARCHIVED` (i.e. an
     "upcoming" event in the lifecycle sense) → hard-block, `409 CATEGORY_IN_USE`, no override.
   - Otherwise → sets `isActive: false`. The row is never physically deleted through this API, so
     historical/finished events always keep a valid, readable `categoryId`.
   - Same permission gate as Speaker: `requireAuth` + `requirePermission(EVENT_UPDATE)` — no new
     dedicated permission.
3. **Category picker mirrors the Speaker combobox, with one deliberate UX improvement.** Same
   debounced search-dropdown + "+ Create new category '{query}'" interaction. Unlike Speaker's
   modal (which opens empty), the create modal here is **pre-filled** with the typed query text —
   there's only one field (name), so making the admin retype it would be pure friction with no
   corresponding benefit. Search results only ever list active categories (Decision #2's
   `includeInactive=false` default), but the currently-assigned category is always shown as the
   selected value when editing an existing event, even if it has since been deactivated — the
   picker never silently blanks out a valid, already-saved selection just because that category
   is no longer offered to *new* selections.
4. **The public API contract is preserved unchanged — bliblitalk-user-fe needs zero code
   changes.** `EventDTO.category` stays a `string` on the wire, now mapped from
   `category.name` instead of the raw column (`lib/shared/mappers.ts:96`). The portal's gradient
   lookups and `CategoryTabs`/pills filtering both do plain string comparisons against
   `event.category`, so this mapping is fully transparent to them. The DTO gains one **additive**
   field, `categoryId: string`, read only by the admin FE (to preselect the combobox when editing
   and to know a category's live id for the management page); nothing in bliblitalk-user-fe reads
   it. `AdminEventInput`/`AdminEventUpdateInput` switch their write field from
   `category: z.string().min(1)` to `categoryId: z.string().min(1)`.
5. **The portal's stale `CATEGORIES` list is explicitly out of scope for P5** (see Out of Scope) —
   flagged as a standalone follow-up, not silently rolled into this phase.

## Architecture

**Backend:**
- `schema.prisma` — new model:
  ```prisma
  model EventCategory {
    id        String   @id @default(cuid())
    name      String   @unique @db.Citext
    isActive  Boolean  @default(true)
    createdAt DateTime @default(now())
    events    Event[]
  }
  ```
  `Event.category String` is replaced by `Event.categoryId String` (FK to `EventCategory.id`,
  required). This is the first use of `citext` in this schema — the migration enables the
  extension if not already present.
- New `apps/backend/src/routes/admin/adminCategories.routes.ts` +
  `adminCategories.service.ts`, structured exactly like `adminSpeakers.*`:
  - `GET /admin/categories?q=&includeInactive=` — list, name search, `_count.events` as
    `eventCount`; `includeInactive` defaults `false` (combobox/dropdown never shows deactivated
    categories; a management page can pass `true`).
  - `POST /admin/categories` — create, `CreateCategoryInput = z.object({ name: z.string().min(1) })`.
    A citext unique-violation (`P2002`) is caught and returned as `409 DUPLICATE_CATEGORY`, not a
    generic 500.
  - `PATCH /admin/categories/:id` — update `name` and/or `isActive`; same duplicate handling on
    rename.
  - `DELETE /admin/categories/:id` — implements Decision #2's hard-block/soft-delete branch.
- `adminEvents.service.ts` — create/update swap `category: input.category` for
  `categoryId: input.categoryId`; `REQUIRED_FOR_PUBLISH` swaps `"category"` for `"categoryId"`.
- `lib/shared/mappers.ts` — `toEventDTO` changes `category: e.category` to
  `category: e.category.name, categoryId: e.categoryId` (requires the category relation to be
  included in every query that maps to `EventDTO`, mirroring how `speakers` is already included).
- `adminAnalytics.service.ts` — `groupBy({ by: ["category"] })` becomes
  `groupBy({ by: ["categoryId"] })`, joined against `EventCategory` to resolve display names for
  `CategoryBreakdownDTO`.
- `packages/shared-types/src/schemas.ts` — `EventDTO` gains `categoryId: z.string()`;
  `AdminEventInput`/`AdminEventUpdateInput`'s `category` field becomes `categoryId`; new
  `CategoryDTO`/`AdminCategoryDTO` (the latter extended with `eventCount: z.number().int()`,
  mirroring `AdminSpeakerDTO`).

**Frontend (bliblitalk-admin) — new/changed components:**
- `apps/frontend/src/pages/categories/CategoriesPage.tsx` (new) — table (name, event count,
  active/inactive badge, edit/delete icon buttons), client-side name filter, "Add Category"
  button — structured like `SpeakersPage.tsx`. Linked from the sidebar near Speakers.
- `apps/frontend/src/components/CategoryFormModal.tsx` (new) — single-field (name) create/edit
  modal, structurally like `SpeakerFormModal` but far smaller.
- `apps/frontend/src/pages/events/EventFormPage.tsx` and
  `apps/frontend/src/pages/events/workspace/OverviewTab.tsx` — the plain category `<input>` is
  replaced by a single-select debounced combobox (Decision #3): type to filter active categories,
  click a result to select, or "+ Create new category '{query}'" to open `CategoryFormModal`
  pre-filled with the typed text. Both forms submit `categoryId` instead of `category`.
- `apps/frontend/src/pages/events/workspace/EventWorkspacePage.tsx` — existing read-only category
  pill now reads `event.category` (unchanged — still the flattened name string per Decision #4).
- `apps/frontend/src/pages/analytics/AnalyticsPage.tsx` — unaffected visually; its data source
  changes on the backend only.

**Data flow:** the event form fetches active categories the same way it fetches speakers today
(on combobox query, debounced `GET /admin/categories?q=`); creating a category inline updates the
combobox's result set and immediately selects the new category, mirroring `attachSpeaker`'s
dedupe-and-append pattern but single-select instead of multi.

## Error handling

- `409 DUPLICATE_CATEGORY` on create/rename — surfaced inline in `CategoryFormModal` next to the
  name field, not a toast (matches how form-level validation errors are already shown elsewhere
  in this codebase, e.g. `SpeakerFormModal`).
- `409 CATEGORY_IN_USE` on delete — shown in the confirm flow with the blocking event count (and,
  if the backend includes them, a few event titles) instead of a generic error, so the admin
  understands why deletion is blocked and that deactivation isn't available either while upcoming
  events still reference it.
- Migration safety: since this is a single live migration dropping a column, it runs against the
  already-small dataset only after this design is approved and the plan's migration task is
  reviewed — no separate rollback tooling is built (consistent with how prior migrations in this
  project have been handled).

## Testing

- **Backend:** new `adminCategories.routes.test.ts` mirroring `adminSpeakers.routes.test.ts`
  conventions — CRUD happy paths, citext duplicate-name rejection on create and rename, hard-block
  delete when an upcoming event references the category, soft-delete succeeding when only
  finished/archived/cancelled events (or none) reference it, permission gating.
  `adminEvents.routes.test.ts` and `adminAnalytics.routes.test.ts` fixtures update from
  `category: "..."` string literals to a seeded `categoryId`.
- **Migration:** a one-off verification (script or test run directly after migrating) confirming
  exactly 5 `EventCategory` rows exist and all 11 existing events resolve to a non-null
  `categoryId` matching their pre-migration `category` string.
- **Frontend (bliblitalk-admin):** component tests for `CategoryFormModal` and the combobox's
  create-flow (typed text pre-fills the modal, per Decision #3), plus updating existing
  `EventFormPage`/`OverviewTab` tests that reference the old `category` string field.
- **bliblitalk-user-fe:** no test changes needed (Decision #4 — its contract is unchanged). A live
  post-merge sanity check confirms gradients/filter-tabs still render correctly against the
  migrated data, matching this project's standing live-verification practice for cross-repo
  phases.

## Out of scope for P5 (explicitly deferred)

- **bliblitalk-user-fe's stale `CATEGORIES` arrays** (missing `"Career Growth"`, listing three
  unused categories) — a pre-existing bug, independent of and not touched by this phase. Flagged
  as a standalone follow-up.
- Any admin-facing "mapping review" UI for the backfill (Decision #1) — not needed given the
  clean, small dataset; would be speculative scope for a problem that doesn't exist yet.
- Create Event form restructure (grouping into Identity/Schedule/Behavior sections) — P6.
- A dedicated `EVENT_CATEGORY_MANAGE`-style permission distinct from `EVENT_UPDATE` — no existing
  precedent in this codebase for permissions this granular; revisit only if a real need surfaces.
