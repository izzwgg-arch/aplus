-- Create Community Tables
-- Run this on the server to create the Community module tables

-- Create CommunityClient table
CREATE TABLE IF NOT EXISTS "CommunityClient" (
  id TEXT PRIMARY KEY,
  "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW(),
  "deletedAt" TIMESTAMP,
  status TEXT DEFAULT 'ACTIVE',
  "firstName" TEXT NOT NULL,
  "lastName" TEXT NOT NULL,
  address TEXT,
  city TEXT,
  state TEXT,
  "zipCode" TEXT,
  phone TEXT,
  email TEXT,
  notes TEXT
);

-- Create CommunityClass table
CREATE TABLE IF NOT EXISTS "CommunityClass" (
  id TEXT PRIMARY KEY,
  "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW(),
  name TEXT NOT NULL,
  "ratePerUnit" DECIMAL(10,2) NOT NULL,
  "isActive" BOOLEAN DEFAULT true,
  "deletedAt" TIMESTAMP
);

-- Create CommunityInvoiceStatus enum
DO $$ BEGIN
  CREATE TYPE "CommunityInvoiceStatus" AS ENUM ('DRAFT', 'APPROVED', 'REJECTED', 'QUEUED', 'EMAILED', 'FAILED');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Create CommunityInvoice table
CREATE TABLE IF NOT EXISTS "CommunityInvoice" (
  id TEXT PRIMARY KEY,
  "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW(),
  "deletedAt" TIMESTAMP,
  "clientId" TEXT NOT NULL,
  "classId" TEXT NOT NULL,
  units INTEGER NOT NULL,
  "unitMinutes" INTEGER DEFAULT 30,
  "ratePerUnit" DECIMAL(10,2) NOT NULL,
  "totalAmount" DECIMAL(10,2) NOT NULL,
  status "CommunityInvoiceStatus" DEFAULT 'DRAFT',
  "approvedAt" TIMESTAMP,
  "approvedByUserId" TEXT,
  "rejectedAt" TIMESTAMP,
  "rejectedByUserId" TEXT,
  "queuedAt" TIMESTAMP,
  "emailedAt" TIMESTAMP,
  notes TEXT,
  "serviceDate" TIMESTAMP,
  "createdByUserId" TEXT NOT NULL,
  FOREIGN KEY ("clientId") REFERENCES "CommunityClient"(id),
  FOREIGN KEY ("classId") REFERENCES "CommunityClass"(id)
);

-- Create indexes
CREATE INDEX IF NOT EXISTS "CommunityClient_deletedAt_idx" ON "CommunityClient"("deletedAt");
CREATE INDEX IF NOT EXISTS "CommunityClass_deletedAt_idx" ON "CommunityClass"("deletedAt");
CREATE INDEX IF NOT EXISTS "CommunityInvoice_status_createdAt_idx" ON "CommunityInvoice"("status", "createdAt");
CREATE INDEX IF NOT EXISTS "CommunityInvoice_clientId_deletedAt_idx" ON "CommunityInvoice"("clientId", "deletedAt");
CREATE INDEX IF NOT EXISTS "CommunityInvoice_classId_deletedAt_idx" ON "CommunityInvoice"("classId", "deletedAt");
CREATE INDEX IF NOT EXISTS "CommunityInvoice_deletedAt_idx" ON "CommunityInvoice"("deletedAt");
