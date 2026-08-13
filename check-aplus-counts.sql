SELECT 'Client' AS table_name, COUNT(*)::int AS count FROM aplus_sched."Client"
UNION ALL
SELECT 'Service', COUNT(*)::int FROM aplus_sched."Service"
UNION ALL
SELECT 'Appointment', COUNT(*)::int FROM aplus_sched."Appointment"
UNION ALL
SELECT 'Provider', COUNT(*)::int FROM aplus_sched."Provider";
