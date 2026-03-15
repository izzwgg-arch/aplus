-- Check all scheduled emails (QUEUED, SENDING, SENT, FAILED)
SELECT 
  id,
  status,
  "scheduledSendAt",
  "queuedAt",
  "sentAt",
  "errorMessage",
  "toEmail",
  "entityId"
FROM "EmailQueueItem"
WHERE "scheduledSendAt" IS NOT NULL
ORDER BY "scheduledSendAt" DESC
LIMIT 10;
