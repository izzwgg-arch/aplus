const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

async function runMigration() {
  try {
    console.log('Running overtime migration...')
    
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "PayrollEmployee" ADD COLUMN IF NOT EXISTS "overtimeRateHourly" DECIMAL(10, 2);
    `)
    console.log('✓ Added overtimeRateHourly to PayrollEmployee')
    
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "PayrollEmployee" ADD COLUMN IF NOT EXISTS "overtimeStartTime" INTEGER;
    `)
    console.log('✓ Added overtimeStartTime to PayrollEmployee')
    
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "PayrollEmployee" ADD COLUMN IF NOT EXISTS "overtimeEnabled" BOOLEAN DEFAULT false;
    `)
    console.log('✓ Added overtimeEnabled to PayrollEmployee')
    
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "PayrollRunLine" ADD COLUMN IF NOT EXISTS "regularMinutes" INTEGER DEFAULT 0;
    `)
    console.log('✓ Added regularMinutes to PayrollRunLine')
    
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "PayrollRunLine" ADD COLUMN IF NOT EXISTS "overtimeMinutes" INTEGER DEFAULT 0;
    `)
    console.log('✓ Added overtimeMinutes to PayrollRunLine')
    
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "PayrollRunLine" ADD COLUMN IF NOT EXISTS "regularPay" DECIMAL(10, 2) DEFAULT 0;
    `)
    console.log('✓ Added regularPay to PayrollRunLine')
    
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "PayrollRunLine" ADD COLUMN IF NOT EXISTS "overtimePay" DECIMAL(10, 2) DEFAULT 0;
    `)
    console.log('✓ Added overtimePay to PayrollRunLine')
    
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "PayrollRunLine" ADD COLUMN IF NOT EXISTS "overtimeRateUsed" DECIMAL(10, 2);
    `)
    console.log('✓ Added overtimeRateUsed to PayrollRunLine')
    
    console.log('\n✅ Migration completed successfully!')
  } catch (error) {
    console.error('❌ Migration failed:', error)
    process.exit(1)
  } finally {
    await prisma.$disconnect()
  }
}

runMigration()
