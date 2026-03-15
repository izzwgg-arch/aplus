import { prisma } from '../prisma'
import { sendMailSafe } from '../email'
import { generateCommunityInvoicePdf } from '../pdf/communityInvoicePdf'
import { format } from 'date-fns'
import { v4 as uuidv4 } from 'uuid'
import { readFile } from 'fs/promises'
import { join } from 'path'
import { existsSync } from 'fs'

const UPLOAD_DIR = join(process.cwd(), 'uploads', 'community-email-attachments')

/**
 * Send scheduled Community Classes email batch
 * This function contains the core logic for sending Community Classes emails
 * Reused by both the send-batch route and the scheduled email cron job
 */
export async function sendCommunityEmailBatch(itemIds: string[]) {
  // Step 1: Lock items to SENDING (already done by caller, but verify)
  const lockedItems = await prisma.emailQueueItem.findMany({
    where: {
      id: { in: itemIds },
      status: 'SENDING',
      entityType: 'COMMUNITY_INVOICE',
      deletedAt: null,
    },
  })

  if (lockedItems.length === 0) {
    throw new Error('No items found to send')
  }

  // Step 2: Generate batch ID
  const batchId = uuidv4()
  const batchDate = format(new Date(), 'yyyy-MM-dd')

  // Step 3: Fetch invoice details
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

  const validInvoices = invoicesWithDetails.filter(
    (inv): inv is NonNullable<typeof inv> => inv !== null
  )

  if (validInvoices.length === 0) {
    await prisma.emailQueueItem.updateMany({
      where: { id: { in: itemIds } },
      data: {
        status: 'FAILED',
        errorMessage: 'No valid invoices found',
      },
    })
    throw new Error('No valid invoices found')
  }

  // Step 4: Generate PDFs
  const pdfAttachments: Array<{ filename: string; content: Buffer; contentType: string }> = []
  const emailItems: Array<{
    id: string
    clientName: string
    className: string
    units: number
    totalAmount: number
    invoiceUrl: string
  }> = []

  const baseUrl = process.env.APP_URL || process.env.NEXTAUTH_URL || 'http://66.94.105.43:3000'

  for (const item of validInvoices) {
    try {
      const pdfBuffer = await generateCommunityInvoicePdf(item.invoice.id)
      const filename = `KJ_Play_Center_Invoice_${item.invoice.client.firstName}_${item.invoice.client.lastName}_${format(new Date(item.invoice.createdAt), 'yyyy-MM-dd')}.pdf`

      pdfAttachments.push({
        filename,
        content: pdfBuffer,
        contentType: 'application/pdf',
      })

      const invoiceWithToken = await prisma.communityInvoice.findUnique({
        where: { id: item.invoice.id },
        select: { viewToken: true },
      })

      const publicInvoiceUrl = invoiceWithToken?.viewToken
        ? `${baseUrl}/public/community/invoice/${item.invoice.id}?token=${invoiceWithToken.viewToken}`
        : `${baseUrl}/community/invoices/${item.invoice.id}`

      emailItems.push({
        id: item.invoice.id,
        clientName: `${item.invoice.client.firstName} ${item.invoice.client.lastName}`,
        className: item.invoice.class.name,
        units: item.invoice.units,
        totalAmount: item.invoice.totalAmount.toNumber(),
        invoiceUrl: publicInvoiceUrl,
      })
    } catch (error: any) {
      console.error(`Failed to generate PDF for invoice ${item.invoice.id}:`, error)
      // Continue with other invoices
    }
  }

  if (pdfAttachments.length === 0) {
    await prisma.emailQueueItem.updateMany({
      where: { id: { in: itemIds } },
      data: {
        status: 'FAILED',
        errorMessage: 'All PDF generation failed',
      },
    })
    throw new Error('Failed to generate PDFs')
  }

  // Step 5: COMMUNITY EMAIL QUEUE - Get recipients from stored toEmail (REQUIRED, NO fallback)
  const firstItem = lockedItems[0]
  
  // For Community Classes: Recipients MUST be stored in toEmail (no fallback to fixed emails)
  if (!firstItem.toEmail || firstItem.toEmail.trim().length === 0) {
    console.error('[EMAIL_COMMUNITY] Scheduled email missing recipients', {
      queueItemId: firstItem.id,
      entityId: firstItem.entityId,
      source: 'COMMUNITY',
    })
    
    await prisma.emailQueueItem.updateMany({
      where: { id: { in: itemIds } },
      data: {
        status: 'FAILED',
        errorMessage: 'MISSING_RECIPIENTS: Recipient email address(es) are required. Please reschedule with recipients.',
        lastError: 'MISSING_RECIPIENTS: Recipient email address(es) are required. Please reschedule with recipients.',
      },
    })
    throw new Error('MISSING_RECIPIENTS: Recipient email address(es) are required. Please reschedule with recipients.')
  }

  const recipients = firstItem.toEmail
    .split(',')
    .map((email) => email.trim().toLowerCase())
    .filter((email) => email.length > 0)

  if (recipients.length === 0) {
    await prisma.emailQueueItem.updateMany({
      where: { id: { in: itemIds } },
      data: {
        status: 'FAILED',
        errorMessage: 'MISSING_RECIPIENTS: No valid recipient email addresses found',
        lastError: 'MISSING_RECIPIENTS: No valid recipient email addresses found',
      },
    })
    throw new Error('MISSING_RECIPIENTS: No valid recipient email addresses found')
  }

  console.log('[EMAIL_COMMUNITY] Processing scheduled email', {
    queueItemIds: itemIds,
    recipients: recipients.join(', '),
    source: 'COMMUNITY',
    fromStoredToEmail: firstItem.toEmail,
  })

  // Step 6: Build email content
  const totalAmount = emailItems.reduce((sum, item) => sum + item.totalAmount, 0)
  const totalUnits = emailItems.reduce((sum, item) => sum + item.units, 0)

  const emailBrandName = process.env.COMMUNITY_EMAIL_FROM_NAME || 'KJ Play Center'
  // Use billing@kjplaycenter.com for Community Classes emails only
  const emailFromAddress = process.env.COMMUNITY_EMAIL_FROM || 'billing@kjplaycenter.com'
  const emailFrom = `${emailBrandName} <${emailFromAddress}>`
  const emailReplyTo = process.env.COMMUNITY_EMAIL_REPLY_TO || emailFromAddress
  const emailSubjectPrefix = process.env.COMMUNITY_EMAIL_SUBJECT_PREFIX || 'KJ Play Center'

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

  // Step 6.5: Load additional PDF attachment if stored on queue items
  const allAttachments = [...pdfAttachments]
  const firstItemWithAttachment = lockedItems.find(item => item.attachmentKey)
  if (firstItemWithAttachment?.attachmentKey) {
    try {
      const attachmentPath = join(UPLOAD_DIR, firstItemWithAttachment.attachmentKey)
      if (existsSync(attachmentPath)) {
        const attachmentBuffer = await readFile(attachmentPath)
        allAttachments.push({
          filename: firstItemWithAttachment.attachmentFilename || `additional-${firstItemWithAttachment.attachmentKey}.pdf`,
          content: attachmentBuffer,
          contentType: 'application/pdf',
        })
        console.log('[EMAIL_COMMUNITY] Added additional PDF attachment from scheduled item', {
          attachmentKey: firstItemWithAttachment.attachmentKey,
          filename: firstItemWithAttachment.attachmentFilename,
          size: attachmentBuffer.length,
        })
      } else {
        console.warn('[EMAIL_COMMUNITY] Scheduled attachment file not found', { 
          attachmentKey: firstItemWithAttachment.attachmentKey, 
          attachmentPath 
        })
      }
    } catch (error: any) {
      console.error('[EMAIL_COMMUNITY] Failed to load scheduled attachment', { 
        attachmentKey: firstItemWithAttachment.attachmentKey, 
        error: error.message 
      })
      // Continue without attachment rather than failing the entire send
    }
  }

  // Step 7: Send email (with logging)
  console.log('[EMAIL_COMMUNITY] Sending scheduled email', {
    queueItemIds: itemIds,
    recipients: recipients.join(', '),
    source: 'COMMUNITY',
    batchId,
    hasAdditionalAttachment: !!firstItemWithAttachment?.attachmentKey,
  })

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
      userId: lockedItems[0].queuedByUserId,
    }
  )

  const sentAt = new Date()

  // Step 8: Update database
  if (emailResult.success) {
    await prisma.$transaction(async (tx) => {
      await tx.emailQueueItem.updateMany({
        where: { id: { in: itemIds } },
        data: {
          status: 'SENT',
          sentAt,
          batchId,
        },
      })

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
  } else {
    await prisma.emailQueueItem.updateMany({
      where: { id: { in: itemIds } },
      data: {
        status: 'FAILED',
        errorMessage: emailResult.error || 'Email sending failed',
      },
    })
    throw new Error(emailResult.error || 'Email sending failed')
  }
}
