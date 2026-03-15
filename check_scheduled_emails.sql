SELECT 
  id, 
  status, 
  "scheduledSendAt", 
  "queuedAt", 
  "sentAt", 
  "errorMessage",
  "toEmail",
  "entityType"
FROM "EmailQueueItem" 
WHERE "scheduledSendAt" IS NOT NULL 
ORDER BY "scheduledSendAt" DESC 
LIMIT 10;
