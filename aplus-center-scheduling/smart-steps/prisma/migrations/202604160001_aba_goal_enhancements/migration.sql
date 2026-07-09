ALTER TABLE "Target" ADD COLUMN IF NOT EXISTS "dateMastered" TIMESTAMP(3);
ALTER TABLE "Session" ADD COLUMN IF NOT EXISTS "mode" TEXT NOT NULL DEFAULT 'DTT';
ALTER TABLE "Trial" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);
ALTER TABLE "Trial" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

UPDATE "Target"
SET "dateMastered" = NULLIF(("masteryRule"->>'masteredDate'), '')::timestamp
WHERE "dateMastered" IS NULL
  AND "masteryRule" IS NOT NULL
  AND ("masteryRule"->>'masteredDate') IS NOT NULL
  AND ("masteryRule"->>'masteredDate') <> '';

CREATE TABLE IF NOT EXISTS "TargetAnnotation" (
  "id" TEXT NOT NULL,
  "targetId" TEXT NOT NULL,
  "userId" TEXT,
  "note" TEXT NOT NULL,
  "annotatedAt" TIMESTAMP(3) NOT NULL,
  "isVisible" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TargetAnnotation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "TargetLibraryItem" (
  "id" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "operationalDefinition" TEXT,
  "targetType" TEXT NOT NULL DEFAULT 'DISCRETE_TRIAL',
  "masteryRule" JSONB,
  "promptHierarchy" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "baseline" TEXT,
  "notes" TEXT,
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TargetLibraryItem_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "Trial_deletedAt_idx" ON "Trial"("deletedAt");
CREATE INDEX IF NOT EXISTS "TargetAnnotation_targetId_annotatedAt_idx" ON "TargetAnnotation"("targetId", "annotatedAt");

DO $$ BEGIN
  ALTER TABLE "TargetAnnotation"
    ADD CONSTRAINT "TargetAnnotation_targetId_fkey"
    FOREIGN KEY ("targetId") REFERENCES "Target"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "TargetAnnotation"
    ADD CONSTRAINT "TargetAnnotation_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;