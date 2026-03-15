import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { generateRegularInvoicePdf } from '@/lib/pdf/regularInvoicePdf'

/**
 * GET /api/public/invoice/[id]/pdf
 * 
 * Public route for downloading Regular Invoice PDF by token
 * NO AUTH REQUIRED - validates token from query parameter
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> | { id: string } }
) {
  try {
    const resolvedParams = await Promise.resolve(params)
    const invoiceId = resolvedParams.id

    const { searchParams } = new URL(request.url)
    const token = searchParams.get('token')

    if (!token) {
      return NextResponse.json(
        { error: 'Token is required' },
        { status: 400 }
      )
    }

    // Validate token and expiration
    const invoice = await prisma.invoice.findFirst({
      where: {
        id: invoiceId,
        viewToken: token,
        tokenExpiresAt: {
          gt: new Date(), // Token must not be expired
        },
        deletedAt: null,
      },
      select: { id: true }, // Only need ID for PDF generation
    })

    if (!invoice) {
      return NextResponse.json(
        { error: 'Invoice link expired or invalid' },
        { status: 404 }
      )
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
    console.error('[PUBLIC_REGULAR_INVOICE_PDF_ROUTE] Error:', {
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
