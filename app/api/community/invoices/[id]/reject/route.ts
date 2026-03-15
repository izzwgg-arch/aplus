import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getUserPermissions } from '@/lib/permissions'
import { logReject } from '@/lib/audit'

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
    const permissionKey = 'community.invoices.reject'
    const permission = userPermissions[permissionKey]
    
    const isAdmin = session.user.role === 'ADMIN' || session.user.role === 'SUPER_ADMIN'
    const hasPermission = isAdmin || (permission?.canApprove === true) // Reject uses canApprove

    if (!hasPermission) {
      console.error('[COMMUNITY INVOICE REJECT] Permission denied:', {
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
          message: 'Permission denied - Insufficient permissions to reject community invoices',
        },
        { status: 403 }
      )
    }

    const data = await request.json()
    const { reason } = data

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

    if (invoice.status !== 'DRAFT' && invoice.status !== 'APPROVED' && invoice.status !== 'QUEUED') {
      return NextResponse.json(
        { ok: false, code: 'INVALID_STATUS', message: `Invoice cannot be rejected from status: ${invoice.status}. Must be DRAFT, APPROVED, or QUEUED.` },
        { status: 400 }
      )
    }

    // Update invoice to REJECTED and remove from queue if queued
    const invoiceId = resolvedParams.id
    const updatedInvoice = await prisma.$transaction(async (tx) => {
      // Remove from email queue if it exists
      await tx.emailQueueItem.deleteMany({
        where: {
          entityType: 'COMMUNITY_INVOICE',
          entityId: invoiceId,
        },
      })

      // Update invoice to REJECTED
      return await tx.communityInvoice.update({
        where: { id: invoiceId },
        data: {
          status: 'REJECTED',
          rejectedAt: new Date(),
          rejectedByUserId: session.user.id,
          notes: reason ? `${invoice.notes || ''}\nRejection reason: ${reason}`.trim() : invoice.notes,
        },
      })
    })

    // Log audit
    try {
      await logReject(
        'CommunityInvoice',
        resolvedParams.id,
        session.user.id,
        reason || 'No reason provided'
      )
    } catch (error) {
      console.error('Failed to log reject action (non-blocking):', error)
    }

    return NextResponse.json({
      ok: true,
      invoice: updatedInvoice,
    })
  } catch (error: any) {
    console.error('[COMMUNITY INVOICE REJECT] Error:', {
      error: error.message,
      stack: error.stack,
      invoiceId: resolvedParams?.id,
      userId: session?.user?.id,
    })
    return NextResponse.json(
      {
        ok: false,
        code: 'SERVER_ERROR',
        message: 'Failed to reject invoice',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined,
      },
      { status: 500 }
    )
  }
}
