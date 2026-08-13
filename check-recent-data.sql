SELECT id, "fullName", "createdAt"
FROM aplus_sched."Client"
ORDER BY "createdAt" DESC
LIMIT 5;

SELECT id, name, "createdAt", "isActive"
FROM aplus_sched."Service"
ORDER BY "createdAt" DESC
LIMIT 10;
