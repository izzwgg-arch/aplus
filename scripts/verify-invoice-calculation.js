/**
 * Verify invoice calculation for a specific invoice
 * Run: node scripts/verify-invoice-calculation.js INV-2026-0052
 */

const { PrismaClient } = require('@prisma/client')
const { Decimal } = require('@prisma/client/runtime/library')

const prisma = new PrismaClient()

function minutesToUnits(minutes) {
  if (minutes <= 0) return 0
  const hours = minutes / 60
  const units = hours * 4
  return Math.round(units * 100) / 100
}

async function verifyInvoice(invoiceNumber) {
  const invoice = await prisma.invoice.findFirst({
    where: { invoiceNumber },
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
  })

  if (!invoice) {
    console.log('Invoice not found')
    return
  }

  console.log(`\nInvoice: ${invoice.invoiceNumber}`)
  console.log(`Date range: ${invoice.startDate.toISOString().split('T')[0]} to ${invoice.endDate.toISOString().split('T')[0]}`)
  console.log(`Current total: $${invoice.totalAmount.toString()}`)
  console.log(`Current total units: ${invoice.entries.reduce((s, e) => s + parseFloat(e.units.toString()), 0).toFixed(2)}`)

  const isBCBA = invoice.entries.some(e => e.timesheet?.isBCBA === true)
  const insurance = invoice.client.insurance
  const ratePerUnit = isBCBA
    ? (insurance.bcbaRatePerUnit ? new Decimal(insurance.bcbaRatePerUnit.toString()) : new Decimal(insurance.ratePerUnit.toString()))
    : (insurance.regularRatePerUnit ? new Decimal(insurance.regularRatePerUnit.toString()) : new Decimal(insurance.ratePerUnit.toString()))

  console.log(`\nType: ${isBCBA ? 'BCBA' : 'Regular'}`)
  console.log(`Rate per unit: $${ratePerUnit.toString()}`)

  let totalMinutes = 0
  let totalUnits = 0
  let billableUnits = 0
  let totalAmount = new Decimal(0)

  console.log(`\nTimesheet Entries:`)
  invoice.entries.forEach((entry, i) => {
    if (entry.timesheet?.entries) {
      entry.timesheet.entries.forEach((tsEntry, j) => {
        const entryDate = new Date(tsEntry.date)
        const entryDateOnly = new Date(entryDate.getFullYear(), entryDate.getMonth(), entryDate.getDate())
        const startDateOnly = new Date(invoice.startDate.getFullYear(), invoice.startDate.getMonth(), invoice.startDate.getDate())
        const endDateOnly = new Date(invoice.endDate.getFullYear(), invoice.endDate.getMonth(), invoice.endDate.getDate())
        
        if (entryDateOnly >= startDateOnly && entryDateOnly <= endDateOnly) {
          const units = minutesToUnits(tsEntry.minutes)
          const isSV = tsEntry.notes === 'SV'
          const isRegular = !entry.timesheet.isBCBA
          const amount = (isRegular && isSV) ? new Decimal(0) : new Decimal(units).times(ratePerUnit)
          
          totalMinutes += tsEntry.minutes
          totalUnits += units
          if (!(isRegular && isSV)) {
            billableUnits += units
          }
          totalAmount = totalAmount.plus(amount)
          
          console.log(`  ${tsEntry.date.toISOString().split('T')[0]} ${tsEntry.notes || 'DR'}: ${tsEntry.minutes} min = ${units.toFixed(2)} units, $${amount.toNumber().toFixed(2)}`)
        }
      })
    }
  })

  console.log(`\nCalculated Totals:`)
  console.log(`  Total minutes: ${totalMinutes}`)
  console.log(`  Total units (all): ${totalUnits.toFixed(2)}`)
  console.log(`  Billable units: ${billableUnits.toFixed(2)}`)
  console.log(`  Total amount: $${totalAmount.toNumber().toFixed(2)}`)
  console.log(`\nExpected: ${billableUnits.toFixed(2)} units × $${ratePerUnit.toString()} = $${totalAmount.toNumber().toFixed(2)}`)
}

const invoiceNumber = process.argv[2] || 'INV-2026-0052'
verifyInvoice(invoiceNumber)
  .then(() => prisma.$disconnect())
  .catch(e => {
    console.error(e)
    prisma.$disconnect()
    process.exit(1)
  })
