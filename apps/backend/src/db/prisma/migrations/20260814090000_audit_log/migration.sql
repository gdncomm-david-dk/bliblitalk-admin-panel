-- SEC-011: the registrant and per-event participant CSV exports pulled full contact PII with
-- no privilege beyond page-browse and left no trace of who took it. The export now runs
-- server-side behind `registrant:export` and writes one row here per export.
--
-- `actorId` is a plain column, not a foreign key to "User". That is the same choice
-- "EventStatusHistory"."actorId" already makes, and for the same reason: an audit row that a
-- cascading delete can remove is not an audit row. `actorEmail` is denormalised alongside it
-- so the trail still names the person if the account is later removed.
--
-- No grant for bliblitalk_public. SEC-031 removed the `ALTER DEFAULT PRIVILEGES ... GRANT
-- SELECT` that used to hand the internet-facing role read access to every future table, and
-- provision-public-role.sql enumerates its reads explicitly — so this table is unreadable from
-- the public app without someone adding it there on purpose. Nothing to do here; noted because
-- it is the property that makes a new admin-only table safe by default.

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "actorEmail" TEXT NOT NULL,
    "actorRole" TEXT NOT NULL,
    "targetType" TEXT,
    "targetId" TEXT,
    "rowCount" INTEGER,
    "detail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AuditLog_action_createdAt_idx" ON "AuditLog"("action", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_actorId_createdAt_idx" ON "AuditLog"("actorId", "createdAt");
