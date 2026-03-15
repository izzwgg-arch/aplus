import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getUserPermissions } from '@/lib/permissions'

/**
 * GET COMMUNITY EMAIL QUEUE
 * 
 * Returns all queued community invoices
 * Permission: community.invoices.emailqueue.view
 */
export async function GET(request: NextRequest) {
  let session: any = null
  try {
    session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json(
        {
          ok: false,
          code: 'PERMISSION_DENIED',
          message: 'Unauthorized - Please log in',
        },
        { status: 401 }
      )
    }

    // Check Community Classes subsection permission
    const { canAccessCommunitySection } = await import('@/lib/permissions')
    const hasAccess = await canAccessCommunitySection(session.user.id, 'emailQueue')
    if (!hasAccess) {
      return NextResponse.json(
        {
          ok: false,
          code: 'PERMISSION_DENIED',
          message: 'Permission denied - No access to Community Classes Email Queue',
        },
        { status: 403 }
      )
    }

    const searchParams = request.nextUrl.searchParams
    const status = searchParams.get('status') // 'QUEUED', 'SENT', 'FAILED', or null for all

    const where: any = {
      entityType: 'COMMUNITY_INVOICE',
      deletedAt: null, // Only show non-deleted items
    }
    if (status) {
      where.status = status
    }

    // Fetch all queue items for community invoices (excluding deleted)
    const queueItems = await prisma.emailQueueItem.findMany({
      where,
      orderBy: { queuedAt: 'desc' },
      include: {
        queuedBy: {
          select: {
            id: true,
            username: true,
            email: true,
          },
        },
      },
    })

    // Fetch invoice details for each item
    const itemsWithInvoices = await Promise.all(
      queueItems.map(async (item) => {
        try {
          const invoice = await prisma.communityInvoice.findFirst({
            where: {
              id: item.entityId,
              deletedAt: null,
            },
            include: {
              client: {
                select: {
                  firstName: true,
                  lastName: true,
                  medicaidId: true,
                },
              },
              class: {
                select: {
                  name: true,
                },
              },
            },
          })

          if (!invoice) {
          return {
            id: item.id,
            entityType: item.entityType,
            entityId: item.entityId,
            queuedAt: item.queuedAt.toISOString(),
            sentAt: item.sentAt?.toISOString() || null,
            status: item.status,
            errorMessage: item.errorMessage || 'Invoice not found or deleted',
            batchId: item.batchId,
            toEmail: item.toEmail,
            scheduledSendAt: item.scheduledSendAt?.toISOString() || null,
            queuedBy: item.queuedBy,
            invoice: null,
          }
          }

          return {
            id: item.id,
            entityType: item.entityType,
            entityId: item.entityId,
            queuedAt: item.queuedAt.toISOString(),
            sentAt: item.sentAt?.toISOString() || null,
            status: item.status,
            errorMessage: item.errorMessage,
            batchId: item.batchId,
            toEmail: item.toEmail,
            scheduledSendAt: item.scheduledSendAt?.toISOString() || null,
            queuedBy: item.queuedBy,
            invoice: {
              id: invoice.id,
              client: {
                firstName: invoice.client.firstName,
                lastName: invoice.client.lastName,
                medicaidId: invoice.client.medicaidId,
              },
              class: invoice.class,
              units: invoice.units,
              totalAmount: invoice.totalAmount.toNumber(),
              serviceDate: invoice.serviceDate?.toISOString() || null,
            },
          }
        } catch (error: any) {
          console.error(`Error fetching invoice ${item.entityId}:`, error)
          return {
            id: item.id,
            entityType: item.entityType,
            entityId: item.entityId,
            queuedAt: item.queuedAt.toISOString(),
            sentAt: item.sentAt?.toISOString() || null,
            status: item.status,
            errorMessage: item.errorMessage || `Error loading invoice: ${error.message || 'Unknown error'}`,
            batchId: item.batchId,
            toEmail: item.toEmail,
            scheduledSendAt: item.scheduledSendAt?.toISOString() || null,
            queuedBy: item.queuedBy,
            invoice: null,
          }
        }
      })
    )

    return NextResponse.json({
      ok: true,
      items: itemsWithInvoices,
    })
  } catch (error: any) {
    console.error('[COMMUNITY EMAIL QUEUE] Error:', {
      route: '/api/community/email-queue',
      userId: session?.user?.id,
      userRole: session?.user?.role,
      errorCode: error?.code,
      errorMessage: error?.message,
      errorStack: error?.stack,
    })
    
    return NextResponse.json(
      {
        ok: false,
        code: 'DB_ERROR',
        message: 'Failed to fetch community email queue',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined,
      },
      { status: 500 }
    )
  }
}
