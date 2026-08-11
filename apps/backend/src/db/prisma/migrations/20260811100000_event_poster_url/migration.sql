-- Owner decision (2026-08-11): each banner surface must be replaceable on its own, so the image
-- an admin uploads actually fits where it is shown.
--
-- Two columns could not do that. The UI renders three genuinely different shapes: a ~4:1 hero
-- strip, a ~16:10 card, and the portrait poster column of a My Events row. One image forced into
-- all three is cropped wrongly in at least two of them. A third column is the smallest change that
-- gives one image per shape; grouping by shape (3) rather than by slot (8) is deliberate, since
-- five of the slots are the same card shape and would otherwise mean five identical uploads.
--
-- Nullable with no default and no backfill: existing events keep exactly the images they have, and
-- the application falls back poster -> thumbnail -> banner, so nothing renders empty.
--
-- ASCII only, deliberately: prisma migrate validates against a shadow database whose client
-- encoding is WIN1252 on Windows, and characters like the arrow glyph fail there (P3006).

-- AlterTable
ALTER TABLE "Event" ADD COLUMN "posterUrl" TEXT;
