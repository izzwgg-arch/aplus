import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { sendMailSafe } from '@/lib/email'
import { generateCommunityInvoicePdf } from '@/lib/pdf/communityInvoicePdf'
import { logEmailSent, logEmailFailed } from '@/lib/audit'
import { getUserPermissions } from '@/lib/permissions'
import { format } from 'date-fns'
import { v4 as uuidv4 } from 'uuid'
import { readFile } from 'fs/promises'
import { join } from 'path'
import { existsSync } from 'fs'

const UPLOAD_DIR = join(process.cwd(), 'uploads', 'community-email-attachments')

/**
 * SEND BATCH EMAIL FOR COMMUNITY INVOICES
 * 
 * Transactional flow:
 * 1. Check permissions
 * 2. Lock all QUEUED items to SENDING (transaction)
 * 3. Generate PDFs for all invoices
 * 4. Send ONE email with all PDFs attached
 * 5. On success: Mark items SENT, update invoices EMAILED
 * 6. On failure: Mark items FAILED, store error
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Check Community Classes subsection permission
    const { canAccessCommunitySection } = await import('@/lib/permissions')
    const hasAccess = await canAccessCommunitySection(session.user.id, 'emailQueue')
    if (!hasAccess) {
      return NextResponse.json(
        { error: 'Forbidden - No access to Community Classes Email Queue' },
        { status: 403 }
      )
    }

    // Parse request body to get selected item IDs and recipients
    const requestBody = await request.json().catch(() => ({}))
    const selectedItemIds = requestBody.itemIds // Optional: array of item IDs to send
    const customRecipients = requestBody.recipients // REQUIRED: Array of email addresses from request (Community must use user-entered recipients)
    const scheduledSendAt = requestBody.scheduledSendAt // Optional: ISO datetime string for scheduled send
    const attachmentKey = requestBody.attachmentKey // Optional: Key for additional PDF attachment
    const attachmentFilename = requestBody.attachmentFilename // Optional: Original filename for attachment

    // COMMUNITY EMAIL QUEUE: Recipients are REQUIRED (no fallback to fixed emails)
    if (!customRecipients || !Array.isArray(customRecipients) || customRecipients.length === 0) {
      return NextResponse.json(
        { error: 'RECIPIENT_REQUIRED: Recipient email address(es) are required for Community Classes emails' },
        { status: 400 }
      )
    }

    // Normalize recipients: trim and lowercase
    const normalizedRecipients = customRecipients
      .map((email: string) => email.trim().toLowerCase())
      .filter((email: string) => email.length > 0)

    if (normalizedRecipients.length === 0) {
      return NextResponse.json(
        { error: 'RECIPIENT_REQUIRED: At least one valid recipient email address is required' },
        { status: 400 }
      )
    }

    // Parse scheduled send time if provided
    // IMPORTANT: datetime-local input sends time like "2026-01-12T19:37" (no timezone info)
    // We interpret this as America/New_York time and convert to UTC for storage
    let scheduledSendDateTime: Date | null = null
    if (scheduledSendAt) {
      const { zonedTimeToUtc } = await import('date-fns-tz')
      const TIMEZONE = 'America/New_York'
      
      // Parse the datetime-local string: "2026-01-12T19:37"
      // This represents a date/time WITHOUT timezone - we interpret it as America/New_York time
      const [datePart, timePart = '00:00:00'] = scheduledSendAt.split('T')
      const [year, month, day] = datePart.split('-').map(Number)
      const [hour, minute = 0, second = 0] = timePart.split(':').map(Number)
      
      // CORRECT APPROACH:
      // datetime-local gives us time components WITHOUT timezone (e.g., "2026-01-12T20:16")
      // We interpret these as America/New_York local time
      // We need to convert to UTC for database storage
      //
      // SOLUTION: Create a Date object representing the time in Eastern Time, then convert to UTC
      // We'll use Intl API to get the offset for Eastern Time at this date, then apply it
      //
      // Step 1: Create a Date object with the components (in system timezone)
      // Then we'll adjust it to represent Eastern Time
      const dateInSystemTZ = new Date(year, month - 1, day, hour, minute, second)
      
      // Step 2: Get what this system timezone date represents in Eastern Time
      const { utcToZonedTime } = await import('date-fns-tz')
      const dateInEastern = utcToZonedTime(dateInSystemTZ, TIMEZONE)
      
      // Step 3: Calculate the offset between system timezone and Eastern Time
      // This tells us how to adjust the date
      const systemToEasternOffset = dateInSystemTZ.getTime() - dateInEastern.getTime()
      
      // Step 4: Adjust the date to represent Eastern Time correctly
      // Add the offset to convert from system timezone interpretation to Eastern Time interpretation
      const adjustedForEastern = new Date(dateInSystemTZ.getTime() + systemToEasternOffset)
      
      // Step 5: Convert from Eastern Time to UTC
      // zonedTimeToUtc interprets the Date as Eastern Time and converts to UTC
      scheduledSendDateTime = zonedTimeToUtc(adjustedForEastern, TIMEZONE)
      
      // Debug logging
      console.log('[SCHEDULED_EMAIL] Parsing scheduled time', {
        input: scheduledSendAt,
        easternTimeComponents: { year, month, day, hour, minute, second },
        dateInSystemTZ: dateInSystemTZ.toISOString(),
        dateInEastern: dateInEastern.toISOString(),
        systemToEasternOffsetHours: systemToEasternOffset / (1000 * 60 * 60),
        adjustedForEastern: adjustedForEastern.toISOString(),
        scheduledUTC: scheduledSendDateTime.toISOString(),
        timezone: TIMEZONE,
      })
      
      // Validate that scheduled time is in the future (compare UTC times)
      // Allow at least 30 seconds in the future to account for processing time and timezone differences
      const nowUTC = new Date()
      const minimumTime = new Date(nowUTC.getTime() + 30000) // 30 seconds from now
      
      console.log('[SCHEDULED_EMAIL] Validation', {
        scheduledUTC: scheduledSendDateTime.toISOString(),
        nowUTC: nowUTC.toISOString(),
        minimumTimeUTC: minimumTime.toISOString(),
        isFuture: scheduledSendDateTime > minimumTime,
        diffSeconds: (scheduledSendDateTime.getTime() - minimumTime.getTime()) / 1000,
      })
      
      if (scheduledSendDateTime <= minimumTime) {
        return NextResponse.json(
          { 
            error: 'Scheduled send time must be at least 30 seconds in the future',
            details: {
              scheduled: scheduledSendDateTime.toISOString(),
              now: nowUTC.toISOString(),
              minimum: minimumTime.toISOString(),
            }
          },
          { status: 400 }
        )
      }
    }

    // Step 1: Lock selected QUEUED items to SENDING in a transaction (or schedule them)
    const lockedItems = await prisma.$transaction(async (tx) => {
      // Find QUEUED items for community invoices (optionally filtered by selectedItemIds, not deleted)
      const where: any = {
        status: 'QUEUED',
        entityType: 'COMMUNITY_INVOICE',
        deletedAt: null,
      }
      if (selectedItemIds && Array.isArray(selectedItemIds) && selectedItemIds.length > 0) {
        where.id = { in: selectedItemIds }
      }

      const queuedItems = await tx.emailQueueItem.findMany({
        where,
        orderBy: { queuedAt: 'asc' },
      })

      if (queuedItems.length === 0) {
        return []
      }

      // If scheduled, store the scheduled time and user-entered recipients/subject, keep status as QUEUED
      // Otherwise, lock them to SENDING for immediate send
      if (scheduledSendDateTime) {
        // Store user-entered recipients (already validated above)
        const recipientsStr = normalizedRecipients.join(',')
        
        const emailSubjectPrefix = process.env.COMMUNITY_EMAIL_SUBJECT_PREFIX || 'KJ Play Center'
        const batchDate = format(new Date(), 'yyyy-MM-dd')
        const emailSubject = `${emailSubjectPrefix} – Approved Community Invoices Batch (${batchDate})`

        console.log('[COMMUNITY_EMAIL_SCHEDULE] Scheduling emails', {
          itemIds: queuedItems.map(item => item.id),
          scheduledSendAt: scheduledSendDateTime.toISOString(),
          recipients: recipientsStr,
          attachmentKey,
        })

        const updateResult = await tx.emailQueueItem.updateMany({
          where: { id: { in: queuedItems.map((item) => item.id) } },
          data: { 
            scheduledSendAt: scheduledSendDateTime,
            toEmail: recipientsStr, // Store user-entered recipients (NO fallback)
            subject: emailSubject,
            context: 'COMMUNITY', // Mark as Community queue item
            attachmentKey: attachmentKey || null, // Store attachment key if provided
            attachmentFilename: attachmentFilename || null, // Store attachment filename if provided
            // Keep status as QUEUED - will be processed by cron job
          },
        })

        console.log('[COMMUNITY_EMAIL_SCHEDULE] Update result', {
          count: updateResult.count,
          expectedCount: queuedItems.length,
        })
      } else {
        // Lock them to SENDING for immediate send
        // Also store recipients and context for tracking
        await tx.emailQueueItem.updateMany({
          where: { id: { in: queuedItems.map((item) => item.id) } },
          data: { 
            status: 'SENDING',
            toEmail: normalizedRecipients.join(','), // Store user-entered recipients
            context: 'COMMUNITY', // Mark as Community queue item
            attachmentKey: attachmentKey || null, // Store attachment key if provided
            attachmentFilename: attachmentFilename || null, // Store attachment filename if provided
          },
        })
      }

      return queuedItems
    })

    if (lockedItems.length === 0) {
      return NextResponse.json({ message: 'No items in queue to send' })
    }

    // If scheduled, return early with success message (emails will be sent by cron job)
    if (scheduledSendDateTime) {
      return NextResponse.json({
        success: true,
        scheduledCount: lockedItems.length,
        scheduledSendAt: scheduledSendDateTime.toISOString(),
        message: `Successfully scheduled ${lockedItems.length} invoice(s) to be sent at ${scheduledSendDateTime.toLocaleString()}`,
      })
    }

    // Step 2: Generate batch ID
    const batchId = uuidv4()
    const batchDate = format(new Date(), 'yyyy-MM-dd')

    // Step 3: Fetch invoice details for all locked items
    const invoicesWithDetails = await Promise.all(
      lockedItems.map(async (item) => {
        try {
          const invoice = await prisma.communityInvoice.findUnique({
            where: { id: item.entityId },
            include: {
              client: true,
              class: true,
            },
          })

          if (!invoice || invoice.deletedAt) {
            return null
          }

          return {
            queueItemId: item.id,
            invoice,
          }
        } catch (error: any) {
          console.error(`Error fetching invoice ${item.entityId}:`, error)
          return null
        }
      })
    )

    // Filter out null values
    const validInvoices = invoicesWithDetails.filter(
      (inv): inv is NonNullable<typeof inv> => inv !== null
    )

    if (validInvoices.length === 0) {
      // Mark all locked items as FAILED
      await prisma.emailQueueItem.updateMany({
        where: { id: { in: lockedItems.map((item) => item.id) } },
        data: {
          status: 'FAILED',
          errorMessage: 'No valid invoices found',
        },
      })
      return NextResponse.json(
        { error: 'No valid invoices found in queue' },
        { status: 400 }
      )
    }

    // Step 4: Generate PDFs for each invoice
    const pdfAttachments: Array<{ filename: string; content: Buffer; contentType: string }> = []
    const emailItems: Array<{
      id: string
      clientName: string
      className: string
      units: number
      totalAmount: number
      invoiceUrl: string
    }> = []
    const pdfErrors: Array<{ queueItemId: string; error: string }> = []

    const baseUrl = process.env.APP_URL || process.env.NEXTAUTH_URL || 'http://66.94.105.43:3000'

    for (const item of validInvoices) {
      const correlationId = `email-pdf-${item.invoice.id}-${Date.now()}`
      try {
        console.error(`[COMMUNITY EMAIL QUEUE] ${correlationId} Generating PDF for invoice ${item.invoice.id}...`)
        // Use the SAME PDF generation function as the print route
        const pdfBuffer = await generateCommunityInvoicePdf(item.invoice.id)

        console.error(`[COMMUNITY EMAIL QUEUE] ${correlationId} PDF generated successfully, size: ${pdfBuffer.length} bytes`)
        // Attachment filename with KJ Play Center branding (no Smart Steps ABA)
        const filename = `KJ_Play_Center_Invoice_${item.invoice.client.firstName}_${item.invoice.client.lastName}_${format(new Date(item.invoice.createdAt), 'yyyy-MM-dd')}.pdf`

        pdfAttachments.push({
          filename,
          content: pdfBuffer,
          contentType: 'application/pdf',
        })

        // Build public invoice URL with token (NO AUTH REQUIRED)
        // Fetch the invoice again to get the viewToken (it was generated during approval)
        const invoiceWithToken = await prisma.communityInvoice.findUnique({
          where: { id: item.invoice.id },
          select: { viewToken: true },
        })
        
        const publicInvoiceUrl = invoiceWithToken?.viewToken
          ? `${baseUrl}/public/community/invoice/${item.invoice.id}?token=${invoiceWithToken.viewToken}`
          : `${baseUrl}/community/invoices/${item.invoice.id}` // Fallback if token missing

        emailItems.push({
          id: item.invoice.id,
          clientName: `${item.invoice.client.firstName} ${item.invoice.client.lastName}`,
          className: item.invoice.class.name,
          units: item.invoice.units,
          totalAmount: item.invoice.totalAmount.toNumber(),
          invoiceUrl: publicInvoiceUrl,
        })
      } catch (error: any) {
        console.error(`[COMMUNITY EMAIL QUEUE] ${correlationId} Failed to generate PDF for invoice ${item.invoice.id}:`, {
          message: error?.message,
          code: error?.code,
          stack: error?.stack,
          queueItemId: item.queueItemId,
        })
        pdfErrors.push({
          queueItemId: item.queueItemId,
          error: error.message || 'PDF generation failed',
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
        },
      })
      return NextResponse.json(
        { error: 'Failed to generate PDFs for all invoices' },
        { status: 500 }
      )
    }

    // Step 5: Calculate totals
    const totalAmount = emailItems.reduce((sum, item) => sum + item.totalAmount, 0)
    const totalUnits = emailItems.reduce((sum, item) => sum + item.units, 0)

    // Step 6: COMMUNITY EMAIL QUEUE - Use user-entered recipients (already validated, no fallback)
    // Recipients already stored in transaction above
    const recipients = normalizedRecipients

    console.log('[EMAIL_COMMUNITY] Sending batch email', {
      queueItemIds: lockedItems.map((item) => item.id),
      recipients: recipients.join(', '),
      source: 'COMMUNITY',
      context: 'COMMUNITY',
      batchId,
      lockedItemsCount: lockedItems.length,
      hasAttachment: !!attachmentKey,
      attachmentKey: attachmentKey || null,
    })

    // Step 8: Build email content with KJ Play Center branding
    // NOTE: To avoid Gmail generic avatar, use a domain-based email address (not gmail.com)
    // Example: invoices@kjplaycenter.com (requires SPF/DKIM/DMARC DNS records)
    // Gmail shows generic avatar when:
    //   - Sender uses gmail.com domain
    //   - OR domain lacks proper authentication (SPF/DKIM/DMARC)
    // Once domain-authenticated, Gmail removes the generic icon automatically
    const emailBrandName = process.env.COMMUNITY_EMAIL_FROM_NAME || 'KJ Play Center'
    // Use billing@kjplaycenter.com for Community Classes emails only
    const emailFromAddress = process.env.COMMUNITY_EMAIL_FROM || 'billing@kjplaycenter.com'
    const emailFrom = `${emailBrandName} <${emailFromAddress}>`
    const emailReplyTo = process.env.COMMUNITY_EMAIL_REPLY_TO || emailFromAddress
    const emailSubjectPrefix = process.env.COMMUNITY_EMAIL_SUBJECT_PREFIX || 'KJ Play Center'
    
    // Log the From header for verification
    console.error('[COMMUNITY_EMAIL] Email From header:', emailFrom)

    const emailHtml = `
      <html>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
          <h2>${emailSubjectPrefix} – Approved Community Invoices Batch (${batchDate})</h2>
          <p>This email contains ${emailItems.length} approved community invoice(s) for processing.</p>
          
          <h3>Summary</h3>
          <ul>
            <li><strong>Total Invoices:</strong> ${emailItems.length}</li>
            <li><strong>Total Units:</strong> ${totalUnits}</li>
            <li><strong>Total Amount:</strong> $${totalAmount.toFixed(2)}</li>
          </ul>
          
          <h3>Invoice Details</h3>
          <table border="1" cellpadding="8" cellspacing="0" style="border-collapse: collapse; width: 100%;">
            <thead>
              <tr style="background-color: #f0f0f0;">
                <th>Client</th>
                <th>Class</th>
                <th>Units</th>
                <th>Total Amount</th>
                <th>Link</th>
              </tr>
            </thead>
            <tbody>
              ${emailItems.map(item => `
                <tr>
                  <td>${item.clientName}</td>
                  <td>${item.className}</td>
                  <td>${item.units}</td>
                  <td>$${item.totalAmount.toFixed(2)}</td>
                  <td><a href="${item.invoiceUrl}">View Invoice</a></td>
                </tr>
              `).join('')}
            </tbody>
          </table>
          
          <p style="margin-top: 20px; font-size: 12px; color: #666;">
            All invoices are attached as PDF files. Please review and process accordingly.
          </p>
        </body>
      </html>
    `

    const emailText = `
${emailSubjectPrefix} – Approved Community Invoices Batch (${batchDate})

This email contains ${emailItems.length} approved community invoice(s) for processing.

Summary:
- Total Invoices: ${emailItems.length}
- Total Units: ${totalUnits}
- Total Amount: $${totalAmount.toFixed(2)}

Invoice Details:
${emailItems.map(item => `- ${item.clientName} | ${item.className} | ${item.units} units | $${item.totalAmount.toFixed(2)} | ${item.invoiceUrl}`).join('\n')}

All invoices are attached as PDF files. Please review and process accordingly.
    `

    // Step 8.5: Load additional PDF attachment if provided
    const allAttachments = [...pdfAttachments]
    if (attachmentKey) {
      try {
        const attachmentPath = join(UPLOAD_DIR, attachmentKey)
        if (existsSync(attachmentPath)) {
          const attachmentBuffer = await readFile(attachmentPath)
          allAttachments.push({
            filename: attachmentFilename || `additional-${attachmentKey}.pdf`,
            content: attachmentBuffer,
            contentType: 'application/pdf',
          })
          console.log('[EMAIL_COMMUNITY] Added additional PDF attachment', {
            attachmentKey,
            filename: attachmentFilename,
            size: attachmentBuffer.length,
          })
        } else {
          console.warn('[EMAIL_COMMUNITY] Attachment file not found', { attachmentKey, attachmentPath })
        }
      } catch (error: any) {
        console.error('[EMAIL_COMMUNITY] Failed to load attachment', { attachmentKey, error: error.message })
        // Continue without attachment rather than failing the entire send
      }
    }

    // Step 9: Send batch email
    const emailResult = await sendMailSafe(
      {
        to: recipients,
        from: emailFrom,
        replyTo: emailReplyTo,
        subject: `${emailSubjectPrefix} – Approved Community Invoices Batch (${batchDate})`,
        html: emailHtml,
        text: emailText,
        attachments: allAttachments,
        useCommunityTransporter: true, // Use community-specific SMTP credentials
      },
      {
        action: 'EMAIL_SENT',
        entityType: 'EmailQueue',
        entityId: batchId,
        userId: session.user.id,
      }
    )

    const sentAt = new Date()

    // Step 10: Update database based on result
    if (emailResult.success) {
      // SUCCESS: Mark items SENT, update invoices EMAILED
      await prisma.$transaction(async (tx) => {
        // Update queue items to SENT
        await tx.emailQueueItem.updateMany({
          where: { id: { in: lockedItems.map((item) => item.id) } },
          data: {
            status: 'SENT',
            sentAt,
            batchId,
          },
        })

        // Update invoices to EMAILED
        await tx.communityInvoice.updateMany({
          where: {
            id: { in: validInvoices.map((item) => item.invoice.id) },
          },
          data: {
            status: 'EMAILED',
            emailedAt: sentAt,
          },
        })
      })

      // Log audit events
      for (const item of validInvoices) {
        try {
          await logEmailSent(
            'CommunityInvoice',
            item.invoice.id,
            session.user.id,
            {
              type: 'COMMUNITY_INVOICE',
              batchId,
              clientName: `${item.invoice.client.firstName} ${item.invoice.client.lastName}`,
              className: item.invoice.class.name,
              totalAmount: item.invoice.totalAmount.toFixed(2),
            }
          )
        } catch (error) {
          console.error('Failed to log email sent event (non-blocking):', error)
        }
      }

      return NextResponse.json({
        success: true,
        sentCount: validInvoices.length,
        batchId,
        message: `Successfully sent ${validInvoices.length} invoice(s) in batch email`,
      })
    } else {
      // FAILURE: Mark items FAILED
      await prisma.$transaction(async (tx) => {
        await tx.emailQueueItem.updateMany({
          where: { id: { in: lockedItems.map((item) => item.id) } },
          data: {
            status: 'FAILED',
            errorMessage: emailResult.error || 'Email sending failed',
          },
        })
      })

      // Log audit events
      for (const item of validInvoices) {
        try {
          await logEmailFailed(
            'CommunityInvoice',
            item.invoice.id,
            session.user.id,
            emailResult.error || 'Email sending failed',
            {
              type: 'COMMUNITY_INVOICE',
            }
          )
        } catch (error) {
          console.error('Failed to log email failed event (non-blocking):', error)
        }
      }

      return NextResponse.json(
        {
          error: emailResult.error || 'Failed to send batch email',
        },
        { status: 500 }
      )
    }
  } catch (error: any) {
    console.error('[COMMUNITY EMAIL QUEUE SEND BATCH] Error:', error)
    return NextResponse.json(
      {
        error: 'Failed to send batch email',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined,
      },
      { status: 500 }
    )
  }
}
