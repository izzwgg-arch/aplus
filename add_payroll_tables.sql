-- Payroll Management Tables Migration
-- This migration adds all payroll-related tables

-- Create enums
DO $$ BEGIN
    CREATE TYPE "PayrollRunStatus" AS ENUM ('DRAFT', 'APPROVED', 'PAID', 'PARTIALLY_PAID');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE "PayrollEventType" AS ENUM ('IN', 'OUT');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- PayrollEmployee table
CREATE TABLE IF NOT EXISTS "PayrollEmployee" (
    "id" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "scannerCode" TEXT,
    "userId" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "payType" TEXT NOT NULL DEFAULT 'hourly',
    "hourlyRate" DECIMAL(10, 2) NOT NULL,
    "dailyRate" DECIMAL(10, 2),
    "perShiftRate" DECIMAL(10, 2),
    "weeklyOTAfter" INTEGER NOT NULL DEFAULT 40,
    "dailyOTEnabled" BOOLEAN NOT NULL DEFAULT false,
    "roundingRule" TEXT NOT NULL DEFAULT 'none',
    "breakDeduction" BOOLEAN NOT NULL DEFAULT false,
    "breakMinutes" INTEGER NOT NULL DEFAULT 0,
    "laborBurdenPct" DECIMAL(5, 2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "PayrollEmployee_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "PayrollEmployee_userId_deletedAt_idx" ON "PayrollEmployee"("userId", "deletedAt");
CREATE INDEX IF NOT EXISTS "PayrollEmployee_scannerCode_deletedAt_idx" ON "PayrollEmployee"("scannerCode", "deletedAt");
CREATE INDEX IF NOT EXISTS "PayrollEmployee_deletedAt_idx" ON "PayrollEmployee"("deletedAt");

-- PayrollImportTemplate table
CREATE TABLE IF NOT EXISTS "PayrollImportTemplate" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "employeeColumn" TEXT NOT NULL,
    "timestampColumn" TEXT,
    "dateColumn" TEXT,
    "timeColumn" TEXT,
    "eventTypeColumn" TEXT,
    "timezone" TEXT NOT NULL DEFAULT 'America/New_York',
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PayrollImportTemplate_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "PayrollImportTemplate_createdById_idx" ON "PayrollImportTemplate"("createdById");

-- PayrollImport table
CREATE TABLE IF NOT EXISTS "PayrollImport" (
    "id" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileHash" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "rowCount" INTEGER NOT NULL,
    "importedRows" INTEGER NOT NULL,
    "skippedRows" INTEGER NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'America/New_York',
    "templateId" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PayrollImport_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "PayrollImport_createdById_idx" ON "PayrollImport"("createdById");
CREATE INDEX IF NOT EXISTS "PayrollImport_fileHash_idx" ON "PayrollImport"("fileHash");

-- PayrollTimeLog table
CREATE TABLE IF NOT EXISTS "PayrollTimeLog" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT,
    "employeeCode" TEXT,
    "employeeName" TEXT,
    "timestamp" TIMESTAMP(3) NOT NULL,
    "eventType" "PayrollEventType",
    "timezone" TEXT NOT NULL DEFAULT 'America/New_York',
    "importId" TEXT NOT NULL,
    "fileHash" TEXT NOT NULL,
    "rowSignature" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PayrollTimeLog_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "PayrollTimeLogUnique" UNIQUE ("fileHash", "rowSignature")
);

CREATE INDEX IF NOT EXISTS "PayrollTimeLog_employeeId_timestamp_idx" ON "PayrollTimeLog"("employeeId", "timestamp");
CREATE INDEX IF NOT EXISTS "PayrollTimeLog_timestamp_idx" ON "PayrollTimeLog"("timestamp");
CREATE INDEX IF NOT EXISTS "PayrollTimeLog_importId_idx" ON "PayrollTimeLog"("importId");
CREATE INDEX IF NOT EXISTS "PayrollTimeLog_employeeCode_idx" ON "PayrollTimeLog"("employeeCode");

-- PayrollRun table
CREATE TABLE IF NOT EXISTS "PayrollRun" (
    "id" TEXT NOT NULL,
    "name" TEXT,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "status" "PayrollRunStatus" NOT NULL DEFAULT 'DRAFT',
    "totalGross" DECIMAL(10, 2) NOT NULL,
    "totalPaid" DECIMAL(10, 2) NOT NULL,
    "totalRemaining" DECIMAL(10, 2) NOT NULL,
    "laborBurdenPct" DECIMAL(5, 2),
    "createdById" TEXT NOT NULL,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PayrollRun_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "PayrollRun_startDate_endDate_idx" ON "PayrollRun"("startDate", "endDate");
CREATE INDEX IF NOT EXISTS "PayrollRun_status_idx" ON "PayrollRun"("status");
CREATE INDEX IF NOT EXISTS "PayrollRun_createdById_idx" ON "PayrollRun"("createdById");

-- PayrollRunLineItem table
CREATE TABLE IF NOT EXISTS "PayrollRunLineItem" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "totalHours" DECIMAL(10, 2) NOT NULL,
    "regularHours" DECIMAL(10, 2) NOT NULL,
    "overtimeHours" DECIMAL(10, 2) NOT NULL,
    "grossPay" DECIMAL(10, 2) NOT NULL,
    "adjustments" DECIMAL(10, 2) NOT NULL DEFAULT 0,
    "loadedCost" DECIMAL(10, 2),
    "paidAmount" DECIMAL(10, 2) NOT NULL DEFAULT 0,
    "remainingBalance" DECIMAL(10, 2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PayrollRunLineItem_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "PayrollRunLineItem_runId_employeeId_key" UNIQUE ("runId", "employeeId")
);

CREATE INDEX IF NOT EXISTS "PayrollRunLineItem_runId_idx" ON "PayrollRunLineItem"("runId");
CREATE INDEX IF NOT EXISTS "PayrollRunLineItem_employeeId_idx" ON "PayrollRunLineItem"("employeeId");

-- PayrollAdjustment table
CREATE TABLE IF NOT EXISTS "PayrollAdjustment" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "lineItemId" TEXT NOT NULL,
    "amount" DECIMAL(10, 2) NOT NULL,
    "reason" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PayrollAdjustment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "PayrollAdjustment_runId_idx" ON "PayrollAdjustment"("runId");
CREATE INDEX IF NOT EXISTS "PayrollAdjustment_lineItemId_idx" ON "PayrollAdjustment"("lineItemId");
CREATE INDEX IF NOT EXISTS "PayrollAdjustment_createdById_idx" ON "PayrollAdjustment"("createdById");

-- PayrollPayment table
CREATE TABLE IF NOT EXISTS "PayrollPayment" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "lineItemId" TEXT NOT NULL,
    "amount" DECIMAL(10, 2) NOT NULL,
    "paymentDate" TIMESTAMP(3) NOT NULL,
    "paymentMethod" TEXT NOT NULL,
    "referenceNumber" TEXT,
    "note" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PayrollPayment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "PayrollPayment_runId_idx" ON "PayrollPayment"("runId");
CREATE INDEX IF NOT EXISTS "PayrollPayment_lineItemId_idx" ON "PayrollPayment"("lineItemId");
CREATE INDEX IF NOT EXISTS "PayrollPayment_paymentDate_idx" ON "PayrollPayment"("paymentDate");
CREATE INDEX IF NOT EXISTS "PayrollPayment_createdById_idx" ON "PayrollPayment"("createdById");

-- PayrollAllocationBucket table
CREATE TABLE IF NOT EXISTS "PayrollAllocationBucket" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "PayrollAllocationBucket_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "PayrollAllocationBucket_name_key" UNIQUE ("name")
);

CREATE INDEX IF NOT EXISTS "PayrollAllocationBucket_deletedAt_idx" ON "PayrollAllocationBucket"("deletedAt");

-- PayrollAllocation table
CREATE TABLE IF NOT EXISTS "PayrollAllocation" (
    "id" TEXT NOT NULL,
    "lineItemId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "bucketId" TEXT NOT NULL,
    "amount" DECIMAL(10, 2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PayrollAllocation_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "PayrollAllocation_lineItemId_bucketId_key" UNIQUE ("lineItemId", "bucketId")
);

CREATE INDEX IF NOT EXISTS "PayrollAllocation_lineItemId_idx" ON "PayrollAllocation"("lineItemId");
CREATE INDEX IF NOT EXISTS "PayrollAllocation_employeeId_idx" ON "PayrollAllocation"("employeeId");
CREATE INDEX IF NOT EXISTS "PayrollAllocation_bucketId_idx" ON "PayrollAllocation"("bucketId");

-- PayrollReportArtifact table
CREATE TABLE IF NOT EXISTS "PayrollReportArtifact" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "runId" TEXT,
    "employeeId" TEXT,
    "month" INTEGER,
    "year" INTEGER,
    "fileName" TEXT NOT NULL,
    "filePath" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "mimeType" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PayrollReportArtifact_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "PayrollReportArtifact_runId_idx" ON "PayrollReportArtifact"("runId");
CREATE INDEX IF NOT EXISTS "PayrollReportArtifact_employeeId_idx" ON "PayrollReportArtifact"("employeeId");
CREATE INDEX IF NOT EXISTS "PayrollReportArtifact_type_month_year_idx" ON "PayrollReportArtifact"("type", "month", "year");
CREATE INDEX IF NOT EXISTS "PayrollReportArtifact_createdById_idx" ON "PayrollReportArtifact"("createdById");

-- Add foreign key constraints
DO $$ BEGIN
    ALTER TABLE "PayrollEmployee" ADD CONSTRAINT "PayrollEmployee_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "PayrollImportTemplate" ADD CONSTRAINT "PayrollImportTemplate_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "PayrollImport" ADD CONSTRAINT "PayrollImport_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "PayrollImport" ADD CONSTRAINT "PayrollImport_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "PayrollImportTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "PayrollTimeLog" ADD CONSTRAINT "PayrollTimeLog_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "PayrollEmployee"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "PayrollTimeLog" ADD CONSTRAINT "PayrollTimeLog_importId_fkey" FOREIGN KEY ("importId") REFERENCES "PayrollImport"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "PayrollRun" ADD CONSTRAINT "PayrollRun_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "PayrollRun" ADD CONSTRAINT "PayrollRun_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "PayrollRunLineItem" ADD CONSTRAINT "PayrollRunLineItem_runId_fkey" FOREIGN KEY ("runId") REFERENCES "PayrollRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "PayrollRunLineItem" ADD CONSTRAINT "PayrollRunLineItem_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "PayrollEmployee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "PayrollAdjustment" ADD CONSTRAINT "PayrollAdjustment_runId_fkey" FOREIGN KEY ("runId") REFERENCES "PayrollRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "PayrollAdjustment" ADD CONSTRAINT "PayrollAdjustment_lineItemId_fkey" FOREIGN KEY ("lineItemId") REFERENCES "PayrollRunLineItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "PayrollAdjustment" ADD CONSTRAINT "PayrollAdjustment_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "PayrollPayment" ADD CONSTRAINT "PayrollPayment_runId_fkey" FOREIGN KEY ("runId") REFERENCES "PayrollRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "PayrollPayment" ADD CONSTRAINT "PayrollPayment_lineItemId_fkey" FOREIGN KEY ("lineItemId") REFERENCES "PayrollRunLineItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "PayrollPayment" ADD CONSTRAINT "PayrollPayment_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "PayrollAllocation" ADD CONSTRAINT "PayrollAllocation_lineItemId_fkey" FOREIGN KEY ("lineItemId") REFERENCES "PayrollRunLineItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "PayrollAllocation" ADD CONSTRAINT "PayrollAllocation_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "PayrollEmployee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "PayrollAllocation" ADD CONSTRAINT "PayrollAllocation_bucketId_fkey" FOREIGN KEY ("bucketId") REFERENCES "PayrollAllocationBucket"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "PayrollReportArtifact" ADD CONSTRAINT "PayrollReportArtifact_runId_fkey" FOREIGN KEY ("runId") REFERENCES "PayrollRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "PayrollReportArtifact" ADD CONSTRAINT "PayrollReportArtifact_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "PayrollEmployee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "PayrollReportArtifact" ADD CONSTRAINT "PayrollReportArtifact_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;
