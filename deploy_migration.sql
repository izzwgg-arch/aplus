-- Add EmailQueueContext enum
CREATE TYPE "EmailQueueContext" AS ENUM ('MAIN', 'COMMUNITY');

-- Add context and attachment fields to EmailQueueItem
ALTER TABLE "EmailQueueItem" ADD COLUMN IF NOT EXISTS "context" "EmailQueueContext";
ALTER TABLE "EmailQueueItem" ADD COLUMN IF NOT EXISTS "attachmentKey" TEXT;
ALTER TABLE "EmailQueueItem" ADD COLUMN IF NOT EXISTS "attachmentUrl" TEXT;
ALTER TABLE "EmailQueueItem" ADD COLUMN IF NOT EXISTS "attachmentFilename" TEXT;

-- Add community email queue permissions to Role
ALTER TABLE "Role" ADD COLUMN IF NOT EXISTS "communityEmailQueueView" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Role" ADD COLUMN IF NOT EXISTS "communityEmailQueueSendNow" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Role" ADD COLUMN IF NOT EXISTS "communityEmailQueueSchedule" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Role" ADD COLUMN IF NOT EXISTS "communityEmailQueueDelete" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Role" ADD COLUMN IF NOT EXISTS "communityEmailQueueAttachPdf" BOOLEAN NOT NULL DEFAULT false;

-- Set context for existing COMMUNITY_INVOICE items
UPDATE "EmailQueueItem" SET "context" = 'COMMUNITY' WHERE "entityType" = 'COMMUNITY_INVOICE' AND "context" IS NULL;

-- Set context for existing REGULAR and BCBA items
UPDATE "EmailQueueItem" SET "context" = 'MAIN' WHERE "entityType" IN ('REGULAR', 'BCBA') AND "context" IS NULL;
