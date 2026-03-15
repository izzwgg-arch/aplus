/**
 * Complete Timesheet ID System Setup
 * 
 * This script runs all necessary steps to set up the timesheet ID system:
 * 1. Assign IDs to all existing timesheets (T-1001, BT-1002, etc.)
 * 2. Backfill invoice-timesheet links for all existing invoices
 * 
 * Run: node scripts/complete-timesheet-id-setup.js
 */

const { PrismaClient } = require('@prisma/client')

const prisma = new PrismaClient()

function formatTimesheetNumber(sequence, isBCBA) {
  const prefix = isBCBA ? 'BT' : 'T'
  return `${prefix}-${String(sequence).padStart(4, '0')}`
}

async function assignTimesheetIds() {
  console.log('='.repeat(60))
  console.log('STEP 1: Assigning IDs to existing timesheets')
  console.log('='.repeat(60))
  console.log('')

  try {
    const allTimesheets = await prisma.timesheet.findMany({
      where: { deletedAt: null },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        timesheetNumber: true,
        isBCBA: true,
        createdAt: true,
      },
    })

    console.log(`Found ${allTimesheets.length} timesheets to process\n`)

    const regularTimesheets = allTimesheets.filter(ts => !ts.isBCBA)
    const bcbaTimesheets = allTimesheets.filter(ts => ts.isBCBA)

    console.log(`Regular timesheets: ${regularTimesheets.length}`)
    console.log(`BCBA timesheets: ${bcbaTimesheets.length}\n`)

    let regularSequence = 1001
    let bcbaSequence = 1001
    let assignedCount = 0
    let skippedCount = 0

    // Process regular timesheets
    console.log('Processing regular timesheets...')
    for (const timesheet of regularTimesheets) {
      if (timesheet.timesheetNumber) {
        skippedCount++
        continue
      }

      const timesheetNumber = formatTimesheetNumber(regularSequence, false)
      
      try {
        await prisma.timesheet.update({
          where: { id: timesheet.id },
          data: { timesheetNumber },
        })
        assignedCount++
        regularSequence++
      } catch (error) {
        if (error.code === 'P2002') {
          regularSequence++
          const retryNumber = formatTimesheetNumber(regularSequence, false)
          await prisma.timesheet.update({
            where: { id: timesheet.id },
            data: { timesheetNumber: retryNumber },
          })
          assignedCount++
          regularSequence++
        } else {
          console.error(`  ❌ ${timesheet.id}: Error - ${error.message}`)
        }
      }
    }

    // Process BCBA timesheets
    console.log('\nProcessing BCBA timesheets...')
    for (const timesheet of bcbaTimesheets) {
      if (timesheet.timesheetNumber) {
        skippedCount++
        continue
      }

      const timesheetNumber = formatTimesheetNumber(bcbaSequence, true)
      
      try {
        await prisma.timesheet.update({
          where: { id: timesheet.id },
          data: { timesheetNumber },
        })
        assignedCount++
        bcbaSequence++
      } catch (error) {
        if (error.code === 'P2002') {
          bcbaSequence++
          const retryNumber = formatTimesheetNumber(bcbaSequence, true)
          await prisma.timesheet.update({
            where: { id: timesheet.id },
            data: { timesheetNumber: retryNumber },
          })
          assignedCount++
          bcbaSequence++
        } else {
          console.error(`  ❌ ${timesheet.id}: Error - ${error.message}`)
        }
      }
    }

    console.log(`\n✅ ID Assignment complete!`)
    console.log(`   Assigned: ${assignedCount}`)
    console.log(`   Skipped: ${skippedCount}`)
    console.log(`   Next regular ID: ${formatTimesheetNumber(regularSequence, false)}`)
    console.log(`   Next BCBA ID: ${formatTimesheetNumber(bcbaSequence, true)}`)

    return { assignedCount, skippedCount }
  } catch (error) {
    console.error('Error assigning IDs:', error)
    throw error
  }
}

async function backfillInvoiceLinks() {
  console.log('\n')
  console.log('='.repeat(60))
  console.log('STEP 2: Backfilling invoice-timesheet links')
  console.log('='.repeat(60))
  console.log('')

  try {
    const invoices = await prisma.invoice.findMany({
      where: { deletedAt: null },
      include: {
        entries: {
          select: {
            timesheetId: true,
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    })

    console.log(`Found ${invoices.length} invoices\n`)

    let linkedCount = 0
    let alreadyLinkedCount = 0
    let errorCount = 0

    for (const invoice of invoices) {
      try {
        const timesheetIds = [...new Set(invoice.entries.map(e => e.timesheetId).filter(Boolean))]
        
        if (timesheetIds.length === 0) {
          continue
        }

        const alreadyLinked = await prisma.timesheet.count({
          where: {
            id: { in: timesheetIds },
            invoiceId: invoice.id,
          },
        })

        if (alreadyLinked === timesheetIds.length) {
          alreadyLinkedCount += timesheetIds.length
          continue
        }

        const result = await prisma.timesheet.updateMany({
          where: {
            id: { in: timesheetIds },
            deletedAt: null,
            OR: [
              { invoiceId: null },
              { invoiceId: { not: invoice.id } },
            ],
          },
          data: {
            invoiceId: invoice.id,
            invoicedAt: invoice.createdAt,
          },
        })

        if (result.count > 0) {
          console.log(`✅ ${invoice.invoiceNumber}: Linked ${result.count} timesheet(s)`)
          linkedCount += result.count
        } else {
          alreadyLinkedCount += timesheetIds.length
        }

      } catch (error) {
        console.error(`❌ Error processing ${invoice.invoiceNumber}:`, error.message)
        errorCount++
      }
    }

    console.log(`\n✅ Link backfill complete!`)
    console.log(`   Linked: ${linkedCount} timesheet(s)`)
    console.log(`   Already linked: ${alreadyLinkedCount} timesheet(s)`)
    console.log(`   Errors: ${errorCount}`)

    return { linkedCount, alreadyLinkedCount, errorCount }
  } catch (error) {
    console.error('Error backfilling links:', error)
    throw error
  }
}

async function main() {
  try {
    console.log('')
    console.log('╔════════════════════════════════════════════════════════════╗')
    console.log('║   TIMESHEET ID SYSTEM - COMPLETE SETUP                    ║')
    console.log('╚════════════════════════════════════════════════════════════╝')
    console.log('')

    // Step 1: Assign IDs
    const idResults = await assignTimesheetIds()

    // Step 2: Backfill invoice links
    const linkResults = await backfillInvoiceLinks()

    console.log('\n')
    console.log('='.repeat(60))
    console.log('SETUP COMPLETE!')
    console.log('='.repeat(60))
    console.log(`Timesheets assigned IDs: ${idResults.assignedCount}`)
    console.log(`Timesheets linked to invoices: ${linkResults.linkedCount}`)
    console.log(`Already linked: ${linkResults.alreadyLinkedCount}`)
    console.log('')

  } catch (error) {
    console.error('\n❌ Fatal error:', error)
    process.exit(1)
  } finally {
    await prisma.$disconnect()
  }
}

main()
