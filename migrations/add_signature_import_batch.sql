-- CreateTable
CREATE TABLE IF NOT EXISTS "SignatureImportBatch" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdByUserId" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'SIGNATURE_IMPORT',
    "notes" TEXT,

    CONSTRAINT "SignatureImportBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "SignatureImportBatchItem" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "originalSignatureUrl" TEXT,
    "newSignatureUrl" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SignatureImportBatchItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "SignatureImportBatch_createdAt_idx" ON "SignatureImportBatch"("createdAt" DESC);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "SignatureImportBatch_createdByUserId_idx" ON "SignatureImportBatch"("createdByUserId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "SignatureImportBatchItem_batchId_idx" ON "SignatureImportBatchItem"("batchId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "SignatureImportBatchItem_entityType_entityId_idx" ON "SignatureImportBatchItem"("entityType", "entityId");

-- AddForeignKey
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'SignatureImportBatch_createdByUserId_fkey'
    ) THEN
        ALTER TABLE "SignatureImportBatch" ADD CONSTRAINT "SignatureImportBatch_createdByUserId_fkey" 
        FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;
END $$;

-- AddForeignKey
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'SignatureImportBatchItem_batchId_fkey'
    ) THEN
        ALTER TABLE "SignatureImportBatchItem" ADD CONSTRAINT "SignatureImportBatchItem_batchId_fkey" 
        FOREIGN KEY ("batchId") REFERENCES "SignatureImportBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;
