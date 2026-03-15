import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { calculateWeeklyBillingPeriod } from '@/lib/billingPeriodUtils'
import { getNextRunTime } from '@/lib/cron'

// Schedule constants (must match lib/cron.ts)
const INVOICE_GENERATION_SCHEDULE = '0 7 * * 2'
const TIMEZONE = 'America/New_York'

/**
 * GET /api/invoices/generation-status
 * Get the status of the last automatic invoice generation run
 * Admin only
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Only admins can view generation status
    if (session.user.role !== 'ADMIN' && session.user.role !== 'SUPER_ADMIN') {
      return NextResponse.json({ error: 'Forbidden: Admin access required' }, { status: 403 })
    }

    // Get the scheduled job record
    const job = await prisma.scheduledJob.findFirst({
      where: {
        jobType: 'INVOICE_GENERATION',
        active: true,
      },
    })

    if (!job) {
      return NextResponse.json({
        status: 'not_configured',
        message: 'Invoice generation job not configured',
      })
    }

    // Parse metadata if available
    let metadata: any = null
    if (job.metadata) {
      try {
        metadata = JSON.parse(job.metadata)
      } catch (e) {
        console.error('Failed to parse job metadata:', e)
      }
    }

    // Get current billing period for reference
    const currentPeriod = calculateWeeklyBillingPeriod()
    
    // Calculate next run if not set
    const nextRun = job.nextRun || getNextRunTime(INVOICE_GENERATION_SCHEDULE, TIMEZONE)

    return NextResponse.json({
      status: 'active',
      schedule: job.schedule,
      scheduleDescription: 'Every Tuesday at 7:00 AM ET (America/New_York)',
      lastRun: job.lastRun,
      nextRun: nextRun,
      currentPeriod: {
        startDate: currentPeriod.startDate.toISOString(),
        endDate: currentPeriod.endDate.toISOString(),
        periodLabel: currentPeriod.periodLabel,
      },
      lastRunResult: metadata
        ? {
            success: metadata.success,
            invoicesCreated: metadata.invoicesCreated || 0,
            clientsProcessed: metadata.clientsProcessed || 0,
            invoicesSkipped: metadata.invoicesSkipped || 0,
            errorsCount: metadata.errorsCount || 0,
            errors: metadata.errors || [],
            periodLabel: metadata.periodLabel,
            periodStart: metadata.periodStart,
            periodEnd: metadata.periodEnd,
          }
        : null,
    })
  } catch (error) {
    console.error('[INVOICE_GENERATION_STATUS] Error:', error)
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      },
      { status: 500 }
    )
  }
}
