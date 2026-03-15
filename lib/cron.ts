import cron from 'node-cron'
import { generateInvoicesForApprovedTimesheets } from './jobs/invoiceGeneration'
import { prisma } from './prisma'
import { zonedTimeToUtc, utcToZonedTime } from 'date-fns-tz'
import { calculateWeeklyBillingPeriod } from './billingPeriodUtils'

const TIMEZONE = 'America/New_York'

// Schedule: Every Tuesday at 7:00 AM ET
// Cron expression: 0 7 * * 2
// Minute (0), Hour (7 = 7 AM), Day of month (*), Month (*), Day of week (2 = Tuesday)
const INVOICE_GENERATION_SCHEDULE = '0 7 * * 2'

// Schedule: Every minute to check for scheduled emails
// Cron expression: * * * * *
const SCHEDULED_EMAIL_CHECK_SCHEDULE = '* * * * *'

let invoiceGenerationTask: cron.ScheduledTask | null = null
let scheduledEmailTask: cron.ScheduledTask | null = null

/**
 * Initialize and start all scheduled cron jobs
 */
export function initializeCronJobs() {
  console.log('Initializing cron jobs...')

  // Initialize invoice generation job
  initializeInvoiceGenerationJob()

  // Initialize scheduled email processing job
  initializeScheduledEmailJob()

  console.log('Cron jobs initialized')
}

/**
 * Initialize the automatic invoice generation job (Tuesday 7:00 AM ET)
 * Generates invoices for the previous week's billing period (Monday 12:00 AM → Monday 11:59 PM)
 * One invoice per client, aggregating all timesheets for the week
 */
function initializeInvoiceGenerationJob() {
  if (invoiceGenerationTask) {
    invoiceGenerationTask.stop()
  }

  invoiceGenerationTask = cron.schedule(
    INVOICE_GENERATION_SCHEDULE,
    async () => {
      console.log(`[CRON] Running automatic invoice generation at ${new Date().toISOString()}`)
      
      try {
        const billingPeriod = calculateWeeklyBillingPeriod()
        const result = await generateInvoicesForApprovedTimesheets()
        
        if (result.success) {
          console.log(
            `[CRON] Invoice generation completed successfully: ${result.invoicesCreated} invoice(s) created for ${result.clientsProcessed} client(s)`
          )
        } else {
          console.error(
            `[CRON] Invoice generation completed with errors: ${result.errors.join('; ')}`
          )
        }

        // Update scheduled job record with detailed results including period
        await updateScheduledJobRecord('INVOICE_GENERATION', {
          ...result,
          periodStart: billingPeriod.startDate.toISOString(),
          periodEnd: billingPeriod.endDate.toISOString(),
          periodLabel: billingPeriod.periodLabel,
        })
      } catch (error) {
        console.error('[CRON] Error in invoice generation job:', error)
        const billingPeriod = calculateWeeklyBillingPeriod()
        await updateScheduledJobRecord('INVOICE_GENERATION', {
          success: false,
          invoicesCreated: 0,
          clientsProcessed: 0,
          errors: [error instanceof Error ? error.message : 'Unknown error'],
          periodStart: billingPeriod.startDate.toISOString(),
          periodEnd: billingPeriod.endDate.toISOString(),
          periodLabel: billingPeriod.periodLabel,
        })
      }
    },
    {
      scheduled: true,
      timezone: TIMEZONE,
    }
  )

  // Update scheduled job record in database
  updateScheduledJobRecord('INVOICE_GENERATION').catch(console.error)

  console.log(`[CRON] Invoice generation job scheduled: ${INVOICE_GENERATION_SCHEDULE} (${TIMEZONE})`)
}

/**
 * Update or create the scheduled job record in the database
 */
async function updateScheduledJobRecord(
  jobType: string,
  lastResult?: {
    success: boolean
    invoicesCreated: number
    clientsProcessed: number
    errors: string[]
    periodStart?: string
    periodEnd?: string
    periodLabel?: string
  }
) {
  try {
    const now = new Date()
    const nextRun = getNextRunTime(INVOICE_GENERATION_SCHEDULE, TIMEZONE)

    // Find existing job record
    const existing = await prisma.scheduledJob.findFirst({
      where: {
        jobType,
        active: true,
      },
    })

    // Store detailed run results in metadata JSON
    const metadata = lastResult
      ? JSON.stringify({
          success: lastResult.success,
          invoicesCreated: lastResult.invoicesCreated,
          clientsProcessed: lastResult.clientsProcessed,
          invoicesSkipped: lastResult.clientsProcessed - lastResult.invoicesCreated,
          errors: lastResult.errors,
          errorsCount: lastResult.errors.length,
          periodStart: lastResult.periodStart,
          periodEnd: lastResult.periodEnd,
          periodLabel: lastResult.periodLabel,
        })
      : null

    if (existing) {
      await prisma.scheduledJob.update({
        where: { id: existing.id },
        data: {
          lastRun: lastResult ? now : existing.lastRun,
          nextRun,
          updatedAt: now,
          metadata: metadata || existing.metadata,
        },
      })
    } else {
      await prisma.scheduledJob.create({
        data: {
          jobType,
          schedule: INVOICE_GENERATION_SCHEDULE,
          nextRun,
          active: true,
          lastRun: lastResult ? now : undefined,
          metadata,
        },
      })
    }

    // Enhanced logging for PM2 output
    if (lastResult) {
      const runId = existing?.id || 'new'
      const period = lastResult.periodLabel || 'unknown'
      console.log(
        `[AUTO_INVOICE] runId=${runId} period=${period} ` +
        `created=${lastResult.invoicesCreated} skipped=${lastResult.clientsProcessed - lastResult.invoicesCreated} ` +
        `errors=${lastResult.errors.length} success=${lastResult.success}`
      )
    }
  } catch (error) {
    console.error(`Failed to update scheduled job record for ${jobType}:`, error)
  }
}

/**
 * Calculate the next run time for a cron schedule in the given timezone
 */
export function getNextRunTime(cronExpression: string, timezone: string): Date {
  // Parse cron expression: "0 16 * * 5"
  const parts = cronExpression.split(' ')
  const minute = parseInt(parts[0])
  const hour = parseInt(parts[1])
  const dayOfWeek = parseInt(parts[4]) // 0-6, where 0 = Sunday, 5 = Friday

  const now = utcToZonedTime(new Date(), timezone)
  const nextRun = new Date(now)

  // Calculate days until next Tuesday
  const currentDay = now.getDay() // 0 = Sunday, 2 = Tuesday
  let daysUntilTuesday = (dayOfWeek - currentDay + 7) % 7

  // If it's already Tuesday and past the scheduled time, schedule for next Tuesday
  if (currentDay === dayOfWeek) {
    const scheduledTime = new Date(now)
    scheduledTime.setHours(hour, minute, 0, 0)
    if (now >= scheduledTime) {
      daysUntilTuesday = 7
    }
  }

  // If daysUntilTuesday is 0, it means we're scheduling for today
  if (daysUntilTuesday === 0 && currentDay === dayOfWeek) {
    const scheduledTime = new Date(now)
    scheduledTime.setHours(hour, minute, 0, 0)
    if (now < scheduledTime) {
      nextRun.setHours(hour, minute, 0, 0)
      return zonedTimeToUtc(nextRun, timezone)
    }
  }

  // Set to next Tuesday
  nextRun.setDate(nextRun.getDate() + daysUntilTuesday)
  nextRun.setHours(hour, minute, 0, 0)

  return zonedTimeToUtc(nextRun, timezone)
}

/**
 * Stop all cron jobs (useful for graceful shutdown)
 */
/**
 * Initialize the scheduled email processing job (runs every minute)
 * Processes Community Classes email queue items that have reached their scheduled send time
 */
function initializeScheduledEmailJob() {
  if (scheduledEmailTask) {
    scheduledEmailTask.stop()
  }

  scheduledEmailTask = cron.schedule(
    SCHEDULED_EMAIL_CHECK_SCHEDULE,
    async () => {
      try {
        await processScheduledEmails()
      } catch (error) {
        console.error('[CRON] Error in scheduled email job:', error)
      }
    },
    {
      scheduled: true,
      timezone: TIMEZONE,
    }
  )

  console.log(`[CRON] Scheduled email processing job scheduled: ${SCHEDULED_EMAIL_CHECK_SCHEDULE} (${TIMEZONE})`)
}

/**
 * Process scheduled emails that have reached their send time
 * Only processes Community Classes email queue items
 */
export async function processScheduledEmails() {
  const now = new Date()
  
  console.log(`[CRON] Checking for scheduled emails at ${now.toISOString()}`)
  
  // Find all QUEUED Community Classes email items that have reached their scheduled send time
  const scheduledItems = await prisma.emailQueueItem.findMany({
    where: {
      status: 'QUEUED',
      entityType: 'COMMUNITY_INVOICE',
      scheduledSendAt: {
        lte: now, // scheduledSendAt <= now (time has come)
      },
      deletedAt: null,
    },
    orderBy: { scheduledSendAt: 'asc' },
    take: 100, // Process up to 100 items per run to avoid overload
  })

  console.log(`[CRON] Found ${scheduledItems.length} scheduled email(s) ready to send`, {
    itemIds: scheduledItems.map(item => item.id),
    scheduledTimes: scheduledItems.map(item => item.scheduledSendAt?.toISOString()),
  })

  if (scheduledItems.length === 0) {
    return // No scheduled emails to process
  }

  console.log(`[CRON] Processing ${scheduledItems.length} scheduled email(s) for Community Classes`)

  // Group items by scheduledSendAt time (batch items scheduled for the same time)
  const itemsByTime = new Map<string, typeof scheduledItems>()
  for (const item of scheduledItems) {
    if (!item.scheduledSendAt) continue
    const timeKey = item.scheduledSendAt.toISOString()
    if (!itemsByTime.has(timeKey)) {
      itemsByTime.set(timeKey, [])
    }
    itemsByTime.get(timeKey)!.push(item)
  }

  // Process each batch
  for (const [timeKey, items] of itemsByTime.entries()) {
    try {
      // Lock items to SENDING
      await prisma.emailQueueItem.updateMany({
        where: { id: { in: items.map((item) => item.id) } },
        data: { status: 'SENDING' },
      })

      // Call the send logic directly
      await sendScheduledCommunityEmails(items.map((item) => item.id))
    } catch (error) {
      console.error(`[CRON] Error processing scheduled emails at ${timeKey}:`, error)
      // Mark failed items
      await prisma.emailQueueItem.updateMany({
        where: { id: { in: items.map((item) => item.id) } },
        data: {
          status: 'FAILED',
          errorMessage: error instanceof Error ? error.message : 'Failed to process scheduled email',
        },
      })
    }
  }
}

/**
 * Send scheduled Community Classes emails
 * This function reuses the logic from the send-batch route
 */
async function sendScheduledCommunityEmails(itemIds: string[]) {
  // Import the send logic dynamically to avoid circular dependencies
  const { sendCommunityEmailBatch } = await import('./jobs/scheduledEmailSender')
  await sendCommunityEmailBatch(itemIds)
}

export function stopCronJobs() {
  console.log('Stopping cron jobs...')
  
  if (invoiceGenerationTask) {
    invoiceGenerationTask.stop()
    invoiceGenerationTask = null
  }

  if (scheduledEmailTask) {
    scheduledEmailTask.stop()
    scheduledEmailTask = null
  }

  console.log('Cron jobs stopped')
}

/**
 * Manually trigger invoice generation (for testing or manual execution)
 */
export async function triggerInvoiceGeneration() {
  console.log('Manually triggering invoice generation...')
  return await generateInvoicesForApprovedTimesheets()
}
