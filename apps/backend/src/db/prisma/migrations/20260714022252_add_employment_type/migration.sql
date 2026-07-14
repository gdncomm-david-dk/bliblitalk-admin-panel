-- CreateEnum
CREATE TYPE "EmploymentType" AS ENUM ('INTERNAL', 'EXTERNAL');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "employmentType" "EmploymentType" NOT NULL DEFAULT 'EXTERNAL';
