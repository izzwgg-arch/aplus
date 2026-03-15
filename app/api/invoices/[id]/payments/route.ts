import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { Decimal } from '@prisma/client/runtime/library'
import { logPayment } from '@/lib/audit'

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session || session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const data = await request.json()
    const { amount, paymentDate, referenceNumber, notes } = data

    if (!amount || !paymentDate) {
      return NextResponse.json(
        { error: 'Amount and payment date are required' },
        { status: 400 }
      )
    }

    const invoice = await prisma.invoice.findUnique({
      where: { id: params.id },
      include: { payments: true },
    })

    if (!invoice || invoice.deletedAt) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })
    }

    const paymentAmount = new Decimal(amount)
    const newPaidAmount = new Decimal(invoice.paidAmount.toString()).plus(
      paymentAmount
    )
    const outstanding = new Decimal(invoice.totalAmount.toString())
      .plus(new Decimal(invoice.adjustments.toString()))
      .minus(newPaidAmount)

    // Determine new status
    let newStatus = invoice.status
    if (outstanding.lessThanOrEqualTo(0)) {
      newStatus = 'PAID'
    } else if (newPaidAmount.greaterThan(0)) {
      newStatus = 'PARTIALLY_PAID'
    }

    const result = await prisma.$transaction(async (tx) => {
      // Create payment
      const payment = await tx.payment.create({
        data: {
          invoiceId: params.id,
          amount: paymentAmount,
          paymentDate: new Date(paymentDate),
          referenceNumber: referenceNumber || null,
          notes: notes || null,
        },
      })

      // Update invoice
      await tx.invoice.update({
        where: { id: params.id },
        data: {
          paidAmount: newPaidAmount,
          outstanding,
          status: newStatus,
        },
      })

      return payment
    })

    // Log audit
    await logPayment('Invoice', params.id, session.user.id, {
      paymentId: result.id,
      amount: paymentAmount.toString(),
      paymentDate: paymentDate,
      referenceNumber: referenceNumber || null,
      newPaidAmount: newPaidAmount.toString(),
      newStatus: newStatus,
    })

    return NextResponse.json(result, { status: 201 })
  } catch (error) {
    console.error('Error recording payment:', error)
    return NextResponse.json(
      { error: 'Failed to record payment' },
      { status: 500 }
    )
  }
}
