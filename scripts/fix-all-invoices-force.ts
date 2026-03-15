/**
 * FORCE FIX: Recalculate ALL invoices from timesheet entries
 * This version always recalculates, even if stored values appear correct
 * Run with: npx ts-node scripts/fix-all-invoices-force.ts --dry-run
 */

import { PrismaClient } from '@prisma/client'
import { Decimal } from '@prisma/client/runtime/library'
import { calculateEntryTotals } from '../lib/billing'

const prisma = new PrismaClient()
const DRY_RUN = process.argv.includes('--dry-run') || process.argv.includes('--dryrun')

async function fixAllInvoicesForce() {
  if (DRY_RUN) {
    console.log('🔍 DRY RUN MODE - No changes will be made\n')
  }
  console.log('Starting FORCE recalculation of all invoices...\n')
  console.log('='.repeat(60))

  try {
    const invoices = await (prisma as any).invoice.findMany({
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
    const errors: string[] = []

    for (const invoice of invoices) {
      try {
        const insurance = invoice.client?.insurance
        if (!insurance) {
          console.log(`⚠️  Skipping ${invoice.invoiceNumber}: No insurance`)
          skippedCount++
          continue
        }

        const ratePerUnit = (insurance as any).regularRatePerUnit 
          ? new Decimal((insurance as any).regularRatePerUnit.toString())
          : new Decimal(insurance.ratePerUnit.toString())
        const unitMinutes = (insurance as any).regularUnitMinutes || 15

        if (ratePerUnit.toNumber() <= 0) {
          console.log(`⚠️  Skipping ${invoice.invoiceNumber}: Invalid rate`)
          skippedCount++
          continue
        }

        // Recalculate ALL entries from timesheet data
        let totalRecalculatedAmount = new Decimal(0)
        let totalRecalculatedUnits = 0
        const entryUpdates: Array<{
          id: string
          oldUnits: number
          oldAmount: number
          newUnits: number
          newAmount: Decimal
          minutes: number
        }> = []

        for (const entry of invoice.entries) {
          const timesheet = entry.timesheet
          let entryMinutes: number | null = null

          // Try to get actual minutes from timesheet entries
          if (timesheet?.entries?.length > 0) {
            // If only one entry, use it
            if (timesheet.entries.length === 1) {
              entryMinutes = timesheet.entries[0].minutes
            } else {
              // Try to match by amount or units
              const match = timesheet.entries.find((e: any) => {
                const oldLogicAmount = new Decimal(e.minutes / unitMinutes).times(ratePerUnit)
                return Math.abs(oldLogicAmount.toNumber() - entry.amount.toNumber()) < 0.01
              })
              if (match) {
                entryMinutes = match.minutes
              } else {
                // Sum all entries (invoice entry might be aggregate)
                entryMinutes = timesheet.entries.reduce((sum: number, e: any) => sum + e.minutes, 0)
              }
            }
          }

          // Fallback: estimate from stored units
          if (entryMinutes === null) {
            entryMinutes = Math.round(entry.units.toNumber() * unitMinutes)
          }

          // Recalculate with Hours × 4
          const { units, amount } = calculateEntryTotals(entryMinutes, null, ratePerUnit, true)

          entryUpdates.push({
            id: entry.id,
            oldUnits: entry.units.toNumber(),
            oldAmount: entry.amount.toNumber(),
            newUnits: units,
            newAmount: amount,
            minutes: entryMinutes,
          })

          totalRecalculatedAmount = totalRecalculatedAmount.plus(amount)
          totalRecalculatedUnits += units
        }

        if (entryUpdates.length === 0) {
          console.log(`⚠️  Skipping ${invoice.invoiceNumber}: No entries to process`)
          skippedCount++
          continue
        }

        // Check if anything actually changed
        const oldTotal = invoice.totalAmount.toNumber()
        const newTotal = totalRecalculatedAmount.toNumber()
        const hasChanges = entryUpdates.some(e => 
          Math.abs(e.oldUnits - e.newUnits) > 0.001 || 
          Math.abs(e.oldAmount - e.newAmount.toNumber()) > 0.01
        )

        if (!hasChanges && Math.abs(oldTotal - newTotal) < 0.01) {
          console.log(`✓ ${invoice.invoiceNumber}: Already correct`)
          skippedCount++
          continue
        }

        // Apply changes
        if (!DRY_RUN) {
          await prisma.$transaction(async (tx) => {
            for (const update of entryUpdates) {
              await (tx as any).invoiceEntry.update({
                where: { id: update.id },
                data: {
                  units: new Decimal(update.newUnits),
                  amount: update.newAmount,
                },
              })
            }

            const newOutstanding = totalRecalculatedAmount
              .minus(invoice.paidAmount || 0)
              .plus(invoice.adjustments || 0)

            await (tx as any).invoice.update({
              where: { id: invoice.id },
              data: {
                totalAmount: totalRecalculatedAmount,
                outstanding: newOutstanding,
              },
            })
          })
        }

        console.log(`${DRY_RUN ? '[DRY RUN]' : '✅'} ${invoice.invoiceNumber}:`)
        console.log(`   Total: $${oldTotal.toFixed(2)} → $${newTotal.toFixed(2)}`)
        console.log(`   Units: ${invoice.entries.reduce((s: number, e: any) => s + e.units.toNumber(), 0).toFixed(2)} → ${totalRecalculatedUnits}`)
        console.log(`   Entries: ${entryUpdates.length}`)
        
        if (entryUpdates.length <= 5) {
          entryUpdates.forEach((e, i) => {
            console.log(`     ${i + 1}. ${e.oldUnits.toFixed(2)}u (${e.minutes}m) → ${e.newUnits}u | $${e.oldAmount.toFixed(2)} → $${e.newAmount.toNumber().toFixed(2)}`)
          })
        }

        fixedCount++
      } catch (error: any) {
        const msg = `${invoice.invoiceNumber}: ${error.message}`
        console.error(`❌ ${msg}`)
        errors.push(msg)
      }
    }

    console.log('\n' + '='.repeat(60))
    console.log(`\nSummary:`)
    console.log(`  ${DRY_RUN ? '🔍 Would fix' : '✅ Fixed'}: ${fixedCount}`)
    console.log(`  ⏭️  Skipped: ${skippedCount}`)
    console.log(`  ❌ Errors: ${errors.length}`)

    if (DRY_RUN && fixedCount > 0) {
      console.log('\n💡 Run without --dry-run to apply fixes')
    }
  } catch (error: any) {
    console.error('Fatal error:', error)
    process.exit(1)
  } finally {
    await prisma.$disconnect()
  }
}

fixAllInvoicesForce()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Fatal error:', error)
    process.exit(1)
  })
