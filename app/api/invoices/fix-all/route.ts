import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { Decimal } from '@prisma/client/runtime/library'
import { calculateEntryTotals } from '@/lib/billing'

/**
 * POST /api/invoices/fix-all
 * Admin-only endpoint to recalculate all existing invoices using ceil() rounding
 * 
 * Query params:
 *   - dryRun=true: Preview changes without applying
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Admin only
    if (session.user.role !== 'ADMIN' && session.user.role !== 'SUPER_ADMIN') {
      return NextResponse.json({ error: 'Forbidden: Admin access required' }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const dryRun = searchParams.get('dryRun') === 'true'

    console.log(`[INVOICE FIX] Starting ${dryRun ? 'DRY RUN' : 'FIX'} for all invoices`)

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

    const results: Array<{
      invoiceNumber: string
      fixed: boolean
      oldTotal: number
      newTotal: number
      oldUnits: number
      newUnits: number
      entriesUpdated: number
      error?: string
    }> = []

    let fixedCount = 0
    let skippedCount = 0

    for (const invoice of invoices) {
      try {
        const insurance = invoice.client?.insurance
        if (!insurance) {
          results.push({
            invoiceNumber: invoice.invoiceNumber,
            fixed: false,
            oldTotal: invoice.totalAmount.toNumber(),
            newTotal: invoice.totalAmount.toNumber(),
            oldUnits: 0,
            newUnits: 0,
            entriesUpdated: 0,
            error: 'No insurance',
          })
          skippedCount++
          continue
        }

        const ratePerUnit = (insurance as any).regularRatePerUnit 
          ? new Decimal((insurance as any).regularRatePerUnit.toString())
          : new Decimal(insurance.ratePerUnit.toString())
        const unitMinutes = (insurance as any).regularUnitMinutes || 15

        if (ratePerUnit.toNumber() <= 0) {
          results.push({
            invoiceNumber: invoice.invoiceNumber,
            fixed: false,
            oldTotal: invoice.totalAmount.toNumber(),
            newTotal: invoice.totalAmount.toNumber(),
            oldUnits: 0,
            newUnits: 0,
            entriesUpdated: 0,
            error: 'Invalid rate',
          })
          skippedCount++
          continue
        }

        // Recalculate ALL entries from timesheet data
        // Strategy: Get all unique timesheets, collect all their entries within date range,
        // recalculate each, and match/update InvoiceEntries
        const uniqueTimesheets = new Map<string, any>()
        invoice.entries.forEach((entry: any) => {
          if (entry.timesheet && !uniqueTimesheets.has(entry.timesheet.id)) {
            uniqueTimesheets.set(entry.timesheet.id, entry.timesheet)
          }
        })

        // Collect all timesheet entries within invoice date range
        // IMPORTANT: Include ALL entries, not just those marked as invoiced
        const allTimesheetEntries: Array<{ entry: any; timesheet: any }> = []
        uniqueTimesheets.forEach((timesheet) => {
          if (timesheet.entries) {
            timesheet.entries.forEach((tsEntry: any) => {
              const entryDate = new Date(tsEntry.date)
              // Check if entry falls within invoice date range (inclusive)
              const entryDateOnly = new Date(entryDate.getFullYear(), entryDate.getMonth(), entryDate.getDate())
              const startDateOnly = new Date(invoice.startDate.getFullYear(), invoice.startDate.getMonth(), invoice.startDate.getDate())
              const endDateOnly = new Date(invoice.endDate.getFullYear(), invoice.endDate.getMonth(), invoice.endDate.getDate())
              
              if (entryDateOnly >= startDateOnly && entryDateOnly <= endDateOnly) {
                allTimesheetEntries.push({ entry: tsEntry, timesheet })
              }
            })
          }
        })

        console.log(`[FIX-ALL] Invoice ${invoice.invoiceNumber}: Found ${allTimesheetEntries.length} timesheet entries from ${uniqueTimesheets.size} timesheets`)

        // Recalculate each timesheet entry
        const recalculatedEntries: Array<{
          timesheetEntry: any
          timesheet: any
          units: number
          amount: Decimal
        }> = []

        for (const { entry: tsEntry, timesheet } of allTimesheetEntries) {
          const { units, amount } = calculateEntryTotals(
            tsEntry.minutes,
            tsEntry.notes,
            ratePerUnit,
            !timesheet.isBCBA // isRegularTimesheet
          )
          recalculatedEntries.push({
            timesheetEntry: tsEntry,
            timesheet,
            units: units,
            amount,
          })
        }

        // Match InvoiceEntries to recalculated entries (by order or best match)
        let totalRecalculatedAmount = new Decimal(0)
        let totalRecalculatedUnits = 0
        const entryUpdates: Array<{
          id: string
          newUnits: number
          newAmount: Decimal
        }> = []
        const usedRecalculatedIndices = new Set<number>()

        for (const invoiceEntry of invoice.entries) {
          // Try to find best matching recalculated entry
          let bestMatch: { index: number; entry: any } | null = null
          let bestMatchScore = Infinity

          for (let i = 0; i < recalculatedEntries.length; i++) {
            if (usedRecalculatedIndices.has(i)) continue

            const recalc = recalculatedEntries[i]
            // Match by timesheet ID first
            if (recalc.timesheet.id === invoiceEntry.timesheet.id) {
              // Calculate match score (lower is better)
              const unitsDiff = Math.abs(recalc.units - invoiceEntry.units.toNumber())
              const amountDiff = Math.abs(recalc.amount.toNumber() - invoiceEntry.amount.toNumber())
              const score = unitsDiff + amountDiff

              if (score < bestMatchScore) {
                bestMatch = { index: i, entry: recalc }
                bestMatchScore = score
              }
            }
          }

          // Use best match, or first available if no match found
          let recalcEntry = bestMatch?.entry
          if (!recalcEntry && recalculatedEntries.length > 0) {
            // Use first unused entry
            const firstUnused = recalculatedEntries.findIndex((_, i) => !usedRecalculatedIndices.has(i))
            if (firstUnused >= 0) {
              recalcEntry = recalculatedEntries[firstUnused]
              usedRecalculatedIndices.add(firstUnused)
            }
          }

          if (recalcEntry) {
            if (bestMatch) usedRecalculatedIndices.add(bestMatch.index)
            entryUpdates.push({
              id: invoiceEntry.id,
              newUnits: recalcEntry.units,
              newAmount: recalcEntry.amount,
            })
            totalRecalculatedAmount = totalRecalculatedAmount.plus(recalcEntry.amount)
            totalRecalculatedUnits += recalcEntry.units
          } else {
            // Fallback: estimate from stored units
            const estimatedMinutes = Math.round(invoiceEntry.units.toNumber() * unitMinutes)
            const { units, amount } = calculateEntryTotals(estimatedMinutes, null, ratePerUnit, true)
            entryUpdates.push({
              id: invoiceEntry.id,
              newUnits: units,
              newAmount: amount,
            })
            totalRecalculatedAmount = totalRecalculatedAmount.plus(amount)
            totalRecalculatedUnits += units
          }
        }

        const oldTotal = invoice.totalAmount.toNumber()
        const newTotal = totalRecalculatedAmount.toNumber()
        const oldUnits = invoice.entries.reduce((sum: number, e: any) => sum + e.units.toNumber(), 0)
        
        // ALWAYS recalculate and update if we have recalculated entries
        // This ensures all invoices use the correct ceil() logic
        const hasChanges = entryUpdates.length > 0 && (
          entryUpdates.some(e => {
            const oldEntry = invoice.entries.find((ent: any) => ent.id === e.id)
            if (!oldEntry) return true // New entry, definitely needs update
            
            const unitsDiffer = Math.abs(oldEntry.units.toNumber() - e.newUnits) > 0.001
            const amountDiffers = Math.abs(oldEntry.amount.toNumber() - e.newAmount.toNumber()) > 0.01
            const hasFractionalUnits = oldEntry.units.toNumber() % 1 !== 0
            
            return unitsDiffer || amountDiffers || hasFractionalUnits
          }) || Math.abs(oldTotal - newTotal) > 0.01
        )

        // If no changes detected but we have recalculated data, still update to ensure consistency
        if (!hasChanges && entryUpdates.length === 0) {
          results.push({
            invoiceNumber: invoice.invoiceNumber,
            fixed: false,
            oldTotal,
            newTotal,
            oldUnits,
            newUnits: totalRecalculatedUnits,
            entriesUpdated: 0,
          })
          skippedCount++
          continue
        }

        if (!dryRun) {
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

        results.push({
          invoiceNumber: invoice.invoiceNumber,
          fixed: true,
          oldTotal,
          newTotal,
          oldUnits,
          newUnits: totalRecalculatedUnits,
          entriesUpdated: entryUpdates.length,
        })

        fixedCount++
      } catch (error: any) {
        results.push({
          invoiceNumber: invoice.invoiceNumber,
          fixed: false,
          oldTotal: invoice.totalAmount.toNumber(),
          newTotal: invoice.totalAmount.toNumber(),
          oldUnits: 0,
          newUnits: 0,
          entriesUpdated: 0,
          error: error.message,
        })
      }
    }

    return NextResponse.json({
      success: true,
      dryRun,
      summary: {
        total: invoices.length,
        fixed: fixedCount,
        skipped: skippedCount,
        errors: results.filter(r => r.error).length,
      },
      results: results.slice(0, 100), // Limit to first 100 for response size
      message: dryRun 
        ? `Dry run complete: Would fix ${fixedCount} invoices, ${skippedCount} already correct`
        : `Fixed ${fixedCount} invoices, ${skippedCount} already correct`,
    })
  } catch (error: any) {
    console.error('[INVOICE FIX] Error:', error)
    return NextResponse.json(
      { error: 'Failed to fix invoices', details: error?.message },
      { status: 500 }
    )
  }
}
