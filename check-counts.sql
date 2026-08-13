SELECT 'aplus_sched.Client' AS table_name, COUNT(*)::int AS count FROM aplus_sched."Client"
UNION ALL
SELECT 'aplus_sched.Service', COUNT(*)::int FROM aplus_sched."Service"
UNION ALL
SELECT 'aplus_sched.Appointment', COUNT(*)::int FROM aplus_sched."Appointment"
UNION ALL
SELECT 'public.Client', COUNT(*)::int FROM public."Client"
UNION ALL
SELECT 'public.Service', COUNT(*)::int FROM public."Service"
UNION ALL
SELECT 'public.Appointment', COUNT(*)::int FROM public."Appointment";
