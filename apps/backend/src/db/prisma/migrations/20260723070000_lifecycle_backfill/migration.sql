-- P7: backfill lifecycle status + history for events that predate the P1 engine
-- (or were seeded directly with a non-DRAFT status). General — matches any
-- historyless non-DRAFT row, not specific event IDs. Runs in three ordered
-- steps: A must run before B/C so they see the corrected status.

-- Step A: promote PUBLISHED rows whose registration should already be open.
-- A PUBLISHED row with a genuine future registrationOpensAt is already
-- correct and is left alone — it will auto-advance via the P2 scheduler.
UPDATE "Event" e
SET status = 'REGISTRATION_OPEN'
WHERE status = 'PUBLISHED'
  AND (e."registrationOpensAt" IS NULL OR e."registrationOpensAt" <= CURRENT_TIMESTAMP)
  AND NOT EXISTS (SELECT 1 FROM "EventStatusHistory" h WHERE h."eventId" = e.id);

-- Step B: backfill statusChangedAt using each status's own natural boundary
-- (mirrors scheduleDecisions.ts's own transition rules, not an arbitrary "now").
UPDATE "Event" e
SET "statusChangedAt" = CASE e.status
  WHEN 'REGISTRATION_OPEN' THEN COALESCE(e."publishedAt", CURRENT_TIMESTAMP)
  WHEN 'REGISTRATION_CLOSED' THEN COALESCE(e."registrationDeadline", e."startsAt")
  WHEN 'ONGOING' THEN e."startsAt"
  WHEN 'COMPLETED' THEN e."endsAt" + (e."autoCompleteAfterMinutes" * INTERVAL '1 minute')
  ELSE CURRENT_TIMESTAMP
END
WHERE e.status != 'DRAFT'
  AND NOT EXISTS (SELECT 1 FROM "EventStatusHistory" h WHERE h."eventId" = e.id);

-- Step C: insert one synthetic history row per affected event (fromStatus
-- is NULL because there is no real prior transition to record).
INSERT INTO "EventStatusHistory"
  (id, "eventId", "fromStatus", "toStatus", "actorType", "actorId", "reason", "sideEffectsStatus", "createdAt")
SELECT
  'histbf_' || e.id,
  e.id,
  NULL,
  e.status,
  'SYSTEM',
  NULL,
  'backfill',
  CASE WHEN e.status = 'COMPLETED' THEN 'DONE' ELSE 'NONE' END,
  e."statusChangedAt"
FROM "Event" e
WHERE e.status != 'DRAFT'
  AND NOT EXISTS (SELECT 1 FROM "EventStatusHistory" h WHERE h."eventId" = e.id);
