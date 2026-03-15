import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getUserPermissions } from '@/lib/permissions'
import { logApprove } from '@/lib/audit'
import { randomBytes } from 'crypto'

/**
 * POST /api/invoices/[id]/approve
 * 
 * Approve a regular invoice and generate token for public viewing
 * When approved, invoice status is updated and a view token is generated
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> | { id: string } }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json(
        { ok: false, code: 'UNAUTHORIZED', message: 'Unauthorized' },
        { status: 401 }
      )
    }

    const resolvedParams = await Promise.resolve(params)
    const invoiceId = resolvedParams.id

    // Check permissions
    const userPermissions = await getUserPermissions(session.user.id)
    const canApprove =
      userPermissions['invoices.approve']?.canCreate === true ||
      session.user.role === 'SUPER_ADMIN' ||
      session.user.role === 'ADMIN'

    if (!canApprove) {
      return NextResponse.json(
        { ok: false, code: 'FORBIDDEN', message: 'Not authorized to approve invoices' },
        { status: 403 }
      )
    }

    // Fetch invoice
    const invoice = await prisma.invoice.findUnique({
      where: { id: invoiceId, deletedAt: null },
      include: {
        client: {
          select: {
            name: true,
          },
        },
      },
    })

    if (!invoice) {
      return NextResponse.json(
        { ok: false, code: 'NOT_FOUND', message: 'Invoice not found' },
        { status: 404 }
      )
    }

    if (invoice.status !== 'DRAFT' && invoice.status !== 'READY') {
      return NextResponse.json(
        { ok: false, code: 'INVALID_STATUS', message: 'Only DRAFT or READY invoices can be approved' },
        { status: 400 }
      )
    }

    // Generate secure token for public invoice view (valid for 30 days)
    const viewToken = randomBytes(32).toString('hex')
    const tokenExpiresAt = new Date()
    tokenExpiresAt.setDate(tokenExpiresAt.getDate() + 30) // 30 days from now

    // Transactional approval with token generation
    const result = await prisma.$transaction(async (tx) => {
      // 1. Update invoice to SENT (approved and ready for viewing)
      const updatedInvoice = await tx.invoice.update({
        where: { id: invoiceId },
        data: {
          status: 'SENT',
          sentAt: new Date(),
          viewToken, // Save the generated token
          tokenExpiresAt, // Save the token expiration
        },
      })

      // 2. Log audit (non-blocking, but in transaction for consistency)
      try {
        await tx.auditLog.create({
          data: {
            action: 'INVOICE_APPROVED' as any,
            entityType: 'Invoice',
            entityId: invoiceId,
            userId: session.user.id,
            metadata: JSON.stringify({
              invoiceNumber: invoice.invoiceNumber,
              clientName: invoice.client.name,
              totalAmount: invoice.totalAmount.toString(),
            }),
          },
        })
      } catch (auditError) {
        // Log but don't fail transaction
        console.error('Failed to create audit log (non-blocking):', auditError)
      }

      return updatedInvoice
    })

    // Log approval action (outside transaction, non-blocking)
    try {
      await logApprove(
        'Invoice',
        invoiceId,
        session.user.id,
        {
          invoiceNumber: invoice.invoiceNumber,
          clientName: invoice.client.name,
          totalAmount: invoice.totalAmount.toString(),
        }
      )
    } catch (error) {
      console.error('Failed to log approve action (non-blocking):', error)
    }

    return NextResponse.json({
      ok: true,
      message: 'Invoice approved successfully',
      invoice: {
        id: result.id,
        invoiceNumber: result.invoiceNumber,
        status: result.status,
        viewToken: result.viewToken, // Return token for email generation
      },
    })
  } catch (error: any) {
    console.error('[INVOICE_APPROVE] Error:', {
      error: error?.message,
      stack: error?.stack,
    })

    return NextResponse.json(
      { ok: false, code: 'INTERNAL_ERROR', message: 'Failed to approve invoice' },
      { status: 500 }
    )
  }
}
