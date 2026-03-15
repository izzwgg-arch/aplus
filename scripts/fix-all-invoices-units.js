/**
 * Fix All Invoices: Recalculate units and totals from InvoiceEntry records
 * 
 * Problem: Invoices are showing incorrect units (e.g., 778 instead of 58, 480 instead of 80)
 * Solution: Recalculate totals by summing InvoiceEntry.units and multiplying by rate
 * 
 * Run on server: node scripts/fix-all-invoices-units.js
 */

const { PrismaClient } = require('@prisma/client')
const { Decimal } = require('@prisma/client/runtime/library')

const prisma = new PrismaClient()

async function fixAllInvoices() {
  console.log('Starting invoice units and totals fix...\n')

  try {
    const invoices = await prisma.invoice.findMany({
      where: { deletedAt: null },
      include: {
        entries: true, // Get all InvoiceEntry records
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

        // Sum units from all InvoiceEntry records
        let totalUnits = 0
        let ratePerUnit = 0
        
        invoice.entries.forEach((entry) => {
          totalUnits += parseFloat(entry.units.toString())
          // Get rate from first entry (all entries should have same rate)
          if (ratePerUnit === 0) {
            ratePerUnit = parseFloat(entry.rate.toString())
          }
        })

        if (ratePerUnit === 0) {
          console.log(`⚠️  Skipping ${invoice.invoiceNumber}: Invalid rate`)
          skippedCount++
          continue
        }

        // Calculate correct total: units × rate
        const calculatedTotal = new Decimal(totalUnits).times(new Decimal(ratePerUnit))
        const oldTotal = invoice.totalAmount.toNumber()
        const newTotal = calculatedTotal.toNumber()
        const difference = Math.abs(newTotal - oldTotal)

        // Only update if there's a meaningful difference
        if (difference < 0.01) {
          console.log(`✓ ${invoice.invoiceNumber}: Already correct (${oldTotal.toFixed(2)})`)
          skippedCount++
          continue
        }

        console.log(`\n🔧 Fixing ${invoice.invoiceNumber}:`)
        console.log(`   Units: ${totalUnits.toFixed(2)}`)
        console.log(`   Rate: $${ratePerUnit.toFixed(2)}`)
        console.log(`   Old Total: $${oldTotal.toFixed(2)}`)
        console.log(`   New Total: $${newTotal.toFixed(2)}`)
        console.log(`   Difference: $${difference.toFixed(2)}`)

        // Update invoice totals
        const newOutstanding = calculatedTotal
          .minus(invoice.paidAmount || 0)
          .plus(invoice.adjustments || 0)

        await prisma.invoice.update({
          where: { id: invoice.id },
          data: {
            totalAmount: calculatedTotal,
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
