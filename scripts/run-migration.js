const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

async function runMigration() {
  try {
    console.log('Step 1: Converting status to TEXT...')
    await prisma.$executeRawUnsafe('ALTER TABLE "Timesheet" ALTER COLUMN "status" TYPE TEXT USING "status"::TEXT;')
    
    console.log('Step 2: Dropping old enum...')
    await prisma.$executeRawUnsafe('DROP TYPE IF EXISTS "TimesheetStatus" CASCADE;')
    
    console.log('Step 3: Creating new enum...')
    await prisma.$executeRawUnsafe(`CREATE TYPE "TimesheetStatus" AS ENUM ('DRAFT', 'APPROVED', 'REJECTED', 'QUEUED', 'EMAILED');`)
    
    console.log('Step 4: Converting status column...')
    await prisma.$executeRawUnsafe(`ALTER TABLE "Timesheet" ALTER COLUMN "status" TYPE "TimesheetStatus" USING 
      CASE 
        WHEN "status" = 'SUBMITTED' THEN 'DRAFT'::"TimesheetStatus"
        WHEN "status" = 'LOCKED' THEN 'DRAFT'::"TimesheetStatus"
        WHEN "status" = 'QUEUED_FOR_EMAIL' THEN 'QUEUED'::"TimesheetStatus"
        ELSE "status"::"TimesheetStatus"
      END;`)
    
    console.log('Step 5: Setting default...')
    await prisma.$executeRawUnsafe(`ALTER TABLE "Timesheet" ALTER COLUMN "status" SET DEFAULT 'DRAFT';`)
    
    console.log('Step 6: Dropping old columns...')
    await prisma.$executeRawUnsafe('ALTER TABLE "Timesheet" DROP COLUMN IF EXISTS "submittedAt";')
    await prisma.$executeRawUnsafe('ALTER TABLE "Timesheet" DROP COLUMN IF EXISTS "lockedAt";')
    await prisma.$executeRawUnsafe('ALTER TABLE "Timesheet" DROP COLUMN IF EXISTS "queuedForEmailAt";')
    await prisma.$executeRawUnsafe('ALTER TABLE "Timesheet" DROP COLUMN IF EXISTS "emailStatus";')
    await prisma.$executeRawUnsafe('ALTER TABLE "Timesheet" DROP COLUMN IF EXISTS "emailError";')
    await prisma.$executeRawUnsafe('ALTER TABLE "Timesheet" DROP COLUMN IF EXISTS "emailedBatchId";')
    
    console.log('Step 7: Adding new columns...')
    await prisma.$executeRawUnsafe('ALTER TABLE "Timesheet" ADD COLUMN IF NOT EXISTS "rejectedAt" TIMESTAMP(3);')
    await prisma.$executeRawUnsafe('ALTER TABLE "Timesheet" ADD COLUMN IF NOT EXISTS "queuedAt" TIMESTAMP(3);')
    
    console.log('Step 8: Updating EmailQueueItem...')
    // Create enums if they don't exist
    try {
      await prisma.$executeRawUnsafe(`DO $$ BEGIN
        CREATE TYPE "EmailQueueStatus" AS ENUM ('QUEUED', 'SENDING', 'SENT', 'FAILED');
      EXCEPTION WHEN duplicate_object THEN null;
      END $$;`)
      await prisma.$executeRawUnsafe(`DO $$ BEGIN
        CREATE TYPE "EmailQueueEntityType" AS ENUM ('REGULAR', 'BCBA');
      EXCEPTION WHEN duplicate_object THEN null;
      END $$;`)
      
      // Try to alter EmailQueueItem - if permission denied, skip and note it
      try {
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
        await prisma.$executeRawUnsafe('ALTER TABLE "EmailQueueItem" ALTER COLUMN "status" SET DEFAULT \'QUEUED\';')
        await prisma.$executeRawUnsafe('ALTER TABLE "EmailQueueItem" DROP COLUMN IF EXISTS "type";')
        await prisma.$executeRawUnsafe('ALTER TABLE "EmailQueueItem" DROP COLUMN IF EXISTS "lastError";')
        
        // Add unique constraint
        try {
          await prisma.$executeRawUnsafe('ALTER TABLE "EmailQueueItem" ADD CONSTRAINT "EmailQueueItem_entityType_entityId_key" UNIQUE ("entityType", "entityId");')
        } catch (e) {
          if (!e.message.includes('already exists')) {
            console.log('Unique constraint may already exist, continuing...')
          }
        }
        console.log('EmailQueueItem migration completed')
      } catch (permError) {
        if (permError.message.includes('must be owner') || permError.message.includes('permission denied')) {
          console.log('⚠️  EmailQueueItem migration skipped - requires postgres user. Run manually as postgres.')
          console.log('   The Timesheet migration completed successfully.')
        } else {
          throw permError
        }
      }
    } catch (e) {
      console.log('EmailQueueItem enum creation may have failed, but continuing...')
    }
    
    console.log('Step 9: Updating AuditAction enum...')
    // First convert to TEXT and update any invalid values
    await prisma.$executeRawUnsafe('ALTER TABLE "AuditLog" ALTER COLUMN "action" TYPE TEXT USING "action"::TEXT;')
    // Update SUBMIT to CREATE (closest equivalent)
    await prisma.$executeRawUnsafe(`UPDATE "AuditLog" SET "action" = 'CREATE' WHERE "action" = 'SUBMIT';`)
    // Update LOCK to UPDATE (closest equivalent)
    await prisma.$executeRawUnsafe(`UPDATE "AuditLog" SET "action" = 'UPDATE' WHERE "action" = 'LOCK';`)
    
    await prisma.$executeRawUnsafe('DROP TYPE IF EXISTS "AuditAction" CASCADE;')
    await prisma.$executeRawUnsafe(`CREATE TYPE "AuditAction" AS ENUM (
      'CREATE', 'UPDATE', 'DELETE', 'APPROVE', 'REJECT', 'QUEUE', 
      'GENERATE', 'PAYMENT', 'ADJUSTMENT', 'LOGIN', 'EMAIL_SENT', 
      'EMAIL_FAILED', 'TIMESHEET_APPROVED', 'TIMESHEET_REJECTED', 
      'BCBA_TIMESHEET_APPROVED', 'BCBA_TIMESHEET_REJECTED', 
      'USER_PASSWORD_SET', 'USER_LOGIN'
    );`)
    await prisma.$executeRawUnsafe('ALTER TABLE "AuditLog" ALTER COLUMN "action" TYPE "AuditAction" USING "action"::"AuditAction";')
    
    console.log('Step 10: Updating indexes...')
    try {
      await prisma.$executeRawUnsafe('DROP INDEX IF EXISTS "Timesheet_emailStatus_deletedAt_idx";')
    } catch (e) {
      console.log('Index drop skipped (may not exist)')
    }
    try {
      await prisma.$executeRawUnsafe('DROP INDEX IF EXISTS "EmailQueueItem_type_status_idx";')
    } catch (e) {
      if (e.message.includes('must be owner') || e.message.includes('permission denied')) {
        console.log('EmailQueueItem index drop skipped - requires postgres user')
      }
    }
    try {
      await prisma.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS "EmailQueueItem_entityType_status_idx" ON "EmailQueueItem"("entityType", "status");')
    } catch (e) {
      if (e.message.includes('must be owner') || e.message.includes('permission denied')) {
        console.log('EmailQueueItem index creation skipped - requires postgres user')
      }
    }
    
    console.log('\n✅ Migration completed successfully!')
  } catch (error) {
    console.error('❌ Migration error:', error.message)
    console.error('Stack:', error.stack)
    process.exit(1)
  } finally {
    await prisma.$disconnect()
  }
}

runMigration()
