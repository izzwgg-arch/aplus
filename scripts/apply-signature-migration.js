const { PrismaClient } = require('@prisma/client')
const fs = require('fs')
const path = require('path')

const prisma = new PrismaClient()

async function applyMigration() {
  try {
    // Create tables directly
    const createTables = `
      CREATE TABLE IF NOT EXISTS "SignatureImportBatch" (
        "id" TEXT NOT NULL,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "createdByUserId" TEXT NOT NULL,
        "type" TEXT NOT NULL DEFAULT 'SIGNATURE_IMPORT',
        "notes" TEXT,
        CONSTRAINT "SignatureImportBatch_pkey" PRIMARY KEY ("id")
      );

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
    `
    
    await prisma.$executeRawUnsafe(createTables)
    console.log('✓ Tables created')
    
    // Create indexes
    const createIndexes = `
      CREATE INDEX IF NOT EXISTS "SignatureImportBatch_createdAt_idx" ON "SignatureImportBatch"("createdAt" DESC);
      CREATE INDEX IF NOT EXISTS "SignatureImportBatch_createdByUserId_idx" ON "SignatureImportBatch"("createdByUserId");
      CREATE INDEX IF NOT EXISTS "SignatureImportBatchItem_batchId_idx" ON "SignatureImportBatchItem"("batchId");
      CREATE INDEX IF NOT EXISTS "SignatureImportBatchItem_entityType_entityId_idx" ON "SignatureImportBatchItem"("entityType", "entityId");
    `
    
    await prisma.$executeRawUnsafe(createIndexes)
    console.log('✓ Indexes created')
    
    // Add foreign keys (with error handling)
    try {
      await prisma.$executeRawUnsafe(`
        ALTER TABLE "SignatureImportBatch" 
        ADD CONSTRAINT "SignatureImportBatch_createdByUserId_fkey" 
        FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
      `)
      console.log('✓ Foreign key for SignatureImportBatch created')
    } catch (error) {
      if (error.message.includes('already exists')) {
        console.log('⚠ Foreign key for SignatureImportBatch already exists')
      } else {
        throw error
      }
    }
    
    try {
      await prisma.$executeRawUnsafe(`
        ALTER TABLE "SignatureImportBatchItem" 
        ADD CONSTRAINT "SignatureImportBatchItem_batchId_fkey" 
        FOREIGN KEY ("batchId") REFERENCES "SignatureImportBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
      `)
      console.log('✓ Foreign key for SignatureImportBatchItem created')
    } catch (error) {
      if (error.message.includes('already exists')) {
        console.log('⚠ Foreign key for SignatureImportBatchItem already exists')
      } else {
        throw error
      }
    }
    
    console.log('✅ Migration applied successfully')
    process.exit(0)
  } catch (error) {
    console.error('❌ Migration error:', error.message)
    process.exit(1)
  } finally {
    await prisma.$disconnect()
  }
}

applyMigration()
