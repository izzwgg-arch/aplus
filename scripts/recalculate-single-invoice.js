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

/**
 * Convert display invoice number (I-XXXX) to full invoice number (INV-YYYY-XXXX)
 */
function parseInvoiceNumber(displayNumber) {
  if (!displayNumber.startsWith('I-')) {
    return displayNumber // Assume it's already full or invalid
  }
  const sequence = displayNumber.substring(2) // "0052"
  const currentYear = new Date().getFullYear()
  return `INV-${currentYear}-${sequence}`
}

async function recalculateSingleInvoice(invoiceDisplayNumber) {
  try {
    const fullInvoiceNumber = parseInvoiceNumber(invoiceDisplayNumber)
    console.log(`Recalculating invoice: ${fullInvoiceNumber} (display: ${invoiceDisplayNumber})\n`)

    // Get the invoice
    const invoice = await prisma.invoice.findUnique({
      where: {
        invoiceNumber: fullInvoiceNumber,
      },
      include: {
        client: {
          include: {
            insurance: true,
          },
        },
      },
    })

    if (!invoice) {
      console.error(`Invoice ${fullInvoiceNumber} not found`)
      return
    }

    if (invoice.deletedAt) {
      console.error(`Invoice ${fullInvoiceNumber} is deleted`)
      return
    }

    console.log(`Found invoice ${invoice.invoiceNumber} for client ${invoice.client.name}\n`)

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
      console.log(`⚠️  No timesheets linked to invoice ${invoice.invoiceNumber}`)
      return
    }

    console.log(`Found ${timesheets.length} linked timesheet(s):`)
    timesheets.forEach((ts, idx) => {
      console.log(`  ${idx + 1}. Timesheet ${ts.id} (${ts.isBCBA ? 'BCBA' : 'Regular'}) - ${ts.entries.length} entries`)
    })
    console.log()

    // Get Insurance from client
    const insurance = invoice.client.insurance
    if (!insurance) {
      console.error(`❌ No insurance found for client ${invoice.client.name}`)
      return
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

    console.log(`Insurance: ${insurance.name}`)
    console.log(`  Regular unit minutes: ${regularUnitMinutes}`)
    console.log(`  BCBA unit minutes: ${bcbaUnitMinutes}`)
    console.log(`  Regular rate per unit: $${regularRatePerUnit.toNumber()}`)
    console.log(`  BCBA rate per unit: $${bcbaRatePerUnit.toNumber()}`)
    console.log()

    // Get all existing InvoiceEntry records for this invoice
    const existingInvoiceEntries = await prisma.invoiceEntry.findMany({
      where: {
        invoiceId: invoice.id,
      },
      orderBy: {
        createdAt: 'asc',
      },
    })

    console.log(`Found ${existingInvoiceEntries.length} existing InvoiceEntry records\n`)

    // Recalculate totals from all timesheet entries
    let totalMinutes = 0
    let totalUnits = 0
    let totalAmount = new Decimal(0)
    const invoiceEntriesToUpdate = []

    for (const timesheet of timesheets) {
      // Get unit duration and rate for this timesheet
      const unitMinutes = timesheet.isBCBA ? bcbaUnitMinutes : regularUnitMinutes
      const ratePerUnit = timesheet.isBCBA ? bcbaRatePerUnit : regularRatePerUnit

      console.log(`Processing timesheet ${timesheet.id} (${timesheet.isBCBA ? 'BCBA' : 'Regular'}, ${timesheet.entries.length} entries, unitMinutes: ${unitMinutes}):`)

      // Get existing InvoiceEntry records for this timesheet (sorted by creation time)
      const existingEntries = existingInvoiceEntries.filter(e => e.timesheetId === timesheet.id)

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

        console.log(`  Entry ${i + 1}: ${entry.minutes} min → ${units.toFixed(2)} units @ $${ratePerUnit.toNumber()} = $${amount.toNumber().toFixed(2)} (${entry.notes || 'DR'})`)

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
      console.log()
    }

    console.log(`Calculated totals:`)
    console.log(`  Total minutes: ${totalMinutes}`)
    console.log(`  Total units: ${totalUnits.toFixed(2)}`)
    console.log(`  Total amount: $${totalAmount.toNumber().toFixed(2)}`)
    console.log()
    console.log(`Current invoice totals:`)
    console.log(`  Total amount: $${invoice.totalAmount.toString()}`)
    console.log(`  Paid amount: $${invoice.paidAmount.toString()}`)
    console.log(`  Adjustments: $${invoice.adjustments.toString()}`)
    console.log(`  Outstanding: $${invoice.outstanding.toString()}`)
    console.log()

    // Calculate new outstanding amount
    const newOutstanding = totalAmount.minus(new Decimal(invoice.paidAmount.toString())).plus(new Decimal(invoice.adjustments.toString()))

    console.log(`New outstanding: $${newOutstanding.toNumber().toFixed(2)}`)
    console.log()

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
          outstanding: newOutstanding,
        },
      })
    })

    console.log(`✅ Successfully updated invoice ${invoice.invoiceNumber}`)
    console.log(`   Updated ${invoiceEntriesToUpdate.length} InvoiceEntry records`)
    console.log(`   Updated invoice totals`)

  } catch (error) {
    console.error('Error:', error)
  } finally {
    await prisma.$disconnect()
  }
}

// Get invoice number from command line argument
const invoiceNumber = process.argv[2]

if (!invoiceNumber) {
  console.error('Usage: node recalculate-single-invoice.js <invoice-number>')
  console.error('Example: node recalculate-single-invoice.js I-0052')
  process.exit(1)
}

// Run the recalculation
recalculateSingleInvoice(invoiceNumber)
