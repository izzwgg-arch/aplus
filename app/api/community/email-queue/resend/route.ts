import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getUserPermissions } from '@/lib/permissions'
import { sendCommunityEmailBatch } from '@/lib/jobs/scheduledEmailSender'

/**
 * POST /api/community/email-queue/resend
 * Resend failed emails by resetting them to QUEUED and sending immediately
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Check permissions
    const userPermissions = await getUserPermissions(session.user.id)
    const canSendNow =
      userPermissions['community.invoices.emailqueue.send']?.canCreate === true ||
      session.user.role === 'SUPER_ADMIN' ||
      session.user.role === 'ADMIN'

    if (!canSendNow) {
      return NextResponse.json(
        { error: 'Forbidden - Not authorized to resend emails' },
        { status: 403 }
      )
    }

    const body = await request.json()
    const { itemIds, recipients } = body

    if (!itemIds || !Array.isArray(itemIds) || itemIds.length === 0) {
      return NextResponse.json(
        { error: 'Item IDs are required' },
        { status: 400 }
      )
    }

    // Validate recipients if provided
    let normalizedRecipients: string[] = []
    if (recipients) {
      normalizedRecipients = recipients
        .split(',')
        .map((email: string) => email.trim())
        .filter(Boolean)
      
      // Validate email format
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
      const invalidEmails = normalizedRecipients.filter((email) => !emailRegex.test(email))
      
      if (invalidEmails.length > 0) {
        return NextResponse.json(
          { error: `Invalid email address(es): ${invalidEmails.join(', ')}` },
          { status: 400 }
        )
      }
    }

    // Step 1: Find failed items that belong to COMMUNITY_INVOICE and are not deleted
    const failedItems = await prisma.emailQueueItem.findMany({
      where: {
        id: { in: itemIds },
        status: 'FAILED',
        entityType: 'COMMUNITY_INVOICE',
        deletedAt: null,
      },
    })

    if (failedItems.length === 0) {
      return NextResponse.json(
        { error: 'No failed items found to resend' },
        { status: 404 }
      )
    }

    // Step 2: Reset failed items to QUEUED and clear error messages, update recipients if provided
    const resetItems = await prisma.$transaction(async (tx) => {
      const updateData: any = {
        status: 'QUEUED',
        errorMessage: null,
        lastError: null,
        scheduledSendAt: null, // Clear scheduled time so it sends immediately
        attempts: { increment: 1 }, // Increment attempt counter
      }
      
      // Update recipients if provided
      if (normalizedRecipients.length > 0) {
        updateData.toEmail = normalizedRecipients.join(',')
      }
      
      return await tx.emailQueueItem.updateMany({
        where: {
          id: { in: failedItems.map((item) => item.id) },
        },
        data: updateData,
      })
    })

    console.log('[COMMUNITY EMAIL QUEUE RESEND] Reset items to QUEUED', {
      itemIds: failedItems.map((item) => item.id),
      count: resetItems.count,
      userId: session.user.id,
    })

    // Step 3: Lock items to SENDING
    const lockedItems = await prisma.$transaction(async (tx) => {
      return await tx.emailQueueItem.updateMany({
        where: {
          id: { in: failedItems.map((item) => item.id) },
          status: 'QUEUED',
        },
        data: {
          status: 'SENDING',
        },
      })
    })

    if (lockedItems.count === 0) {
      return NextResponse.json(
        { error: 'Failed to lock items for sending' },
        { status: 500 }
      )
    }

    // Step 4: Send emails using the existing sendCommunityEmailBatch function
    try {
      await sendCommunityEmailBatch(failedItems.map((item) => item.id))

      return NextResponse.json({
        success: true,
        message: `Successfully resent ${failedItems.length} email(s)`,
        resentCount: failedItems.length,
      })
    } catch (error: any) {
      console.error('[COMMUNITY EMAIL QUEUE RESEND] Error sending emails:', error)

      // Mark items as FAILED again if sending fails
      await prisma.emailQueueItem.updateMany({
        where: {
          id: { in: failedItems.map((item) => item.id) },
        },
        data: {
          status: 'FAILED',
          errorMessage: error.message?.substring(0, 500) || 'Failed to resend email',
          lastError: error.message?.substring(0, 1000) || 'Failed to resend email',
        },
      })

      return NextResponse.json(
        {
          error: error.message || 'Failed to resend emails',
          details: process.env.NODE_ENV === 'development' ? error.message : undefined,
        },
        { status: 500 }
      )
    }
  } catch (error: any) {
    console.error('[COMMUNITY EMAIL QUEUE RESEND] Error:', error)
    return NextResponse.json(
      {
        error: 'Failed to resend emails',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined,
      },
      { status: 500 }
    )
  }
}
