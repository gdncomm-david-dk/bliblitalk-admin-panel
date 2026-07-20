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

-- Add the FK column nullable first, backfill by matching the old free-text value
-- (trimmed + case-insensitive, so stray casing/whitespace in legacy data still
-- lands on the right canonical category) ...
ALTER TABLE "Event" ADD COLUMN "categoryId" TEXT;
UPDATE "Event" SET "categoryId" = 'cat_leadership' WHERE TRIM("category") ILIKE 'Leadership';
UPDATE "Event" SET "categoryId" = 'cat_selfdevelopment' WHERE TRIM("category") ILIKE 'Self Development';
UPDATE "Event" SET "categoryId" = 'cat_technology' WHERE TRIM("category") ILIKE 'Technology';
UPDATE "Event" SET "categoryId" = 'cat_careergrowth' WHERE TRIM("category") ILIKE 'Career Growth';
UPDATE "Event" SET "categoryId" = 'cat_design' WHERE TRIM("category") ILIKE 'Design';

-- ...then sweep anything still unmatched (typos, other free-typed values, blanks)
-- into a category named after its own literal value, so no row is ever left
-- orphaned and this migration can never abort on dirty legacy data.
INSERT INTO "EventCategory" ("id", "name")
SELECT 'cat_legacy_' || md5(COALESCE(NULLIF(TRIM(leftover."category"), ''), 'uncategorized')),
       COALESCE(NULLIF(TRIM(leftover."category"), ''), 'Uncategorized')
FROM (SELECT DISTINCT "category" FROM "Event" WHERE "categoryId" IS NULL) AS leftover
ON CONFLICT ("name") DO NOTHING;

-- NB: cast the RHS to citext explicitly. "name" is citext but TRIM(...) yields a
-- definite text value, and citext=text resolves to case-SENSITIVE text equality
-- (the text->citext cast is assignment-only, citext->text is implicit). Without
-- this cast a case-variant duplicate that the INSERT above collapsed to one row
-- (e.g. 'Product' vs 'product') would leave the non-surviving-case event orphaned.
UPDATE "Event" e
SET "categoryId" = c."id"
FROM "EventCategory" c
WHERE e."categoryId" IS NULL
  AND c."name" = (COALESCE(NULLIF(TRIM(e."category"), ''), 'Uncategorized'))::citext;

ALTER TABLE "Event" ALTER COLUMN "categoryId" SET NOT NULL;
ALTER TABLE "Event" DROP COLUMN "category";

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "EventCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
