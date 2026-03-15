-- Update the scheduled email to send in 2 minutes
UPDATE "EmailQueueItem" 
SET 
  status = 'QUEUED', 
  "scheduledSendAt" = NOW() + INTERVAL '2 minutes'
WHERE id = 'cmkbtmne00007132pzt16qkzz';

-- Verify
SELECT id, status, "scheduledSendAt", NOW() as current_time, "scheduledSendAt" <= NOW() as ready_to_send
FROM "EmailQueueItem" 
WHERE id = 'cmkbtmne00007132pzt16qkzz';
