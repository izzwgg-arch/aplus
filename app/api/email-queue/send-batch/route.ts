import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { sendMailSafe, getBatchApprovalEmailHtml, getBatchApprovalEmailText, QueuedTimesheetItem } from '@/lib/email'
import { generateTimesheetPDFFromId } from '@/lib/pdf/playwrightTimesheetPDF'
import { logEmailSent, logEmailFailed } from '@/lib/audit'
import { getUserPermissions } from '@/lib/permissions'
import { format } from 'date-fns'
// Generate batch ID using timestamp and random string
function generateBatchId(): string {
  return `BATCH-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`
}

/**
 * SEND BATCH EMAIL (REBUILT - CLEAN)
 * 
 * Transactional flow:
 * 1. Check permissions
 * 2. Lock all QUEUED items to SENDING (transaction)
 * 3. Generate PDFs for all items
 * 4. Send ONE email with all PDFs attached
 * 5. On success: Mark items SENT, update timesheets EMAILED
 * 6. On failure: Mark items FAILED, store error
 * 
 * IDEMPOTENCY: Items already SENT are skipped
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Check permissions
    const userPermissions = await getUserPermissions(session.user.id)
    const canSendBatch =
      userPermissions['emailQueue.sendBatch']?.canCreate === true ||
      session.user.role === 'SUPER_ADMIN' ||
      session.user.role === 'ADMIN'

    if (!canSendBatch) {
      return NextResponse.json(
        { error: 'Forbidden - Not authorized to send batch emails' },
        { status: 403 }
      )
    }

    // Step 1: Lock all QUEUED items to SENDING in a transaction
    const lockedItems = await prisma.$transaction(async (tx) => {
      // Find all QUEUED items (not deleted)
      const queuedItems = await tx.emailQueueItem.findMany({
        where: {
          status: 'QUEUED',
          deletedAt: null,
        },
        orderBy: { queuedAt: 'asc' },
      })

      if (queuedItems.length === 0) {
        return []
      }

      // Lock them to SENDING and ensure context is MAIN
      await tx.emailQueueItem.updateMany({
        where: { id: { in: queuedItems.map((item) => item.id) } },
        data: { 
          status: 'SENDING',
          context: 'MAIN', // Ensure MAIN context for main email queue
        },
      })

      return queuedItems
    })

    if (lockedItems.length === 0) {
      return NextResponse.json({ message: 'No items in queue to send' })
    }

    // Step 2: Generate batch ID
    const batchId = generateBatchId()
    const batchDate = format(new Date(), 'yyyy-MM-dd')

    // Step 3: Fetch timesheet details for all locked items
    const timesheetsWithDetails = await Promise.all(
      lockedItems.map(async (item) => {
        try {
          const timesheet = await prisma.timesheet.findUnique({
            where: { id: item.entityId },
            include: {
              client: {
                select: {
                  name: true,
                  address: true,
                  idNumber: true,
                  dlb: true,
                  signature: true,
                },
              },
              provider: {
                select: {
                  name: true,
                  phone: true,
                  signature: true,
                  dlb: true,
                },
              },
              bcba: {
                select: {
                  name: true,
                },
              },
              entries: {
                orderBy: { date: 'asc' },
                select: {
                  date: true,
                  startTime: true,
                  endTime: true,
                  minutes: true,
                  notes: true,
                },
              },
            },
          })

          if (!timesheet || timesheet.deletedAt) {
            return null
          }

          const totalMinutes = timesheet.entries.reduce((sum, entry) => sum + entry.minutes, 0)
          const totalHours = totalMinutes / 60

          return {
            queueItemId: item.id,
            entityType: item.entityType,
            timesheet,
            totalHours,
          }
        } catch (error: any) {
          console.error(`Error fetching timesheet ${item.entityId}:`, error)
          return null
        }
      })
    )

    // Filter out null values
    const validTimesheets = timesheetsWithDetails.filter(
      (ts): ts is NonNullable<typeof ts> => ts !== null
    )

    if (validTimesheets.length === 0) {
      // Mark all locked items as FAILED
      await prisma.emailQueueItem.updateMany({
        where: { id: { in: lockedItems.map((item) => item.id) } },
        data: {
          status: 'FAILED',
          errorMessage: 'No valid timesheets found',
          lastError: 'No valid timesheets found',
          attempts: { increment: 1 },
        },
      })
      return NextResponse.json(
        { error: 'No valid timesheets found in queue' },
        { status: 400 }
      )
    }

    // Step 4: Generate PDFs for each timesheet
    const pdfAttachments: Array<{ filename: string; content: Buffer; contentType: string }> = []
    const emailItems: QueuedTimesheetItem[] = []
    const pdfErrors: Array<{ queueItemId: string; error: string; correlationId?: string }> = []

    const baseUrl = process.env.APP_URL || process.env.NEXTAUTH_URL || 'http://66.94.105.43:3000'

    for (const item of validTimesheets) {
      try {
        const itemCorrelationId = `${batchId}-${item.timesheet.id}`
        // Use shared PDF generator function
        const pdfBuffer = await generateTimesheetPDFFromId(item.timesheet.id, prisma, itemCorrelationId)

        const filename = `${item.entityType === 'BCBA' ? 'BCBA' : 'Regular'}_Timesheet_${item.timesheet.client.name.replace(/[^a-z0-9]/gi, '_')}_${format(new Date(item.timesheet.startDate), 'yyyy-MM-dd')}.pdf`

        pdfAttachments.push({
          filename,
          content: pdfBuffer,
          contentType: 'application/pdf',
        })

        emailItems.push({
          id: item.timesheet.id,
          type: item.entityType === 'BCBA' ? 'BCBA_TIMESHEET' : 'REGULAR_TIMESHEET',
          clientName: item.timesheet.client.name,
          providerName: item.timesheet.provider.name,
          bcbaName: item.timesheet.bcba.name,
          startDate: item.timesheet.startDate.toISOString(),
          endDate: item.timesheet.endDate.toISOString(),
          totalHours: item.totalHours,
          timesheetUrl: `${baseUrl}/${item.timesheet.isBCBA ? 'bcba-timesheets' : 'timesheets'}/${item.timesheet.id}`,
          serviceType: item.timesheet.serviceType || undefined,
          sessionData: item.timesheet.sessionData || undefined,
        })
      } catch (error: any) {
        const itemCorrelationId = `${batchId}-${item.timesheet.id}`
        console.error(`[EMAIL_QUEUE_SEND_BATCH] ${itemCorrelationId} Failed to generate PDF`, {
          timesheetId: item.timesheet.id,
          queueItemId: item.queueItemId,
          error: error?.message,
          stack: error?.stack,
        })
        pdfErrors.push({
          queueItemId: item.queueItemId,
          error: error.message || 'PDF generation failed',
          correlationId: itemCorrelationId,
        })
      }
    }

    // If all PDFs failed, mark all as FAILED
    if (pdfAttachments.length === 0) {
      await prisma.emailQueueItem.updateMany({
        where: { id: { in: lockedItems.map((item) => item.id) } },
        data: {
          status: 'FAILED',
          errorMessage: 'All PDF generation failed',
          lastError: 'All PDF generation failed',
          attempts: { increment: 1 },
        },
      })
      return NextResponse.json(
        { error: 'Failed to generate PDFs for all timesheets' },
        { status: 500 }
      )
    }

    // Step 5: Calculate totals
    const regularCount = emailItems.filter((item) => item.type === 'REGULAR_TIMESHEET').length
    const bcbaCount = emailItems.filter((item) => item.type === 'BCBA_TIMESHEET').length
    const totalHours = emailItems.reduce((sum, item) => sum + item.totalHours, 0)

    // Step 6: MAIN EMAIL QUEUE - ALWAYS use fixed recipients (locked)
    // Main Email Queue (Smart Steps) must ALWAYS send to these two fixed emails
    const MAIN_EMAIL_RECIPIENTS = ['info@productivebilling.com', 'jacobw@apluscenterinc.org']
    const recipients = MAIN_EMAIL_RECIPIENTS

    console.log('[EMAIL_MAIN] Sending batch email', {
      messageId: `batch-${batchId}`,
      recipients: recipients.join(', '),
      source: 'MAIN',
      batchId,
      lockedItemsCount: lockedItems.length,
    })
    
    // Get subject from first item or use default
    const firstItem = lockedItems[0]
    const emailSubject = firstItem.subject || `Smart Steps ABA – Approved Timesheets Batch (${batchDate})`

    // Step 7: Send batch email
    const emailResult = await sendMailSafe(
      {
        to: recipients,
        subject: emailSubject,
        html: getBatchApprovalEmailHtml(regularCount, bcbaCount, totalHours, emailItems, batchDate),
        text: getBatchApprovalEmailText(regularCount, bcbaCount, totalHours, emailItems, batchDate),
        attachments: pdfAttachments,
      },
      {
        action: 'EMAIL_SENT',
        entityType: 'EmailQueue',
        entityId: batchId,
        userId: session.user.id,
      }
    )

    const sentAt = new Date()

    // Step 8: Update database based on result
    if (emailResult.success) {
      // SUCCESS: Mark items SENT, update timesheets EMAILED
      await prisma.$transaction(async (tx) => {
        // Update queue items to SENT
        await tx.emailQueueItem.updateMany({
          where: { id: { in: lockedItems.map((item) => item.id) } },
          data: {
            status: 'SENT',
            sentAt,
            batchId,
            attempts: { increment: 1 },
          },
        })

        // Update timesheets to EMAILED
        await tx.timesheet.updateMany({
          where: {
            id: { in: validTimesheets.map((item) => item.timesheet.id) },
          },
          data: {
            status: 'EMAILED',
            emailedAt: sentAt,
          },
        })
      })

      // Log audit (non-blocking)
      try {
        await prisma.auditLog.create({
          data: {
            action: 'EMAIL_SENT',
            entityType: 'EmailQueue',
            entityId: batchId,
            userId: session.user.id,
            metadata: JSON.stringify({
              batchId,
              sentCount: validTimesheets.length,
              regularCount,
              bcbaCount,
              totalHours,
              recipients: recipients.length,
              messageId: emailResult.messageId,
            }),
          },
        })

        // Log individual email sent events (non-blocking)
        for (const item of validTimesheets) {
          try {
            await logEmailSent(
              item.entityType === 'BCBA' ? 'BCBATimesheet' : 'Timesheet',
              item.timesheet.id,
              session.user.id,
              {
                batchId,
                clientName: item.timesheet.client.name,
                providerName: item.timesheet.provider.name,
              }
            )
          } catch (e) {
            // Non-blocking
          }
        }
      } catch (auditError) {
        console.error('Failed to create audit log (non-blocking):', auditError)
      }

      return NextResponse.json({
        success: true,
        batchId,
        sentCount: validTimesheets.length,
        regularCount,
        bcbaCount,
        totalHours,
        messageId: emailResult.messageId,
      })
    } else {
      // FAILURE: Mark items FAILED
      await prisma.emailQueueItem.updateMany({
        where: { id: { in: lockedItems.map((item) => item.id) } },
        data: {
          status: 'FAILED',
          errorMessage: emailResult.error?.substring(0, 500) || 'Unknown email error', // Limit length
          lastError: emailResult.error?.substring(0, 1000) || 'Unknown email error', // More detailed
          attempts: { increment: 1 },
        },
      })

      // Log audit (non-blocking)
      try {
        await logEmailFailed(
          'EmailQueue',
          batchId,
          session.user.id,
          emailResult.error || 'Unknown error',
          {
            batchId,
            itemCount: lockedItems.length,
            recipients: recipients.length,
          }
        )
      } catch (auditError) {
        console.error('Failed to log email failure (non-blocking):', auditError)
      }

      return NextResponse.json(
        {
          error: emailResult.error || 'Failed to send batch email',
        },
        { status: 500 }
      )
    }
  } catch (error: any) {
    console.error('Error sending batch email:', error)

    // Mark any SENDING items as FAILED
    try {
      await prisma.emailQueueItem.updateMany({
        where: { status: 'SENDING' },
        data: {
          status: 'FAILED',
          errorMessage: error.message?.substring(0, 500) || 'Unknown error during batch send',
          lastError: error.message?.substring(0, 1000) || 'Unknown error during batch send',
          attempts: { increment: 1 },
        },
      })
    } catch (updateError) {
      console.error('Failed to update failed items:', updateError)
    }

    return NextResponse.json(
      {
        error: error.message || 'Failed to send batch email',
        details: process.env.NODE_ENV === 'development' ? error.stack : undefined,
      },
      { status: 500 }
    )
  }
}
