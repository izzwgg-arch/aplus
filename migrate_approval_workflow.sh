#!/bin/bash
# Migration script for approval workflow and email queue

sudo -u postgres psql -d apluscenter << 'EOF'
-- CreateEnum for TimesheetStatus
DO $$ BEGIN
  CREATE TYPE "TimesheetStatus_new" AS ENUM ('DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED', 'LOCKED', 'QUEUED_FOR_EMAIL', 'EMAILED');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

ALTER TABLE "Timesheet" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "Timesheet" ALTER COLUMN "status" TYPE "TimesheetStatus_new" USING ("status"::text::"TimesheetStatus_new");
DROP TYPE IF EXISTS "TimesheetStatus_old";
ALTER TYPE "TimesheetStatus_new" RENAME TO "TimesheetStatus";
ALTER TABLE "Timesheet" ALTER COLUMN "status" SET DEFAULT 'DRAFT';

-- CreateEnum for AuditAction
DO $$ BEGIN
  CREATE TYPE "AuditAction_new" AS ENUM ('CREATE', 'UPDATE', 'DELETE', 'APPROVE', 'REJECT', 'SUBMIT', 'LOCK', 'GENERATE', 'PAYMENT', 'ADJUSTMENT', 'LOGIN', 'EMAIL_SENT', 'EMAIL_FAILED', 'TIMESHEET_APPROVED', 'TIMESHEET_REJECTED', 'BCBA_TIMESHEET_APPROVED', 'BCBA_TIMESHEET_REJECTED', 'USER_PASSWORD_SET');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

ALTER TABLE "AuditLog" ALTER COLUMN "action" DROP DEFAULT;
ALTER TABLE "AuditLog" ALTER COLUMN "action" TYPE "AuditAction_new" USING ("action"::text::"AuditAction_new");
DROP TYPE IF EXISTS "AuditAction_old";
ALTER TYPE "AuditAction_new" RENAME TO "AuditAction";

-- AlterTable User
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "tempPasswordHash" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "tempPasswordExpiresAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "lastLoginAt" TIMESTAMP(3);

-- AlterTable Timesheet
ALTER TABLE "Timesheet" ADD COLUMN IF NOT EXISTS "queuedForEmailAt" TIMESTAMP(3);
ALTER TABLE "Timesheet" ADD COLUMN IF NOT EXISTS "emailedAt" TIMESTAMP(3);
ALTER TABLE "Timesheet" ADD COLUMN IF NOT EXISTS "emailedBatchId" TEXT;
ALTER TABLE "Timesheet" ADD COLUMN IF NOT EXISTS "emailStatus" TEXT;
ALTER TABLE "Timesheet" ADD COLUMN IF NOT EXISTS "emailError" TEXT;

-- AlterTable AuditLog
DO $$ BEGIN
  ALTER TABLE "AuditLog" RENAME COLUMN "entity" TO "entityType";
EXCEPTION
  WHEN undefined_column THEN null;
END $$;
ALTER TABLE "AuditLog" ADD COLUMN IF NOT EXISTS "metadata" TEXT;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Timesheet_status_deletedAt_idx" ON "Timesheet"("status", "deletedAt");
CREATE INDEX IF NOT EXISTS "Timesheet_emailStatus_deletedAt_idx" ON "Timesheet"("emailStatus", "deletedAt");
CREATE INDEX IF NOT EXISTS "AuditLog_entityType_entityId_idx" ON "AuditLog"("entityType", "entityId");

-- CreateTable EmailQueueItem
CREATE TABLE IF NOT EXISTS "EmailQueueItem" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "queuedByUserId" TEXT NOT NULL,
    "queuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMP(3),
    "batchId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "EmailQueueItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "EmailQueueItem_status_createdAt_idx" ON "EmailQueueItem"("status", "createdAt");
CREATE INDEX IF NOT EXISTS "EmailQueueItem_type_status_idx" ON "EmailQueueItem"("type", "status");
CREATE INDEX IF NOT EXISTS "EmailQueueItem_batchId_idx" ON "EmailQueueItem"("batchId");

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "EmailQueueItem" ADD CONSTRAINT "EmailQueueItem_queuedByUserId_fkey" FOREIGN KEY ("queuedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
EOF

echo "Migration completed successfully!"
