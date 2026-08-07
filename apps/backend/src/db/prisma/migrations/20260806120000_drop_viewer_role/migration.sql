-- Owner decision (2026-08-06): the VIEWER tier is retired. Read-only observers were never
-- part of the intended org model — every remaining Admin CMS role (SUPER_ADMIN, EVENT_ADMIN,
-- HR_TA) is someone who acts on events, so a role that could only look at them was dead weight
-- and one more surface to reason about in the RBAC matrix.
--
-- Postgres has no ALTER TYPE ... DROP VALUE, so the enum type is recreated. Two consequences
-- this migration handles explicitly:
--
--   1. Existing VIEWER rows must be moved off the value BEFORE the cast, or the USING clause
--      fails on them. They are moved to PARTICIPANT, not to another admin role: PARTICIPANT is
--      the least-privilege landing spot (isAdminRole() is false for it, so the account simply
--      loses CMS access rather than silently gaining shortlist/user-management rights it never
--      had). A Super Admin can re-grant a real role from the Role page afterwards.
--   2. "User"."role" carries a DEFAULT, which pins the old type and must be dropped before the
--      column can be retyped, then restored.

-- AlterEnum
BEGIN;
UPDATE "User" SET "role" = 'PARTICIPANT' WHERE "role" = 'VIEWER';

CREATE TYPE "Role_new" AS ENUM ('SUPER_ADMIN', 'EVENT_ADMIN', 'HR_TA', 'PARTICIPANT');
ALTER TABLE "User" ALTER COLUMN "role" DROP DEFAULT;
ALTER TABLE "User" ALTER COLUMN "role" TYPE "Role_new" USING ("role"::text::"Role_new");
ALTER TYPE "Role" RENAME TO "Role_old";
ALTER TYPE "Role_new" RENAME TO "Role";
DROP TYPE "Role_old";
ALTER TABLE "User" ALTER COLUMN "role" SET DEFAULT 'PARTICIPANT';
COMMIT;
