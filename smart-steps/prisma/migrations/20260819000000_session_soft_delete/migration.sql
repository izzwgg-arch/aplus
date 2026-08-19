-- SmartSteps: soft-delete for sessions.
-- A session that is not needed (accidental start, duplicate, empty entry) can be
-- removed from every list/report without destroying the clinical record: the row
-- stays in the DB with "deletedAt" stamped, and its trials are stamped too so the
-- existing `deletedAt: null` trial filters exclude them from analytics.
-- Additive, nullable, idempotent — safe to re-run and to roll back.

ALTER TABLE "Session" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "Session_deletedAt_idx" ON "Session"("deletedAt");
CREATE INDEX IF NOT EXISTS "Session_clientId_startedAt_idx" ON "Session"("clientId", "startedAt");
