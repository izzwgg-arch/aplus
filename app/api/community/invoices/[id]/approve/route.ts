import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getUserPermissions } from '@/lib/permissions'
import { logApprove, logQueue } from '@/lib/audit'
import { randomBytes } from 'crypto'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> | { id: string } }
) {
  let resolvedParams: { id: string } | null = null
  let session: any = null
  
  try {
    resolvedParams = params instanceof Promise ? await params : params
    if (!resolvedParams) {
      return NextResponse.json(
        { ok: false, code: 'VALIDATION_ERROR', message: 'Invalid invoice ID' },
        { status: 400 }
      )
    }

    session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json(
        { ok: false, code: 'PERMISSION_DENIED', message: 'Unauthorized' },
        { status: 401 }
      )
    }

    // Check permissions - same pattern as BCBA timesheets
    const userPermissions = await getUserPermissions(session.user.id)
    const permissionKey = 'community.invoices.approve'
    const permission = userPermissions[permissionKey]
    
    const isAdmin = session.user.role === 'ADMIN' || session.user.role === 'SUPER_ADMIN'
    const hasPermission = isAdmin || (permission?.canApprove === true)

    if (!hasPermission) {
      console.error('[COMMUNITY INVOICE APPROVE] Permission denied:', {
        userId: session.user.id,
        userRole: session.user.role,
        permissionKey,
        hasPermission: permission?.canApprove,
        isAdmin,
      })
      return NextResponse.json(
        {
          ok: false,
          code: 'PERMISSION_DENIED',
          message: 'Permission denied - Insufficient permissions to approve community invoices',
        },
        { status: 403 }
      )
    }

    // Fetch invoice
    const invoice = await prisma.communityInvoice.findUnique({
      where: { id: resolvedParams.id },
      include: {
        client: true,
        class: true,
      },
    })

    if (!invoice || invoice.deletedAt) {
      return NextResponse.json(
        { ok: false, code: 'NOT_FOUND', message: 'Invoice not found' },
        { status: 404 }
      )
    }

    if (invoice.status !== 'DRAFT') {
      return NextResponse.json(
        { ok: false, code: 'INVALID_STATUS', message: 'Only DRAFT invoices can be approved' },
        { status: 400 }
      )
    }

    // Transactional approval + queue
    const invoiceId = resolvedParams.id
    
    // Generate secure token for public invoice view (valid for 30 days)
    const viewToken = randomBytes(32).toString('hex')
    const tokenExpiresAt = new Date()
    tokenExpiresAt.setDate(tokenExpiresAt.getDate() + 30) // 30 days from now
    
    const result = await prisma.$transaction(async (tx) => {
      // 1. Update invoice to QUEUED (approved and queued for email)
      const updatedInvoice = await tx.communityInvoice.update({
        where: { id: invoiceId },
        data: {
          status: 'QUEUED',
          approvedAt: new Date(),
          approvedByUserId: session.user.id,
          queuedAt: new Date(),
          viewToken,
          tokenExpiresAt,
        },
      })

      // 2. Create email queue item
      try {
        await tx.emailQueueItem.create({
          data: {
            entityType: 'COMMUNITY_INVOICE',
            entityId: invoiceId,
            queuedByUserId: session.user.id,
            status: 'QUEUED',
            context: 'COMMUNITY', // Mark as COMMUNITY email queue
          },
        })
      } catch (queueError: any) {
        if (queueError?.code === 'P2002') {
          // Queue item already exists, continue
        } else {
          throw queueError
        }
      }

      // 3. Log audit
      try {
        await tx.auditLog.create({
          data: {
            action: 'APPROVE',
            entityType: 'CommunityInvoice',
            entityId: invoiceId,
            userId: session.user.id,
            metadata: JSON.stringify({
              clientName: `${invoice.client.firstName} ${invoice.client.lastName}`,
              className: invoice.class.name,
              totalAmount: invoice.totalAmount.toString(),
              units: invoice.units,
            }),
          },
        })
      } catch (auditError) {
        console.error('Failed to create audit log (non-blocking):', auditError)
      }

      return updatedInvoice
    })

    // Log queue action
    try {
      await logQueue(
        'CommunityInvoice',
        invoiceId,
        session.user.id,
        {
          clientName: `${invoice.client.firstName} ${invoice.client.lastName}`,
          className: invoice.class.name,
        }
      )
    } catch (error) {
      console.error('Failed to log queue action (non-blocking):', error)
    }

    return NextResponse.json({
      ok: true,
      invoice: result,
    })
  } catch (error: any) {
    console.error('[COMMUNITY INVOICE APPROVE] Error:', {
      error: error.message,
      stack: error.stack,
      invoiceId: resolvedParams?.id,
      userId: session?.user?.id,
      role: session?.user?.role,
    })
    return NextResponse.json(
      {
        ok: false,
        code: 'SERVER_ERROR',
        message: 'Failed to approve invoice',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined,
      },
      { status: 500 }
    )
  }
}
