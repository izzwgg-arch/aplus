const { PrismaClient } = require('@prisma/client')
const { Decimal } = require('@prisma/client/runtime/library')

// Try to load .env if it exists
try {
  require('dotenv').config()
} catch (e) {
  // dotenv not available, assume environment variables are already set
}

const prisma = new PrismaClient()

async function verifyOutstandingAmounts() {
  try {
    console.log('Verifying outstanding amounts for all invoices...\n')

    // Get all non-deleted invoices
    const invoices = await prisma.invoice.findMany({
      where: {
        deletedAt: null,
      },
      select: {
        id: true,
        invoiceNumber: true,
        totalAmount: true,
        paidAmount: true,
        adjustments: true,
        outstanding: true,
      },
      orderBy: {
        createdAt: 'asc',
      },
    })

    console.log(`Found ${invoices.length} invoices to verify\n`)

    let correctCount = 0
    let incorrectCount = 0
    const incorrectInvoices = []

    for (const invoice of invoices) {
      // Calculate expected outstanding: totalAmount - paidAmount + adjustments
      const expectedOutstanding = new Decimal(invoice.totalAmount.toString())
        .minus(new Decimal(invoice.paidAmount.toString()))
        .plus(new Decimal(invoice.adjustments.toString()))
      
      const currentOutstanding = new Decimal(invoice.outstanding.toString())
      
      // Compare with small tolerance for floating point differences
      const difference = expectedOutstanding.minus(currentOutstanding).abs()
      const tolerance = new Decimal('0.01') // 1 cent tolerance
      
      if (difference.greaterThan(tolerance)) {
        incorrectCount++
        incorrectInvoices.push({
          invoiceNumber: invoice.invoiceNumber,
          expected: expectedOutstanding.toNumber(),
          current: currentOutstanding.toNumber(),
          difference: difference.toNumber(),
        })
        console.log(`❌ ${invoice.invoiceNumber}: Expected $${expectedOutstanding.toFixed(2)}, but has $${currentOutstanding.toFixed(2)} (diff: $${difference.toFixed(2)})`)
      } else {
        correctCount++
      }
    }

    console.log(`\n✅ Verification complete!`)
    console.log(`   Correct: ${correctCount}`)
    console.log(`   Incorrect: ${incorrectCount}`)
    
    if (incorrectInvoices.length > 0) {
      console.log(`\nIncorrect invoices:`)
      incorrectInvoices.forEach(inv => {
        console.log(`   ${inv.invoiceNumber}: Expected $${inv.expected.toFixed(2)}, Current $${inv.current.toFixed(2)}, Difference $${inv.difference.toFixed(2)}`)
      })
      
      // Fix incorrect invoices
      console.log(`\nFixing incorrect invoices...`)
      for (const inv of incorrectInvoices) {
        const invoice = invoices.find(i => i.invoiceNumber === inv.invoiceNumber)
        if (invoice) {
          const expectedOutstanding = new Decimal(invoice.totalAmount.toString())
            .minus(new Decimal(invoice.paidAmount.toString()))
            .plus(new Decimal(invoice.adjustments.toString()))
          
          await prisma.invoice.update({
            where: { id: invoice.id },
            data: {
              outstanding: expectedOutstanding,
            },
          })
          console.log(`   ✅ Fixed ${inv.invoiceNumber}`)
        }
      }
      console.log(`\n✅ All incorrect invoices have been fixed!`)
    } else {
      console.log(`\n✅ All outstanding amounts are correct!`)
    }

    // Calculate dashboard totals
    const dashboardTotals = await prisma.invoice.aggregate({
      where: { deletedAt: null },
      _sum: {
        totalAmount: true,
        paidAmount: true,
        outstanding: true,
      },
    })

    console.log(`\n📊 Dashboard Totals:`)
    console.log(`   Total Billed: $${parseFloat(dashboardTotals._sum.totalAmount?.toString() || '0').toFixed(2)}`)
    console.log(`   Total Paid: $${parseFloat(dashboardTotals._sum.paidAmount?.toString() || '0').toFixed(2)}`)
    console.log(`   Total Outstanding: $${parseFloat(dashboardTotals._sum.outstanding?.toString() || '0').toFixed(2)}`)

  } catch (error) {
    console.error('Error:', error)
  } finally {
    await prisma.$disconnect()
  }
}

// Run the verification
verifyOutstandingAmounts()
