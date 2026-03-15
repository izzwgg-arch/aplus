/**
 * Backfill Invoice-Timesheet Links
 * 
 * This script ensures all existing invoices have their timesheets properly linked.
 * It works by:
 * 1. Finding all invoices
 * 2. Finding all InvoiceEntry records for each invoice
 * 3. Getting the timesheetId from each InvoiceEntry
 * 4. Updating the Timesheet records to set invoiceId and invoicedAt
 * 
 * This is safe to run multiple times - it only updates timesheets that aren't already linked.
 * 
 * Run: node scripts/backfill-invoice-timesheet-links.js
 */

const { PrismaClient } = require('@prisma/client')

const prisma = new PrismaClient()

async function backfillInvoiceTimesheetLinks() {
  console.log('Starting invoice-timesheet link backfill...\n')

  try {
    // Get all non-deleted invoices
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
        // Get unique timesheet IDs from invoice entries
        const timesheetIds = [...new Set(invoice.entries.map(e => e.timesheetId).filter(Boolean))]
        
        if (timesheetIds.length === 0) {
          console.log(`⚠️  ${invoice.invoiceNumber}: No timesheet entries found`)
          continue
        }

        // Check how many are already linked
        const alreadyLinked = await prisma.timesheet.count({
          where: {
            id: { in: timesheetIds },
            invoiceId: invoice.id,
          },
        })

        if (alreadyLinked === timesheetIds.length) {
          console.log(`✓ ${invoice.invoiceNumber}: All ${timesheetIds.length} timesheet(s) already linked`)
          alreadyLinkedCount += timesheetIds.length
          continue
        }

        // Update timesheets that aren't already linked to this invoice
        const result = await prisma.timesheet.updateMany({
          where: {
            id: { in: timesheetIds },
            deletedAt: null,
            OR: [
              { invoiceId: null },
              { invoiceId: { not: invoice.id } }, // Not linked to this invoice
            ],
          },
          data: {
            invoiceId: invoice.id,
            invoicedAt: invoice.createdAt, // Use invoice creation date as invoiced date
          },
        })

        if (result.count > 0) {
          console.log(`✅ ${invoice.invoiceNumber}: Linked ${result.count} timesheet(s)`)
          linkedCount += result.count
        } else {
          console.log(`✓ ${invoice.invoiceNumber}: All timesheets already linked`)
          alreadyLinkedCount += timesheetIds.length
        }

      } catch (error) {
        console.error(`❌ Error processing ${invoice.invoiceNumber}:`, error.message)
        errorCount++
      }
    }

    console.log(`\n✅ Backfill complete!`)
    console.log(`   Linked: ${linkedCount} timesheet(s)`)
    console.log(`   Already linked: ${alreadyLinkedCount} timesheet(s)`)
    console.log(`   Errors: ${errorCount}`)

  } catch (error) {
    console.error('Fatal error:', error)
  } finally {
    await prisma.$disconnect()
  }
}

backfillInvoiceTimesheetLinks()
