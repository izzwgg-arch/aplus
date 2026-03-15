import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { generateInvoicesForApprovedTimesheets } from '@/lib/jobs/invoiceGeneration'
import { calculateWeeklyBillingPeriod } from '@/lib/billingPeriodUtils'
import { createAuditLog } from '@/lib/audit'

/**
 * POST /api/invoices/generate
 * Manual invoice generation endpoint for admins
 * 
 * Body (optional):
 * - startDate: ISO string (if not provided, uses current weekly billing period)
 * - endDate: ISO string (if not provided, uses current weekly billing period)
 * - clientId: string (optional, filter by client)
 * - insuranceId: string (optional, filter by insurance)
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Only admins can manually generate invoices
    if (session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Forbidden: Admin access required' }, { status: 403 })
    }

    const body = await request.json().catch(() => ({}))
    const { startDate, endDate, clientId, insuranceId } = body

    // Use custom billing period if provided, otherwise use weekly period
    let billingPeriod
    if (startDate && endDate) {
      billingPeriod = {
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        periodLabel: `${new Date(startDate).toLocaleDateString()} - ${new Date(endDate).toLocaleDateString()}`,
      }
    } else {
      billingPeriod = calculateWeeklyBillingPeriod()
    }

    console.log(`[MANUAL INVOICE GENERATION] Admin ${session.user.id} triggered invoice generation`)
    console.log(`[MANUAL INVOICE GENERATION] Period: ${billingPeriod.periodLabel}`)

    // Generate invoices
    const result = await generateInvoicesForApprovedTimesheets(billingPeriod)

    if (result.success) {
      // Audit log: invoice generation
    try {
      await createAuditLog({
        action: 'GENERATE',
        entityType: 'Invoice',
        entityId: 'batch-generate',
        userId: session.user.id,
        newValues: { trigger: 'manual' },
      })
    } catch {}

    return NextResponse.json({
        success: true,
        message: `Successfully generated ${result.invoicesCreated} invoice(s) for ${result.clientsProcessed} client(s)`,
        invoicesCreated: result.invoicesCreated,
        clientsProcessed: result.clientsProcessed,
        billingPeriod: billingPeriod.periodLabel,
        errors: result.errors,
      })
    } else {
      return NextResponse.json(
        {
          success: false,
          message: `Invoice generation completed with errors`,
          invoicesCreated: result.invoicesCreated,
          clientsProcessed: result.clientsProcessed,
          errors: result.errors,
        },
        { status: 500 }
      )
    }
  } catch (error) {
    console.error('[MANUAL INVOICE GENERATION] Error:', error)
    return NextResponse.json(
      {
        error: 'Failed to generate invoices',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}

/**
 * GET /api/invoices/generate
 * Get information about the next billing period
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session || session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const currentPeriod = calculateWeeklyBillingPeriod()
    const nextPeriod = calculateWeeklyBillingPeriod(
      new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // Next week
    )

    return NextResponse.json({
      currentBillingPeriod: {
        startDate: currentPeriod.startDate.toISOString(),
        endDate: currentPeriod.endDate.toISOString(),
        label: currentPeriod.periodLabel,
      },
      nextBillingPeriod: {
        startDate: nextPeriod.startDate.toISOString(),
        endDate: nextPeriod.endDate.toISOString(),
        label: nextPeriod.periodLabel,
      },
    })
  } catch (error) {
    console.error('[INVOICE GENERATION INFO] Error:', error)
    return NextResponse.json(
      { error: 'Failed to get billing period information' },
      { status: 500 }
    )
  }
}
