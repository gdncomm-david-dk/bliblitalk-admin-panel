-- AlterTable
ALTER TABLE "Event" ADD COLUMN     "subtitle" TEXT,
ADD COLUMN     "tags" TEXT[] DEFAULT ARRAY[]::TEXT[];
