import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getUserPermissions } from '@/lib/permissions'
import { generateCommunityInvoicePdf } from '@/lib/pdf/communityInvoicePdf'

/**
 * GET /api/community/invoices/[id]/pdf
 * 
 * Returns PDF bytes for Community Invoice
 * Used by Print/Download button and Email Queue
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> | { id: string } }
) {
  try {
    // Resolve params (Next.js 14+ async params support)
    const resolvedParams = await Promise.resolve(params)
    const invoiceId = resolvedParams.id

    // Auth check
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Check Community Classes subsection permission
    const { canAccessCommunitySection } = await import('@/lib/permissions')
    const hasAccess = await canAccessCommunitySection(session.user.id, 'invoices')
    if (!hasAccess) {
      return NextResponse.json({ error: 'Forbidden - No access to Community Classes' }, { status: 403 })
    }

    // Generate PDF
    const pdfBuffer = await generateCommunityInvoicePdf(invoiceId)

    // Return PDF with proper headers
    // Convert Buffer to Uint8Array for Next.js compatibility
    return new NextResponse(new Uint8Array(pdfBuffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="community-invoice-${invoiceId}.pdf"`,
        'Content-Length': pdfBuffer.length.toString(),
      },
    })
  } catch (error: any) {
    console.error('[COMMUNITY_INVOICE_PDF_ROUTE] Error:', {
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
