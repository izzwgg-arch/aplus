-- Reset the failed email back to QUEUED so it can be retried
UPDATE "EmailQueueItem" 
SET 
  status = 'QUEUED', 
  "errorMessage" = NULL,
  "scheduledSendAt" = NOW()
WHERE id = 'cmkbk9e1u0004qnoy52zxpu9u';

-- Verify the update
SELECT id, status, "scheduledSendAt", "errorMessage" 
FROM "EmailQueueItem" 
WHERE id = 'cmkbk9e1u0004qnoy52zxpu9u';
