-- CreateEnum
CREATE TYPE "Role" AS ENUM ('SUPER_ADMIN', 'EVENT_ADMIN', 'HR_TA', 'VIEWER', 'PARTICIPANT');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "role" "Role" NOT NULL DEFAULT 'PARTICIPANT';

-- CreateTable
CREATE TABLE "_EventAdmins" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_EventAdmins_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE INDEX "_EventAdmins_B_index" ON "_EventAdmins"("B");

-- AddForeignKey
ALTER TABLE "_EventAdmins" ADD CONSTRAINT "_EventAdmins_A_fkey" FOREIGN KEY ("A") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_EventAdmins" ADD CONSTRAINT "_EventAdmins_B_fkey" FOREIGN KEY ("B") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
