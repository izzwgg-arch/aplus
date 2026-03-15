/**
 * CRITICAL FIX: Recalculate ALL invoices with correct logic
 * 
 * Rules:
 * 1. Units = Hours × 4 (1 hour = 4 units)
 * 2. Regular timesheets: SV entries = $0 (displayed but not charged)
 * 3. BCBA timesheets: All entries charged at BCBA rate
 * 
 * Run on server: node scripts/fix-all-invoices-correct.js
 */

const { PrismaClient } = require('@prisma/client')
const { Decimal } = require('@prisma/client/runtime/library')

const prisma = new PrismaClient()

// CORRECT billing functions
function minutesToUnits(minutes) {
  if (minutes <= 0) return 0
  // Formula: Units = Hours × 4
  const hours = minutes / 60
  const units = hours * 4
  // Round to 2 decimal places
  return Math.round(units * 100) / 100
}

function calculateEntryTotals(entryMinutes, entryNotes, ratePerUnit, isRegularTimesheet) {
  const units = minutesToUnits(entryMinutes)
  const rate = ratePerUnit instanceof Decimal ? ratePerUnit : new Decimal(ratePerUnit)
  const isSV = entryNotes === 'SV'
  
  // For regular timesheets: SV entries = $0
  // For BCBA timesheets: All entries charged normally
  const amount = (isRegularTimesheet && isSV)
    ? new Decimal(0) // SV on regular = $0
    : new Decimal(units).times(rate) // Normal charge
  
  return {
    units,
    amount,
  }
}

async function fixAllInvoices() {
  console.log('Starting CRITICAL invoice fix with correct calculation logic...\n')

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

        // Determine if this is a BCBA invoice
        const isBCBATimesheet = invoice.entries.some(e => e.timesheet?.isBCBA === true)
        const ratePerUnit = isBCBATimesheet
          ? (insurance.bcbaRatePerUnit 
              ? new Decimal(insurance.bcbaRatePerUnit.toString())
              : new Decimal(insurance.ratePerUnit.toString()))
          : (insurance.regularRatePerUnit 
              ? new Decimal(insurance.regularRatePerUnit.toString())
              : new Decimal(insurance.ratePerUnit.toString()))

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
        const allTimesheetEntries = []
        const invoiceTimesheetIds = new Set(invoice.entries.map(e => e.timesheetId).filter(Boolean))
        
        uniqueTimesheets.forEach((timesheet) => {
          if (!invoiceTimesheetIds.has(timesheet.id)) return
          
          if (timesheet.entries) {
            timesheet.entries.forEach((tsEntry) => {
              const entryDate = new Date(tsEntry.date)
              const entryDateOnly = new Date(entryDate.getFullYear(), entryDate.getMonth(), entryDate.getDate())
              const startDateOnly = new Date(invoice.startDate.getFullYear(), invoice.startDate.getMonth(), invoice.startDate.getDate())
              const endDateOnly = new Date(invoice.endDate.getFullYear(), invoice.endDate.getMonth(), invoice.endDate.getDate())
              
              // Only include entries within date range
              // NOTE: We include ALL entries in the date range because this invoice already exists
              // The original invoice creation logic filters by !e.invoiced, but for fixing existing invoices,
              // we need to rebuild from the entries that are linked to this invoice
              if (entryDateOnly >= startDateOnly && entryDateOnly <= endDateOnly) {
                allTimesheetEntries.push({ entry: tsEntry, timesheet })
              }
            })
          }
        })

        // CRITICAL: Create one InvoiceEntry per TimesheetEntry (no deduplication)
        // This matches how invoices are created in generate-invoice routes
        const entryDataList = []
        
        for (const { entry: tsEntry, timesheet } of allTimesheetEntries) {
          // Calculate units and amount for this entry
          // Units = Hours × 4, SV on regular = $0
          const { units, amount: entryAmount } = calculateEntryTotals(
            tsEntry.minutes,
            tsEntry.notes,
            ratePerUnit,
            !timesheet.isBCBA // isRegularTimesheet
          )
          
          entryDataList.push({
            timesheetId: timesheet.id,
            providerId: timesheet.providerId,
            insuranceId: insurance.id,
            units,
            amount: entryAmount,
            tsEntryId: tsEntry.id, // Store for reference
          })
        }

        // Now create InvoiceEntries from all timesheet entries
        // Delete all existing entries and recreate from scratch
        let totalRecalculatedAmount = new Decimal(0)
        let totalRecalculatedUnits = 0

        for (const entryData of entryDataList) {
          totalRecalculatedAmount = totalRecalculatedAmount.plus(entryData.amount)
          totalRecalculatedUnits += entryData.units // Always add units (for display)
        }

        const oldTotal = invoice.totalAmount.toNumber()
        const newTotal = totalRecalculatedAmount.toNumber()
        const oldUnits = invoice.entries.reduce((sum, e) => sum + e.units.toNumber(), 0)
        
        // Check if there are changes (different entry count or different total)
        const oldEntryCount = invoice.entries.length
        const newEntryCount = entryDataList.length
        const hasChanges = newEntryCount !== oldEntryCount || Math.abs(oldTotal - newTotal) > 0.01

        if (!hasChanges) {
          console.log(`✓ ${invoice.invoiceNumber}: Already correct (${oldTotal.toFixed(2)})`)
          skippedCount++
          continue
        }

        // Apply fixes - delete all entries and recreate
        await prisma.$transaction(async (tx) => {
          // Delete all existing invoice entries
          await tx.invoiceEntry.deleteMany({
            where: { invoiceId: invoice.id },
          })

          // Create ALL new entries from all timesheet entries
          const entriesToCreate = entryDataList.map(e => ({
            invoiceId: invoice.id,
            timesheetId: e.timesheetId,
            providerId: e.providerId,
            insuranceId: e.insuranceId,
            units: new Decimal(e.units),
            rate: ratePerUnit.toNumber(),
            amount: e.amount instanceof Decimal ? e.amount : new Decimal(e.amount),
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
        console.log(`   Units: ${oldUnits.toFixed(2)} → ${totalRecalculatedUnits.toFixed(2)}`)
        console.log(`   Entries: ${oldEntryCount} → ${newEntryCount}`)
        console.log(`   Type: ${isBCBATimesheet ? 'BCBA' : 'Regular'}`)

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
