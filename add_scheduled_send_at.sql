-- Add scheduledSendAt column to EmailQueueItem
ALTER TABLE "EmailQueueItem" ADD COLUMN IF NOT EXISTS "scheduledSendAt" TIMESTAMP(3);

-- Create index for scheduled email processing
CREATE INDEX IF NOT EXISTS "EmailQueueItem_scheduledSendAt_status_idx" ON "EmailQueueItem"("scheduledSendAt", "status");
