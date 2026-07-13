-- Phase 5.5 lifecycle refactor.
-- Adds organizer/lifecycle fields, remaps EventStatus (UPCOMING->PUBLISHED) and
-- RegistrationStatus (legacy REJECTED cancellations -> CANCELLED), preserving data.

-- ---- Registration: lifecycle timestamps ----
ALTER TABLE "Registration" ADD COLUMN "shortlistedAt" TIMESTAMP(3);
ALTER TABLE "Registration" ADD COLUMN "checkedInAt" TIMESTAMP(3);
ALTER TABLE "Registration" ADD COLUMN "cancelledAt" TIMESTAMP(3);

-- ---- Event: organizer controls + lifecycle ----
ALTER TABLE "Event" ADD COLUMN "ownerId" TEXT;
ALTER TABLE "Event" ADD COLUMN "showRemainingSeats" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Event" ADD COLUMN "enableCertificate" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Event" ADD COLUMN "enableFeedback" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Event" ADD COLUMN "waitingListEnabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Event" ADD COLUMN "registrationOpensAt" TIMESTAMP(3);
ALTER TABLE "Event" ADD COLUMN "publishedAt" TIMESTAMP(3);
ALTER TABLE "Event" ADD COLUMN "venue" TEXT;
ALTER TABLE "Event" ADD COLUMN "mapsUrl" TEXT;

-- ---- EventStatus enum: rebuild with 5-state lifecycle, remap old values ----
ALTER TYPE "EventStatus" RENAME TO "EventStatus_old";
CREATE TYPE "EventStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'REGISTRATION_CLOSED', 'COMPLETED', 'CANCELLED');
ALTER TABLE "Event" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "Event" ALTER COLUMN "status" TYPE "EventStatus" USING (
  CASE "status"::text
    WHEN 'UPCOMING' THEN 'PUBLISHED'
    WHEN 'COMPLETED' THEN 'COMPLETED'
    ELSE 'DRAFT'
  END::"EventStatus"
);
ALTER TABLE "Event" ALTER COLUMN "status" SET DEFAULT 'DRAFT';
DROP TYPE "EventStatus_old";
-- Backfill publishedAt for events that were live before this migration.
UPDATE "Event" SET "publishedAt" = COALESCE("publishedAt", "startsAt") WHERE "status" = 'PUBLISHED';

-- ---- RegistrationStatus enum: add CANCELLED, remap legacy cancellations ----
ALTER TYPE "RegistrationStatus" RENAME TO "RegistrationStatus_old";
CREATE TYPE "RegistrationStatus" AS ENUM ('REGISTERED', 'WAITING', 'REJECTED', 'SHORTLISTED', 'CANCELLED');
ALTER TABLE "Registration" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "Registration" ALTER COLUMN "status" TYPE "RegistrationStatus" USING (
  CASE "status"::text
    WHEN 'REJECTED' THEN 'CANCELLED'
    ELSE "status"::text
  END::"RegistrationStatus"
);
ALTER TABLE "Registration" ALTER COLUMN "status" SET DEFAULT 'REGISTERED';
DROP TYPE "RegistrationStatus_old";
-- Backfill cancelledAt for the remapped cancellations.
UPDATE "Registration" SET "cancelledAt" = COALESCE("cancelledAt", "createdAt") WHERE "status" = 'CANCELLED';

-- ---- Event.ownerId FK ----
ALTER TABLE "Event" ADD CONSTRAINT "Event_ownerId_fkey"
  FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
