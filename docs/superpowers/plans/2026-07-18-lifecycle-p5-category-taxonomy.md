# P5 — Category Taxonomy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the free-text `Event.category` string with a managed `EventCategory` taxonomy — a de-duplicated, admin-managed set of categories that the event form picks from via a combobox instead of typing free text.

**Architecture:** New `EventCategory` Prisma model (citext-unique name, `isActive` soft-delete flag), a single live migration that creates it, seeds the 5 real distinct category values, backfills every event's new `categoryId` FK, then drops the old `category` column. Backend CRUD mirrors the existing `Speaker` feature's file structure exactly. The public API contract is preserved — `EventDTO.category` stays a string (now the category's name), so bliblitalk-user-fe needs zero changes.

**Tech Stack:** Express + Prisma + Zod (backend), React + react-router-dom (admin frontend), Vitest + Supertest (backend tests only — the admin frontend has no test harness).

## Global Constraints

- The public API contract must not change: `EventDTO.category` stays a `string` (mapped from the new `category.name` relation), so bliblitalk-user-fe requires no code changes. `EventDTO.categoryId: string` is an **additive** field.
- Category deletion is **soft-delete with a hard block** (not a straight hard delete like `Speaker`): `DELETE /admin/categories/:id` returns `409 CATEGORY_IN_USE` if any event with status other than `COMPLETED`/`CANCELLED`/`ARCHIVED` references it; otherwise it sets `isActive: false` and never physically removes the row.
- Category names are unique case-insensitively (Postgres `citext`). A duplicate create/rename returns `409 DUPLICATE_CATEGORY`.
- No new permission is introduced — every category endpoint uses the same `requireAuth` + `requirePermission(Permission.EVENT_UPDATE)` gate as `Speaker`.
- The admin frontend (`apps/frontend`) has **no test harness** (`package.json` has no `test` script, no vitest/testing-library dependency) — do not add component tests here. Verification for frontend tasks is a live manual browser check at the final task, not an automated test file.
- **Do not run a full `pnpm typecheck` across the whole repo until Task 11.** Tasks 1–10 each touch one piece of a single cross-cutting schema rename (`category: string` → `categoryId` FK); until every consumer is updated, unrelated not-yet-touched files will show real (expected) type errors referencing the old field. Each task's own verification step is scoped to the files that task touches — Task 11 is the first point where the full, unscoped typecheck is expected to pass.
- Every backend integration test in this codebase requires a running, already-migrated, already-seeded local Postgres (same convention as every existing `*.routes.test.ts` file) — this is unchanged by this plan.

---

### Task 1: Schema + migration

**Files:**
- Modify: `apps/backend/src/db/prisma/schema.prisma`
- Create: `apps/backend/src/db/prisma/migrations/20260718060000_category_taxonomy/migration.sql`

**Interfaces:**
- Produces: Prisma model `EventCategory { id, name, isActive, createdAt, events }`; `Event.categoryId: String` (FK, required) replacing `Event.category: String`; Prisma Client type `Event` now has `categoryId: string` and (when included) a `category: EventCategory` relation object instead of a plain string.

- [ ] **Step 1: Edit `schema.prisma`**

Add the new model right after the existing `Speaker` model (after line 93, before `model Event {`):

```prisma
model EventCategory {
  id        String   @id @default(cuid())
  name      String   @unique @db.Citext
  isActive  Boolean  @default(true)
  createdAt DateTime @default(now())
  events    Event[]
}
```

In the `Event` model, replace this line:

```prisma
  category             String
```

with:

```prisma
  categoryId           String
  category             EventCategory  @relation(fields: [categoryId], references: [id])
```

(Keep the relation field named `category` — so `event.category.name` reads naturally everywhere it's consumed — while the scalar FK column is `categoryId`.)

- [ ] **Step 2: Write the migration SQL by hand**

Create `apps/backend/src/db/prisma/migrations/20260718060000_category_taxonomy/migration.sql` (this repo's established convention for non-trivial schema changes — see `20260716060555_lifecycle_engine/migration.sql` for the precedent of hand-writing enum/backfill SQL directly rather than relying on Prisma's auto-diff):

```sql
-- Case-insensitive uniqueness for category names
CREATE EXTENSION IF NOT EXISTS citext;

-- CreateTable
CREATE TABLE "EventCategory" (
    "id" TEXT NOT NULL,
    "name" CITEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EventCategory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EventCategory_name_key" ON "EventCategory"("name");

-- Seed the 5 distinct category values in use today (see docs/superpowers/specs/2026-07-18-lifecycle-p5-category-taxonomy-design.md)
INSERT INTO "EventCategory" ("id", "name") VALUES
  ('cat_leadership', 'Leadership'),
  ('cat_selfdevelopment', 'Self Development'),
  ('cat_technology', 'Technology'),
  ('cat_careergrowth', 'Career Growth'),
  ('cat_design', 'Design');

-- Add the FK column nullable first, backfill by matching the old free-text value, then enforce NOT NULL
ALTER TABLE "Event" ADD COLUMN "categoryId" TEXT;
UPDATE "Event" SET "categoryId" = 'cat_leadership' WHERE "category" = 'Leadership';
UPDATE "Event" SET "categoryId" = 'cat_selfdevelopment' WHERE "category" = 'Self Development';
UPDATE "Event" SET "categoryId" = 'cat_technology' WHERE "category" = 'Technology';
UPDATE "Event" SET "categoryId" = 'cat_careergrowth' WHERE "category" = 'Career Growth';
UPDATE "Event" SET "categoryId" = 'cat_design' WHERE "category" = 'Design';
ALTER TABLE "Event" ALTER COLUMN "categoryId" SET NOT NULL;
ALTER TABLE "Event" DROP COLUMN "category";

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "EventCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
```

If the final `ALTER COLUMN "categoryId" SET NOT NULL` fails, it means an event exists whose `category` string isn't one of the 5 known values — the migration is deliberately fail-fast here per the design's "no approval UI" decision; find the row (`SELECT slug, category FROM "Event" WHERE "categoryId" IS NULL;`) and add a matching `INSERT`/`UPDATE` pair above before re-running.

- [ ] **Step 3: Apply the migration and regenerate the Prisma Client**

Run: `pnpm --filter @repo/backend migrate`

Expected: Prisma detects the new, not-yet-applied `20260718060000_category_taxonomy` migration folder, applies it, and reports success. This also regenerates `@prisma/client` types (the `migrate` script includes an implicit generate step); if it doesn't, run `pnpm --filter @repo/backend generate` explicitly afterward.

- [ ] **Step 4: Verify the migration applied correctly**

Run: `pnpm --filter @repo/backend exec prisma studio --schema=src/db/prisma/schema.prisma` (or a quick psql query) to confirm: `EventCategory` has exactly 5 rows: Leadership, Self Development, Technology, Career Growth, Design. Every existing `Event` row has a non-null `categoryId` matching its prior category. There is no `category` string column left on `Event`.

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/db/prisma/schema.prisma apps/backend/src/db/prisma/migrations/20260718060000_category_taxonomy
git commit -m "feat(db): add EventCategory taxonomy, backfill Event.categoryId, drop free-text category"
```

---

### Task 2: Shared types

**Files:**
- Modify: `packages/shared-types/src/schemas.ts`

**Interfaces:**
- Consumes: nothing new (pure Zod schema additions/edits).
- Produces: `CategoryDTO`, `CreateCategoryInput`, `UpdateCategoryInput`, `AdminCategoryDTO` (new); `EventDTO.categoryId: string` (new field); `AdminEventInput`/`AdminEventUpdateInput`'s `category` field renamed to `categoryId`.

- [ ] **Step 1: Add the category schemas**

Insert immediately after the existing `AdminSpeakerDTO` block (after line 96, before the `// ---- Event detail-page content` comment):

```ts
export const CategoryDTO = z.object({
  id: z.string(),
  name: z.string(),
  isActive: z.boolean(),
});
export type CategoryDTO = z.infer<typeof CategoryDTO>;

export const CreateCategoryInput = z.object({
  name: z.string().min(1, "Name is required"),
});
export type CreateCategoryInput = z.infer<typeof CreateCategoryInput>;

export const UpdateCategoryInput = z.object({
  name: z.string().min(1).optional(),
  isActive: z.boolean().optional(),
});
export type UpdateCategoryInput = z.infer<typeof UpdateCategoryInput>;

/** Category row for the admin management page — DTO plus usage count. */
export const AdminCategoryDTO = CategoryDTO.extend({
  eventCount: z.number().int(),
});
export type AdminCategoryDTO = z.infer<typeof AdminCategoryDTO>;
```

- [ ] **Step 2: Add `categoryId` to `EventDTO`**

In the `EventDTO` object (around line 170-214), immediately after the existing `category: z.string(),` line, add:

```ts
  categoryId: z.string(),
```

(`category` itself stays exactly as `z.string()` — per the Global Constraints, its wire value is now the category's *name*, not the raw column, but the Zod shape doesn't change.)

- [ ] **Step 3: Switch `AdminEventInput`'s write field from `category` to `categoryId`**

In `AdminEventInput` (around line 346-385), replace:

```ts
  category: z.string().min(1, "Category is required"),
```

with:

```ts
  categoryId: z.string().min(1, "Category is required"),
```

(`AdminEventUpdateInput = AdminEventInput.partial()` needs no separate edit — it derives from this automatically.)

- [ ] **Step 4: Verify**

Run: `pnpm --filter @repo/shared-types typecheck` — expected to show errors in *other* packages that still reference the old field (backend/frontend not yet updated — expected per Global Constraints), but `schemas.ts` itself should have no local syntax errors. If this package has no standalone typecheck script, confirm via `pnpm --filter @repo/shared-types exec tsc --noEmit` instead.

- [ ] **Step 5: Commit**

```bash
git add packages/shared-types/src/schemas.ts
git commit -m "feat(types): add category taxonomy DTOs; EventDTO gains categoryId; AdminEventInput category -> categoryId"
```

---

### Task 3: Backend mappers + eventInclude

**Files:**
- Modify: `apps/backend/src/lib/shared/mappers.ts`
- Modify: `apps/backend/src/routes/public/events/events.service.ts`

**Interfaces:**
- Consumes: `EventCategory` Prisma type (from `@prisma/client`), `EventDTO`/`categoryId` (Task 2).
- Produces: `toEventDTO` now reads `e.category.name` for the `category` field and adds `categoryId: e.categoryId`; `eventInclude` includes the category relation so every caller of `toEventDTO` has it available.

- [ ] **Step 1: Include the category relation everywhere events are fetched**

In `apps/backend/src/routes/public/events/events.service.ts`, change:

```ts
export const eventInclude = {
  speakers: true,
  _count: { select: { registrations: { where: { status: RegistrationStatus.REGISTERED } } } },
} as const;
```

to:

```ts
export const eventInclude = {
  speakers: true,
  category: true,
  _count: { select: { registrations: { where: { status: RegistrationStatus.REGISTERED } } } },
} as const;
```

- [ ] **Step 2: Update `toEventDTO` in `mappers.ts`**

Add `EventCategory` to the Prisma type import at the top of the file:

```ts
import type {
  Announcement,
  Certificate,
  Event,
  EventCategory,
  EventStatusHistory,
  Feedback,
  Registration,
  Speaker,
  SpeedDatingRegistration,
} from "@prisma/client";
```

Change the `EventWithRelations` type:

```ts
type EventWithRelations = Event & {
  speakers: Speaker[];
  category: EventCategory;
  _count?: { registrations: number };
};
```

In `toEventDTO`, replace:

```ts
    category: e.category,
```

with:

```ts
    category: e.category.name,
    categoryId: e.categoryId,
```

- [ ] **Step 3: Verify**

Run: `pnpm --filter @repo/backend exec tsc --noEmit -p . 2>&1 | grep -E "mappers.ts|events.service.ts"` (or just eyeball the compiler output) — these two files themselves should show no errors referencing `category`/`categoryId`. Other files (adminEvents.service.ts, seed.ts, etc.) will still show errors — expected, fixed in later tasks.

- [ ] **Step 4: Commit**

```bash
git add apps/backend/src/lib/shared/mappers.ts apps/backend/src/routes/public/events/events.service.ts
git commit -m "feat(mappers): flatten category relation to its name on EventDTO, add categoryId"
```

---

### Task 4: Backend adminCategories CRUD + tests

**Files:**
- Create: `apps/backend/src/routes/admin/adminCategories.service.ts`
- Create: `apps/backend/src/routes/admin/adminCategories.routes.ts`
- Create: `apps/backend/src/routes/admin/adminCategories.routes.test.ts`
- Modify: `apps/backend/src/app.ts`

**Interfaces:**
- Consumes: `AdminCategoryDTO`, `CreateCategoryInput`, `UpdateCategoryInput` (Task 2); `requireAuth`/`requirePermission`/`validate` middleware (existing, same as `adminSpeakers.routes.ts`).
- Produces: `GET/POST/PATCH/DELETE /api/admin/categories[...]`, consumed by frontend Tasks 8-10.

- [ ] **Step 1: Write `adminCategories.service.ts`**

```ts
import type { AdminCategoryDTO, CreateCategoryInput, UpdateCategoryInput } from "@repo/shared-types";
import { EventStatus } from "@repo/shared-types";
import { Prisma } from "@prisma/client";
import { prisma } from "../../db/client";
import { AppError } from "../../middleware/error";

type CategoryWithCount = {
  id: string;
  name: string;
  isActive: boolean;
  _count: { events: number };
};

function toAdminCategoryDTO(c: CategoryWithCount): AdminCategoryDTO {
  return { id: c.id, name: c.name, isActive: c.isActive, eventCount: c._count.events };
}

const categoryInclude = { _count: { select: { events: true } } } as const;

export async function listCategories(q?: string, includeInactive = false): Promise<AdminCategoryDTO[]> {
  const categories = await prisma.eventCategory.findMany({
    where: {
      ...(q ? { name: { contains: q, mode: "insensitive" } } : {}),
      ...(includeInactive ? {} : { isActive: true }),
    },
    include: categoryInclude,
    orderBy: { name: "asc" },
  });
  return categories.map(toAdminCategoryDTO);
}

export async function createCategory(input: CreateCategoryInput): Promise<AdminCategoryDTO> {
  try {
    const category = await prisma.eventCategory.create({
      data: { name: input.name },
      include: categoryInclude,
    });
    return toAdminCategoryDTO(category);
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      throw new AppError("DUPLICATE_CATEGORY", `A category named "${input.name}" already exists.`, 409);
    }
    throw err;
  }
}

export async function updateCategory(id: string, input: UpdateCategoryInput): Promise<AdminCategoryDTO> {
  const existing = await prisma.eventCategory.findUnique({ where: { id } });
  if (!existing) throw new AppError("NOT_FOUND", "Category not found", 404);
  try {
    const category = await prisma.eventCategory.update({
      where: { id },
      data: {
        ...(input.name !== undefined && { name: input.name }),
        ...(input.isActive !== undefined && { isActive: input.isActive }),
      },
      include: categoryInclude,
    });
    return toAdminCategoryDTO(category);
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      throw new AppError("DUPLICATE_CATEGORY", `A category named "${input.name}" already exists.`, 409);
    }
    throw err;
  }
}

/**
 * Hard-blocks if any non-finished event still references this category (409
 * CATEGORY_IN_USE); otherwise soft-deletes (isActive: false). Never physically
 * deletes the row — finished/cancelled/archived events keep a valid categoryId.
 */
export async function deleteCategory(id: string): Promise<void> {
  const existing = await prisma.eventCategory.findUnique({ where: { id } });
  if (!existing) throw new AppError("NOT_FOUND", "Category not found", 404);

  const upcomingCount = await prisma.event.count({
    where: {
      categoryId: id,
      status: { notIn: [EventStatus.COMPLETED, EventStatus.CANCELLED, EventStatus.ARCHIVED] },
    },
  });
  if (upcomingCount > 0) {
    throw new AppError(
      "CATEGORY_IN_USE",
      `${upcomingCount} upcoming event(s) still use this category.`,
      409,
      { upcomingCount },
    );
  }
  await prisma.eventCategory.update({ where: { id }, data: { isActive: false } });
}
```

- [ ] **Step 2: Write `adminCategories.routes.ts`**

```ts
import { Router } from "express";
import { CreateCategoryInput, UpdateCategoryInput } from "@repo/shared-types";
import { Permission } from "@repo/auth";
import { requireAuth, requirePermission } from "../../middleware/requireAuth";
import { validate } from "../../middleware/validate";
import {
  createCategory,
  deleteCategory,
  listCategories,
  updateCategory,
} from "./adminCategories.service";

export const adminCategoriesRoutes = Router();

// GET /admin/categories?q=&includeInactive=
adminCategoriesRoutes.get(
  "/categories",
  requireAuth,
  requirePermission(Permission.EVENT_UPDATE),
  async (req, res, next) => {
    try {
      const q = typeof req.query.q === "string" ? req.query.q : undefined;
      const includeInactive = req.query.includeInactive === "true";
      res.json(await listCategories(q, includeInactive));
    } catch (err) {
      next(err);
    }
  },
);

// POST /admin/categories
adminCategoriesRoutes.post(
  "/categories",
  requireAuth,
  requirePermission(Permission.EVENT_UPDATE),
  validate(CreateCategoryInput),
  async (req, res, next) => {
    try {
      res.status(201).json(await createCategory(req.body as CreateCategoryInput));
    } catch (err) {
      next(err);
    }
  },
);

// PATCH /admin/categories/:id
adminCategoriesRoutes.patch(
  "/categories/:id",
  requireAuth,
  requirePermission(Permission.EVENT_UPDATE),
  validate(UpdateCategoryInput),
  async (req, res, next) => {
    try {
      res.json(await updateCategory(req.params.id!, req.body as UpdateCategoryInput));
    } catch (err) {
      next(err);
    }
  },
);

// DELETE /admin/categories/:id
adminCategoriesRoutes.delete(
  "/categories/:id",
  requireAuth,
  requirePermission(Permission.EVENT_UPDATE),
  async (req, res, next) => {
    try {
      await deleteCategory(req.params.id!);
      res.status(204).end();
    } catch (err) {
      next(err);
    }
  },
);
```

- [ ] **Step 3: Wire the routes into `app.ts`**

Add the import next to the existing speakers import:

```ts
import { adminSpeakersRoutes } from "./routes/admin/adminSpeakers.routes";
import { adminCategoriesRoutes } from "./routes/admin/adminCategories.routes";
```

Add the mount line next to the existing speakers mount:

```ts
  app.use("/api/admin", adminSpeakersRoutes);
  app.use("/api/admin", adminCategoriesRoutes);
```

- [ ] **Step 4: Write `adminCategories.routes.test.ts`**

```ts
import { describe, it, expect, beforeEach, afterAll } from "vitest";
import request from "supertest";
import { createApp } from "../../app";
import { prisma } from "../../db/client";

const TEST_PREFIX = "Category CRUD Test ";

async function purgeSyntheticCategories() {
  await prisma.eventCategory.deleteMany({ where: { name: { startsWith: TEST_PREFIX } } });
}

// Integration — requires a running, seeded Postgres.
describe("admin categories CRUD", () => {
  const app = createApp();

  beforeEach(purgeSyntheticCategories);
  afterAll(purgeSyntheticCategories);

  async function loginAs(email: string) {
    const agent = request.agent(app);
    await agent.post("/api/auth/login").send({ email, password: "password123" });
    return agent;
  }

  it("requires auth", async () => {
    const res = await request(app).get("/api/admin/categories");
    expect(res.status).toBe(401);
  });

  it("rejects participants (no permission)", async () => {
    const agent = await loginAs("demo@gdn-commerce.com");
    const res = await agent.get("/api/admin/categories");
    expect(res.status).toBe(403);
  });

  it("creates a category and lists it with eventCount 0", async () => {
    const agent = await loginAs("superadmin@gdn-commerce.com");
    const created = await agent.post("/api/admin/categories").send({ name: `${TEST_PREFIX}Robotics` });
    expect(created.status).toBe(201);
    expect(created.body.name).toBe(`${TEST_PREFIX}Robotics`);
    expect(created.body.isActive).toBe(true);
    expect(created.body.eventCount).toBe(0);

    const list = await agent.get(`/api/admin/categories?q=${encodeURIComponent(TEST_PREFIX)}`);
    expect(list.status).toBe(200);
    expect(list.body.some((c: { id: string }) => c.id === created.body.id)).toBe(true);
  });

  it("rejects a nameless category with 422", async () => {
    const agent = await loginAs("superadmin@gdn-commerce.com");
    const res = await agent.post("/api/admin/categories").send({});
    expect(res.status).toBe(422);
  });

  it("rejects a duplicate name (case-insensitive) with 409", async () => {
    const agent = await loginAs("superadmin@gdn-commerce.com");
    await agent.post("/api/admin/categories").send({ name: `${TEST_PREFIX}Duplicate` });
    const res = await agent.post("/api/admin/categories").send({ name: `${TEST_PREFIX}duplicate` });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("DUPLICATE_CATEGORY");
  });

  it("updates a category via PATCH, rejecting a rename to a duplicate", async () => {
    const agent = await loginAs("superadmin@gdn-commerce.com");
    const a = await agent.post("/api/admin/categories").send({ name: `${TEST_PREFIX}A` });
    const b = await agent.post("/api/admin/categories").send({ name: `${TEST_PREFIX}B` });

    const renamed = await agent
      .patch(`/api/admin/categories/${a.body.id}`)
      .send({ name: `${TEST_PREFIX}A Renamed` });
    expect(renamed.status).toBe(200);
    expect(renamed.body.name).toBe(`${TEST_PREFIX}A Renamed`);

    const clash = await agent
      .patch(`/api/admin/categories/${b.body.id}`)
      .send({ name: `${TEST_PREFIX}A Renamed` });
    expect(clash.status).toBe(409);
    expect(clash.body.error.code).toBe("DUPLICATE_CATEGORY");
  });

  it("404s on updating a missing category", async () => {
    const agent = await loginAs("superadmin@gdn-commerce.com");
    const res = await agent.patch("/api/admin/categories/nonexistent-id").send({ name: "X" });
    expect(res.status).toBe(404);
  });

  it("hard-blocks deletion when an upcoming event still uses the category", async () => {
    const agent = await loginAs("superadmin@gdn-commerce.com");
    const category = await agent.post("/api/admin/categories").send({ name: `${TEST_PREFIX}InUse` });
    const future = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    const event = await agent.post("/api/admin/events").send({
      title: `${TEST_PREFIX}Event`,
      description: "test",
      categoryId: category.body.id,
      location: "Online",
      startsAt: future,
      endsAt: future,
      capacity: 10,
    });
    expect(event.status).toBe(201);

    const res = await agent.delete(`/api/admin/categories/${category.body.id}`);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("CATEGORY_IN_USE");

    // Cleanup — the event fixture isn't purged by purgeSyntheticCategories.
    await prisma.event.delete({ where: { id: event.body.id } });
  });

  it("soft-deletes (deactivates) a category with no upcoming events", async () => {
    const agent = await loginAs("superadmin@gdn-commerce.com");
    const category = await agent.post("/api/admin/categories").send({ name: `${TEST_PREFIX}Unused` });
    const res = await agent.delete(`/api/admin/categories/${category.body.id}`);
    expect(res.status).toBe(204);

    const row = await prisma.eventCategory.findUnique({ where: { id: category.body.id } });
    expect(row).not.toBeNull();
    expect(row!.isActive).toBe(false);
  });

  it("excludes inactive categories from the default list, includes them with includeInactive=true", async () => {
    const agent = await loginAs("superadmin@gdn-commerce.com");
    const category = await agent
      .post("/api/admin/categories")
      .send({ name: `${TEST_PREFIX}ToggleVisibility` });
    await agent.delete(`/api/admin/categories/${category.body.id}`);

    const defaultList = await agent.get(`/api/admin/categories?q=${encodeURIComponent(TEST_PREFIX)}`);
    expect(defaultList.body.some((c: { id: string }) => c.id === category.body.id)).toBe(false);

    const withInactive = await agent.get(
      `/api/admin/categories?q=${encodeURIComponent(TEST_PREFIX)}&includeInactive=true`,
    );
    expect(withInactive.body.some((c: { id: string }) => c.id === category.body.id)).toBe(true);
  });
});
```

Note: this test's "hard-blocks deletion" case calls `POST /api/admin/events` with `categoryId` — this only works correctly once Task 5 (which switches `adminEvents.service.ts` to accept `categoryId`) is also done. If running this test file in isolation before Task 5 lands, that one test will fail with a 422 — expected; it will pass once Task 5 is complete. Run the rest of this suite's tests now; re-run the full file after Task 5.

- [ ] **Step 5: Run the new tests**

Run: `pnpm --filter @repo/backend test -- adminCategories.routes.test.ts`
Expected: all tests pass except (if Task 5 isn't done yet) "hard-blocks deletion when an upcoming event still uses the category" — note this and move on; it will be re-verified in Task 5.

- [ ] **Step 6: Commit**

```bash
git add apps/backend/src/routes/admin/adminCategories.service.ts apps/backend/src/routes/admin/adminCategories.routes.ts apps/backend/src/routes/admin/adminCategories.routes.test.ts apps/backend/src/app.ts
git commit -m "feat(admin): category CRUD (list/create/update/soft-delete with hard-block)"
```

---

### Task 5: Wire adminEvents + adminAnalytics to the new categoryId

**Files:**
- Modify: `apps/backend/src/routes/admin/adminEvents.service.ts`
- Modify: `apps/backend/src/routes/admin/adminAnalytics.service.ts`

**Interfaces:**
- Consumes: `categoryId` on `AdminEventInput`/`AdminEventUpdateInput` (Task 2); `EventCategory` model (Task 1).
- Produces: event create/update/publish now read/write `categoryId`; `CategoryBreakdownDTO` rows still shaped `{category: string, count: number}` (unchanged DTO), now resolved via a join instead of a raw scalar groupBy.

- [ ] **Step 1: `adminEvents.service.ts` — create**

Replace:

```ts
      category: input.category,
```

with:

```ts
      categoryId: input.categoryId,
```

- [ ] **Step 2: `adminEvents.service.ts` — update**

Replace:

```ts
      ...(input.category !== undefined && { category: input.category }),
```

with:

```ts
      ...(input.categoryId !== undefined && { categoryId: input.categoryId }),
```

- [ ] **Step 3: `adminEvents.service.ts` — REQUIRED_FOR_PUBLISH**

Replace:

```ts
const REQUIRED_FOR_PUBLISH: (keyof AdminEventInput)[] = [
  "title",
  "description",
  "category",
  "location",
  "startsAt",
  "endsAt",
];
```

with:

```ts
const REQUIRED_FOR_PUBLISH: (keyof AdminEventInput)[] = [
  "title",
  "description",
  "categoryId",
  "location",
  "startsAt",
  "endsAt",
];
```

- [ ] **Step 4: `adminAnalytics.service.ts` — resolve category names via a join**

Replace:

```ts
  const [categoryGroups, statusGroups, events] = await Promise.all([
    prisma.event.groupBy({ by: ["category"], where: eventWhere, _count: { _all: true } }),
    prisma.registration.groupBy({ by: ["status"], where: registrationWhere, _count: { _all: true } }),
    prisma.event.findMany({
```

with:

```ts
  const [categoryGroups, statusGroups, events] = await Promise.all([
    prisma.event.groupBy({ by: ["categoryId"], where: eventWhere, _count: { _all: true } }),
    prisma.registration.groupBy({ by: ["status"], where: registrationWhere, _count: { _all: true } }),
    prisma.event.findMany({
```

Then replace:

```ts
  return {
    eventsByCategory: categoryGroups
      .map((g) => ({ category: g.category, count: g._count._all }))
      .sort((a, b) => b.count - a.count),
```

with:

```ts
  const categoryNameById = new Map(
    (
      await prisma.eventCategory.findMany({
        where: { id: { in: categoryGroups.map((g) => g.categoryId) } },
        select: { id: true, name: true },
      })
    ).map((c) => [c.id, c.name]),
  );

  return {
    eventsByCategory: categoryGroups
      .map((g) => ({ category: categoryNameById.get(g.categoryId) ?? "Unknown", count: g._count._all }))
      .sort((a, b) => b.count - a.count),
```

- [ ] **Step 5: Verify**

Run: `pnpm --filter @repo/backend test -- adminCategories.routes.test.ts`
Expected: all tests now pass, including "hard-blocks deletion when an upcoming event still uses the category" (deferred from Task 4).

Run: `pnpm --filter @repo/backend test -- adminAnalytics.routes.test.ts`
Expected: still passes (the `CategoryBreakdownDTO` shape is unchanged, only its computation changed) — if it fails, it's likely a stale `category: "..."` literal in that test's own fixtures; that's fixed in Task 6, not this one — note the failure and continue.

- [ ] **Step 6: Commit**

```bash
git add apps/backend/src/routes/admin/adminEvents.service.ts apps/backend/src/routes/admin/adminAnalytics.service.ts
git commit -m "feat(admin): switch event create/update/publish and analytics breakdown to categoryId"
```

---

### Task 6: Fix existing test fixtures broken by the schema change

**Files:**
- Modify: `apps/backend/src/routes/admin/adminEvents.routes.test.ts`
- Modify: `apps/backend/src/routes/admin/adminFeedback.routes.test.ts`
- Modify: `apps/backend/src/routes/admin/adminReminders.routes.test.ts`
- Modify: `apps/backend/src/routes/admin/adminParticipants.routes.test.ts`
- Modify: `apps/backend/src/routes/admin/adminCertificates.routes.test.ts`
- Modify: `apps/backend/src/routes/public/events/events.routes.test.ts`
- Modify: `apps/backend/src/routes/public/registrations/feedback.routes.test.ts`
- Modify: `apps/backend/src/lib/lifecycle/transitionEvent.test.ts`
- Modify: `apps/backend/src/lib/lifecycle/sweepEventLifecycle.test.ts`

**Interfaces:**
- Consumes: the 5 seeded `EventCategory` rows (Task 1) — every fixture below uses the pre-existing "Technology" category, connecting to it by its unique `name` rather than recreating it.

Two distinct fix patterns are needed, split by how each file builds its fixture:

**Pattern A — raw `prisma.event.create({ data: {...} })` fixtures (8 files).** Every occurrence of a literal `category: "Technology",` inside a `prisma.event.create` (or `prisma.event.createMany`) data object becomes a relation-connect:

```ts
      category: { connect: { name: "Technology" } },
```

- [ ] **Step 1: Apply Pattern A to each raw-Prisma fixture file**

In each of these 8 files, find the line `category: "Technology",` inside a `prisma.event.create` data object and replace it with `category: { connect: { name: "Technology" } },` (keep the same indentation as the surrounding object):

- `apps/backend/src/routes/admin/adminFeedback.routes.test.ts` — 2 occurrences (lines ~40 and ~115)
- `apps/backend/src/routes/admin/adminReminders.routes.test.ts` — 1 occurrence (line ~37)
- `apps/backend/src/routes/admin/adminParticipants.routes.test.ts` — 1 occurrence (line ~27)
- `apps/backend/src/routes/admin/adminCertificates.routes.test.ts` — 1 occurrence (line ~29)
- `apps/backend/src/routes/public/events/events.routes.test.ts` — 3 occurrences (lines ~98, ~132, ~159)
- `apps/backend/src/routes/public/registrations/feedback.routes.test.ts` — 1 occurrence (line ~47)
- `apps/backend/src/lib/lifecycle/transitionEvent.test.ts` — 2 occurrences (lines ~16 and ~151)
- `apps/backend/src/lib/lifecycle/sweepEventLifecycle.test.ts` — 1 occurrence (line ~29)

**Pattern B — HTTP payload fixture (1 file).** `adminEvents.routes.test.ts`'s `validPayload()` builds a JSON body sent through `POST /api/admin/events`, which now requires a real `categoryId` string (not a connect object — that's a Prisma-only construct). This needs a one-time lookup of the seeded "Technology" category's id.

- [ ] **Step 2: Apply Pattern B to `adminEvents.routes.test.ts`**

Change the import line:

```ts
import { describe, it, expect, beforeEach, afterAll } from "vitest";
```

to:

```ts
import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
```

Add a module-level variable right after `const TEST_SLUG_PREFIX = "admin-crud-test-";`:

```ts
let technologyCategoryId: string;
```

Change `validPayload`'s `category: "Technology",` line to:

```ts
    categoryId: technologyCategoryId,
```

Inside the `describe("admin events CRUD", ...)` block, add a `beforeAll` right after `const app = createApp();`:

```ts
  beforeAll(async () => {
    const category = await prisma.eventCategory.findFirstOrThrow({ where: { name: "Technology" } });
    technologyCategoryId = category.id;
  });
```

- [ ] **Step 3: Run the full backend suite**

Run: `pnpm --filter @repo/backend test`
Expected: every test file passes. If any of the 9 files above still fails, re-check that the literal replacement landed on the correct line (some files may have slightly different surrounding formatting than the line numbers above, which were captured before this task's edits).

- [ ] **Step 4: Commit**

```bash
git add apps/backend/src/routes/admin/adminEvents.routes.test.ts apps/backend/src/routes/admin/adminFeedback.routes.test.ts apps/backend/src/routes/admin/adminReminders.routes.test.ts apps/backend/src/routes/admin/adminParticipants.routes.test.ts apps/backend/src/routes/admin/adminCertificates.routes.test.ts apps/backend/src/routes/public/events/events.routes.test.ts apps/backend/src/routes/public/registrations/feedback.routes.test.ts apps/backend/src/lib/lifecycle/transitionEvent.test.ts apps/backend/src/lib/lifecycle/sweepEventLifecycle.test.ts
git commit -m "fix(test): update event fixtures for the category -> categoryId schema change"
```

---

### Task 7: Seed data

**Files:**
- Modify: `apps/backend/src/db/prisma/seed.ts`

**Interfaces:**
- Consumes: the 5 seeded `EventCategory` rows (Task 1 — created by the migration, not by this seed script; this task only changes how `seed.ts`'s 9 event fixtures *reference* them).

- [ ] **Step 1: Replace every `category: "..."` literal with a relation-connect**

In each of the 9 `prisma.event.create` calls in `seed.ts`, replace the literal category string with a connect-by-name. The 9 occurrences and their exact replacements:

| Event (slug) | Old line | New line |
|---|---|---|
| `not-lost-in-translation` | `category: "Leadership",` | `category: { connect: { name: "Leadership" } },` |
| `learning-how-to-learn` | `category: "Self Development",` | `category: { connect: { name: "Self Development" } },` |
| `ai-in-everyday-work` | `category: "Technology",` | `category: { connect: { name: "Technology" } },` |
| `building-influence-as-a-leader` | `category: "Leadership",` | `category: { connect: { name: "Leadership" } },` |
| `future-of-work-skills` | `category: "Career Growth",` | `category: { connect: { name: "Career Growth" } },` |
| `mindset-for-continuous-growth` | `category: "Self Development",` | `category: { connect: { name: "Self Development" } },` |
| `breaking-fast-breaking-ideas` | `category: "Design",` | `category: { connect: { name: "Design" } },` |
| `kartini-masa-gitu` | `category: "Leadership",` | `category: { connect: { name: "Leadership" } },` |
| `love-hate-work-relationship` | `category: "Self Development",` | `category: { connect: { name: "Self Development" } },` |

Apply each replacement in place (same indentation, same position in the `data` object) — do not reorder or otherwise touch the surrounding fields.

- [ ] **Step 2: Re-seed and verify**

Run: `pnpm --filter @repo/backend run seed`
Expected: `Seed complete: 3 users (1 participant + super/event admin), 10 speakers, 9 events, 4 registrations, 3 certificates, 1 speed-dating, 2 announcements` (unchanged message — categories aren't newly created here, just referenced). No errors about missing categories (they were created by Task 1's migration and persist across reseeds, since `seed.ts` never deletes `EventCategory` rows).

- [ ] **Step 3: Commit**

```bash
git add apps/backend/src/db/prisma/seed.ts
git commit -m "fix(seed): connect events to their category by name instead of a free-text string"
```

---

### Task 8: Admin FE — Category management page + modal + nav

**Files:**
- Create: `apps/frontend/src/components/CategoryFormModal.tsx`
- Create: `apps/frontend/src/pages/categories/CategoriesPage.tsx`
- Modify: `apps/frontend/src/app/App.tsx`
- Modify: `apps/frontend/src/layouts/AdminShell.tsx`

**Interfaces:**
- Consumes: `AdminCategoryDTO`, `CreateCategoryInput`, `UpdateCategoryInput` (Task 2); `GET/POST/PATCH/DELETE /admin/categories` (Task 4); `FIELD_CLASS` from `apps/frontend/src/pages/events/workspace/fieldStyles.ts`; `api`/`ApiRequestError` from `apps/frontend/src/services/api.ts`.
- Produces: `<CategoryFormModal>` (consumed by this task's `CategoriesPage` and by Tasks 9-10's combobox "+ Create new category" action — props: `category: AdminCategoryDTO | null`, `initialName?: string`, `onClose: () => void`, `onSaved: (category: AdminCategoryDTO) => void`).

- [ ] **Step 1: Write `CategoryFormModal.tsx`**

```tsx
import { useState, type FormEvent } from "react";
import type { AdminCategoryDTO, CreateCategoryInput, UpdateCategoryInput } from "@repo/shared-types";
import { api, ApiRequestError } from "../services/api";
import { FIELD_CLASS } from "../pages/events/workspace/fieldStyles";

interface CategoryFormModalProps {
  /** null = create mode; an existing category = edit mode. */
  category: AdminCategoryDTO | null;
  /** Create mode only — pre-fills the name field from the event form combobox's typed query. */
  initialName?: string;
  onClose: () => void;
  onSaved: (category: AdminCategoryDTO) => void;
}

interface FormState {
  name: string;
  isActive: boolean;
}

function fromCategory(c: AdminCategoryDTO | null, initialName?: string): FormState {
  return {
    name: c?.name ?? initialName ?? "",
    isActive: c?.isActive ?? true,
  };
}

export function CategoryFormModal({ category, initialName, onClose, onSaved }: CategoryFormModalProps) {
  const [form, setForm] = useState<FormState>(fromCategory(category, initialName));
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
      const saved = category
        ? await api.patch<AdminCategoryDTO>(`/admin/categories/${category.id}`, {
            name: form.name.trim(),
            isActive: form.isActive,
          } as UpdateCategoryInput)
        : await api.post<AdminCategoryDTO>("/admin/categories", {
            name: form.name.trim(),
          } as CreateCategoryInput);
      onSaved(saved);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.apiError.message : "Failed to save category.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4" onClick={onClose}>
      <div className="w-full max-w-sm rounded-2xl bg-white p-6" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-base font-bold text-ink">{category ? "Edit Category" : "Add Category"}</h2>

        {error && <p className="mt-3 text-sm font-medium text-status-red">{error}</p>}

        <form onSubmit={onSubmit} className="mt-4 space-y-4">
          <div>
            <label className="mb-1 block text-xs font-semibold text-muted">Name</label>
            <input
              required
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              className={FIELD_CLASS}
            />
          </div>
          {category && (
            <label className="flex items-center gap-2 text-sm text-ink">
              <input
                type="checkbox"
                checked={form.isActive}
                onChange={(e) => set("isActive", e.target.checked)}
              />
              Active (shown as a selectable option on events)
            </label>
          )}

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
              {saving ? "Saving…" : "Save Category"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Write `CategoriesPage.tsx`**

```tsx
import { useEffect, useState } from "react";
import type { AdminCategoryDTO } from "@repo/shared-types";
import { api, ApiRequestError } from "../../services/api";
import { useToastStore } from "../../store/toastStore";
import { CategoryFormModal } from "../../components/CategoryFormModal";
import { SearchIcon, PlusIcon, EditIcon, TrashIcon } from "../../components/icons";
import { FIELD_CLASS } from "../events/workspace/fieldStyles";

export function CategoriesPage() {
  const [categories, setCategories] = useState<AdminCategoryDTO[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modal, setModal] = useState<{ open: boolean; category: AdminCategoryDTO | null }>({
    open: false,
    category: null,
  });
  const showToast = useToastStore((s) => s.show);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      setCategories(await api.get<AdminCategoryDTO[]>("/admin/categories?includeInactive=true"));
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.apiError.message : "Failed to load categories.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const filtered = query
    ? categories.filter((c) => c.name.toLowerCase().includes(query.toLowerCase()))
    : categories;

  async function onDelete(category: AdminCategoryDTO) {
    if (!window.confirm(`Deactivate ${category.name}?`)) return;
    try {
      await api.delete(`/admin/categories/${category.id}`);
      showToast("Category deactivated.");
      void load();
    } catch (err) {
      showToast(err instanceof ApiRequestError ? err.apiError.message : "Failed to deactivate category.");
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-ink">Category Management</h1>
          <p className="mt-1 text-sm text-muted">
            Create categories once, then pick them from each event&apos;s Overview tab.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setModal({ open: true, category: null })}
          className="inline-flex shrink-0 items-center gap-2 rounded-full bg-primary px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-primary-dark"
        >
          <PlusIcon width={16} height={16} /> Add Category
        </button>
      </div>

      <div className="relative mt-5 max-w-sm">
        <SearchIcon width={16} height={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search categories by name..."
          className={`${FIELD_CLASS} pl-9`}
        />
      </div>

      {error && <p className="mt-4 text-sm font-medium text-status-red">{error}</p>}

      <div className="mt-4 overflow-hidden rounded-2xl border border-line bg-white">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-line text-xs font-semibold uppercase tracking-wide text-muted">
            <tr>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Events</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={4} className="px-4 py-8 text-center text-muted">Loading…</td></tr>
            )}
            {!loading && filtered.length === 0 && (
              <tr><td colSpan={4} className="px-4 py-8 text-center text-muted">No categories yet. Add your first category.</td></tr>
            )}
            {filtered.map((c) => (
              <tr key={c.id} className="border-b border-line last:border-b-0">
                <td className="px-4 py-3 font-medium text-ink">{c.name}</td>
                <td className="px-4 py-3">
                  {c.isActive ? (
                    <span className="rounded-md bg-primary-50 px-2 py-0.5 text-xs font-semibold text-primary">Active</span>
                  ) : (
                    <span className="rounded-md bg-surface px-2 py-0.5 text-xs font-semibold text-muted">Inactive</span>
                  )}
                </td>
                <td className="px-4 py-3 text-muted">{c.eventCount}</td>
                <td className="px-4 py-3">
                  <div className="flex justify-end gap-1">
                    <button
                      type="button"
                      onClick={() => setModal({ open: true, category: c })}
                      aria-label={`Edit ${c.name}`}
                      className="rounded-full p-2 text-muted transition-colors hover:bg-surface hover:text-primary"
                    >
                      <EditIcon width={16} height={16} />
                    </button>
                    <button
                      type="button"
                      onClick={() => void onDelete(c)}
                      aria-label={`Deactivate ${c.name}`}
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
        <CategoryFormModal
          category={modal.category}
          onClose={() => setModal({ open: false, category: null })}
          onSaved={() => {
            setModal({ open: false, category: null });
            showToast("Category saved.");
            void load();
          }}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 3: Add the route in `App.tsx`**

Add the import next to the existing `SpeakersPage` import:

```ts
import { SpeakersPage } from "../pages/speakers/SpeakersPage";
import { CategoriesPage } from "../pages/categories/CategoriesPage";
```

Add the route next to the existing speakers route:

```tsx
          <Route path="speakers" element={<SpeakersPage />} />
          <Route path="categories" element={<CategoriesPage />} />
```

- [ ] **Step 4: Add the sidebar nav item in `AdminShell.tsx`**

Add `FilterIcon` to the existing icons import:

```ts
import {
  AwardIcon,
  BarChartIcon,
  BellIcon,
  FilterIcon,
  GridIcon,
  HeartIcon,
  HomeIcon,
  MailIcon,
  MicIcon,
  SearchIcon,
  SettingsIcon,
  ShieldIcon,
  SidebarIcon,
  StarIcon,
  UsersIcon,
} from "../components/icons";
```

Add the nav entry right after Speakers in the `NAV` array:

```ts
      { to: "/speakers", label: "Speakers", icon: MicIcon, permission: Permission.EVENT_UPDATE },
      { to: "/categories", label: "Categories", icon: FilterIcon, permission: Permission.EVENT_UPDATE },
```

- [ ] **Step 5: Verify**

Run: `pnpm --filter @repo/frontend exec tsc --noEmit 2>&1 | grep -E "CategoryFormModal|CategoriesPage|App.tsx|AdminShell.tsx"` — these 4 files should show no errors. (The rest of the frontend will still show errors from `EventFormPage.tsx`/`OverviewTab.tsx` until Tasks 9-10 — expected per Global Constraints.)

- [ ] **Step 6: Commit**

```bash
git add apps/frontend/src/components/CategoryFormModal.tsx apps/frontend/src/pages/categories/CategoriesPage.tsx apps/frontend/src/app/App.tsx apps/frontend/src/layouts/AdminShell.tsx
git commit -m "feat(admin-fe): Category management page, modal, route, and nav item"
```

---

### Task 9: Admin FE — EventFormPage combobox

**Files:**
- Modify: `apps/frontend/src/pages/events/EventFormPage.tsx`

**Interfaces:**
- Consumes: `CategoryFormModal` (Task 8); `GET /admin/categories?q=` (Task 4); `AdminCategoryDTO`, `AdminEventInput` (Task 2).

- [ ] **Step 1: Update imports and `FormState`**

Add to the imports:

```ts
import { useEffect, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import type { AdminCategoryDTO, AdminEventInput, EventDTO } from "@repo/shared-types";
import { api, ApiRequestError } from "../../services/api";
import { CategoryFormModal } from "../../components/CategoryFormModal";
```

Change `FormState`'s `category: string;` to:

```ts
  categoryId: string;
  categoryName: string;
```

Change `EMPTY`'s `category: "",` to:

```ts
  categoryId: "",
  categoryName: "",
```

- [ ] **Step 2: Add combobox state and the debounced search effect**

Inside the `EventFormPage` component, after the existing `const [saving, setSaving] = useState(false);` line, add:

```ts
  const [categoryQuery, setCategoryQuery] = useState("");
  const [categoryResults, setCategoryResults] = useState<AdminCategoryDTO[]>([]);
  const [creatingCategory, setCreatingCategory] = useState(false);

  useEffect(() => {
    if (!categoryQuery.trim()) {
      setCategoryResults([]);
      return;
    }
    const t = setTimeout(() => {
      api
        .get<AdminCategoryDTO[]>(`/admin/categories?q=${encodeURIComponent(categoryQuery.trim())}`)
        .then(setCategoryResults)
        .catch(() => setCategoryResults([]));
    }, 250);
    return () => clearTimeout(t);
  }, [categoryQuery]);

  function selectCategory(c: { id: string; name: string }) {
    set("categoryId", c.id);
    set("categoryName", c.name);
    setCategoryQuery("");
    setCategoryResults([]);
  }
```

- [ ] **Step 3: Update the submit payload**

Change:

```ts
        category: form.category,
```

to:

```ts
        categoryId: form.categoryId,
```

- [ ] **Step 4: Replace the category `<input>` with the combobox**

Replace:

```tsx
          <div>
            <label className="mb-1 block text-xs font-semibold text-muted">Category</label>
            <input
              required
              value={form.category}
              onChange={(e) => set("category", e.target.value)}
              className={FIELD_CLASS}
            />
          </div>
```

with:

```tsx
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
```

- [ ] **Step 5: Render the create-category modal**

Right before the closing `</div>` of the component's returned JSX (after the `</form>` tag), add:

```tsx
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
```

- [ ] **Step 6: Verify**

Run: `pnpm --filter @repo/frontend exec tsc --noEmit 2>&1 | grep EventFormPage` — expected: no errors in this file.

- [ ] **Step 7: Commit**

```bash
git add apps/frontend/src/pages/events/EventFormPage.tsx
git commit -m "feat(admin-fe): replace free-text category input with the category combobox on the create form"
```

---

### Task 10: Admin FE — OverviewTab combobox

**Files:**
- Modify: `apps/frontend/src/pages/events/workspace/OverviewTab.tsx`

**Interfaces:**
- Consumes: same as Task 9 (`CategoryFormModal`, `GET /admin/categories?q=`, `AdminCategoryDTO`).
- Produces: `OverviewTab`'s PATCH payload now sends `categoryId` instead of `category`.

- [ ] **Step 1: Update imports and `FormState`**

Add to the imports:

```ts
import type {
  AdminCategoryDTO,
  AdminCertificateDTO,
  AdminEventFeedbackDTO,
  AdminEventInput,
  AdminRegistrationDTO,
  AdminSpeakerDTO,
  AdminSpeedDatingRegistrationDTO,
  EventDTO,
} from "@repo/shared-types";
import { CategoryFormModal } from "../../../components/CategoryFormModal";
```

Change `FormState`'s `category: string;` to:

```ts
  categoryId: string;
  categoryName: string;
```

Change `fromEvent`'s `category: e.category,` to:

```ts
    categoryId: e.categoryId,
    categoryName: e.category,
```

- [ ] **Step 2: Add combobox state and the debounced search effect**

Right after the existing `const [creatingSpeaker, setCreatingSpeaker] = useState(false);` line, add:

```ts
  const [categoryQuery, setCategoryQuery] = useState("");
  const [categoryResults, setCategoryResults] = useState<AdminCategoryDTO[]>([]);
  const [creatingCategory, setCreatingCategory] = useState(false);

  useEffect(() => {
    if (!categoryQuery.trim()) {
      setCategoryResults([]);
      return;
    }
    const t = setTimeout(() => {
      api
        .get<AdminCategoryDTO[]>(`/admin/categories?q=${encodeURIComponent(categoryQuery.trim())}`)
        .then(setCategoryResults)
        .catch(() => setCategoryResults([]));
    }, 250);
    return () => clearTimeout(t);
  }, [categoryQuery]);

  function selectCategory(c: { id: string; name: string }) {
    set("categoryId", c.id);
    set("categoryName", c.name);
    setCategoryQuery("");
    setCategoryResults([]);
  }
```

- [ ] **Step 3: Update the submit payload**

Change:

```ts
        category: form.category,
```

to:

```ts
        categoryId: form.categoryId,
```

- [ ] **Step 4: Replace the category `<input>` with the combobox**

Replace:

```tsx
          <div>
            <label className="mb-1 block text-xs font-semibold text-muted">Category</label>
            <input required value={form.category} onChange={(e) => set("category", e.target.value)} className={FIELD_CLASS} />
          </div>
```

with:

```tsx
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
```

- [ ] **Step 5: Render the create-category modal**

Right after the existing `{creatingSpeaker && (...)}` block (still inside the component's top-level returned `<div>`), add:

```tsx
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
```

- [ ] **Step 6: Verify**

Run: `pnpm --filter @repo/frontend exec tsc --noEmit 2>&1 | grep OverviewTab` — expected: no errors in this file.

- [ ] **Step 7: Commit**

```bash
git add apps/frontend/src/pages/events/workspace/OverviewTab.tsx
git commit -m "feat(admin-fe): replace free-text category input with the category combobox in the event workspace"
```

---

### Task 11: Final verification

**Files:** none (verification only).

- [ ] **Step 1: Full backend verification**

Run: `pnpm --filter @repo/backend typecheck` — expected: clean.
Run: `pnpm --filter @repo/backend test` — expected: all test files pass.

- [ ] **Step 2: Full frontend verification**

Run: `pnpm --filter @repo/frontend typecheck` — expected: clean.

- [ ] **Step 3: Re-seed and confirm canonical state**

Run: `pnpm --filter @repo/backend run seed` — expected: same success message as Task 7, no errors.

- [ ] **Step 4: Live browser walkthrough**

Start both dev servers (backend `:4001`, frontend admin `:5184` per this repo's `.claude/launch.json`), log in as `superadmin@gdn-commerce.com`, and confirm:

1. The sidebar shows a new "Categories" nav item; the Category Management page lists exactly 5 active categories (Leadership, Self Development, Technology, Career Growth, Design), each with a correct event count.
2. Opening an existing event's Overview tab shows its correct current category name in the picker.
3. Creating a new event: typing in the Category field shows matching results; selecting one populates it; typing a brand-new name and clicking "+ Create new category" opens the modal pre-filled with that typed text, and saving it both creates the category and selects it on the form.
4. Deactivating a category with zero upcoming events succeeds; it disappears from the combobox's search results afterward but still appears (marked Inactive) on the Category Management page.
5. Attempting to deactivate a category still used by an upcoming (non-completed/cancelled/archived) event is blocked with a clear message.
6. The Analytics page's "Events by Category" chart still renders correctly with real category names.
7. (bliblitalk-user-fe, per Decision #4 — should need zero changes) Load the portal's dashboard and an event detail page; confirm poster gradients and category filter tabs still work exactly as before, unaffected by this migration.

- [ ] **Step 5: Report**

Confirm all checks above pass; this phase is ready for final whole-branch review and merge per `superpowers:subagent-driven-development`.
