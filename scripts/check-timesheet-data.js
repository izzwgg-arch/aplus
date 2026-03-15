const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

async function checkData() {
  try {
    // Check total timesheets
    const total = await prisma.timesheet.count({
      where: { deletedAt: null }
    })
    
    // Check using raw SQL to see invoiceId column
    const result = await prisma.$queryRaw`
      SELECT 
        COUNT(*) as total,
        COUNT(CASE WHEN "invoiceId" IS NOT NULL THEN 1 END) as invoiced,
        COUNT(CASE WHEN "invoiceId" IS NULL THEN 1 END) as not_invoiced,
        COUNT(CASE WHEN "isBCBA" = true THEN 1 END) as bcba,
        COUNT(CASE WHEN "isBCBA" = false THEN 1 END) as regular
      FROM "Timesheet"
      WHERE "deletedAt" IS NULL
    `
    
    console.log('=== TIMESHEET DATA CHECK ===')
    console.log('Total (not deleted):', total)
    console.log('Raw SQL Results:', result[0])
    console.log('')
    
    // Check if invoiceId column exists
    const columnCheck = await prisma.$queryRaw`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'Timesheet' AND column_name = 'invoiceId'
    `
    console.log('invoiceId column exists:', columnCheck.length > 0)
    console.log('')
    
    // Sample timesheets
    const sample = await prisma.timesheet.findMany({
      where: { deletedAt: null },
      take: 5,
      select: {
        id: true,
        isBCBA: true,
        invoiceId: true,
        createdAt: true,
      }
    })
    console.log('Sample timesheets:', sample)
    
  } catch (error) {
    console.error('Error:', error.message)
    console.error('Stack:', error.stack)
  } finally {
    await prisma.$disconnect()
  }
}

checkData()
