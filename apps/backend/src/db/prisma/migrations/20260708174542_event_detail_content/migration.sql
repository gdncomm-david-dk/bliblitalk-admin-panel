-- AlterTable
ALTER TABLE "Event" ADD COLUMN     "agenda" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "discussionPoints" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "dressCode" TEXT,
ADD COLUMN     "eventCode" TEXT,
ADD COLUMN     "eventType" TEXT,
ADD COLUMN     "faqs" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "galleryImages" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "importantNotes" TEXT,
ADD COLUMN     "language" TEXT,
ADD COLUMN     "learningPoints" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "organizedBy" TEXT,
ADD COLUMN     "registrationDeadline" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Speaker" ADD COLUMN     "bioLong" TEXT,
ADD COLUMN     "credentials" TEXT[] DEFAULT ARRAY[]::TEXT[];
