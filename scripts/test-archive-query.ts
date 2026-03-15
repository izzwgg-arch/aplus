import { prisma } from '../lib/prisma'

async function testArchiveQuery() {
  try {
    console.log('Testing archive query...')
    
    // Test 1: Count invoiced timesheets
    const invoicedCount = await (prisma as any).timesheet.count({
      where: {
        deletedAt: null,
        invoicedAt: { not: null },
      },
    })
    console.log(`Total invoiced timesheets: ${invoicedCount}`)
    
    // Test 2: Count regular invoiced timesheets
    const regularInvoicedCount = await (prisma as any).timesheet.count({
      where: {
        deletedAt: null,
        invoicedAt: { not: null },
        isBCBA: false,
      },
    })
    console.log(`Regular invoiced timesheets: ${regularInvoicedCount}`)
    
    // Test 3: Count BCBA invoiced timesheets
    const bcbaInvoicedCount = await (prisma as any).timesheet.count({
      where: {
        deletedAt: null,
        invoicedAt: { not: null },
        isBCBA: true,
      },
    })
    console.log(`BCBA invoiced timesheets: ${bcbaInvoicedCount}`)
    
    // Test 4: Get a sample
    const sample = await (prisma as any).timesheet.findFirst({
      where: {
        deletedAt: null,
        invoicedAt: { not: null },
      },
      select: {
        id: true,
        invoicedAt: true,
        invoiceId: true,
        isBCBA: true,
      },
    })
    console.log('Sample invoiced timesheet:', sample)
    
  } catch (error: any) {
    console.error('Error:', error.message)
    console.error('Stack:', error.stack)
  } finally {
    await prisma.$disconnect()
  }
}

testArchiveQuery()
