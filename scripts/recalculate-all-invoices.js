const { PrismaClient } = require('@prisma/client')
const { Decimal } = require('@prisma/client/runtime/library')

// Try to load .env if it exists
try {
  require('dotenv').config()
} catch (e) {
  // dotenv not available, assume environment variables are already set
}

const prisma = new PrismaClient()

/**
 * Convert minutes to units based on Insurance unit duration
 */
function minutesToUnits(minutes, unitMinutes = 15) {
  if (minutes <= 0) return 0
  if (unitMinutes <= 0) unitMinutes = 15 // Safety fallback
  const units = minutes / unitMinutes
  return Math.round(units * 100) / 100
}

/**
 * Calculate entry totals
 */
function calculateEntryTotals(entryMinutes, entryNotes, ratePerUnit, isRegularTimesheet, unitMinutes) {
  const units = minutesToUnits(entryMinutes, unitMinutes)
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

async function recalculateAllInvoices() {
  try {
    console.log('Starting invoice recalculation...\n')

    // Get all non-deleted invoices
    const invoices = await prisma.invoice.findMany({
      where: {
        deletedAt: null,
      },
      include: {
        client: {
          include: {
            insurance: true,
          },
        },
      },
      orderBy: {
        createdAt: 'asc',
      },
    })

    console.log(`Found ${invoices.length} invoices to recalculate\n`)

    let successCount = 0
    let errorCount = 0
    const errors = []

    for (const invoice of invoices) {
      try {
        console.log(`Processing invoice ${invoice.invoiceNumber}...`)

        // Get all linked timesheets for this invoice
        const timesheets = await prisma.timesheet.findMany({
          where: {
            invoiceId: invoice.id,
            deletedAt: null,
          },
          include: {
            entries: {
              orderBy: {
                date: 'asc',
              },
            },
            client: {
              include: {
                insurance: true,
              },
            },
          },
        })

        if (timesheets.length === 0) {
          console.log(`  ⚠️  No timesheets linked to invoice ${invoice.invoiceNumber}`)
          continue
        }

        console.log(`  Found ${timesheets.length} linked timesheet(s)`)

        // Get Insurance from client (all timesheets should have same insurance)
        const insurance = invoice.client.insurance
        if (!insurance) {
          console.log(`  ❌ No insurance found for client ${invoice.client.name}`)
          errorCount++
          errors.push(`${invoice.invoiceNumber}: No insurance found`)
          continue
        }

        // Get unit duration and rate from Insurance
        const regularUnitMinutes = insurance.regularUnitMinutes || 15
        const bcbaUnitMinutes = insurance.bcbaUnitMinutes || regularUnitMinutes
        const regularRatePerUnit = insurance.regularRatePerUnit 
          ? new Decimal(insurance.regularRatePerUnit.toString())
          : new Decimal(insurance.ratePerUnit.toString())
        const bcbaRatePerUnit = insurance.bcbaRatePerUnit
          ? new Decimal(insurance.bcbaRatePerUnit.toString())
          : regularRatePerUnit

        // Get all existing InvoiceEntry records for this invoice, grouped by timesheet
        const existingInvoiceEntries = await prisma.invoiceEntry.findMany({
          where: {
            invoiceId: invoice.id,
          },
          orderBy: {
            createdAt: 'asc',
          },
        })

        // Group existing entries by timesheetId
        const entriesByTimesheet = new Map()
        for (const entry of existingInvoiceEntries) {
          if (!entriesByTimesheet.has(entry.timesheetId)) {
            entriesByTimesheet.set(entry.timesheetId, [])
          }
          entriesByTimesheet.get(entry.timesheetId).push(entry)
        }

        // Recalculate totals from all timesheet entries
        let totalMinutes = 0
        let totalUnits = 0
        let totalAmount = new Decimal(0)
        const invoiceEntriesToUpdate = []

        for (const timesheet of timesheets) {
          // Get unit duration and rate for this timesheet
          const unitMinutes = timesheet.isBCBA ? bcbaUnitMinutes : regularUnitMinutes
          const ratePerUnit = timesheet.isBCBA ? bcbaRatePerUnit : regularRatePerUnit

          console.log(`  Processing timesheet ${timesheet.id} (${timesheet.isBCBA ? 'BCBA' : 'Regular'}, ${timesheet.entries.length} entries, unitMinutes: ${unitMinutes})`)

          // Get existing InvoiceEntry records for this timesheet (sorted by creation time)
          const existingEntries = entriesByTimesheet.get(timesheet.id) || []

          // Process each timesheet entry and match to InvoiceEntry
          for (let i = 0; i < timesheet.entries.length; i++) {
            const entry = timesheet.entries[i]
            
            // Calculate units and amount using Insurance unit duration
            const { units, amount } = calculateEntryTotals(
              entry.minutes,
              entry.notes,
              ratePerUnit,
              !timesheet.isBCBA, // isRegularTimesheet
              unitMinutes
            )

            totalMinutes += entry.minutes
            totalUnits += units
            totalAmount = totalAmount.plus(amount)

            // Match to existing InvoiceEntry (by order if available, or find by closest match)
            const existingEntry = existingEntries[i] || existingEntries[0]
            
            if (existingEntry) {
              invoiceEntriesToUpdate.push({
                id: existingEntry.id,
                units: new Decimal(units),
                amount: amount,
              })
            } else {
              console.log(`    ⚠️  No InvoiceEntry found for timesheet entry ${entry.id}`)
            }
          }
        }

        console.log(`  Calculated totals: ${totalMinutes} minutes, ${totalUnits.toFixed(2)} units, $${totalAmount.toNumber().toFixed(2)}`)

        // Update invoice and invoice entries in a transaction
        await prisma.$transaction(async (tx) => {
          // Update all invoice entries for this invoice
          for (const entryUpdate of invoiceEntriesToUpdate) {
            await tx.invoiceEntry.update({
              where: { id: entryUpdate.id },
              data: {
                units: entryUpdate.units,
                amount: entryUpdate.amount,
              },
            })
          }

          // Update invoice totals
          await tx.invoice.update({
            where: { id: invoice.id },
            data: {
              totalAmount: totalAmount,
              outstanding: totalAmount.minus(new Decimal(invoice.paidAmount.toString())).plus(new Decimal(invoice.adjustments.toString())),
            },
          })
        })

        console.log(`  ✅ Updated invoice ${invoice.invoiceNumber}`)
        successCount++

      } catch (error) {
        console.error(`  ❌ Error processing invoice ${invoice.invoiceNumber}:`, error.message)
        errorCount++
        errors.push(`${invoice.invoiceNumber}: ${error.message}`)
      }
    }

    console.log(`\n✅ Recalculation complete!`)
    console.log(`   Success: ${successCount}`)
    console.log(`   Errors: ${errorCount}`)
    if (errors.length > 0) {
      console.log(`\nErrors:`)
      errors.forEach(err => console.log(`   - ${err}`))
    }

  } catch (error) {
    console.error('Fatal error:', error)
  } finally {
    await prisma.$disconnect()
  }
}

// Run the recalculation
recalculateAllInvoices()
