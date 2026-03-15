import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { sendMailSafe, getBatchApprovalEmailHtml, getBatchApprovalEmailText, QueuedTimesheetItem } from '@/lib/email'
import { generateTimesheetPDFFromId } from '@/lib/pdf/playwrightTimesheetPDF'
import { logEmailSent, logEmailFailed } from '@/lib/audit'
import { getUserPermissions } from '@/lib/permissions'
import { format } from 'date-fns'

function generateBatchId(): string {
  return `BATCH-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`
}

/**
 * SEND SELECTED EMAIL QUEUE ITEMS
 * 
 * Sends only the selected queued items
 * Permission: emailQueue.sendBatch
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

    const body = await request.json()
    const { ids } = body

    if (!Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ error: 'Invalid request: ids array required' }, { status: 400 })
    }

    // Step 1: Lock selected QUEUED items to SENDING in a transaction
    const lockedItems = await prisma.$transaction(async (tx) => {
      // Find selected QUEUED items (not deleted)
      const queuedItems = await tx.emailQueueItem.findMany({
        where: {
          id: { in: ids },
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
      return NextResponse.json({ message: 'No queued items found to send' })
    }

    // Step 2: Generate batch ID
    const batchId = generateBatchId()
    const batchDate = format(new Date(), 'yyyy-MM-dd')

    // Step 3: Create list of timesheet IDs (we'll use generateTimesheetPDFFromId which fetches data internally)
    const validTimesheets = lockedItems.map((item) => ({
      queueItem: item,
      timesheetId: item.entityId,
    }))

    if (validTimesheets.length === 0) {
      // Mark items as FAILED
      await prisma.emailQueueItem.updateMany({
        where: { id: { in: lockedItems.map((item) => item.id) } },
        data: {
          status: 'FAILED',
          errorMessage: 'No valid timesheets found',
          lastError: 'No valid timesheets found',
          attempts: { increment: 1 },
        },
      })
      return NextResponse.json({ error: 'No valid timesheets found' }, { status: 400 })
    }

    // Step 4: Generate PDFs for all timesheets using shared function
    const pdfPromises = validTimesheets.map(async (item) => {
      const itemCorrelationId = `${batchId}-${item.timesheetId}`
      try {
        // Use shared PDF generator function (it fetches data internally)
        const pdfBuffer = await generateTimesheetPDFFromId(item.timesheetId, prisma, itemCorrelationId)
        
        // Fetch timesheet data for email content
        const timesheet = await prisma.timesheet.findUnique({
          where: { id: item.timesheetId },
          include: {
            client: { select: { name: true } },
            provider: { select: { name: true } },
            bcba: { select: { name: true } },
            entries: { select: { minutes: true } },
          },
        })
        
        if (!timesheet) {
          return null
        }
        
        const totalMinutes = timesheet.entries.reduce((sum, entry) => sum + entry.minutes, 0)
        const totalHours = totalMinutes / 60
        
        return {
          queueItem: item.queueItem,
          timesheet: {
            ...timesheet,
            totalHours,
          },
          pdfBuffer,
        }
      } catch (error: any) {
        console.error(`[EMAIL_QUEUE_SEND_SELECTED] ${itemCorrelationId} Error generating PDF`, {
          timesheetId: item.timesheetId,
          error: error?.message,
          stack: error?.stack,
        })
        return null
      }
    })

    const pdfResults = await Promise.all(pdfPromises)
    const validPdfs = pdfResults.filter((item) => item !== null) as Array<{
      queueItem: any
      timesheet: any
      pdfBuffer: Buffer
    }>

    if (validPdfs.length === 0) {
      // Mark items as FAILED
      await prisma.emailQueueItem.updateMany({
        where: { id: { in: lockedItems.map((item) => item.id) } },
        data: {
          status: 'FAILED',
          errorMessage: 'Failed to generate PDFs',
          lastError: 'Failed to generate PDFs',
          attempts: { increment: 1 },
        },
      })
      return NextResponse.json({ error: 'Failed to generate PDFs' }, { status: 500 })
    }

    // Step 5: Prepare email data
    const regularCount = validPdfs.filter((item) => item.queueItem.entityType === 'REGULAR').length
    const bcbaCount = validPdfs.filter((item) => item.queueItem.entityType === 'BCBA').length
    const totalHours = validPdfs.reduce((sum, item) => sum + item.timesheet.totalHours, 0)

    const emailItems: QueuedTimesheetItem[] = validPdfs.map((item) => ({
      id: item.timesheet.id,
      timesheetUrl: `${process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || 'https://app.smartstepsabapc.org'}/timesheets/${item.timesheet.id}`,
      clientName: item.timesheet.client.name,
      providerName: item.timesheet.provider.name,
      bcbaName: item.timesheet.bcba?.name || 'N/A',
      startDate: item.timesheet.startDate,
      endDate: item.timesheet.endDate,
      totalHours: item.timesheet.totalHours,
      serviceType: item.timesheet.serviceType || undefined,
      sessionData: item.timesheet.sessionData || undefined,
      type: item.queueItem.entityType === 'BCBA' ? 'BCBA_TIMESHEET' : 'REGULAR_TIMESHEET',
    }))

    // Step 6: Prepare PDF attachments
    const pdfAttachments = validPdfs.map((item, index) => ({
      filename: `timesheet-${item.timesheet.id}-${index + 1}.pdf`,
      content: item.pdfBuffer,
      contentType: 'application/pdf',
    }))

    // Step 7: MAIN EMAIL QUEUE - ALWAYS use fixed recipients (locked)
    // Main Email Queue (Smart Steps) must ALWAYS send to these two fixed emails
    const MAIN_EMAIL_RECIPIENTS = ['info@productivebilling.com', 'jacobw@apluscenterinc.org']
    const recipients = MAIN_EMAIL_RECIPIENTS
    
    console.log('[EMAIL_MAIN] Sending selected emails', {
      messageId: `batch-${batchId}`,
      recipients: recipients.join(', '),
      source: 'MAIN',
      batchId,
      selectedCount: lockedItems.length,
    })
    
    // Get subject from first item or use default
    const firstItem = lockedItems[0]
    const emailSubject = firstItem.subject || `Smart Steps ABA – Approved Timesheets Batch (${batchDate})`

    // Step 8: Send batch email
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
            id: { in: validTimesheets.map((item) => item.timesheetId) },
          },
          data: {
            status: 'EMAILED',
            emailedAt: sentAt,
          },
        })
      })

      // Log audit (non-blocking)
      try {
        await logEmailSent('EmailQueue', batchId, session.user.id, {
          sentCount: validPdfs.length,
          batchDate,
        })
      } catch (auditError) {
        console.error('Failed to log email sent audit:', auditError)
      }

      return NextResponse.json({
        success: true,
        sentCount: validPdfs.length,
        batchId,
        message: `Successfully sent ${validPdfs.length} timesheet(s)`,
      })
    } else {
      // FAILURE: Mark items FAILED, store error
      await prisma.$transaction(async (tx) => {
        await tx.emailQueueItem.updateMany({
          where: { id: { in: lockedItems.map((item) => item.id) } },
          data: {
            status: 'FAILED',
            errorMessage: emailResult.error?.substring(0, 500) || 'Unknown error sending email',
            lastError: emailResult.error?.substring(0, 1000) || 'Unknown error sending email',
            attempts: { increment: 1 },
          },
        })
      })

      // Log audit (non-blocking)
      try {
        await logEmailFailed('EmailQueue', batchId, session.user.id, emailResult.error || 'Unknown error', {
          attemptedCount: validPdfs.length,
          batchDate,
        })
      } catch (auditError) {
        console.error('Failed to log email failed audit:', auditError)
      }

      return NextResponse.json(
        {
          error: emailResult.error || 'Failed to send batch email',
          details: process.env.NODE_ENV === 'development' ? emailResult.error : undefined,
        },
        { status: 500 }
      )
    }
  } catch (error: any) {
    console.error('[EMAIL QUEUE SEND SELECTED] Error:', {
      error: error?.message,
      stack: error?.stack,
    })

    return NextResponse.json(
      {
        error: error.message || 'Failed to send batch email',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined,
      },
      { status: 500 }
    )
  }
}
