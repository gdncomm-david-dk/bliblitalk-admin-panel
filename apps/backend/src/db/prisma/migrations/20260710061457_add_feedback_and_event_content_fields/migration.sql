-- AlterTable
ALTER TABLE "Event" ADD COLUMN     "displayConfig" JSONB NOT NULL DEFAULT '{"pastEvent":true,"speaker":true,"gallery":true,"keyTakeaways":true,"recording":true,"certificate":true}',
ADD COLUMN     "presentationUrl" TEXT;

-- CreateTable
CREATE TABLE "Feedback" (
    "id" TEXT NOT NULL,
    "registrationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "overallRating" INTEGER NOT NULL,
    "topicRating" INTEGER NOT NULL,
    "qnaRating" INTEGER NOT NULL,
    "contentRating" INTEGER NOT NULL,
    "speakerRating" INTEGER NOT NULL,
    "venueRating" INTEGER NOT NULL,
    "timingRating" INTEGER NOT NULL,
    "npsScore" INTEGER NOT NULL,
    "takeaway" TEXT,
    "topicsWanted" TEXT,
    "speakerWanted" TEXT,
    "comments" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Feedback_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Feedback_registrationId_key" ON "Feedback"("registrationId");

-- AddForeignKey
ALTER TABLE "Feedback" ADD CONSTRAINT "Feedback_registrationId_fkey" FOREIGN KEY ("registrationId") REFERENCES "Registration"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Feedback" ADD CONSTRAINT "Feedback_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Feedback" ADD CONSTRAINT "Feedback_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
