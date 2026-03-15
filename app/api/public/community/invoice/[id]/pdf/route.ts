import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { generateCommunityInvoicePdf } from '@/lib/pdf/communityInvoicePdf'

/**
 * GET /api/public/community/invoice/[id]/pdf
 * 
 * Public route for downloading Community Invoice PDF by token
 * NO AUTH REQUIRED - validates token from query parameter
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> | { id: string } }
) {
  try {
    // Resolve params (Next.js 14+ async params support)
    const resolvedParams = await Promise.resolve(params)
    const invoiceId = resolvedParams.id

    // Get token from query parameter
    const { searchParams } = new URL(request.url)
    const token = searchParams.get('token')

    if (!token) {
      return NextResponse.json(
        { error: 'Token is required' },
        { status: 400 }
      )
    }

    // Validate token before generating PDF
    const invoice = await prisma.communityInvoice.findFirst({
      where: {
        id: invoiceId,
        viewToken: token,
        tokenExpiresAt: {
          gt: new Date(), // Token must not be expired
        },
        deletedAt: null,
      },
    })

    if (!invoice) {
      return NextResponse.json(
        { error: 'Invoice link expired or invalid' },
        { status: 404 }
      )
    }

    // Generate PDF using the same function as authenticated route
    const pdfBuffer = await generateCommunityInvoicePdf(invoiceId)

    // Return PDF with proper headers
    return new NextResponse(new Uint8Array(pdfBuffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="kj-play-center-invoice-${invoiceId}.pdf"`,
        'Content-Length': pdfBuffer.length.toString(),
      },
    })
  } catch (error: any) {
    console.error('[PUBLIC_COMMUNITY_INVOICE_PDF] Error:', {
      error: error?.message,
      stack: error?.stack,
    })
    
    if (error.message?.includes('not found')) {
      return NextResponse.json({ error: error.message }, { status: 404 })
    }
    
    return NextResponse.json(
      { error: 'Failed to generate PDF' },
      { status: 500 }
    )
  }
}
