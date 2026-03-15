const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

async function completeEmailQueueMigration() {
  try {
    console.log('Completing EmailQueueItem migration...')
    
    await prisma.$executeRawUnsafe('ALTER TABLE "EmailQueueItem" ALTER COLUMN "type" TYPE TEXT USING "type"::TEXT;')
    await prisma.$executeRawUnsafe('ALTER TABLE "EmailQueueItem" ALTER COLUMN "status" TYPE TEXT USING "status"::TEXT;')
    await prisma.$executeRawUnsafe('ALTER TABLE "EmailQueueItem" ADD COLUMN IF NOT EXISTS "entityType" "EmailQueueEntityType";')
    await prisma.$executeRawUnsafe('ALTER TABLE "EmailQueueItem" ADD COLUMN IF NOT EXISTS "errorMessage" TEXT;')
    
    await prisma.$executeRawUnsafe(`UPDATE "EmailQueueItem" SET "entityType" = 
      CASE 
        WHEN "type" = 'BCBA_TIMESHEET' THEN 'BCBA'::"EmailQueueEntityType"
        ELSE 'REGULAR'::"EmailQueueEntityType"
      END
    WHERE "entityType" IS NULL;`)
    
    await prisma.$executeRawUnsafe('UPDATE "EmailQueueItem" SET "errorMessage" = "lastError" WHERE "errorMessage" IS NULL AND "lastError" IS NOT NULL;')
    await prisma.$executeRawUnsafe('ALTER TABLE "EmailQueueItem" ALTER COLUMN "entityType" SET NOT NULL;')
    
    await prisma.$executeRawUnsafe(`ALTER TABLE "EmailQueueItem" ALTER COLUMN "status" TYPE "EmailQueueStatus" USING 
      CASE 
        WHEN "status" = 'QUEUED' THEN 'QUEUED'::"EmailQueueStatus"
        WHEN "status" = 'SENT' THEN 'SENT'::"EmailQueueStatus"
        WHEN "status" = 'FAILED' THEN 'FAILED'::"EmailQueueStatus"
        ELSE 'QUEUED'::"EmailQueueStatus"
      END;`)
    
    await prisma.$executeRawUnsafe(`ALTER TABLE "EmailQueueItem" ALTER COLUMN "status" SET DEFAULT 'QUEUED';`)
    await prisma.$executeRawUnsafe('ALTER TABLE "EmailQueueItem" DROP COLUMN IF EXISTS "type";')
    await prisma.$executeRawUnsafe('ALTER TABLE "EmailQueueItem" DROP COLUMN IF EXISTS "lastError";')
    
    try {
      await prisma.$executeRawUnsafe('ALTER TABLE "EmailQueueItem" ADD CONSTRAINT "EmailQueueItem_entityType_entityId_key" UNIQUE ("entityType", "entityId");')
      console.log('Unique constraint added')
    } catch (e) {
      if (e.message.includes('already exists')) {
        console.log('Unique constraint already exists')
      } else {
        throw e
      }
    }
    
    try {
      await prisma.$executeRawUnsafe('DROP INDEX IF EXISTS "EmailQueueItem_type_status_idx";')
    } catch (e) {
      console.log('Index drop skipped (may not exist)')
    }
    
    await prisma.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS "EmailQueueItem_entityType_status_idx" ON "EmailQueueItem"("entityType", "status");')
    
    console.log('✅ EmailQueueItem migration completed!')
  } catch (error) {
    console.error('❌ Error:', error.message)
    if (error.message.includes('must be owner') || error.message.includes('permission denied')) {
      console.error('⚠️  This script must be run as postgres user or with proper permissions')
      console.error('   Run: sudo -u postgres psql -d apluscenter -f <(node -e "require(\'./scripts/complete-emailqueue-migration.js\')")')
    }
    process.exit(1)
  } finally {
    await prisma.$disconnect()
  }
}

completeEmailQueueMigration()
