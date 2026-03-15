import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

/**
 * GET /api/public/invoice/[id]
 * 
 * Public route for viewing Regular Invoice by token
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

    const invoice = await prisma.invoice.findFirst({
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
        entries: {
          include: {
            provider: true,
            timesheet: {
              select: {
                startDate: true,
                endDate: true,
              },
            },
          },
          orderBy: {
            timesheet: {
              startDate: 'asc',
            },
          },
        },
      },
    })

    if (!invoice) {
      return NextResponse.json(
        { error: 'Invoice link expired or invalid' },
        { status: 404 }
      )
    }

    return NextResponse.json({
      id: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      status: invoice.status,
      startDate: invoice.startDate.toISOString(),
      endDate: invoice.endDate.toISOString(),
      totalAmount: invoice.totalAmount.toNumber(),
      paidAmount: invoice.paidAmount.toNumber(),
      outstanding: invoice.outstanding.toNumber(),
      notes: invoice.notes,
      createdAt: invoice.createdAt.toISOString(),
      client: {
        name: invoice.client.name,
        address: invoice.client.address,
        idNumber: invoice.client.idNumber,
      },
      entries: invoice.entries.map(entry => ({
        id: entry.id,
        date: entry.timesheet?.startDate?.toISOString() || invoice.startDate.toISOString(),
        description: entry.provider?.name || `Provider ${entry.providerId}`,
        units: entry.units.toNumber(),
        amount: entry.amount.toNumber(),
      })),
    })
  } catch (error: any) {
    console.error('[PUBLIC_REGULAR_INVOICE] Error:', {
      error: error?.message,
      stack: error?.stack,
    })
    
    return NextResponse.json(
      { error: 'Failed to load invoice' },
      { status: 500 }
    )
  }
}
