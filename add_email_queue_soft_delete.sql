-- Add soft delete fields to EmailQueueItem table
-- This migration adds deletedAt and deletedByUserId columns for soft delete functionality

ALTER TABLE "EmailQueueItem" 
ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP NULL,
ADD COLUMN IF NOT EXISTS "deletedByUserId" TEXT NULL;

-- Create index on deletedAt for faster queries
CREATE INDEX IF NOT EXISTS "EmailQueueItem_deletedAt_idx" ON "EmailQueueItem"("deletedAt");

-- Create index on entityType, entityId, deletedAt for efficient lookups
CREATE INDEX IF NOT EXISTS "EmailQueueItem_entityType_entityId_deletedAt_idx" ON "EmailQueueItem"("entityType", "entityId", "deletedAt");

-- Add foreign key constraint for deletedByUserId (optional, can be added if needed)
-- ALTER TABLE "EmailQueueItem" ADD CONSTRAINT "EmailQueueItem_deletedByUserId_fkey" 
-- FOREIGN KEY ("deletedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Note: The unique constraint on (entityType, entityId) was removed to allow re-queueing after soft delete
-- If you need to enforce uniqueness for non-deleted items, you can add a partial unique index:
-- CREATE UNIQUE INDEX "EmailQueueItem_entityType_entityId_unique" ON "EmailQueueItem"("entityType", "entityId") 
-- WHERE "deletedAt" IS NULL;
