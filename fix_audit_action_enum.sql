-- Fix AuditAction enum type
-- Convert column to text first
ALTER TABLE "AuditLog" ALTER COLUMN "action" TYPE TEXT USING "action"::TEXT;

-- Drop old enum types
DROP TYPE IF EXISTS "AuditAction_old" CASCADE;
DROP TYPE IF EXISTS "AuditAction_new" CASCADE;
DROP TYPE IF EXISTS "AuditAction" CASCADE;

-- Recreate the correct enum type with all values
CREATE TYPE "AuditAction" AS ENUM ('CREATE', 'UPDATE', 'DELETE', 'APPROVE', 'REJECT', 'SUBMIT', 'LOCK', 'GENERATE', 'PAYMENT', 'ADJUSTMENT', 'LOGIN', 'EMAIL_SENT', 'EMAIL_FAILED', 'TIMESHEET_APPROVED', 'TIMESHEET_REJECTED', 'BCBA_TIMESHEET_APPROVED', 'BCBA_TIMESHEET_REJECTED', 'USER_PASSWORD_SET');

-- Update the column back to use the enum
ALTER TABLE "AuditLog" ALTER COLUMN "action" TYPE "AuditAction" USING "action"::"AuditAction";
