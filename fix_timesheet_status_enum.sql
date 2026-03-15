-- Fix TimesheetStatus enum type
-- Convert column to text first
ALTER TABLE "Timesheet" ALTER COLUMN "status" TYPE TEXT USING "status"::TEXT;

-- Drop old enum types
DROP TYPE IF EXISTS "TimesheetStatus_old" CASCADE;
DROP TYPE IF EXISTS "TimesheetStatus_new" CASCADE;
DROP TYPE IF EXISTS "TimesheetStatus" CASCADE;

-- Recreate the correct enum type with all values
CREATE TYPE "TimesheetStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED', 'LOCKED', 'QUEUED_FOR_EMAIL', 'EMAILED');

-- Update the column back to use the enum
ALTER TABLE "Timesheet" ALTER COLUMN "status" TYPE "TimesheetStatus" USING "status"::"TimesheetStatus";
ALTER TABLE "Timesheet" ALTER COLUMN "status" SET DEFAULT 'DRAFT';
