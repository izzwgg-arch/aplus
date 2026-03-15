import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { Decimal } from '@prisma/client/runtime/library'
import { minutesToUnits, calculateEntryTotals } from '@/lib/billing'
import { format } from 'date-fns'

/**
 * GET /api/invoices/:id/debug
 * Admin-only endpoint to get detailed invoice calculation breakdown
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Admin only
    if (session.user.role !== 'ADMIN' && session.user.role !== 'SUPER_ADMIN') {
      return NextResponse.json({ error: 'Forbidden: Admin access required' }, { status: 403 })
    }

    const invoiceId = params.id

    // Fetch invoice with all related data
    const invoice = await prisma.invoice.findUnique({
      where: { id: invoiceId },
      include: {
        client: {
          include: {
            insurance: true,
          },
        },
        entries: {
          include: {
            timesheet: {
              include: {
                entries: true,
              },
            },
          },
        },
      },
    })

    if (!invoice) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })
    }

    // Get insurance rate
    const insurance = invoice.client.insurance
    if (!insurance) {
      return NextResponse.json({
        error: 'MISSING_INSURANCE_RATE',
        message: `Client "${invoice.client.name}" has no insurance assigned`,
      }, { status: 400 })
    }

    // Use regular-specific rates, with fallbacks
    const ratePerUnit = (insurance as any).regularRatePerUnit 
      ? new Decimal((insurance as any).regularRatePerUnit.toString())
      : new Decimal(insurance.ratePerUnit.toString())
    const unitMinutes = (insurance as any).regularUnitMinutes || 15

    // Calculate breakdown from invoice entries
    const entryBreakdown = invoice.entries.map((entry) => {
      // Find the timesheet entry that corresponds to this invoice entry
      // Try to match by timesheet ID and approximate minutes match
      const timesheetEntry = entry.timesheet?.entries.find(e => {
        // Match if timesheet ID matches and minutes are close (within 1 minute tolerance)
        const storedMinutes = entry.units.toNumber() * unitMinutes
        return entry.timesheetId === entry.timesheet?.id && 
               Math.abs(e.minutes - storedMinutes) < 1
      })

      // Use stored units to calculate minutes, or use timesheet entry minutes if available
      const storedMinutes = entry.units.toNumber() * unitMinutes
      const entryMinutes = timesheetEntry?.minutes || storedMinutes
      const { units, amount } = calculateEntryTotals(entryMinutes, timesheetEntry?.notes || null, ratePerUnit, true)

      return {
        invoiceEntryId: entry.id,
        timesheetId: entry.timesheetId,
        timesheetEntryId: timesheetEntry?.id || null,
        date: timesheetEntry?.date ? format(new Date(timesheetEntry.date), 'MMM d, yyyy') : 'N/A',
        startTime: timesheetEntry?.startTime || 'N/A',
        endTime: timesheetEntry?.endTime || 'N/A',
        minutes: entryMinutes,
        unitsRaw: entryMinutes / unitMinutes,
        unitsBilled: units,
        ratePerUnit: ratePerUnit.toNumber(),
        amount: amount.toNumber(),
        storedUnits: entry.units.toNumber(),
        storedAmount: entry.amount.toNumber(),
      }
    })

    // Calculate totals
    const totalMinutes = entryBreakdown.reduce((sum, e) => sum + e.minutes, 0)
    const totalUnitsRaw = totalMinutes / unitMinutes
    const totalUnitsBilled = entryBreakdown.reduce((sum, e) => sum + (e.unitsBilled || 0), 0)
    const totalAmount = entryBreakdown.reduce((sum, e) => sum + e.amount, 0)

    return NextResponse.json({
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      clientId: invoice.clientId,
      clientName: invoice.client.name,
      dateRange: {
        start: format(new Date(invoice.startDate), 'MMM d, yyyy'),
        end: format(new Date(invoice.endDate), 'MMM d, yyyy'),
      },
      insurance: {
        id: insurance.id,
        name: insurance.name,
        ratePerUnit: ratePerUnit.toNumber(),
        unitMinutes,
      },
      calculation: {
        totalMinutes,
        totalUnitsRaw,
        totalUnitsBilled,
        totalAmount,
        invoiceTotalAmount: invoice.totalAmount.toNumber(),
        difference: invoice.totalAmount.toNumber() - totalAmount,
      },
      entries: entryBreakdown,
      summary: {
        entryCount: entryBreakdown.length,
        timesheetCount: new Set(entryBreakdown.map(e => e.timesheetId)).size,
      },
    })
  } catch (error: any) {
    console.error('[INVOICE DEBUG] Error:', error)
    return NextResponse.json(
      { error: 'Failed to generate debug breakdown', details: error?.message },
      { status: 500 }
    )
  }
}
