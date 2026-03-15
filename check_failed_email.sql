-- Check the failed email details
SELECT 
  id, 
  "entityId",
  status, 
  "scheduledSendAt", 
  "queuedAt", 
  "sentAt", 
  "errorMessage",
  "toEmail",
  "entityType"
FROM "EmailQueueItem" 
WHERE id = 'cmkbk9e1u0004qnoy52zxpu9u';

-- Check if the invoice exists
SELECT 
  id,
  status,
  "deletedAt",
  "clientId",
  "classId"
FROM "CommunityInvoice"
WHERE id = (
  SELECT "entityId" 
  FROM "EmailQueueItem" 
  WHERE id = 'cmkbk9e1u0004qnoy52zxpu9u'
);
