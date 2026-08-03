# P6 — Create/Edit Event Form Restructure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restructure the admin create-event form into Identity / Schedule / Behavior sections and surface the four already-supported-but-hidden fields (hero banner, thumbnail, speakers, `registrationOpensAt`, `selectionMode`) plus a visible waiting-list control; bring the edit side (Overview + Settings tabs) to parity so `registrationOpensAt` and `selectionMode` are editable, without duplicating any control across tabs.

**Architecture:** Strictly frontend (admin app + one shared pure util). `AdminEventInput` already accepts every field and `EventDTO` already exposes `selectionMode` + `registrationOpensAt`, so there is **no** backend/schema/DTO/migration work. One new pure helper `validateEventDates` lives in `@repo/shared-utils` (has vitest); the three form surfaces import it. Section markup and combobox blocks are duplicated inline across files by owner decision — no shared React components.

**Tech Stack:** React 18 + TypeScript (Vite), Tailwind (Blu tokens), zod (`@repo/shared-types`), dayjs, vitest (shared-utils only). Admin app has no unit-test harness — it is verified by `tsc --noEmit` + live browser.

**Spec:** `docs/superpowers/specs/2026-07-21-lifecycle-p6-create-form-restructure-design.md`

## Global Constraints

Every task's requirements implicitly include this section.

- **Strictly frontend.** No changes to backend, Prisma schema, migrations, `EventDTO`, `AdminEventInput`, or any mapper. If a task appears to need one, stop and escalate.
- **No new shared React components.** The section wrapper, the category/speaker combobox blocks, and the `SELECTION_OPTIONS`/selection-mode radio are written **inline** in each file. Duplication across `EventFormPage.tsx`, `OverviewTab.tsx`, and `SettingsTab.tsx` is **intended by owner decision — reviewers must NOT flag this duplication as a defect.** The one shared item is the pure function `validateEventDates` in `@repo/shared-utils`.
- **No control is duplicated across workspace tabs.** `registrationOpensAt` is added only to the Overview tab (Schedule); `selectionMode` is added only to the Settings tab. Neither appears on both.
- **Blu styling — reuse exactly what exists.** Inputs use `FIELD_CLASS` / `TEXTAREA_CLASS` (defined locally in `EventFormPage.tsx:7-9`; imported from `./fieldStyles` in workspace tabs). Do not invent new field styles.
- **Section wrapper — use this exact markup** wherever a task says "wrap in a section card":

  ```tsx
  <section className="rounded-2xl border border-line bg-white p-6">
    <div className="mb-4">
      <h2 className="text-sm font-semibold text-ink">{TITLE}</h2>
      <p className="text-xs text-muted">{HELPER}</p>
    </div>
    <div className="space-y-4">
      {/* fields */}
    </div>
  </section>
  ```

  Section (TITLE, HELPER) pairs:
  - Identity — "Identity", "What the event is and its content."
  - Schedule — "Schedule", "When the event happens and when registration is open."
  - Behavior — "Behavior", "How registration and event modules operate."

- **Selection Mode control — use this exact block** (Tasks 2 and 4). `SELECTION_OPTIONS` is a module-level const defined locally in each file that uses it:

  ```tsx
  const SELECTION_OPTIONS = [
    { value: "FCFS", label: "First-come-first-served", hint: "Registrations are auto-approved up to capacity." },
    { value: "CURATED", label: "Curated (admin shortlists)", hint: "Registrations wait for admin shortlisting." },
  ] as const;
  ```

  ```tsx
  <div>
    <label className="mb-1 block text-xs font-semibold text-muted">Selection Mode</label>
    <div className="flex gap-3">
      {SELECTION_OPTIONS.map((opt) => (
        <label
          key={opt.value}
          className={`flex-1 cursor-pointer rounded-lg border p-3 transition ${
            SELECTION_VALUE === opt.value ? "border-primary bg-primary-50" : "border-line bg-surface hover:border-primary/40"
          }`}
        >
          <span className="flex items-center gap-2">
            <input type="radio" name="selectionMode" value={opt.value} checked={SELECTION_VALUE === opt.value} onChange={() => SELECTION_SETTER(opt.value)} />
            <span className="text-sm font-semibold text-ink">{opt.label}</span>
          </span>
          <span className="mt-1 block pl-6 text-xs text-muted">{opt.hint}</span>
        </label>
      ))}
    </div>
  </div>
  ```

  Replace `SELECTION_VALUE`/`SELECTION_SETTER` per task: create form → `form.selectionMode` / `(v) => set("selectionMode", v)`; Settings tab → `selectionMode` / `setSelectionMode`.

- **Datetime ordering:** where each value is present, the create form and the Overview tab block submit unless `registrationOpensAt ≤ registrationDeadline ≤ startsAt < endsAt`, via `validateEventDates` (Task 1). The Settings tab edits no dates and does not call it.
- **DRY/YAGNI/TDD, frequent commits.** Only Task 1 is unit-testable (pure fn); Tasks 2–4 are verified by typecheck + browser.

---

### Task 1: `validateEventDates` pure helper (`@repo/shared-utils`)

**Suggested model:** cheap (pure function, complete code below, TDD).

**Files:**
- Modify: `packages/shared-utils/src/date.ts`
- Test: `packages/shared-utils/src/date.test.ts`
- (No barrel change — `index.ts` already does `export * from "./date"`.)

**Interfaces:**
- Produces: `export interface EventDateFields { registrationOpensAt?: string | null; registrationDeadline?: string | null; startsAt?: string | null; endsAt?: string | null }` and `export function validateEventDates(f: EventDateFields): string | null`. Consumed by Tasks 2 and 3 via `import { validateEventDates } from "@repo/shared-utils"`.

- [ ] **Step 1: Write the failing tests** — append to `packages/shared-utils/src/date.test.ts`. Add `validateEventDates` to the existing `import { ... } from "./date";` line, then append:

```ts
describe("validateEventDates", () => {
  it("returns null when all fields are empty", () => {
    expect(validateEventDates({})).toBeNull();
  });

  it("returns null for a fully valid ordering", () => {
    expect(
      validateEventDates({
        registrationOpensAt: "2026-07-01T09:00",
        registrationDeadline: "2026-07-05T17:00",
        startsAt: "2026-07-10T09:00",
        endsAt: "2026-07-10T17:00",
      }),
    ).toBeNull();
  });

  it("flags registration open after the deadline", () => {
    expect(
      validateEventDates({ registrationOpensAt: "2026-07-06T09:00", registrationDeadline: "2026-07-05T17:00" }),
    ).toMatch(/on or before the registration deadline/i);
  });

  it("flags a deadline after the event start", () => {
    expect(
      validateEventDates({ registrationDeadline: "2026-07-11T09:00", startsAt: "2026-07-10T09:00" }),
    ).toMatch(/on or before the event start/i);
  });

  it("flags registration open after the event start when no deadline is set", () => {
    expect(
      validateEventDates({ registrationOpensAt: "2026-07-11T09:00", startsAt: "2026-07-10T09:00" }),
    ).toMatch(/on or before the event start/i);
  });

  it("flags start equal to end (must be strictly before)", () => {
    expect(
      validateEventDates({ startsAt: "2026-07-10T09:00", endsAt: "2026-07-10T09:00" }),
    ).toMatch(/end must be after/i);
  });

  it("flags start after end", () => {
    expect(
      validateEventDates({ startsAt: "2026-07-10T18:00", endsAt: "2026-07-10T09:00" }),
    ).toMatch(/end must be after/i);
  });

  it("returns null when only start+end are present and valid", () => {
    expect(validateEventDates({ startsAt: "2026-07-10T09:00", endsAt: "2026-07-10T17:00" })).toBeNull();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @repo/shared-utils exec vitest run src/date.test.ts`
Expected: FAIL — `validateEventDates is not a function` / not exported.

- [ ] **Step 3: Implement the helper** — append to `packages/shared-utils/src/date.ts` (it already imports `dayjs`):

```ts
export interface EventDateFields {
  registrationOpensAt?: string | null;
  registrationDeadline?: string | null;
  startsAt?: string | null;
  endsAt?: string | null;
}

/**
 * Returns the first date-ordering violation message, or null when the *present* fields satisfy
 * registrationOpensAt ≤ registrationDeadline ≤ startsAt < endsAt. Each rule is checked only when
 * both of its operands are present, so a partially-filled form never reports a spurious error.
 */
export function validateEventDates(f: EventDateFields): string | null {
  const opens = f.registrationOpensAt ? dayjs(f.registrationOpensAt) : null;
  const deadline = f.registrationDeadline ? dayjs(f.registrationDeadline) : null;
  const starts = f.startsAt ? dayjs(f.startsAt) : null;
  const ends = f.endsAt ? dayjs(f.endsAt) : null;

  if (opens && deadline && opens.isAfter(deadline))
    return "Registration open time must be on or before the registration deadline.";
  if (deadline && starts && deadline.isAfter(starts))
    return "Registration deadline must be on or before the event start.";
  if (opens && starts && opens.isAfter(starts))
    return "Registration open time must be on or before the event start.";
  if (starts && ends && !starts.isBefore(ends))
    return "Event end must be after the event start.";
  return null;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter @repo/shared-utils exec vitest run src/date.test.ts`
Expected: PASS (all 8 new cases green; pre-existing date tests still green).

- [ ] **Step 5: Commit**

```bash
git add packages/shared-utils/src/date.ts packages/shared-utils/src/date.test.ts
git commit -m "feat(shared-utils): validateEventDates ordering helper for the event forms"
```

---

### Task 2: Create-form restructure (`EventFormPage.tsx`)

**Suggested model:** standard (multi-field integration, complete code below).

**Files:**
- Modify: `apps/frontend/src/pages/events/EventFormPage.tsx` (full rewrite of state, submit, and render)

**Interfaces:**
- Consumes: `validateEventDates` (Task 1); existing `ImageUploadField` (`label,value,onChange,aspect,helpText`), `SpeakerFormModal` (`speaker,onClose,onSaved`), `CategoryFormModal` (`category,initialName,onClose,onSaved`), `AdminSpeakerDTO`, `SelectionMode`.

- [ ] **Step 1: Replace the imports** at the top of the file with:

```tsx
import { useEffect, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import type { AdminCategoryDTO, AdminEventInput, AdminSpeakerDTO, EventDTO, SelectionMode } from "@repo/shared-types";
import { validateEventDates } from "@repo/shared-utils";
import { api, ApiRequestError } from "../../services/api";
import { CategoryFormModal } from "../../components/CategoryFormModal";
import { SpeakerFormModal } from "../../components/SpeakerFormModal";
import { ImageUploadField } from "../../components/ImageUploadField";
```

- [ ] **Step 2: Replace `FormState`, `EMPTY`, and add `SELECTION_OPTIONS`** (keep the existing `FIELD_CLASS`/`TEXTAREA_CLASS` consts above them):

```tsx
const SELECTION_OPTIONS = [
  { value: "FCFS", label: "First-come-first-served", hint: "Registrations are auto-approved up to capacity." },
  { value: "CURATED", label: "Curated (admin shortlists)", hint: "Registrations wait for admin shortlisting." },
] as const;

interface FormState {
  title: string;
  subtitle: string;
  categoryId: string;
  categoryName: string;
  location: string;
  venue: string;
  description: string;
  bannerUrl: string;
  thumbnailUrl: string;
  speakers: { id: string; name: string; avatarUrl: string | null }[];
  startsAt: string;
  endsAt: string;
  registrationOpensAt: string;
  registrationDeadline: string;
  capacity: string;
  selectionMode: SelectionMode;
  showRemainingSeats: boolean;
  waitingListEnabled: boolean;
  hasSpeedDating: boolean;
  enableCertificate: boolean;
  enableFeedback: boolean;
}

const EMPTY: FormState = {
  title: "",
  subtitle: "",
  categoryId: "",
  categoryName: "",
  location: "",
  venue: "",
  description: "",
  bannerUrl: "",
  thumbnailUrl: "",
  speakers: [],
  startsAt: "",
  endsAt: "",
  registrationOpensAt: "",
  registrationDeadline: "",
  capacity: "0",
  selectionMode: "FCFS",
  showRemainingSeats: true,
  waitingListEnabled: true,
  hasSpeedDating: false,
  enableCertificate: true,
  enableFeedback: false,
};
```

- [ ] **Step 3: Add speaker-combobox state + helpers** inside the component, right after the existing category-combobox state/effect/`selectCategory` (keep all of those unchanged):

```tsx
  const [speakerQuery, setSpeakerQuery] = useState("");
  const [speakerResults, setSpeakerResults] = useState<AdminSpeakerDTO[]>([]);
  const [creatingSpeaker, setCreatingSpeaker] = useState(false);

  useEffect(() => {
    if (!speakerQuery.trim()) {
      setSpeakerResults([]);
      return;
    }
    const t = setTimeout(() => {
      api
        .get<AdminSpeakerDTO[]>(`/admin/speakers?q=${encodeURIComponent(speakerQuery.trim())}`)
        .then(setSpeakerResults)
        .catch(() => setSpeakerResults([]));
    }, 250);
    return () => clearTimeout(t);
  }, [speakerQuery]);

  function attachSpeaker(s: { id: string; name: string; avatarUrl: string | null }) {
    setForm((f) => (f.speakers.some((x) => x.id === s.id) ? f : { ...f, speakers: [...f.speakers, s] }));
    setSpeakerQuery("");
    setSpeakerResults([]);
  }

  function detachSpeaker(id: string) {
    setForm((f) => ({ ...f, speakers: f.speakers.filter((s) => s.id !== id) }));
  }
```

- [ ] **Step 4: Replace `onSubmit`** with the version that validates dates and sends every field:

```tsx
  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const dateError = validateEventDates({
      registrationOpensAt: form.registrationOpensAt,
      registrationDeadline: form.registrationDeadline,
      startsAt: form.startsAt,
      endsAt: form.endsAt,
    });
    if (dateError) {
      setError(dateError);
      return;
    }
    setSaving(true);
    try {
      const payload: AdminEventInput = {
        title: form.title,
        subtitle: form.subtitle || null,
        categoryId: form.categoryId,
        location: form.location,
        venue: form.venue || null,
        description: form.description,
        bannerUrl: form.bannerUrl || null,
        thumbnailUrl: form.thumbnailUrl || null,
        speakerIds: form.speakers.map((s) => s.id),
        startsAt: new Date(form.startsAt).toISOString(),
        endsAt: new Date(form.endsAt).toISOString(),
        registrationOpensAt: form.registrationOpensAt ? new Date(form.registrationOpensAt).toISOString() : null,
        registrationDeadline: form.registrationDeadline ? new Date(form.registrationDeadline).toISOString() : null,
        capacity: Number(form.capacity) || 0,
        selectionMode: form.selectionMode,
        showRemainingSeats: form.showRemainingSeats,
        waitingListEnabled: form.waitingListEnabled,
        hasSpeedDating: form.hasSpeedDating,
        enableCertificate: form.enableCertificate,
        enableFeedback: form.enableFeedback,
        tags: [],
      };
      const created = await api.post<EventDTO>("/admin/events", payload);
      navigate(`/events/${created.id}`, { replace: true });
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.apiError.message : "Failed to save event.");
    } finally {
      setSaving(false);
    }
  }
```

- [ ] **Step 5: Replace the entire `return (...)`** with the three-section layout:

```tsx
  return (
    <div className="max-w-2xl">
      <h1 className="text-xl font-bold text-ink">New Event</h1>

      {error && <p className="mt-4 text-sm font-medium text-status-red">{error}</p>}

      <form onSubmit={onSubmit} className="mt-6 space-y-6">
        {/* ① Identity */}
        <section className="rounded-2xl border border-line bg-white p-6">
          <div className="mb-4">
            <h2 className="text-sm font-semibold text-ink">Identity</h2>
            <p className="text-xs text-muted">What the event is and its content.</p>
          </div>
          <div className="space-y-4">
            <div>
              <label className="mb-1 block text-xs font-semibold text-muted">Title</label>
              <input required value={form.title} onChange={(e) => set("title", e.target.value)} className={FIELD_CLASS} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-muted">Subtitle</label>
              <input value={form.subtitle} onChange={(e) => set("subtitle", e.target.value)} className={FIELD_CLASS} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="mb-1 block text-xs font-semibold text-muted">Category</label>
                <div className="relative">
                  <input
                    required
                    value={categoryQuery || form.categoryName}
                    onChange={(e) => {
                      setCategoryQuery(e.target.value);
                      set("categoryName", "");
                      set("categoryId", "");
                    }}
                    placeholder="Type to search categories..."
                    className={FIELD_CLASS}
                  />
                  {categoryQuery.trim() && (
                    <div className="absolute left-0 right-0 top-full z-10 mt-1 overflow-hidden rounded-lg border border-line bg-white shadow-lg">
                      {categoryResults.map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => selectCategory(c)}
                          className="flex w-full items-center px-3 py-2 text-left text-sm text-ink transition-colors hover:bg-surface"
                        >
                          {c.name}
                        </button>
                      ))}
                      <button
                        type="button"
                        onClick={() => setCreatingCategory(true)}
                        className="w-full border-t border-line px-3 py-2 text-left text-sm font-medium text-primary transition-colors hover:bg-primary-50"
                      >
                        + Create new category &ldquo;{categoryQuery.trim()}&rdquo;
                      </button>
                    </div>
                  )}
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-muted">Location</label>
                <input required value={form.location} onChange={(e) => set("location", e.target.value)} className={FIELD_CLASS} />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-muted">Venue</label>
              <input value={form.venue} onChange={(e) => set("venue", e.target.value)} className={FIELD_CLASS} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-muted">Description</label>
              <textarea required value={form.description} onChange={(e) => set("description", e.target.value)} className={TEXTAREA_CLASS} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <ImageUploadField
                label="Hero Banner"
                value={form.bannerUrl}
                onChange={(url) => set("bannerUrl", url)}
                aspect="16 / 9"
                helpText="Large image shown on the event hero banner."
              />
              <ImageUploadField
                label="Thumbnail"
                value={form.thumbnailUrl}
                onChange={(url) => set("thumbnailUrl", url)}
                aspect="4 / 3"
                helpText="Small image for event lists/cards. Falls back to the hero banner when unset."
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-muted">Speakers</label>
              {form.speakers.length > 0 && (
                <div className="mb-2 flex flex-wrap gap-2">
                  {form.speakers.map((s) => (
                    <span key={s.id} className="inline-flex items-center gap-2 rounded-full border border-line bg-surface py-1 pl-1 pr-2 text-sm text-ink">
                      {s.avatarUrl ? (
                        <img src={s.avatarUrl} alt="" className="h-6 w-6 rounded-full object-cover" />
                      ) : (
                        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary-50 text-xs font-bold text-primary">
                          {s.name.charAt(0).toUpperCase()}
                        </span>
                      )}
                      {s.name}
                      <button
                        type="button"
                        onClick={() => detachSpeaker(s.id)}
                        aria-label={`Remove ${s.name}`}
                        className="text-muted transition-colors hover:text-status-red"
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              )}
              <div className="relative">
                <input
                  value={speakerQuery}
                  onChange={(e) => setSpeakerQuery(e.target.value)}
                  placeholder="Type to search speakers..."
                  className={FIELD_CLASS}
                />
                {speakerQuery.trim() && (
                  <div className="absolute left-0 right-0 top-full z-10 mt-1 overflow-hidden rounded-lg border border-line bg-white shadow-lg">
                    {speakerResults
                      .filter((r) => !form.speakers.some((s) => s.id === r.id))
                      .map((r) => (
                        <button
                          key={r.id}
                          type="button"
                          onClick={() => attachSpeaker({ id: r.id, name: r.name, avatarUrl: r.avatarUrl })}
                          className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-ink transition-colors hover:bg-surface"
                        >
                          <span className="font-medium">{r.name}</span>
                          {(r.title || r.company) && (
                            <span className="text-xs text-muted">{[r.title, r.company].filter(Boolean).join(", ")}</span>
                          )}
                        </button>
                      ))}
                    <button
                      type="button"
                      onClick={() => setCreatingSpeaker(true)}
                      className="w-full border-t border-line px-3 py-2 text-left text-sm font-medium text-primary transition-colors hover:bg-primary-50"
                    >
                      + Create new speaker &ldquo;{speakerQuery.trim()}&rdquo;
                    </button>
                  </div>
                )}
              </div>
              <p className="mt-1 text-xs text-muted">Manage the full speaker directory on the Speakers page.</p>
            </div>
          </div>
        </section>

        {/* ② Schedule */}
        <section className="rounded-2xl border border-line bg-white p-6">
          <div className="mb-4">
            <h2 className="text-sm font-semibold text-ink">Schedule</h2>
            <p className="text-xs text-muted">When the event happens and when registration is open.</p>
          </div>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="mb-1 block text-xs font-semibold text-muted">Starts At</label>
                <input required type="datetime-local" value={form.startsAt} onChange={(e) => set("startsAt", e.target.value)} className={FIELD_CLASS} />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-muted">Ends At</label>
                <input required type="datetime-local" value={form.endsAt} onChange={(e) => set("endsAt", e.target.value)} className={FIELD_CLASS} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="mb-1 block text-xs font-semibold text-muted">Registration Opens At</label>
                <input type="datetime-local" value={form.registrationOpensAt} onChange={(e) => set("registrationOpensAt", e.target.value)} className={FIELD_CLASS} />
                <p className="mt-1 text-xs text-muted">When registration auto-opens after publishing. Leave blank to open immediately on publish.</p>
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-muted">Registration Deadline</label>
                <input type="datetime-local" value={form.registrationDeadline} onChange={(e) => set("registrationDeadline", e.target.value)} className={FIELD_CLASS} />
              </div>
            </div>
          </div>
        </section>

        {/* ③ Behavior */}
        <section className="rounded-2xl border border-line bg-white p-6">
          <div className="mb-4">
            <h2 className="text-sm font-semibold text-ink">Behavior</h2>
            <p className="text-xs text-muted">How registration and event modules operate.</p>
          </div>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="mb-1 block text-xs font-semibold text-muted">Capacity</label>
                <input type="number" min={0} value={form.capacity} onChange={(e) => set("capacity", e.target.value)} className={FIELD_CLASS} />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-muted">Selection Mode</label>
              <div className="flex gap-3">
                {SELECTION_OPTIONS.map((opt) => (
                  <label
                    key={opt.value}
                    className={`flex-1 cursor-pointer rounded-lg border p-3 transition ${
                      form.selectionMode === opt.value ? "border-primary bg-primary-50" : "border-line bg-surface hover:border-primary/40"
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      <input type="radio" name="selectionMode" value={opt.value} checked={form.selectionMode === opt.value} onChange={() => set("selectionMode", opt.value)} />
                      <span className="text-sm font-semibold text-ink">{opt.label}</span>
                    </span>
                    <span className="mt-1 block pl-6 text-xs text-muted">{opt.hint}</span>
                  </label>
                ))}
              </div>
            </div>
            <div className="space-y-2 pt-1">
              <label className="flex items-center gap-2 text-sm text-ink">
                <input type="checkbox" checked={form.showRemainingSeats} onChange={(e) => set("showRemainingSeats", e.target.checked)} />
                Show remaining seat count to participants
              </label>
              <label className="flex items-center gap-2 text-sm text-ink">
                <input type="checkbox" checked={form.waitingListEnabled} onChange={(e) => set("waitingListEnabled", e.target.checked)} />
                Enable waiting list when full
              </label>
              <label className="flex items-center gap-2 text-sm text-ink">
                <input type="checkbox" checked={form.hasSpeedDating} onChange={(e) => set("hasSpeedDating", e.target.checked)} />
                Enable Speed Dating
              </label>
              <label className="flex items-center gap-2 text-sm text-ink">
                <input type="checkbox" checked={form.enableCertificate} onChange={(e) => set("enableCertificate", e.target.checked)} />
                Enable Certificate
              </label>
              <label className="flex items-center gap-2 text-sm text-ink">
                <input type="checkbox" checked={form.enableFeedback} onChange={(e) => set("enableFeedback", e.target.checked)} />
                Enable Feedback
              </label>
            </div>
          </div>
        </section>

        <button
          type="submit"
          disabled={saving}
          className="rounded-full bg-primary px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-primary-dark disabled:opacity-60"
        >
          {saving ? "Saving…" : "Create Event"}
        </button>
      </form>

      {creatingCategory && (
        <CategoryFormModal
          category={null}
          initialName={categoryQuery.trim()}
          onClose={() => setCreatingCategory(false)}
          onSaved={(c) => {
            setCreatingCategory(false);
            selectCategory(c);
          }}
        />
      )}
      {creatingSpeaker && (
        <SpeakerFormModal
          speaker={null}
          onClose={() => setCreatingSpeaker(false)}
          onSaved={(s) => {
            setCreatingSpeaker(false);
            attachSpeaker({ id: s.id, name: s.name, avatarUrl: s.avatarUrl });
          }}
        />
      )}
    </div>
  );
```

- [ ] **Step 6: Typecheck**

Run: `pnpm --filter @repo/frontend exec tsc --noEmit`
Expected: exit 0, no errors.

- [ ] **Step 7: Browser verify** (admin :5184, backend :4001 via preview_start `.claude/launch.json`; reseed not required). Go to New Event: confirm three section cards render; upload a banner + thumbnail; search + attach a speaker (and the "+ Create new speaker" modal path); pick **Curated**; set Registration Opens At; enter an **out-of-order** date pair (e.g. endsAt before startsAt) and confirm submit is blocked with an inline red message; fix it, submit, and confirm redirect to the new event and that its workspace shows the banner, speaker, and Curated selection. Capture one screenshot of the sectioned form.

- [ ] **Step 8: Commit**

```bash
git add apps/frontend/src/pages/events/EventFormPage.tsx
git commit -m "feat(admin-fe): restructure New Event form into Identity/Schedule/Behavior + new fields"
```

---

### Task 3: Overview tab — Identity/Schedule sections + `registrationOpensAt` (`OverviewTab.tsx`)

**Suggested model:** standard.

**Files:**
- Modify: `apps/frontend/src/pages/events/workspace/OverviewTab.tsx`

**Interfaces:**
- Consumes: `validateEventDates` (Task 1). Does **not** add `selectionMode` (that is Task 4, on Settings) or any Behavior control.

- [ ] **Step 1: Add the import** — add to the existing top imports:

```tsx
import { validateEventDates } from "@repo/shared-utils";
```

- [ ] **Step 2: Add `registrationOpensAt` to `FormState` and `fromEvent`.** In `interface FormState`, add after `registrationDeadline: string;`:

```tsx
  registrationOpensAt: string;
```

In `fromEvent`, add after the `registrationDeadline:` line:

```tsx
    registrationOpensAt: toInputDateTime(e.registrationOpensAt),
```

- [ ] **Step 3: Validate dates + send `registrationOpensAt` in `onSubmit`.** At the very top of `onSubmit`, right after `setError(null);`, insert:

```tsx
    const dateError = validateEventDates({
      registrationOpensAt: form.registrationOpensAt,
      registrationDeadline: form.registrationDeadline,
      startsAt: form.startsAt,
      endsAt: form.endsAt,
    });
    if (dateError) {
      setError(dateError);
      return;
    }
```

In the `payload` object, add after the `registrationDeadline:` entry:

```tsx
        registrationOpensAt: form.registrationOpensAt ? new Date(form.registrationOpensAt).toISOString() : null,
```

- [ ] **Step 4: Wrap the form fields into Identity + Schedule sections.** Replace the current `<form ...>...</form>` block (the `<h2>Event Information</h2>` heading + the flat card) with two section cards. Keep the KPI `StatCard` grid above and the two modals below **unchanged**. The new form:

```tsx
      <form onSubmit={onSubmit} className="mt-6 space-y-6">
        {/* ① Identity */}
        <section className="rounded-2xl border border-line bg-white p-6">
          <div className="mb-4">
            <h2 className="text-sm font-semibold text-ink">Identity</h2>
            <p className="text-xs text-muted">What the event is and its content.</p>
          </div>
          <div className="space-y-4">
            <div>
              <label className="mb-1 block text-xs font-semibold text-muted">Title</label>
              <input required value={form.title} onChange={(e) => set("title", e.target.value)} className={FIELD_CLASS} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-muted">Subtitle</label>
              <input value={form.subtitle} onChange={(e) => set("subtitle", e.target.value)} className={FIELD_CLASS} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="mb-1 block text-xs font-semibold text-muted">Category</label>
                <div className="relative">
                  <input
                    required
                    value={categoryQuery || form.categoryName}
                    onChange={(e) => {
                      setCategoryQuery(e.target.value);
                      set("categoryName", "");
                      set("categoryId", "");
                    }}
                    placeholder="Type to search categories..."
                    className={FIELD_CLASS}
                  />
                  {categoryQuery.trim() && (
                    <div className="absolute left-0 right-0 top-full z-10 mt-1 overflow-hidden rounded-lg border border-line bg-white shadow-lg">
                      {categoryResults.map((c) => (
                        <button key={c.id} type="button" onClick={() => selectCategory(c)} className="flex w-full items-center px-3 py-2 text-left text-sm text-ink transition-colors hover:bg-surface">
                          {c.name}
                        </button>
                      ))}
                      <button type="button" onClick={() => setCreatingCategory(true)} className="w-full border-t border-line px-3 py-2 text-left text-sm font-medium text-primary transition-colors hover:bg-primary-50">
                        + Create new category &ldquo;{categoryQuery.trim()}&rdquo;
                      </button>
                    </div>
                  )}
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-muted">Location</label>
                <input required value={form.location} onChange={(e) => set("location", e.target.value)} className={FIELD_CLASS} />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-muted">Venue</label>
              <input value={form.venue} onChange={(e) => set("venue", e.target.value)} className={FIELD_CLASS} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-muted">Speakers</label>
              {form.speakers.length > 0 && (
                <div className="mb-2 flex flex-wrap gap-2">
                  {form.speakers.map((s) => (
                    <span key={s.id} className="inline-flex items-center gap-2 rounded-full border border-line bg-surface py-1 pl-1 pr-2 text-sm text-ink">
                      {s.avatarUrl ? (
                        <img src={s.avatarUrl} alt="" className="h-6 w-6 rounded-full object-cover" />
                      ) : (
                        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary-50 text-xs font-bold text-primary">{s.name.charAt(0).toUpperCase()}</span>
                      )}
                      {s.name}
                      <button type="button" onClick={() => detachSpeaker(s.id)} aria-label={`Remove ${s.name}`} className="text-muted transition-colors hover:text-status-red">
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              )}
              <div className="relative">
                <input value={speakerQuery} onChange={(e) => setSpeakerQuery(e.target.value)} placeholder="Type to search speakers..." className={FIELD_CLASS} />
                {speakerQuery.trim() && (
                  <div className="absolute left-0 right-0 top-full z-10 mt-1 overflow-hidden rounded-lg border border-line bg-white shadow-lg">
                    {speakerResults
                      .filter((r) => !form.speakers.some((s) => s.id === r.id))
                      .map((r) => (
                        <button key={r.id} type="button" onClick={() => attachSpeaker({ id: r.id, name: r.name, avatarUrl: r.avatarUrl })} className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-ink transition-colors hover:bg-surface">
                          <span className="font-medium">{r.name}</span>
                          {(r.title || r.company) && <span className="text-xs text-muted">{[r.title, r.company].filter(Boolean).join(", ")}</span>}
                        </button>
                      ))}
                    <button type="button" onClick={() => setCreatingSpeaker(true)} className="w-full border-t border-line px-3 py-2 text-left text-sm font-medium text-primary transition-colors hover:bg-primary-50">
                      + Create new speaker &ldquo;{speakerQuery.trim()}&rdquo;
                    </button>
                  </div>
                )}
              </div>
              <p className="mt-1 text-xs text-muted">Manage the full speaker directory on the Speakers page.</p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <ImageUploadField label="Hero Banner" value={form.bannerUrl} onChange={(url) => set("bannerUrl", url)} aspect="16 / 9" helpText="Large image shown on the event hero banner." />
              <ImageUploadField label="Thumbnail" value={form.thumbnailUrl} onChange={(url) => set("thumbnailUrl", url)} aspect="4 / 3" helpText="Small image for event lists/cards. Falls back to the hero banner when unset." />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-muted">Description</label>
              <textarea required value={form.description} onChange={(e) => set("description", e.target.value)} className={TEXTAREA_CLASS} />
            </div>
          </div>
        </section>

        {/* ② Schedule */}
        <section className="rounded-2xl border border-line bg-white p-6">
          <div className="mb-4">
            <h2 className="text-sm font-semibold text-ink">Schedule</h2>
            <p className="text-xs text-muted">When the event happens and when registration is open.</p>
          </div>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="mb-1 block text-xs font-semibold text-muted">Starts At</label>
                <input required type="datetime-local" value={form.startsAt} onChange={(e) => set("startsAt", e.target.value)} className={FIELD_CLASS} />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-muted">Ends At</label>
                <input required type="datetime-local" value={form.endsAt} onChange={(e) => set("endsAt", e.target.value)} className={FIELD_CLASS} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="mb-1 block text-xs font-semibold text-muted">Registration Opens At</label>
                <input type="datetime-local" value={form.registrationOpensAt} onChange={(e) => set("registrationOpensAt", e.target.value)} className={FIELD_CLASS} />
                <p className="mt-1 text-xs text-muted">When registration auto-opens after publishing. Leave blank to open immediately on publish.</p>
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-muted">Registration Deadline</label>
                <input type="datetime-local" value={form.registrationDeadline} onChange={(e) => set("registrationDeadline", e.target.value)} className={FIELD_CLASS} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="mb-1 block text-xs font-semibold text-muted">Capacity</label>
                <input type="number" min={0} value={form.capacity} onChange={(e) => set("capacity", e.target.value)} className={FIELD_CLASS} />
              </div>
            </div>
          </div>
        </section>

        <div>
          <button
            type="submit"
            disabled={saving}
            className="rounded-full bg-primary px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-primary-dark disabled:opacity-60"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </form>
```

(Note: the previous standalone `<div className="mt-6"><h2>Event Information</h2></div>` heading is removed — the section headers replace it. The `{error && ...}` line stays where it is, just above the form.)

- [ ] **Step 5: Typecheck**

Run: `pnpm --filter @repo/frontend exec tsc --noEmit`
Expected: exit 0.

- [ ] **Step 6: Browser verify** — open an existing event's workspace → Overview: confirm the KPI cards still render above, and the form now shows Identity + Schedule section cards; confirm **Registration Opens At** is present and pre-filled if the event has one; edit it and Save (toast appears); enter an out-of-order date and confirm Save is blocked with an inline message.

- [ ] **Step 7: Commit**

```bash
git add apps/frontend/src/pages/events/workspace/OverviewTab.tsx
git commit -m "feat(admin-fe): section the Overview tab and add editable Registration Opens At"
```

---

### Task 4: Settings tab — explicit Selection Mode + decoupled seat toggle (`SettingsTab.tsx`)

**Suggested model:** standard.

**Files:**
- Modify: `apps/frontend/src/pages/events/workspace/SettingsTab.tsx`

**Interfaces:**
- Consumes: `SelectionMode` type. Adds `selectionMode` to the PATCH payload; replaces the `shortlistRequired` (inverted) checkbox with a direct `showRemainingSeats` toggle. No date validation (Settings edits no dates).

- [ ] **Step 1: Imports + `SELECTION_OPTIONS`.** Add `SelectionMode` to the type import from `@repo/shared-types`, and add the `SELECTION_OPTIONS` const (from Global Constraints) at module level, above the component:

```tsx
import type { AdminEventInput, EventDisplayConfig, EventDTO, SelectionMode } from "@repo/shared-types";
```

```tsx
const SELECTION_OPTIONS = [
  { value: "FCFS", label: "First-come-first-served", hint: "Registrations are auto-approved up to capacity." },
  { value: "CURATED", label: "Curated (admin shortlists)", hint: "Registrations wait for admin shortlisting." },
] as const;
```

- [ ] **Step 2: Replace the `shortlistRequired` state with `selectionMode` + a direct `showRemainingSeats`.** Replace this line:

```tsx
  const [shortlistRequired, setShortlistRequired] = useState(!event.showRemainingSeats);
```

with:

```tsx
  const [selectionMode, setSelectionMode] = useState<SelectionMode>(event.selectionMode);
  const [showRemainingSeats, setShowRemainingSeats] = useState(event.showRemainingSeats);
```

- [ ] **Step 3: Update the payload in `onSave`.** Replace:

```tsx
        showRemainingSeats: !shortlistRequired,
```

with:

```tsx
        showRemainingSeats,
        selectionMode,
```

- [ ] **Step 4: Replace the "Shortlist required" checkbox with the Selection Mode control + a direct seat toggle.** In the first card's `<div className="mt-4 space-y-2">` block, replace this label:

```tsx
          <label className="flex items-center gap-2 text-sm text-ink">
            <input type="checkbox" checked={shortlistRequired} onChange={(e) => setShortlistRequired(e.target.checked)} />
            Shortlist required (hides remaining-seats counter, every registrant waits for review)
          </label>
```

with the Selection Mode radio (placed just above the checkbox row is fine — put the radio block immediately before the `<div className="mt-4 space-y-2">`, and the seat toggle inside it). Concretely, insert this block **before** the `<div className="mt-4 space-y-2">`:

```tsx
        <div className="mt-4">
          <label className="mb-1 block text-xs font-semibold text-muted">Selection Mode</label>
          <div className="flex gap-3">
            {SELECTION_OPTIONS.map((opt) => (
              <label
                key={opt.value}
                className={`flex-1 cursor-pointer rounded-lg border p-3 transition ${
                  selectionMode === opt.value ? "border-primary bg-primary-50" : "border-line bg-surface hover:border-primary/40"
                }`}
              >
                <span className="flex items-center gap-2">
                  <input type="radio" name="selectionMode" value={opt.value} checked={selectionMode === opt.value} onChange={() => setSelectionMode(opt.value)} />
                  <span className="text-sm font-semibold text-ink">{opt.label}</span>
                </span>
                <span className="mt-1 block pl-6 text-xs text-muted">{opt.hint}</span>
              </label>
            ))}
          </div>
        </div>
```

and replace the removed "Shortlist required" label with this direct seat toggle (keep it in the same `space-y-2` list, in the position the old checkbox occupied):

```tsx
          <label className="flex items-center gap-2 text-sm text-ink">
            <input type="checkbox" checked={showRemainingSeats} onChange={(e) => setShowRemainingSeats(e.target.checked)} />
            Show remaining seat count to participants
          </label>
```

- [ ] **Step 5: Typecheck**

Run: `pnpm --filter @repo/frontend exec tsc --noEmit`
Expected: exit 0.

- [ ] **Step 6: Browser verify** — open an event workspace → Settings: confirm the Selection Mode radio renders and reflects the event's current mode; confirm the "Show remaining seat count" checkbox reflects `showRemainingSeats` (a Curated/seats-hidden event shows it unchecked); toggle both, Save (toast), reload, and confirm both round-trip. Confirm there is no longer a "Shortlist required" checkbox.

- [ ] **Step 7: Commit**

```bash
git add apps/frontend/src/pages/events/workspace/SettingsTab.tsx
git commit -m "feat(admin-fe): explicit Selection Mode on Settings, decouple show-remaining-seats"
```

---

### Task 5: Final verification

**Suggested model:** controller (verification only; no code unless a defect is found).

**Files:** none (verification).

- [ ] **Step 1: Full frontend typecheck**

Run: `pnpm --filter @repo/frontend exec tsc --noEmit`
Expected: exit 0, zero errors across the whole package.

- [ ] **Step 2: shared-utils tests**

Run: `pnpm --filter @repo/shared-utils test`
Expected: all green (including the new `validateEventDates` cases and pre-existing date/statusColor tests).

- [ ] **Step 3: Backend regression (guard against accidental cross-package breakage)**

Run: `pnpm --filter @repo/backend test`
Expected: 22 files / 154 tests pass (unchanged — P6 touches no backend).

- [ ] **Step 4: End-to-end browser walkthrough** (admin :5184, backend :4001; portal :5183 for the sanity check). Drive the full create flow with every new field, then the Overview and Settings edits, confirming persistence and the datetime guard, per the spec's Verification section. Then load the portal and confirm a Curated / seats-hidden event still renders correctly (no P4 seat-visibility/badge regression).

- [ ] **Step 5: Report** P6 implemented, reviewed, verified — ready for the final whole-branch review + merge.
