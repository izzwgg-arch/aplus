-- Fix EmailQueueItem migration
-- Add new columns
ALTER TABLE "EmailQueueItem" ADD COLUMN IF NOT EXISTS "entityType" "EmailQueueEntityType";
ALTER TABLE "EmailQueueItem" ADD COLUMN IF NOT EXISTS "errorMessage" TEXT;

-- Migrate data from old columns to new
UPDATE "EmailQueueItem" SET "entityType" = 
  CASE 
    WHEN "type" = 'BCBA_TIMESHEET' OR "type" = 'BCBA' THEN 'BCBA'::"EmailQueueEntityType"
    ELSE 'REGULAR'::"EmailQueueEntityType"
  END
WHERE "entityType" IS NULL;

UPDATE "EmailQueueItem" SET "errorMessage" = "lastError" 
WHERE "errorMessage" IS NULL AND "lastError" IS NOT NULL;

-- Make entityType required (after data migration)
ALTER TABLE "EmailQueueItem" ALTER COLUMN "entityType" SET NOT NULL;

-- Update status to use enum
ALTER TABLE "EmailQueueItem" ALTER COLUMN "status" TYPE TEXT USING "status"::TEXT;
ALTER TABLE "EmailQueueItem" ALTER COLUMN "status" TYPE "EmailQueueStatus" USING 
  CASE 
    WHEN "status" = 'QUEUED' THEN 'QUEUED'::"EmailQueueStatus"
    WHEN "status" = 'SENT' THEN 'SENT'::"EmailQueueStatus"
    WHEN "status" = 'FAILED' THEN 'FAILED'::"EmailQueueStatus"
    WHEN "status" = 'SENDING' THEN 'SENDING'::"EmailQueueStatus"
    ELSE 'QUEUED'::"EmailQueueStatus"
  END;
ALTER TABLE "EmailQueueItem" ALTER COLUMN "status" SET DEFAULT 'QUEUED';

-- Drop old columns
ALTER TABLE "EmailQueueItem" DROP COLUMN IF EXISTS "type";
ALTER TABLE "EmailQueueItem" DROP COLUMN IF EXISTS "lastError";

-- Add unique constraint if it doesn't exist
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'EmailQueueItem_entityType_entityId_key'
  ) THEN
    ALTER TABLE "EmailQueueItem" ADD CONSTRAINT "EmailQueueItem_entityType_entityId_key" 
      UNIQUE ("entityType", "entityId");
  END IF;
END $$;

SELECT 'Migration completed' AS result;
