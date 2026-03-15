/**
 * CRITICAL FIX V2: Recalculate ALL invoices with correct logic
 * 
 * FIX: Only process InvoiceEntry records that exist, don't create new ones
 * 
 * Rules:
 * 1. Units = Hours × 4 (1 hour = 4 units)
 * 2. Regular timesheets: SV entries = $0 (displayed but not charged)
 * 3. BCBA timesheets: All entries charged at BCBA rate
 * 
 * Run on server: node scripts/fix-all-invoices-correct-v2.js
 */

const { PrismaClient } = require('@prisma/client')
const { Decimal } = require('@prisma/client/runtime/library')

const prisma = new PrismaClient()

// CORRECT billing functions
function minutesToUnits(minutes) {
  if (minutes <= 0) return 0
  const hours = minutes / 60
  const units = hours * 4
  return Math.round(units * 100) / 100
}

function calculateEntryTotals(entryMinutes, entryNotes, ratePerUnit, isRegularTimesheet) {
  const units = minutesToUnits(entryMinutes)
  const rate = ratePerUnit instanceof Decimal ? ratePerUnit : new Decimal(ratePerUnit)
  const isSV = entryNotes === 'SV'
  
  const amount = (isRegularTimesheet && isSV)
    ? new Decimal(0)
    : new Decimal(units).times(rate)
  
  return { units, amount }
}

async function fixAllInvoices() {
  console.log('Starting CRITICAL invoice fix V2 (only process existing InvoiceEntries)...\n')

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
            provider: true,
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

        // CRITICAL: Only process existing InvoiceEntry records
        // Match each InvoiceEntry to its corresponding TimesheetEntry and recalculate
        let totalRecalculatedAmount = new Decimal(0)
        let totalRecalculatedUnits = 0
        const entryUpdates = []

        for (const invoiceEntry of invoice.entries) {
          const timesheet = invoiceEntry.timesheet
          if (!timesheet || !timesheet.entries || timesheet.entries.length === 0) {
            console.log(`  ⚠️  InvoiceEntry ${invoiceEntry.id} has no timesheet entries, skipping`)
            continue
          }

          // Find the matching timesheet entry
          // Strategy: Match by finding the timesheet entry that best matches the invoice entry
          let matchedTimesheetEntry = null
          
          // Try to match by amount (most reliable)
          for (const tsEntry of timesheet.entries) {
            const { amount: calculatedAmount } = calculateEntryTotals(
              tsEntry.minutes,
              tsEntry.notes,
              ratePerUnit,
              !timesheet.isBCBA
            )
            
            if (Math.abs(calculatedAmount.toNumber() - invoiceEntry.amount.toNumber()) < 0.01) {
              matchedTimesheetEntry = tsEntry
              break
            }
          }

          // If no match by amount, try to match by units
          if (!matchedTimesheetEntry) {
            for (const tsEntry of timesheet.entries) {
              const { units: calculatedUnits } = calculateEntryTotals(
                tsEntry.minutes,
                tsEntry.notes,
                ratePerUnit,
                !timesheet.isBCBA
              )
              
              if (Math.abs(calculatedUnits - invoiceEntry.units.toNumber()) < 0.1) {
                matchedTimesheetEntry = tsEntry
                break
              }
            }
          }

          // If still no match and only one entry, use it
          if (!matchedTimesheetEntry && timesheet.entries.length === 1) {
            matchedTimesheetEntry = timesheet.entries[0]
          }

          // If still no match, sum all entries (invoice entry might be aggregate)
          if (!matchedTimesheetEntry) {
            const totalMinutes = timesheet.entries.reduce((sum, e) => sum + (e.minutes || 0), 0)
            const totalNotes = timesheet.entries[0]?.notes || null
            matchedTimesheetEntry = {
              minutes: totalMinutes,
              notes: totalNotes,
              id: 'aggregate'
            }
          }

          // Recalculate using correct logic
          const { units, amount } = calculateEntryTotals(
            matchedTimesheetEntry.minutes,
            matchedTimesheetEntry.notes,
            ratePerUnit,
            !timesheet.isBCBA
          )

          entryUpdates.push({
            id: invoiceEntry.id,
            newUnits: units,
            newAmount: amount,
            oldUnits: invoiceEntry.units.toNumber(),
            oldAmount: invoiceEntry.amount.toNumber(),
          })

          totalRecalculatedAmount = totalRecalculatedAmount.plus(amount)
          totalRecalculatedUnits += units
        }

        if (entryUpdates.length === 0) {
          console.log(`⚠️  Skipping ${invoice.invoiceNumber}: No entries to process`)
          skippedCount++
          continue
        }

        const oldTotal = invoice.totalAmount.toNumber()
        const newTotal = totalRecalculatedAmount.toNumber()
        const difference = Math.abs(newTotal - oldTotal)

        // Only update if there's a meaningful difference
        if (difference < 0.01) {
          console.log(`✓ ${invoice.invoiceNumber}: Already correct (${oldTotal.toFixed(2)})`)
          skippedCount++
          continue
        }

        console.log(`\n🔧 Fixing ${invoice.invoiceNumber}:`)
        console.log(`   Old Total: $${oldTotal.toFixed(2)}`)
        console.log(`   New Total: $${newTotal.toFixed(2)}`)
        console.log(`   Difference: $${difference.toFixed(2)}`)
        console.log(`   Entries: ${entryUpdates.length}`)

        // Update invoice entries
        for (const update of entryUpdates) {
          await prisma.invoiceEntry.update({
            where: { id: update.id },
            data: {
              units: new Decimal(update.newUnits),
              amount: update.newAmount,
            },
          })
        }

        // Update invoice totals
        await prisma.invoice.update({
          where: { id: invoice.id },
          data: {
            totalAmount: totalRecalculatedAmount,
            outstanding: totalRecalculatedAmount.minus(invoice.paidAmount || 0),
          },
        })

        console.log(`   ✅ Fixed`)
        fixedCount++

      } catch (error) {
        console.error(`❌ Error fixing ${invoice.invoiceNumber}:`, error.message)
        skippedCount++
      }
    }

    console.log(`\n✅ Fixed: ${fixedCount}`)
    console.log(`⚠️  Skipped: ${skippedCount}`)
    console.log(`\nDone!`)

  } catch (error) {
    console.error('Fatal error:', error)
  } finally {
    await prisma.$disconnect()
  }
}

fixAllInvoices()
