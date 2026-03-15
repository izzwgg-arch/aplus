/**
 * Fix Missing Timesheets
 * 
 * These timesheets were unarchived but aren't showing in active list.
 * The issue is likely that they have invoiceEntries but no invoiceId.
 * This script will check and fix the issue.
 * 
 * Run: node scripts/fix-missing-timesheets.js
 */

const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

async function fixMissingTimesheets() {
  console.log('Checking and fixing missing timesheets...\n')

  try {
    // Find timesheets that:
    // 1. Are not deleted
    // 2. Are not archived
    // 3. Have no invoiceId
    // 4. Were updated in the last 7 days
    const sevenDaysAgo = new Date()
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)

    const missingTimesheets = await prisma.timesheet.findMany({
      where: {
        deletedAt: null,
        archived: false,
        invoiceId: null,
        updatedAt: {
          gte: sevenDaysAgo,
        },
      },
      include: {
        invoiceEntries: {
          include: {
            invoice: {
              select: {
                id: true,
                invoiceNumber: true,
              },
            },
          },
        },
      },
    })

    console.log(`Found ${missingTimesheets.length} timesheets to check\n`)

    let fixedCount = 0
    let alreadyCorrectCount = 0

    for (const ts of missingTimesheets) {
      // Check if timesheet has invoice entries
      if (ts.invoiceEntries && ts.invoiceEntries.length > 0) {
        // Get the invoice ID from the first invoice entry
        const invoiceId = ts.invoiceEntries[0]?.invoiceId
        
        if (invoiceId && invoiceId !== ts.invoiceId) {
          console.log(`🔧 Fixing ${ts.timesheetNumber || ts.id}:`)
          console.log(`   Client: ${ts.client?.name || 'N/A'}`)
          console.log(`   Has ${ts.invoiceEntries.length} invoice entries`)
          console.log(`   Setting invoiceId to: ${invoiceId}`)
          
          await prisma.timesheet.update({
            where: { id: ts.id },
            data: {
              invoiceId: invoiceId,
              invoicedAt: ts.invoiceEntries[0]?.createdAt || new Date(),
            },
          })
          
          console.log(`   ✅ Fixed\n`)
          fixedCount++
        } else {
          alreadyCorrectCount++
        }
      } else {
        // No invoice entries - should be in active list
        // Check if there's any reason it's not showing
        console.log(`✓ ${ts.timesheetNumber || ts.id}: Should be visible (no invoice entries)`)
        console.log(`   Client: ${ts.client?.name || 'N/A'}`)
        console.log(`   Status: ${ts.status}`)
        console.log(`   Archived: ${ts.archived}`)
        console.log(`   Invoice ID: ${ts.invoiceId || 'None'}\n`)
        alreadyCorrectCount++
      }
    }

    console.log(`\n✅ Fix complete!`)
    console.log(`   Fixed: ${fixedCount}`)
    console.log(`   Already correct: ${alreadyCorrectCount}`)

  } catch (error) {
    console.error('Error:', error)
  } finally {
    await prisma.$disconnect()
  }
}

fixMissingTimesheets()
