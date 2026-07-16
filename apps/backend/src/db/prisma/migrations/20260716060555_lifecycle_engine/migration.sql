-- Rebuild EventStatus 5 -> 8 (all existing values carry over unchanged; no data remap here — P7 handles that)
ALTER TYPE "EventStatus" RENAME TO "EventStatus_old";
CREATE TYPE "EventStatus" AS ENUM ('DRAFT','PUBLISHED','REGISTRATION_OPEN','REGISTRATION_CLOSED','ONGOING','COMPLETED','CANCELLED','ARCHIVED');
ALTER TABLE "Event" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "Event" ALTER COLUMN "status" TYPE "EventStatus" USING ("status"::text::"EventStatus");
ALTER TABLE "Event" ALTER COLUMN "status" SET DEFAULT 'DRAFT';
DROP TYPE "EventStatus_old";

-- New SelectionMode enum + column, backfilled from the legacy showRemainingSeats proxy
CREATE TYPE "SelectionMode" AS ENUM ('FCFS','CURATED');
ALTER TABLE "Event" ADD COLUMN "selectionMode" "SelectionMode" NOT NULL DEFAULT 'FCFS';
UPDATE "Event" SET "selectionMode" = 'CURATED' WHERE "showRemainingSeats" = false;

-- Lifecycle columns
ALTER TABLE "Event" ADD COLUMN "statusChangedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "Event" ADD COLUMN "isOverdue" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Event" ADD COLUMN "gracePeriodMinutes" INTEGER NOT NULL DEFAULT 120;
ALTER TABLE "Event" ADD COLUMN "autoCompleteAfterMinutes" INTEGER NOT NULL DEFAULT 2880;

-- CreateTable
CREATE TABLE "EventStatusHistory" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "fromStatus" "EventStatus",
    "toStatus" "EventStatus" NOT NULL,
    "actorType" TEXT NOT NULL,
    "actorId" TEXT,
    "reason" TEXT,
    "sideEffectsStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EventStatusHistory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EventStatusHistory_eventId_createdAt_idx" ON "EventStatusHistory"("eventId", "createdAt");

-- AddForeignKey
ALTER TABLE "EventStatusHistory" ADD CONSTRAINT "EventStatusHistory_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
