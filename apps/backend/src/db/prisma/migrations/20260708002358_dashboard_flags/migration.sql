-- AlterTable
ALTER TABLE "Event" ADD COLUMN     "featured" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "recommended" BOOLEAN NOT NULL DEFAULT false;
