/**
 * Find Missing Timesheets
 * 
 * Finds timesheets that were recently unarchived but aren't showing in active list
 * 
 * Run: node scripts/find-missing-timesheets.js
 */

const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

async function findMissingTimesheets() {
  console.log('Searching for timesheets that were unarchived but not showing in active list...\n')

  try {
    // Find timesheets that:
    // 1. Are not deleted
    // 2. Are not archived (archived = false)
    // 3. Are not invoiced (no invoiceId)
    // 4. Were updated in the last 7 days (recently unarchived)
    const sevenDaysAgo = new Date()
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)

    const missingTimesheets = await prisma.timesheet.findMany({
      where: {
        deletedAt: null,
        archived: false,
        invoiceId: null, // Not invoiced
        updatedAt: {
          gte: sevenDaysAgo, // Updated in last 7 days
        },
      },
      include: {
        client: {
          select: { name: true },
        },
        provider: {
          select: { name: true },
        },
        bcba: {
          select: { name: true },
        },
        invoiceEntries: {
          select: {
            id: true,
            invoiceId: true,
          },
        },
      },
      orderBy: {
        updatedAt: 'desc',
      },
    })

    console.log(`Found ${missingTimesheets.length} timesheets that might be missing:\n`)

    if (missingTimesheets.length === 0) {
      console.log('No missing timesheets found.')
      return
    }

    for (const ts of missingTimesheets) {
      const hasInvoiceEntries = ts.invoiceEntries && ts.invoiceEntries.length > 0
      const status = hasInvoiceEntries ? '⚠️  HAS INVOICE ENTRIES (should be in archive)' : '✅ Should be in active list'
      
      console.log(`${status}`)
      console.log(`  ID: ${ts.id}`)
      console.log(`  Number: ${ts.timesheetNumber || 'NO ID ASSIGNED'}`)
      console.log(`  Client: ${ts.client.name}`)
      console.log(`  Provider: ${ts.provider?.name || 'N/A'}`)
      console.log(`  BCBA: ${ts.bcba.name}`)
      console.log(`  Status: ${ts.status}`)
      console.log(`  Archived: ${ts.archived}`)
      console.log(`  Invoice ID: ${ts.invoiceId || 'None'}`)
      console.log(`  Has Invoice Entries: ${hasInvoiceEntries}`)
      console.log(`  Updated: ${ts.updatedAt}`)
      console.log(`  Created: ${ts.createdAt}`)
      console.log('')
    }

    // Also check for timesheets that have invoiceEntries but invoiceId is null
    const timesheetsWithInvoiceEntriesButNoInvoiceId = await prisma.timesheet.findMany({
      where: {
        deletedAt: null,
        archived: false,
        invoiceId: null,
        invoiceEntries: {
          some: {},
        },
      },
      include: {
        client: {
          select: { name: true },
        },
        invoiceEntries: {
          include: {
            invoice: {
              select: {
                invoiceNumber: true,
                id: true,
              },
            },
          },
        },
      },
    })

    if (timesheetsWithInvoiceEntriesButNoInvoiceId.length > 0) {
      console.log(`\n⚠️  Found ${timesheetsWithInvoiceEntriesButNoInvoiceId.length} timesheets with invoice entries but no invoiceId:\n`)
      
      for (const ts of timesheetsWithInvoiceEntriesButNoInvoiceId) {
        const invoiceNumbers = ts.invoiceEntries.map(e => e.invoice?.invoiceNumber).filter(Boolean)
        console.log(`  Timesheet: ${ts.timesheetNumber || ts.id}`)
        console.log(`  Client: ${ts.client.name}`)
        console.log(`  Status: ${ts.status}`)
        console.log(`  Invoice Entries: ${ts.invoiceEntries.length}`)
        console.log(`  Linked to Invoices: ${invoiceNumbers.join(', ') || 'Unknown'}`)
        console.log(`  Should have invoiceId: ${ts.invoiceEntries[0]?.invoiceId || 'N/A'}`)
        console.log('')
      }
    }

  } catch (error) {
    console.error('Error:', error)
  } finally {
    await prisma.$disconnect()
  }
}

findMissingTimesheets()
