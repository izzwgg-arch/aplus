/**
 * Server-side script to fix all invoices
 * Run on server: node scripts/fix-all-invoices-server.js
 */

const { PrismaClient } = require('@prisma/client')
const { Decimal } = require('@prisma/client/runtime/library')

const prisma = new PrismaClient()

// Import billing functions (simplified versions)
function minutesToUnits(minutes, unitMinutes = 15) {
  if (minutes <= 0) return 0
  if (unitMinutes <= 0) throw new Error('unitMinutes must be greater than 0')
  return Math.ceil(minutes / unitMinutes)
}

function calculateEntryTotals(entryMinutes, ratePerUnit, unitMinutes = 15) {
  const unitsBilled = minutesToUnits(entryMinutes, unitMinutes)
  const rate = ratePerUnit instanceof Decimal ? ratePerUnit : new Decimal(ratePerUnit)
  const amount = new Decimal(unitsBilled).times(rate)
  
  return {
    unitsBilled,
    amount,
  }
}

async function fixAllInvoices() {
  console.log('Starting invoice fix...\n')

  try {
    const invoices = await prisma.invoice.findMany({
      where: { deletedAt: null },
      include: {
        entries: {
          include: {
            timesheet: {
              include: {
                entries: true,
              },
            },
          },
        },
        client: {
          include: {
            insurance: true,
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    })

    console.log(`Found ${invoices.length} invoices\n`)

    let fixedCount = 0
    let skippedCount = 0

    for (const invoice of invoices) {
      try {
        const insurance = invoice.client?.insurance
        if (!insurance) {
          console.log(`⚠️  Skipping ${invoice.invoiceNumber}: No insurance`)
          skippedCount++
          continue
        }

        const ratePerUnit = insurance.regularRatePerUnit 
          ? new Decimal(insurance.regularRatePerUnit.toString())
          : new Decimal(insurance.ratePerUnit.toString())
        const unitMinutes = insurance.regularUnitMinutes || 15

        if (ratePerUnit.toNumber() <= 0) {
          console.log(`⚠️  Skipping ${invoice.invoiceNumber}: Invalid rate`)
          skippedCount++
          continue
        }

        // Get all unique timesheets
        const uniqueTimesheets = new Map()
        invoice.entries.forEach((entry) => {
          if (entry.timesheet && !uniqueTimesheets.has(entry.timesheet.id)) {
            uniqueTimesheets.set(entry.timesheet.id, entry.timesheet)
          }
        })

        // Collect all timesheet entries within invoice date range
        // CRITICAL: Only include entries that are actually linked to this invoice via InvoiceEntry
        const allTimesheetEntries = []
        const invoiceTimesheetIds = new Set(invoice.entries.map(e => e.timesheetId).filter(Boolean))
        
        uniqueTimesheets.forEach((timesheet) => {
          // Only process timesheets that are actually linked to this invoice
          if (!invoiceTimesheetIds.has(timesheet.id)) return
          
          if (timesheet.entries) {
            timesheet.entries.forEach((tsEntry) => {
              const entryDate = new Date(tsEntry.date)
              const entryDateOnly = new Date(entryDate.getFullYear(), entryDate.getMonth(), entryDate.getDate())
              const startDateOnly = new Date(invoice.startDate.getFullYear(), invoice.startDate.getMonth(), invoice.startDate.getDate())
              const endDateOnly = new Date(invoice.endDate.getFullYear(), invoice.endDate.getMonth(), invoice.endDate.getDate())
              
              if (entryDateOnly >= startDateOnly && entryDateOnly <= endDateOnly) {
                allTimesheetEntries.push({ entry: tsEntry, timesheet })
              }
            })
          }
        })

        // Recalculate each timesheet entry
        const recalculatedEntries = []
        for (const { entry: tsEntry, timesheet } of allTimesheetEntries) {
          const { unitsBilled, amount } = calculateEntryTotals(
            tsEntry.minutes,
            ratePerUnit,
            unitMinutes
          )
          recalculatedEntries.push({
            timesheetEntry: tsEntry,
            timesheet,
            units: unitsBilled,
            amount,
          })
        }

        // CRITICAL: Create one InvoiceEntry per TimesheetEntry
        // This matches how invoices are created in generate-invoice routes
        let totalRecalculatedAmount = new Decimal(0)
        let totalRecalculatedUnits = 0
        const entryUpdates = []

        for (const { entry: tsEntry, timesheet } of allTimesheetEntries) {
          const { unitsBilled, amount } = calculateEntryTotals(tsEntry.minutes, ratePerUnit, unitMinutes)
          
          // Try to find existing InvoiceEntry for this specific timesheet entry
          // Match by timesheet ID and similar amount/units
          const existingEntry = invoice.entries.find(ie => {
            if (ie.timesheet?.id !== timesheet.id) return false
            const ieUnits = parseFloat(ie.units.toString())
            const ieAmount = parseFloat(ie.amount.toString())
            // Match if units/amount are close (within 0.1 units or $0.01)
            return Math.abs(ieUnits - unitsBilled) < 0.1 || Math.abs(ieAmount - amount.toNumber()) < 0.01
          })

          if (existingEntry) {
            entryUpdates.push({
              id: existingEntry.id,
              newUnits: unitsBilled,
              newAmount: amount,
            })
          } else {
            entryUpdates.push({
              id: null, // New entry
              timesheetId: timesheet.id,
              providerId: timesheet.providerId,
              insuranceId: insurance.id,
              newUnits: unitsBilled,
              newAmount: amount,
            })
          }

          totalRecalculatedAmount = totalRecalculatedAmount.plus(amount)
          totalRecalculatedUnits += unitsBilled
        }

        const oldTotal = invoice.totalAmount.toNumber()
        const newTotal = totalRecalculatedAmount.toNumber()
        const oldUnits = invoice.entries.reduce((sum, e) => sum + e.units.toNumber(), 0)
        
        const hasChanges = entryUpdates.length > 0 && (
          entryUpdates.some(e => {
            const oldEntry = invoice.entries.find(ent => ent.id === e.id)
            if (!oldEntry) return true
            
            const unitsDiffer = Math.abs(oldEntry.units.toNumber() - e.newUnits) > 0.001
            const amountDiffers = Math.abs(oldEntry.amount.toNumber() - e.newAmount.toNumber()) > 0.01
            const hasFractionalUnits = oldEntry.units.toNumber() % 1 !== 0
            
            return unitsDiffer || amountDiffers || hasFractionalUnits
          }) || Math.abs(oldTotal - newTotal) > 0.01
        )

        if (!hasChanges && entryUpdates.length === 0) {
          console.log(`✓ ${invoice.invoiceNumber}: Already correct`)
          skippedCount++
          continue
        }

        // Apply fixes - delete all entries and recreate
        await prisma.$transaction(async (tx) => {
          // Delete all existing invoice entries
          await tx.invoiceEntry.deleteMany({
            where: { invoiceId: invoice.id },
          })

          // Create ALL new entries from recalculated data (we deleted all, so all are new)
          const entriesToCreate = entryUpdates.map(e => ({
            invoiceId: invoice.id,
            timesheetId: e.timesheetId || invoice.entries.find(ie => ie.id === e.id)?.timesheetId,
            providerId: e.providerId || invoice.entries.find(ie => ie.id === e.id)?.providerId,
            insuranceId: e.insuranceId || insurance.id,
            units: new Decimal(e.newUnits),
            rate: ratePerUnit.toNumber(),
            amount: e.newAmount instanceof Decimal ? e.newAmount : new Decimal(e.newAmount),
          }))

          if (entriesToCreate.length > 0) {
            await tx.invoiceEntry.createMany({
              data: entriesToCreate,
            })
          }

          const newOutstanding = totalRecalculatedAmount
            .minus(invoice.paidAmount || 0)
            .plus(invoice.adjustments || 0)

          await tx.invoice.update({
            where: { id: invoice.id },
            data: {
              totalAmount: totalRecalculatedAmount,
              outstanding: newOutstanding,
            },
          })
        })

        console.log(`✅ Fixed ${invoice.invoiceNumber}:`)
        console.log(`   Total: $${oldTotal.toFixed(2)} → $${newTotal.toFixed(2)}`)
        console.log(`   Units: ${oldUnits.toFixed(2)} → ${totalRecalculatedUnits}`)
        console.log(`   Entries: ${entryUpdates.length}`)

        fixedCount++
      } catch (error) {
        console.error(`❌ Error fixing ${invoice.invoiceNumber}:`, error.message)
      }
    }

    console.log(`\n✅ Fixed: ${fixedCount}`)
    console.log(`⏭️  Skipped: ${skippedCount}`)
  } catch (error) {
    console.error('Fatal error:', error)
    process.exit(1)
  } finally {
    await prisma.$disconnect()
  }
}

fixAllInvoices()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Fatal error:', error)
    process.exit(1)
  })
