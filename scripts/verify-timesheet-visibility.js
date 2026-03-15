const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

async function verify() {
  try {
    console.log('=== VERIFYING TIMESHEET VISIBILITY ===\n')
    
    // Check total timesheets
    const total = await prisma.timesheet.count({
      where: { deletedAt: null }
    })
    console.log(`Total timesheets (not deleted): ${total}`)
    
    // Check active (not invoiced) - using invoiceEntries relation
    const active = await prisma.timesheet.count({
      where: {
        deletedAt: null,
        invoiceEntries: { none: {} }
      }
    })
    console.log(`Active timesheets (no invoice entries): ${active}`)
    
    // Check archived (invoiced) - using invoiceEntries relation
    const archived = await prisma.timesheet.count({
      where: {
        deletedAt: null,
        invoiceEntries: { some: {} }
      }
    })
    console.log(`Archived timesheets (has invoice entries): ${archived}`)
    
    // Check BCBA
    const bcbaActive = await prisma.timesheet.count({
      where: {
        deletedAt: null,
        isBCBA: true,
        invoiceEntries: { none: {} }
      }
    })
    const bcbaArchived = await prisma.timesheet.count({
      where: {
        deletedAt: null,
        isBCBA: true,
        invoiceEntries: { some: {} }
      }
    })
    console.log(`\nBCBA Active: ${bcbaActive}, BCBA Archived: ${bcbaArchived}`)
    
    // Check Regular
    const regularActive = await prisma.timesheet.count({
      where: {
        deletedAt: null,
        isBCBA: false,
        invoiceEntries: { none: {} }
      }
    })
    const regularArchived = await prisma.timesheet.count({
      where: {
        deletedAt: null,
        isBCBA: false,
        invoiceEntries: { some: {} }
      }
    })
    console.log(`Regular Active: ${regularActive}, Regular Archived: ${regularArchived}`)
    
    // Verify math
    const sum = active + archived
    console.log(`\nVerification: Active (${active}) + Archived (${archived}) = ${sum}, Total = ${total}`)
    if (sum === total) {
      console.log('✅ All timesheets are accounted for!')
    } else {
      console.log(`⚠️  Mismatch: ${total - sum} timesheets not accounted for`)
    }
    
  } catch (error) {
    console.error('Error:', error.message)
    console.error('Stack:', error.stack)
  } finally {
    await prisma.$disconnect()
  }
}

verify()
