SELECT "createdAt", "detailsJson"
FROM aplus_sched."AuditLog"
WHERE action = 'CLIENTS_CSV_IMPORTED'
ORDER BY "createdAt" DESC
LIMIT 5;
