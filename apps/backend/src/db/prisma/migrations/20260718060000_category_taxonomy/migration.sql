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
