# Speaker Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give admins a global Speaker Management page (full CRUD) and a speaker picker on each event's Overview tab, writing to the existing `Speaker` Prisma model that the participant portal already reads.

**Architecture:** Purely additive — the `Speaker` model, `SpeakerDTO`, and all read plumbing already exist; we add a write API (`/api/admin/speakers`), a `speakerIds` field on the existing event create/update endpoints (full-replace `set` semantics), a `/speakers` admin page, and an attach-picker section in the Event Workspace Overview tab. One shared `SpeakerFormModal` component serves both the management page and the inline "create new speaker" flow in the picker.

**Tech Stack:** Express + Prisma + Zod (backend), Vitest + Supertest (integration tests, require running seeded Postgres on :5432), React + Vite + Tailwind (admin frontend), pnpm workspaces.

## Global Constraints

- Repo root: `D:\BlibliTalk-2.0\bliblitalk-admin`. All paths below are relative to it. Run pnpm commands from this root.
- Backend tests are integration tests: they need the Postgres from `docker-compose.yml` up and the DB seeded. If port 4001 dev server is running, that's fine — tests use their own app instance.
- All admin speaker routes gate on `Permission.EVENT_UPDATE` (from `@repo/auth`). Do NOT invent a new permission.
- Zod schemas live in `packages/shared-types/src/schemas.ts` and are the single source of truth; backend `validate()` middleware replaces `req.body` with the parsed result.
- Buttons in the admin UI use full-pill `rounded-full` (Blibli style); form fields use `FIELD_CLASS`/`TEXTAREA_CLASS` from `apps/frontend/src/pages/events/workspace/fieldStyles.ts`.
- Commit after each task with a conventional-commit message. Never `--no-verify`.

---

### Task 1: Shared types — speaker input schemas + `speakerIds` on event inputs

**Files:**
- Modify: `packages/shared-types/src/schemas.ts`

**Interfaces:**
- Produces: `CreateSpeakerInput` (zod + type), `UpdateSpeakerInput` (zod + type), `AdminSpeakerDTO` (zod + type: `SpeakerDTO` + `eventCount: number`), and `speakerIds?: string[]` on `AdminEventInput` (flows to `AdminEventUpdateInput` via `.partial()`).
- Consumes: existing `SpeakerDTO` already defined at lines 56–67 of the same file.

- [ ] **Step 1: Add the speaker input schemas**

In `packages/shared-types/src/schemas.ts`, directly below the existing `SpeakerDTO` block (after its `export type SpeakerDTO = ...` line), add:

```ts
export const CreateSpeakerInput = z.object({
  name: z.string().min(1, "Name is required"),
  title: z.string().optional().nullable(),
  company: z.string().optional().nullable(),
  bioShort: z.string().optional().nullable(),
  bioLong: z.string().optional().nullable(),
  credentials: z.array(z.string()).optional().default([]),
  avatarUrl: z.string().optional().nullable(),
  featured: z.boolean().optional().default(false),
});
export type CreateSpeakerInput = z.infer<typeof CreateSpeakerInput>;

export const UpdateSpeakerInput = CreateSpeakerInput.partial();
export type UpdateSpeakerInput = z.infer<typeof UpdateSpeakerInput>;

/** Speaker row for the admin management page — DTO plus usage count. */
export const AdminSpeakerDTO = SpeakerDTO.extend({
  eventCount: z.number().int(),
});
export type AdminSpeakerDTO = z.infer<typeof AdminSpeakerDTO>;
```

- [ ] **Step 2: Add `speakerIds` to `AdminEventInput`**

In the same file, inside the `AdminEventInput` z.object (lines ~289–330), add one field alongside `galleryImages`:

```ts
  speakerIds: z.array(z.string()).optional(),
```

`AdminEventUpdateInput = AdminEventInput.partial()` already exists below it — no change needed there.

- [ ] **Step 3: Typecheck the package consumers**

Run: `pnpm --filter @repo/backend typecheck && pnpm --filter @repo/frontend typecheck`
Expected: both PASS (additive change only).

- [ ] **Step 4: Commit**

```bash
git add packages/shared-types/src/schemas.ts
git commit -m "feat(shared-types): speaker CRUD input schemas + speakerIds on event input"
```

---

### Task 2: Backend — speaker CRUD service, routes, and tests

**Files:**
- Create: `apps/backend/src/routes/admin/adminSpeakers.service.ts`
- Create: `apps/backend/src/routes/admin/adminSpeakers.routes.ts`
- Create: `apps/backend/src/routes/admin/adminSpeakers.routes.test.ts`
- Modify: `apps/backend/src/app.ts` (register routes)

**Interfaces:**
- Consumes: `CreateSpeakerInput`, `UpdateSpeakerInput`, `AdminSpeakerDTO` from Task 1; `toSpeakerDTO` from `../../lib/shared/mappers`; `AppError` from `../../middleware/error`; `requireAuth`, `requirePermission` from `../../middleware/requireAuth`; `validate` from `../../middleware/validate`.
- Produces: HTTP API `GET/POST /api/admin/speakers`, `PATCH/DELETE /api/admin/speakers/:id` returning `AdminSpeakerDTO` shapes. Service functions `listSpeakers(q?)`, `createSpeaker(input)`, `updateSpeaker(id, input)`, `deleteSpeaker(id)`.

- [ ] **Step 1: Write the failing integration test**

Create `apps/backend/src/routes/admin/adminSpeakers.routes.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterAll } from "vitest";
import request from "supertest";
import { createApp } from "../../app";
import { prisma } from "../../db/client";

const TEST_PREFIX = "Speaker CRUD Test ";

async function purgeSyntheticSpeakers() {
  await prisma.speaker.deleteMany({ where: { name: { startsWith: TEST_PREFIX } } });
}

// Integration — requires a running, seeded Postgres.
describe("admin speakers CRUD", () => {
  const app = createApp();

  beforeEach(purgeSyntheticSpeakers);
  afterAll(purgeSyntheticSpeakers);

  async function loginAs(email: string) {
    const agent = request.agent(app);
    await agent.post("/api/auth/login").send({ email, password: "password123" });
    return agent;
  }

  it("requires auth", async () => {
    const res = await request(app).get("/api/admin/speakers");
    expect(res.status).toBe(401);
  });

  it("rejects participants (no permission)", async () => {
    const agent = await loginAs("demo@gdn-commerce.com");
    const res = await agent.get("/api/admin/speakers");
    expect(res.status).toBe(403);
  });

  it("creates a speaker with full profile and lists it with eventCount 0", async () => {
    const agent = await loginAs("superadmin@gdn-commerce.com");
    const created = await agent.post("/api/admin/speakers").send({
      name: `${TEST_PREFIX}Jane`,
      title: "VP Engineering",
      company: "Blibli",
      bioShort: "Short bio",
      credentials: ["10y engineering", "Speaker at TechConf"],
      featured: true,
    });
    expect(created.status).toBe(201);
    expect(created.body.name).toBe(`${TEST_PREFIX}Jane`);
    expect(created.body.featured).toBe(true);
    expect(created.body.eventCount).toBe(0);

    const list = await agent.get(`/api/admin/speakers?q=${encodeURIComponent(TEST_PREFIX)}`);
    expect(list.status).toBe(200);
    expect(list.body.some((s: { id: string }) => s.id === created.body.id)).toBe(true);
  });

  it("rejects a nameless speaker with 422", async () => {
    const agent = await loginAs("superadmin@gdn-commerce.com");
    const res = await agent.post("/api/admin/speakers").send({ title: "No name" });
    expect(res.status).toBe(422);
  });

  it("updates a speaker via PATCH", async () => {
    const agent = await loginAs("superadmin@gdn-commerce.com");
    const created = await agent.post("/api/admin/speakers").send({ name: `${TEST_PREFIX}Patch` });
    const res = await agent
      .patch(`/api/admin/speakers/${created.body.id}`)
      .send({ company: "GDN", featured: true });
    expect(res.status).toBe(200);
    expect(res.body.company).toBe("GDN");
    expect(res.body.featured).toBe(true);
  });

  it("deletes a speaker", async () => {
    const agent = await loginAs("superadmin@gdn-commerce.com");
    const created = await agent.post("/api/admin/speakers").send({ name: `${TEST_PREFIX}Delete` });
    const res = await agent.delete(`/api/admin/speakers/${created.body.id}`);
    expect(res.status).toBe(204);
    const gone = await prisma.speaker.findUnique({ where: { id: created.body.id } });
    expect(gone).toBeNull();
  });

  it("404s on updating a missing speaker", async () => {
    const agent = await loginAs("superadmin@gdn-commerce.com");
    const res = await agent.patch("/api/admin/speakers/nonexistent-id").send({ name: "X" });
    expect(res.status).toBe(404);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run (from repo root): `pnpm --filter @repo/backend exec vitest run src/routes/admin/adminSpeakers.routes.test.ts`
Expected: FAIL — the `/api/admin/speakers` routes don't exist yet, so the auth test gets 404 instead of 401 (or similar).

- [ ] **Step 3: Write the service**

Create `apps/backend/src/routes/admin/adminSpeakers.service.ts`:

```ts
import type { AdminSpeakerDTO, CreateSpeakerInput, UpdateSpeakerInput } from "@repo/shared-types";
import { prisma } from "../../db/client";
import { AppError } from "../../middleware/error";
import { toSpeakerDTO } from "../../lib/shared/mappers";

type SpeakerWithCount = Parameters<typeof toSpeakerDTO>[0] & {
  _count: { events: number };
};

function toAdminSpeakerDTO(s: SpeakerWithCount): AdminSpeakerDTO {
  return { ...toSpeakerDTO(s), eventCount: s._count.events };
}

const speakerInclude = { _count: { select: { events: true } } } as const;

export async function listSpeakers(q?: string): Promise<AdminSpeakerDTO[]> {
  const speakers = await prisma.speaker.findMany({
    where: q ? { name: { contains: q, mode: "insensitive" } } : undefined,
    include: speakerInclude,
    orderBy: { name: "asc" },
  });
  return speakers.map(toAdminSpeakerDTO);
}

export async function createSpeaker(input: CreateSpeakerInput): Promise<AdminSpeakerDTO> {
  const speaker = await prisma.speaker.create({
    data: {
      name: input.name,
      title: input.title ?? null,
      company: input.company ?? null,
      bioShort: input.bioShort ?? null,
      bioLong: input.bioLong ?? null,
      credentials: input.credentials,
      avatarUrl: input.avatarUrl ?? null,
      featured: input.featured,
    },
    include: speakerInclude,
  });
  return toAdminSpeakerDTO(speaker);
}

export async function updateSpeaker(id: string, input: UpdateSpeakerInput): Promise<AdminSpeakerDTO> {
  const existing = await prisma.speaker.findUnique({ where: { id } });
  if (!existing) throw new AppError("NOT_FOUND", "Speaker not found", 404);

  const speaker = await prisma.speaker.update({
    where: { id },
    data: {
      ...(input.name !== undefined && { name: input.name }),
      ...(input.title !== undefined && { title: input.title }),
      ...(input.company !== undefined && { company: input.company }),
      ...(input.bioShort !== undefined && { bioShort: input.bioShort }),
      ...(input.bioLong !== undefined && { bioLong: input.bioLong }),
      ...(input.credentials !== undefined && { credentials: input.credentials }),
      ...(input.avatarUrl !== undefined && { avatarUrl: input.avatarUrl }),
      ...(input.featured !== undefined && { featured: input.featured }),
    },
    include: speakerInclude,
  });
  return toAdminSpeakerDTO(speaker);
}

/** Implicit m-n relation auto-detaches from events on delete — no FK violation possible. */
export async function deleteSpeaker(id: string): Promise<void> {
  const existing = await prisma.speaker.findUnique({ where: { id } });
  if (!existing) throw new AppError("NOT_FOUND", "Speaker not found", 404);
  await prisma.speaker.delete({ where: { id } });
}
```

- [ ] **Step 4: Write the routes**

Create `apps/backend/src/routes/admin/adminSpeakers.routes.ts`:

```ts
import { Router } from "express";
import { CreateSpeakerInput, UpdateSpeakerInput } from "@repo/shared-types";
import { Permission } from "@repo/auth";
import { requireAuth, requirePermission } from "../../middleware/requireAuth";
import { validate } from "../../middleware/validate";
import { createSpeaker, deleteSpeaker, listSpeakers, updateSpeaker } from "./adminSpeakers.service";

export const adminSpeakersRoutes = Router();

// GET /admin/speakers?q=jane
adminSpeakersRoutes.get(
  "/speakers",
  requireAuth,
  requirePermission(Permission.EVENT_UPDATE),
  async (req, res, next) => {
    try {
      const q = typeof req.query.q === "string" ? req.query.q : undefined;
      res.json(await listSpeakers(q));
    } catch (err) {
      next(err);
    }
  },
);

// POST /admin/speakers
adminSpeakersRoutes.post(
  "/speakers",
  requireAuth,
  requirePermission(Permission.EVENT_UPDATE),
  validate(CreateSpeakerInput),
  async (req, res, next) => {
    try {
      res.status(201).json(await createSpeaker(req.body as CreateSpeakerInput));
    } catch (err) {
      next(err);
    }
  },
);

// PATCH /admin/speakers/:id
adminSpeakersRoutes.patch(
  "/speakers/:id",
  requireAuth,
  requirePermission(Permission.EVENT_UPDATE),
  validate(UpdateSpeakerInput),
  async (req, res, next) => {
    try {
      res.json(await updateSpeaker(req.params.id!, req.body as UpdateSpeakerInput));
    } catch (err) {
      next(err);
    }
  },
);

// DELETE /admin/speakers/:id
adminSpeakersRoutes.delete(
  "/speakers/:id",
  requireAuth,
  requirePermission(Permission.EVENT_UPDATE),
  async (req, res, next) => {
    try {
      await deleteSpeaker(req.params.id!);
      res.status(204).end();
    } catch (err) {
      next(err);
    }
  },
);
```

- [ ] **Step 5: Register the routes in `app.ts`**

In `apps/backend/src/app.ts`, add the import alongside the other admin route imports (after line 28's `adminRemindersRoutes` import):

```ts
import { adminSpeakersRoutes } from "./routes/admin/adminSpeakers.routes";
```

and mount it with the other `/api/admin` routers (after line 80's `adminRemindersRoutes` mount):

```ts
  app.use("/api/admin", adminSpeakersRoutes);
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `pnpm --filter @repo/backend exec vitest run src/routes/admin/adminSpeakers.routes.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 7: Typecheck + commit**

Run: `pnpm --filter @repo/backend typecheck`
Expected: PASS.

```bash
git add apps/backend/src/routes/admin/adminSpeakers.service.ts apps/backend/src/routes/admin/adminSpeakers.routes.ts apps/backend/src/routes/admin/adminSpeakers.routes.test.ts apps/backend/src/app.ts
git commit -m "feat(backend): admin speaker CRUD API"
```

---

### Task 3: Backend — `speakerIds` attach/detach on event create/update

**Files:**
- Modify: `apps/backend/src/routes/admin/adminEvents.service.ts`
- Modify: `apps/backend/src/routes/admin/adminEvents.routes.test.ts` (add one test)

**Interfaces:**
- Consumes: `speakerIds?: string[]` on `AdminEventInput`/`AdminEventUpdateInput` (Task 1).
- Produces: `POST /api/admin/events` and `PATCH /api/admin/events/:id` accept `speakerIds`; response `EventDTO.speakers` reflects the attached set (full-replace semantics).

- [ ] **Step 1: Add the failing test**

Append inside the existing `describe("admin events CRUD", ...)` block in `apps/backend/src/routes/admin/adminEvents.routes.test.ts` (the file already has `loginAs`, `validPayload`, `TEST_SLUG_PREFIX` helpers — reuse them):

```ts
  it("attaches and replaces speakers via speakerIds", async () => {
    const agent = await loginAs("superadmin@gdn-commerce.com");
    const s1 = await agent.post("/api/admin/speakers").send({ name: `${TEST_SLUG_PREFIX}speaker-1` });
    const s2 = await agent.post("/api/admin/speakers").send({ name: `${TEST_SLUG_PREFIX}speaker-2` });

    const created = await agent
      .post("/api/admin/events")
      .send(validPayload({ slug: `${TEST_SLUG_PREFIX}with-speakers`, speakerIds: [s1.body.id] }));
    expect(created.status).toBe(201);
    expect(created.body.speakers.map((s: { id: string }) => s.id)).toEqual([s1.body.id]);

    // Full-replace: s2 in, s1 out.
    const patched = await agent
      .patch(`/api/admin/events/${created.body.id}`)
      .send({ speakerIds: [s2.body.id] });
    expect(patched.status).toBe(200);
    expect(patched.body.speakers.map((s: { id: string }) => s.id)).toEqual([s2.body.id]);

    await prisma.speaker.deleteMany({ where: { name: { startsWith: TEST_SLUG_PREFIX } } });
  });
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @repo/backend exec vitest run src/routes/admin/adminEvents.routes.test.ts -t "attaches and replaces speakers"`
Expected: FAIL — `created.body.speakers` is `[]` because the service ignores `speakerIds`.

- [ ] **Step 3: Implement in the service**

In `apps/backend/src/routes/admin/adminEvents.service.ts`:

In `createAdminEvent`'s `data` object, after the `admins: { connect: [{ id: ownerId }] },` line add:

```ts
      ...(input.speakerIds !== undefined && {
        speakers: { connect: input.speakerIds.map((id) => ({ id })) },
      }),
```

In `updateAdminEvent`'s `data` object, after the `...(input.displayConfig !== undefined && { ... }),` entry add:

```ts
      ...(input.speakerIds !== undefined && {
        speakers: { set: input.speakerIds.map((id) => ({ id })) },
      }),
```

(`connect` on create — the relation starts empty; `set` on update — full replace so removals persist.)

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @repo/backend exec vitest run src/routes/admin/adminEvents.routes.test.ts`
Expected: PASS (all tests in the file, including the new one).

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/routes/admin/adminEvents.service.ts apps/backend/src/routes/admin/adminEvents.routes.test.ts
git commit -m "feat(backend): attach/detach event speakers via speakerIds"
```

---

### Task 4: Frontend — MicIcon + shared SpeakerFormModal

**Files:**
- Modify: `apps/frontend/src/components/icons.tsx` (append MicIcon)
- Create: `apps/frontend/src/components/SpeakerFormModal.tsx`

**Interfaces:**
- Consumes: `api`, `ApiRequestError` from `../services/api`; `ImageUploadField` from `./ImageUploadField` (props: `label: string; value: string; onChange: (url: string) => void; helpText?: string; aspect?: string`); `AdminSpeakerDTO`, `CreateSpeakerInput` from `@repo/shared-types`; `FIELD_CLASS`, `TEXTAREA_CLASS` from `../pages/events/workspace/fieldStyles`.
- Produces: `MicIcon` (same `IconProps` pattern as siblings). `SpeakerFormModal` component with props `{ speaker: AdminSpeakerDTO | null; onClose: () => void; onSaved: (speaker: AdminSpeakerDTO) => void }` — `speaker === null` means create mode; `onSaved` receives the created/updated speaker.

- [ ] **Step 1: Add MicIcon**

Append to `apps/frontend/src/components/icons.tsx` (same pattern as existing icons):

```tsx
export const MicIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <rect x="9" y="2" width="6" height="12" rx="3" />
    <path d="M5 10v1a7 7 0 0 0 14 0v-1" />
    <path d="M12 18v4" />
  </svg>
);
```

- [ ] **Step 2: Create SpeakerFormModal**

Create `apps/frontend/src/components/SpeakerFormModal.tsx`:

```tsx
import { useState, type FormEvent } from "react";
import type { AdminSpeakerDTO, CreateSpeakerInput } from "@repo/shared-types";
import { api, ApiRequestError } from "../services/api";
import { ImageUploadField } from "./ImageUploadField";
import { FIELD_CLASS, TEXTAREA_CLASS } from "../pages/events/workspace/fieldStyles";

interface SpeakerFormModalProps {
  /** null = create mode; a speaker = edit mode. */
  speaker: AdminSpeakerDTO | null;
  onClose: () => void;
  onSaved: (speaker: AdminSpeakerDTO) => void;
}

interface FormState {
  name: string;
  title: string;
  company: string;
  bioShort: string;
  bioLong: string;
  credentials: string; // comma-separated in the UI, string[] on the wire
  avatarUrl: string;
  featured: boolean;
}

function fromSpeaker(s: AdminSpeakerDTO | null): FormState {
  return {
    name: s?.name ?? "",
    title: s?.title ?? "",
    company: s?.company ?? "",
    bioShort: s?.bioShort ?? "",
    bioLong: s?.bioLong ?? "",
    credentials: s?.credentials.join(", ") ?? "",
    avatarUrl: s?.avatarUrl ?? "",
    featured: s?.featured ?? false,
  };
}

export function SpeakerFormModal({ speaker, onClose, onSaved }: SpeakerFormModalProps) {
  const [form, setForm] = useState<FormState>(fromSpeaker(speaker));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const payload: CreateSpeakerInput = {
        name: form.name.trim(),
        title: form.title.trim() || null,
        company: form.company.trim() || null,
        bioShort: form.bioShort.trim() || null,
        bioLong: form.bioLong.trim() || null,
        credentials: form.credentials
          .split(",")
          .map((c) => c.trim())
          .filter(Boolean),
        avatarUrl: form.avatarUrl || null,
        featured: form.featured,
      };
      const saved = speaker
        ? await api.patch<AdminSpeakerDTO>(`/admin/speakers/${speaker.id}`, payload)
        : await api.post<AdminSpeakerDTO>("/admin/speakers", payload);
      onSaved(saved);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.apiError.message : "Failed to save speaker.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4" onClick={onClose}>
      <div
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-base font-bold text-ink">{speaker ? "Edit Speaker" : "Add Speaker"}</h2>

        {error && <p className="mt-3 text-sm font-medium text-status-red">{error}</p>}

        <form onSubmit={onSubmit} className="mt-4 space-y-4">
          <ImageUploadField
            label="Photo"
            value={form.avatarUrl}
            onChange={(url) => set("avatarUrl", url)}
            aspect="1 / 1"
            helpText="Square headshot shown on event pages."
          />
          <div>
            <label className="mb-1 block text-xs font-semibold text-muted">Name</label>
            <input required value={form.name} onChange={(e) => set("name", e.target.value)} className={FIELD_CLASS} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-xs font-semibold text-muted">Title</label>
              <input value={form.title} onChange={(e) => set("title", e.target.value)} className={FIELD_CLASS} placeholder="VP Engineering" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-muted">Company</label>
              <input value={form.company} onChange={(e) => set("company", e.target.value)} className={FIELD_CLASS} placeholder="Blibli" />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-muted">Short Bio</label>
            <input value={form.bioShort} onChange={(e) => set("bioShort", e.target.value)} className={FIELD_CLASS} placeholder="One-line intro shown on cards" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-muted">Long Bio</label>
            <textarea value={form.bioLong} onChange={(e) => set("bioLong", e.target.value)} className={TEXTAREA_CLASS} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-muted">Credentials</label>
            <input value={form.credentials} onChange={(e) => set("credentials", e.target.value)} className={FIELD_CLASS} placeholder="Comma-separated, e.g. 10y engineering, TEDx speaker" />
          </div>
          <label className="flex items-center gap-2 text-sm text-ink">
            <input type="checkbox" checked={form.featured} onChange={(e) => set("featured", e.target.checked)} />
            Featured speaker
          </label>

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
              disabled={saving}
              className="rounded-full bg-primary px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-primary-dark disabled:opacity-60"
            >
              {saving ? "Saving…" : "Save Speaker"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter @repo/frontend typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/frontend/src/components/icons.tsx apps/frontend/src/components/SpeakerFormModal.tsx
git commit -m "feat(admin): MicIcon + shared SpeakerFormModal component"
```

---

### Task 5: Frontend — Speakers page, route, and sidebar entry

**Files:**
- Create: `apps/frontend/src/pages/speakers/SpeakersPage.tsx`
- Modify: `apps/frontend/src/app/App.tsx` (route)
- Modify: `apps/frontend/src/layouts/AdminShell.tsx` (nav entry)

**Interfaces:**
- Consumes: `SpeakerFormModal` and `MicIcon` from Task 4; `AdminSpeakerDTO` from `@repo/shared-types`; `api` from `../../services/api`; `FIELD_CLASS` from `../events/workspace/fieldStyles`; `Permission` from `@repo/auth`; toast via `useToastStore` from `../../store/toastStore`.
- Produces: `/speakers` route rendering `SpeakersPage`; "Speakers" sidebar item gated on `Permission.EVENT_UPDATE`.

- [ ] **Step 1: Create SpeakersPage**

Create `apps/frontend/src/pages/speakers/SpeakersPage.tsx`:

```tsx
import { useEffect, useState } from "react";
import type { AdminSpeakerDTO } from "@repo/shared-types";
import { api, ApiRequestError } from "../../services/api";
import { useToastStore } from "../../store/toastStore";
import { SpeakerFormModal } from "../../components/SpeakerFormModal";
import { SearchIcon, PlusIcon, EditIcon, TrashIcon } from "../../components/icons";
import { FIELD_CLASS } from "../events/workspace/fieldStyles";

export function SpeakersPage() {
  const [speakers, setSpeakers] = useState<AdminSpeakerDTO[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<{ open: boolean; speaker: AdminSpeakerDTO | null }>({
    open: false,
    speaker: null,
  });
  const showToast = useToastStore((s) => s.show);

  async function load() {
    setLoading(true);
    try {
      setSpeakers(await api.get<AdminSpeakerDTO[]>("/admin/speakers"));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const filtered = query
    ? speakers.filter((s) => s.name.toLowerCase().includes(query.toLowerCase()))
    : speakers;

  async function onDelete(speaker: AdminSpeakerDTO) {
    const warning =
      speaker.eventCount > 0
        ? `${speaker.name} is attached to ${speaker.eventCount} event(s). Deleting will remove them from those events too. Continue?`
        : `Delete ${speaker.name}?`;
    if (!window.confirm(warning)) return;
    try {
      await api.delete(`/admin/speakers/${speaker.id}`);
      showToast("Speaker deleted.");
      void load();
    } catch (err) {
      showToast(err instanceof ApiRequestError ? err.apiError.message : "Failed to delete speaker.");
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-ink">Speaker Management</h1>
          <p className="mt-1 text-sm text-muted">
            Create speakers once, then attach them to events from each event&apos;s Overview tab.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setModal({ open: true, speaker: null })}
          className="inline-flex shrink-0 items-center gap-2 rounded-full bg-primary px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-primary-dark"
        >
          <PlusIcon width={16} height={16} /> Add Speaker
        </button>
      </div>

      <div className="relative mt-5 max-w-sm">
        <SearchIcon width={16} height={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search speakers by name..."
          className={`${FIELD_CLASS} pl-9`}
        />
      </div>

      <div className="mt-4 overflow-hidden rounded-2xl border border-line bg-white">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-line text-xs font-semibold uppercase tracking-wide text-muted">
            <tr>
              <th className="px-4 py-3">Speaker</th>
              <th className="px-4 py-3">Title / Company</th>
              <th className="px-4 py-3">Featured</th>
              <th className="px-4 py-3">Events</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-muted">Loading…</td></tr>
            )}
            {!loading && filtered.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-muted">No speakers yet. Add your first speaker.</td></tr>
            )}
            {filtered.map((s) => (
              <tr key={s.id} className="border-b border-line last:border-b-0">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    {s.avatarUrl ? (
                      <img src={s.avatarUrl} alt={s.name} className="h-9 w-9 rounded-full object-cover" />
                    ) : (
                      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary-50 text-sm font-bold text-primary">
                        {s.name.charAt(0).toUpperCase()}
                      </div>
                    )}
                    <span className="font-medium text-ink">{s.name}</span>
                  </div>
                </td>
                <td className="px-4 py-3 text-muted">
                  {[s.title, s.company].filter(Boolean).join(", ") || "—"}
                </td>
                <td className="px-4 py-3">
                  {s.featured && (
                    <span className="rounded-md bg-primary-50 px-2 py-0.5 text-xs font-semibold text-primary">Featured</span>
                  )}
                </td>
                <td className="px-4 py-3 text-muted">{s.eventCount}</td>
                <td className="px-4 py-3">
                  <div className="flex justify-end gap-1">
                    <button
                      type="button"
                      onClick={() => setModal({ open: true, speaker: s })}
                      aria-label={`Edit ${s.name}`}
                      className="rounded-full p-2 text-muted transition-colors hover:bg-surface hover:text-primary"
                    >
                      <EditIcon width={16} height={16} />
                    </button>
                    <button
                      type="button"
                      onClick={() => void onDelete(s)}
                      aria-label={`Delete ${s.name}`}
                      className="rounded-full p-2 text-muted transition-colors hover:bg-surface hover:text-status-red"
                    >
                      <TrashIcon width={16} height={16} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modal.open && (
        <SpeakerFormModal
          speaker={modal.speaker}
          onClose={() => setModal({ open: false, speaker: null })}
          onSaved={() => {
            setModal({ open: false, speaker: null });
            showToast("Speaker saved.");
            void load();
          }}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 2: Add the route**

In `apps/frontend/src/app/App.tsx`, add the import with the other page imports:

```tsx
import { SpeakersPage } from "../pages/speakers/SpeakersPage";
```

and add the route directly after the `events/:id` route (line ~36):

```tsx
          <Route path="speakers" element={<SpeakersPage />} />
```

- [ ] **Step 3: Add the sidebar entry**

In `apps/frontend/src/layouts/AdminShell.tsx`: add `MicIcon` to the existing icons import, then in the `NAV` array insert directly after the `/events` entry (line 44):

```ts
      { to: "/speakers", label: "Speakers", icon: MicIcon, permission: Permission.EVENT_UPDATE },
```

- [ ] **Step 4: Typecheck**

Run: `pnpm --filter @repo/frontend typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/pages/speakers/SpeakersPage.tsx apps/frontend/src/app/App.tsx apps/frontend/src/layouts/AdminShell.tsx
git commit -m "feat(admin): Speaker Management page with search, CRUD, and sidebar nav"
```

---

### Task 6: Frontend — speaker picker on the event Overview tab

**Files:**
- Modify: `apps/frontend/src/pages/events/workspace/OverviewTab.tsx`

**Interfaces:**
- Consumes: `SpeakerFormModal` (Task 4); `AdminSpeakerDTO` from `@repo/shared-types`; the tab's existing `form`/`set`/`onSubmit` pattern; `GET /admin/speakers?q=` (Task 2); `speakerIds` on PATCH (Task 3). `event.speakers: SpeakerDTO[]` is already on the `EventDTO` prop.
- Produces: attached-speaker ids ride the tab's existing single PATCH-on-save; picker searches existing speakers and can create new ones inline.

- [ ] **Step 1: Extend imports and FormState**

In `OverviewTab.tsx`:

Add to the `@repo/shared-types` type import: `AdminSpeakerDTO`. Add component imports:

```tsx
import { SpeakerFormModal } from "../../../components/SpeakerFormModal";
```

Extend `FormState` (line ~31) with one field, and `fromEvent` accordingly:

```ts
interface FormState {
  // ...existing fields unchanged...
  speakers: { id: string; name: string; avatarUrl: string | null }[];
}
```

In `fromEvent(e: EventDTO)` add:

```ts
    speakers: e.speakers.map((s) => ({ id: s.id, name: s.name, avatarUrl: s.avatarUrl })),
```

- [ ] **Step 2: Add picker state + handlers inside the component**

Inside `OverviewTab` (after the existing `set` helper), add:

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
    setForm((f) =>
      f.speakers.some((x) => x.id === s.id) ? f : { ...f, speakers: [...f.speakers, s] },
    );
    setSpeakerQuery("");
    setSpeakerResults([]);
  }

  function detachSpeaker(id: string) {
    setForm((f) => ({ ...f, speakers: f.speakers.filter((s) => s.id !== id) }));
  }
```

- [ ] **Step 3: Include `speakerIds` in the save payload**

In `onSubmit`'s `payload` object (after `thumbnailUrl`), add:

```ts
        speakerIds: form.speakers.map((s) => s.id),
```

- [ ] **Step 4: Render the Speakers section in the form**

Inside the `<form>`, after the Venue field's closing `</div>` and before the ImageUploadField grid, add:

```tsx
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
                        <span className="text-xs text-muted">
                          {[r.title, r.company].filter(Boolean).join(", ")}
                        </span>
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
```

And after the `</form>` closing tag (still inside the component's root `<div>`), render the modal:

```tsx
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
```

Note: `SpeakerFormModal` create-mode opens blank; the admin retypes the name from their query — acceptable for v1 (keeping the modal API simple).

- [ ] **Step 5: Typecheck**

Run: `pnpm --filter @repo/frontend typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/frontend/src/pages/events/workspace/OverviewTab.tsx
git commit -m "feat(admin): speaker attach picker with inline create on event Overview tab"
```

---

### Task 7: End-to-end verification (browser) + full test suite

**Files:** none created — verification only.

**Interfaces:**
- Consumes: everything above; dev servers via `.claude/launch.json` names `bliblitalk-admin-backend` (4001), `bliblitalk-admin-frontend` (5184), `bliblitalk-user-fe-frontend` (5183).

- [ ] **Step 1: Full backend test suite + both typechecks**

Run: `pnpm --filter @repo/backend test && pnpm --filter @repo/backend typecheck && pnpm --filter @repo/frontend typecheck`
Expected: all PASS.

- [ ] **Step 2: Browser — Speaker Management page**

Start/reuse the admin dev servers. Log in at :5184 as `superadmin@gdn-commerce.com` / `password123`. Navigate to `/speakers`. Verify: "Speakers" appears in the sidebar after "Event Management"; create a speaker via "+ Add Speaker" (name, title, company, short bio); it appears in the table with eventCount 0; edit it; search filters it.

- [ ] **Step 3: Browser — attach from event Overview tab**

Open any event's workspace → Overview tab. In the Speakers field, type the new speaker's name → click the result → chip appears → Save. Reload the page; the chip persists (speakers survived the round-trip). Remove the chip → Save → reload → gone.

- [ ] **Step 4: Browser — participant portal reflects the attachment**

Re-attach the speaker and Save. On :5183, open that event's detail page and verify the speaker's name/title/company render (SpeakerCard / banner). This confirms end-to-end admin-write → portal-read.

- [ ] **Step 5: Browser — delete-with-warning flow**

Back on `/speakers`, delete the test speaker. Verify the confirm message mentions it is attached to 1 event. Confirm; verify the event's Overview tab no longer lists it. Clean up any other test data created during verification.

- [ ] **Step 6: Commit any fixes found during verification**

```bash
git add -A
git commit -m "fix(admin): speaker management verification fixes"
```

(Skip if verification found nothing to fix.)
