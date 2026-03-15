/**
 * Script to fix all existing invoices by recalculating units using ceil() rounding
 * 
 * Usage:
 *   Dry run (preview only): npx ts-node scripts/fix-existing-invoices.ts --dry-run
 *   Apply fixes: npx ts-node scripts/fix-existing-invoices.ts
 */

import { PrismaClient } from '@prisma/client'
import { Decimal } from '@prisma/client/runtime/library'
import { minutesToUnits, calculateEntryTotals } from '../lib/billing'

const prisma = new PrismaClient()
const DRY_RUN = process.argv.includes('--dry-run') || process.argv.includes('--dryrun')

interface InvoiceToFix {
  id: string
  invoiceNumber: string
  clientId: string
  totalAmount: Decimal
  entries: Array<{
    id: string
    timesheetId: string
    units: Decimal
    rate: Decimal
    amount: Decimal
  }>
}

async function fixExistingInvoices() {
  if (DRY_RUN) {
    console.log('🔍 DRY RUN MODE - No changes will be made\n')
  }
  console.log('Starting invoice recalculation fix...\n')
  console.log('='.repeat(60))

  try {
    // Fetch all non-deleted invoices with their entries
    const invoices = await (prisma as any).invoice.findMany({
      where: {
        deletedAt: null,
      },
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
      orderBy: {
        createdAt: 'asc',
      },
    })

    console.log(`Found ${invoices.length} invoices to check\n`)

    let fixedCount = 0
    let skippedCount = 0
    const errors: string[] = []

    for (const invoice of invoices) {
      try {
        // Get insurance rate
        const insurance = invoice.client?.insurance
        if (!insurance) {
          console.log(`⚠️  Skipping invoice ${invoice.invoiceNumber}: No insurance found`)
          skippedCount++
          continue
        }

        // Use regular-specific rates, with fallbacks
        const ratePerUnit = (insurance as any).regularRatePerUnit 
          ? new Decimal((insurance as any).regularRatePerUnit.toString())
          : new Decimal(insurance.ratePerUnit.toString())
        const unitMinutes = (insurance as any).regularUnitMinutes || 15

        if (ratePerUnit.toNumber() <= 0) {
          console.log(`⚠️  Skipping invoice ${invoice.invoiceNumber}: Invalid rate`)
          skippedCount++
          continue
        }

        // Check if invoice needs fixing by examining entries
        let needsFix = false
        let totalRecalculatedAmount = new Decimal(0)
        let totalRecalculatedUnits = 0
        const entryUpdates: Array<{
          id: string
          newUnits: number
          newAmount: Decimal
          oldUnits: number
          oldAmount: number
          entryMinutes: number
          source: string
        }> = []

        for (const entry of invoice.entries) {
          // Try to find the original timesheet entry to get actual minutes
          const timesheet = entry.timesheet
          let entryMinutes: number | null = null

          if (timesheet && timesheet.entries && timesheet.entries.length > 0) {
            // Try multiple matching strategies to find the original timesheet entry
            
            // Strategy 1: Match by invoice entry amount (most reliable if amounts are unique)
            let timesheetEntry = timesheet.entries.find((e: any) => {
              // Calculate what the amount would be with old logic (fractional units)
              const oldLogicAmount = new Decimal(e.minutes / unitMinutes).times(ratePerUnit)
              return Math.abs(oldLogicAmount.toNumber() - entry.amount.toNumber()) < 0.01
            })

            // Strategy 2: Match by units (if amount match failed)
            if (!timesheetEntry) {
              timesheetEntry = timesheet.entries.find((e: any) => {
                const entryUnits = e.minutes / unitMinutes
                return Math.abs(entryUnits - entry.units.toNumber()) < 0.1
              })
            }

            // Strategy 3: If only one entry in timesheet, use it
            if (!timesheetEntry && timesheet.entries.length === 1) {
              timesheetEntry = timesheet.entries[0]
            }

            // Strategy 4: Sum all entries if multiple (invoice entry might be aggregate)
            if (!timesheetEntry && timesheet.entries.length > 1) {
              const totalMinutes = timesheet.entries.reduce((sum: number, e: any) => sum + e.minutes, 0)
              const totalUnits = totalMinutes / unitMinutes
              if (Math.abs(totalUnits - entry.units.toNumber()) < 0.1) {
                // This invoice entry represents the sum of all timesheet entries
                // We'll recalculate per entry and sum them
                entryMinutes = totalMinutes
              }
            }

            if (timesheetEntry) {
              entryMinutes = timesheetEntry.minutes
            }
          }

          // If we couldn't find the original entry, estimate minutes from stored units
          // This is less accurate but better than nothing
          if (entryMinutes === null) {
            // Estimate: stored units * unitMinutes (this assumes units were calculated as minutes/15)
            // But if units were fractional, this won't be accurate
            const estimatedMinutes = Math.round(entry.units.toNumber() * unitMinutes)
            entryMinutes = estimatedMinutes
            
            // If units are fractional, we can't accurately recover the original minutes
            // In this case, we'll recalculate based on the estimated minutes
            // This might not be 100% accurate but will at least use ceil() going forward
          }

          // Recalculate using new logic (ceil rounding)
          const { units, amount } = calculateEntryTotals(entryMinutes, null, ratePerUnit, true)
          
          const oldUnits = entry.units.toNumber()
          const oldAmount = entry.amount.toNumber()
          const newUnits = units
          const newAmount = amount.toNumber()

          // Always check if recalculation differs (even slightly)
          // This ensures all invoices use the new ceil() logic
          const unitsDiffer = Math.abs(oldUnits - newUnits) > 0.001
          const amountDiffers = Math.abs(oldAmount - newAmount) > 0.01
          const unitsAreFractional = oldUnits % 1 !== 0

          // Always fix if:
          // 1. Units are fractional (old bug)
          // 2. Units don't match ceil calculation
          // 3. Amount doesn't match (due to rounding differences)
          if (unitsAreFractional || unitsDiffer || amountDiffers) {
            needsFix = true
            entryUpdates.push({
              id: entry.id,
              newUnits,
              newAmount: amount,
              oldUnits,
              oldAmount,
              entryMinutes: entryMinutes || 0,
              source: entryMinutes === null ? 'estimated' : 'timesheet_entry',
            })
          }

          totalRecalculatedAmount = totalRecalculatedAmount.plus(amount)
          totalRecalculatedUnits += newUnits
        }

        // Log details for debugging
        if (entryUpdates.length === 0) {
          console.log(`✓ Invoice ${invoice.invoiceNumber}: Already correct (${invoice.entries.length} entries)`)
          // Show why it's considered correct
          if (invoice.entries.length > 0) {
            const firstEntry = invoice.entries[0]
            const firstUnits = firstEntry.units.toNumber()
            const isFractional = firstUnits % 1 !== 0
            console.log(`   - Sample entry: ${firstUnits.toFixed(2)} units, $${firstEntry.amount.toNumber().toFixed(2)}`)
            if (isFractional) {
              console.log(`   ⚠️  WARNING: Entry has fractional units but wasn't flagged for fix!`)
            }
          }
          skippedCount++
          continue
        }

        if (DRY_RUN) {
          console.log(`[DRY RUN] Would fix invoice ${invoice.invoiceNumber}:`)
        } else {
          // Update invoice in transaction
          await prisma.$transaction(async (tx) => {
            // Update each entry
            for (const update of entryUpdates) {
              await (tx as any).invoiceEntry.update({
                where: { id: update.id },
                data: {
                  units: new Decimal(update.newUnits),
                  amount: new Decimal(update.newAmount),
                },
              })
            }

            // Update invoice totals
            const newOutstanding = totalRecalculatedAmount.minus(invoice.paidAmount || 0).plus(invoice.adjustments || 0)
            
            await (tx as any).invoice.update({
              where: { id: invoice.id },
              data: {
                totalAmount: totalRecalculatedAmount,
                outstanding: newOutstanding,
              },
            })
          })
        }

        console.log(`${DRY_RUN ? '[DRY RUN]' : '✅'} ${DRY_RUN ? 'Would fix' : 'Fixed'} invoice ${invoice.invoiceNumber}:`)
        console.log(`   - Entries updated: ${entryUpdates.length} of ${invoice.entries.length}`)
        console.log(`   - Old total: $${invoice.totalAmount.toNumber().toFixed(2)}`)
        console.log(`   - New total: $${totalRecalculatedAmount.toNumber().toFixed(2)}`)
        const oldTotalUnits = invoice.entries.reduce((sum: number, e: any) => sum + e.units.toNumber(), 0)
        console.log(`   - Units: ${oldTotalUnits.toFixed(2)} → ${totalRecalculatedUnits}`)
        
        // Show sample entry changes for first 3 entries
        entryUpdates.slice(0, 3).forEach((update, idx) => {
          console.log(`   - Entry ${idx + 1}: ${update.oldUnits.toFixed(2)} units (${update.entryMinutes} min, ${update.source}) → ${update.newUnits} units`)
          console.log(`     Amount: $${update.oldAmount.toFixed(2)} → $${update.newAmount.toNumber().toFixed(2)}`)
        })
        if (entryUpdates.length > 3) {
          console.log(`   - ... and ${entryUpdates.length - 3} more entries`)
        }
        
        fixedCount++
      } catch (error: any) {
        const errorMsg = `Failed to fix invoice ${invoice.invoiceNumber}: ${error.message}`
        console.error(`❌ ${errorMsg}`)
        errors.push(errorMsg)
      }
    }

    console.log('\n' + '='.repeat(60))
    console.log('\nSummary:')
    if (DRY_RUN) {
      console.log(`  🔍 Would fix: ${fixedCount} invoices`)
    } else {
      console.log(`  ✅ Fixed: ${fixedCount} invoices`)
    }
    console.log(`  ⏭️  Skipped: ${skippedCount} invoices`)
    console.log(`  ❌ Errors: ${errors.length}`)
    
    if (DRY_RUN && fixedCount > 0) {
      console.log('\n💡 Run without --dry-run to apply these fixes')
    }
    
    if (errors.length > 0) {
      console.log('\nErrors:')
      errors.forEach(err => console.log(`  - ${err}`))
    }

  } catch (error: any) {
    console.error('Fatal error:', error)
    process.exit(1)
  } finally {
    await prisma.$disconnect()
  }
}

// Run the fix
fixExistingInvoices()
  .then(() => {
    console.log('\n✅ Invoice fix completed')
    process.exit(0)
  })
  .catch((error) => {
    console.error('Fatal error:', error)
    process.exit(1)
  })
