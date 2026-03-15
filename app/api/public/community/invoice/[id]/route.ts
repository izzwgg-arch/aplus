import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

/**
 * GET /api/public/community/invoice/[id]
 * 
 * Public route for viewing Community Invoice by token
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

    // Find invoice with matching token and valid expiration
    const invoice = await prisma.communityInvoice.findFirst({
      where: {
        id: invoiceId,
        viewToken: token,
        tokenExpiresAt: {
          gt: new Date(), // Token must not be expired
        },
        deletedAt: null,
      },
      include: {
        client: true,
        class: true,
      },
    })

    if (!invoice) {
      return NextResponse.json(
        { error: 'Invoice link expired or invalid' },
        { status: 404 }
      )
    }

    // Return invoice data (serialize Decimal to number)
    return NextResponse.json({
      id: invoice.id,
      units: invoice.units,
      ratePerUnit: invoice.ratePerUnit.toNumber(),
      totalAmount: invoice.totalAmount.toNumber(),
      status: invoice.status,
      serviceDate: invoice.serviceDate?.toISOString() || null,
      notes: invoice.notes || null,
      createdAt: invoice.createdAt.toISOString(),
      client: invoice.client,
      class: {
        ...invoice.class,
        ratePerUnit: invoice.class.ratePerUnit.toNumber(),
      },
    })
  } catch (error: any) {
    console.error('[PUBLIC_COMMUNITY_INVOICE] Error:', {
      error: error?.message,
      stack: error?.stack,
    })
    
    return NextResponse.json(
      { error: 'Failed to load invoice' },
      { status: 500 }
    )
  }
}
