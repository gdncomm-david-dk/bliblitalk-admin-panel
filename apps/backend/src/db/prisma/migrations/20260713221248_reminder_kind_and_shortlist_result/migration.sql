-- CreateEnum
CREATE TYPE "ReminderKind" AS ENUM ('CUSTOM', 'SHORTLIST_RESULT');

-- AlterTable
ALTER TABLE "EventReminder" ADD COLUMN     "bodyHtmlNotShortlisted" TEXT,
ADD COLUMN     "kind" "ReminderKind" NOT NULL DEFAULT 'CUSTOM',
ADD COLUMN     "subjectNotShortlisted" TEXT;
