import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { generateRegularInvoicePdf } from '@/lib/pdf/regularInvoicePdf'
import { getUserPermissions } from '@/lib/permissions'

/**
 * GET /api/invoices/[id]/pdf
 * 
 * Authenticated route for downloading Regular Invoice PDF
 * Requires authentication and invoice view permissions
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> | { id: string } }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const resolvedParams = await Promise.resolve(params)
    const invoiceId = resolvedParams.id

    // Check permissions (users can view invoices, admins can view all)
    const userPermissions = await getUserPermissions(session.user.id)
    const canView = 
      userPermissions['invoices.view']?.canView === true ||
      session.user.role === 'SUPER_ADMIN' ||
      session.user.role === 'ADMIN'

    if (!canView) {
      return NextResponse.json({ error: 'Forbidden - Not authorized to view invoices' }, { status: 403 })
    }

    // Verify invoice exists and user has access
    const invoice = await prisma.invoice.findUnique({
      where: { id: invoiceId, deletedAt: null },
      select: { id: true },
    })

    if (!invoice) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })
    }

    // Generate PDF
    const pdfBuffer = await generateRegularInvoicePdf(invoiceId)

    return new NextResponse(new Uint8Array(pdfBuffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="invoice-${invoiceId}.pdf"`,
        'Content-Length': pdfBuffer.length.toString(),
      },
    })
  } catch (error: any) {
    console.error('[REGULAR_INVOICE_PDF_ROUTE] Error:', {
      error: error?.message,
      stack: error?.stack,
    })
    
    if (error.message?.includes('not found')) {
      return NextResponse.json({ error: error.message }, { status: 404 })
    }
    
    return NextResponse.json(
      { error: 'Failed to generate PDF', details: process.env.NODE_ENV === 'development' ? error.message : undefined },
      { status: 500 }
    )
  }
}
