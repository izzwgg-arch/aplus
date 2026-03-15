import { NextRequest, NextResponse } from 'next/server'
import { generateInvoicesForApprovedTimesheets } from '@/lib/jobs/invoiceGeneration'

/**
 * API endpoint for triggering automatic invoice generation.
 * 
 * This endpoint can be called by:
 * 1. External cron services (cron-job.org, EasyCron, etc.)
 * 2. Manual admin triggers
 * 
 * Security: In production, you should add authentication via a secret token
 * passed in headers or query params to prevent unauthorized access.
 */
export async function POST(request: NextRequest) {
  try {
    // Optional: Add authentication/authorization check
    // For example, check for a secret token in headers
    const authHeader = request.headers.get('authorization')
    const cronSecret = process.env.CRON_SECRET
    
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    console.log(`[API] Manual invoice generation triggered at ${new Date().toISOString()}`)

    const result = await generateInvoicesForApprovedTimesheets()

    if (result.success) {
      return NextResponse.json({
        success: true,
        message: `Invoice generation completed successfully`,
        invoicesCreated: result.invoicesCreated,
        clientsProcessed: result.clientsProcessed,
        errors: result.errors,
      })
    } else {
      return NextResponse.json(
        {
          success: false,
          message: 'Invoice generation completed with errors',
          invoicesCreated: result.invoicesCreated,
          clientsProcessed: result.clientsProcessed,
          errors: result.errors,
        },
        { status: 500 }
      )
    }
  } catch (error) {
    console.error('[API] Error in invoice generation:', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      },
      { status: 500 }
    )
  }
}

/**
 * GET endpoint to check the status of the invoice generation job
 */
export async function GET() {
  try {
    // Return basic info about the job
    return NextResponse.json({
      job: 'invoice-generation',
      schedule: 'Every Tuesday at 7:00 AM ET',
      cronExpression: '0 7 * * 2',
      timezone: 'America/New_York',
      status: 'active',
    })
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to get job status' },
      { status: 500 }
    )
  }
}
