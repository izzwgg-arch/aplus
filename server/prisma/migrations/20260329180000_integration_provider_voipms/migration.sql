SET search_path TO aplus_sched;

DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    JOIN pg_namespace n ON t.typnamespace = n.oid
    WHERE n.nspname = 'aplus_sched'
      AND t.typname = 'IntegrationProvider'
      AND e.enumlabel = 'VOIPMS'
  ) THEN
    ALTER TYPE "IntegrationProvider" ADD VALUE 'VOIPMS';
  END IF;
END
$do$;
