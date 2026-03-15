/**
 * Fix All Invoices V2: Recalculate units from timesheet entries and update totals
 * 
 * Problem: InvoiceEntry records have incorrect units stored
 * Solution: Recalculate units from timesheet entries (hours × 4) and update InvoiceEntry records
 * 
 * Run on server: node scripts/fix-all-invoices-units-v2.js
 */

const { PrismaClient } = require('@prisma/client')
const { Decimal } = require('@prisma/client/runtime/library')

const prisma = new PrismaClient()

// CORRECT billing function: hours × 4
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
  console.log('Starting invoice units and totals fix V2 (recalculate from timesheet entries)...\n')

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
        if (!invoice.entries || invoice.entries.length === 0) {
          console.log(`⚠️  Skipping ${invoice.invoiceNumber}: No entries`)
          skippedCount++
          continue
        }

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

        // Recalculate each InvoiceEntry from its corresponding timesheet entry
        const invoiceStartDate = new Date(invoice.startDate)
        const invoiceEndDate = new Date(invoice.endDate)
        let totalRecalculatedAmount = new Decimal(0)
        let totalRecalculatedUnits = 0
        const entryUpdates = []

        for (const invoiceEntry of invoice.entries) {
          const timesheet = invoiceEntry.timesheet
          if (!timesheet || !timesheet.entries || timesheet.entries.length === 0) {
            continue
          }

          // Find the matching timesheet entry
          // Strategy: Match by finding the timesheet entry that best matches the invoice entry
          let matchedTimesheetEntry = null
          
          // Try to match by amount (most reliable)
          for (const tsEntry of timesheet.entries) {
            const entryDate = new Date(tsEntry.date)
            // Only consider entries within invoice date range
            if (entryDate < invoiceStartDate || entryDate > invoiceEndDate) {
              continue
            }

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
              const entryDate = new Date(tsEntry.date)
              if (entryDate < invoiceStartDate || entryDate > invoiceEndDate) {
                continue
              }

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

          // If still no match and only one entry in date range, use it
          if (!matchedTimesheetEntry) {
            const entriesInRange = timesheet.entries.filter(ts => {
              const entryDate = new Date(ts.date)
              return entryDate >= invoiceStartDate && entryDate <= invoiceEndDate
            })
            if (entriesInRange.length === 1) {
              matchedTimesheetEntry = entriesInRange[0]
            }
          }

          // If still no match, sum all entries in date range (invoice entry might be aggregate)
          if (!matchedTimesheetEntry) {
            const entriesInRange = timesheet.entries.filter(ts => {
              const entryDate = new Date(ts.date)
              return entryDate >= invoiceStartDate && entryDate <= invoiceEndDate
            })
            if (entriesInRange.length > 0) {
              const totalMinutes = entriesInRange.reduce((sum, e) => sum + (e.minutes || 0), 0)
              const totalNotes = entriesInRange[0]?.notes || null
              matchedTimesheetEntry = {
                minutes: totalMinutes,
                notes: totalNotes,
                id: 'aggregate'
              }
          }
          }

          if (!matchedTimesheetEntry) {
            console.log(`  ⚠️  InvoiceEntry ${invoiceEntry.id} has no matching timesheet entry, skipping`)
            continue
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

        // Check if anything changed
        const hasChanges = entryUpdates.some(e => {
          const unitsDiffer = Math.abs(e.oldUnits - e.newUnits) > 0.001
          const amountDiffers = Math.abs(e.oldAmount - e.newAmount) > 0.01
          return unitsDiffer || amountDiffers
        }) || difference > 0.01

        if (!hasChanges) {
          console.log(`✓ ${invoice.invoiceNumber}: Already correct (${oldTotal.toFixed(2)})`)
          skippedCount++
          continue
        }

        console.log(`\n🔧 Fixing ${invoice.invoiceNumber}:`)
        console.log(`   Units: ${totalRecalculatedUnits.toFixed(2)}`)
        console.log(`   Rate: $${ratePerUnit.toNumber().toFixed(2)}`)
        console.log(`   Old Total: $${oldTotal.toFixed(2)}`)
        console.log(`   New Total: $${newTotal.toFixed(2)}`)
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
        const newOutstanding = totalRecalculatedAmount
          .minus(invoice.paidAmount || 0)
          .plus(invoice.adjustments || 0)

        await prisma.invoice.update({
          where: { id: invoice.id },
          data: {
            totalAmount: totalRecalculatedAmount,
            outstanding: newOutstanding,
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
