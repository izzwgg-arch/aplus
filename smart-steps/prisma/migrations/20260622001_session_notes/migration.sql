-- SmartSteps: Session Notes System
-- Extends the existing Note model with new fields.
-- Does NOT alter any other tables.
-- All new columns are nullable (backward compatible with any existing Note rows).

ALTER TABLE "Note" ADD COLUMN IF NOT EXISTS "title"           TEXT;
ALTER TABLE "Note" ADD COLUMN IF NOT EXISTS "sessionId"       TEXT;
ALTER TABLE "Note" ADD COLUMN IF NOT EXISTS "bcbaServiceType" TEXT;
ALTER TABLE "Note" ADD COLUMN IF NOT EXISTS "serviceDate"     TIMESTAMP(3);
ALTER TABLE "Note" ADD COLUMN IF NOT EXISTS "timeIn"          TEXT;
ALTER TABLE "Note" ADD COLUMN IF NOT EXISTS "timeOut"         TEXT;
ALTER TABLE "Note" ADD COLUMN IF NOT EXISTS "attendance"      TEXT;
ALTER TABLE "Note" ADD COLUMN IF NOT EXISTS "recommendations" TEXT;
ALTER TABLE "Note" ADD COLUMN IF NOT EXISTS "nextSteps"       TEXT;
ALTER TABLE "Note" ADD COLUMN IF NOT EXISTS "providerName"    TEXT;
ALTER TABLE "Note" ADD COLUMN IF NOT EXISTS "isGenerated"     BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS "Note_serviceDate_idx" ON "Note"("serviceDate");
CREATE INDEX IF NOT EXISTS "Note_sessionId_idx"   ON "Note"("sessionId");

DO $$ BEGIN
  ALTER TABLE "Note"
    ADD CONSTRAINT "Note_sessionId_fkey"
    FOREIGN KEY ("sessionId") REFERENCES "Session"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
