import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { Decimal } from '@prisma/client/runtime/library'
import { logPayment } from '@/lib/audit'

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string; paymentId: string } }
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

    const existingPayment = invoice.payments.find((p) => p.id === params.paymentId)
    if (!existingPayment) {
      return NextResponse.json({ error: 'Payment not found' }, { status: 404 })
    }

    const paymentAmount = new Decimal(amount)

    const result = await prisma.$transaction(async (tx) => {
      const updatedPayment = await tx.payment.update({
        where: { id: params.paymentId },
        data: {
          amount: paymentAmount,
          paymentDate: new Date(paymentDate),
          referenceNumber: referenceNumber || null,
          notes: notes || null,
        },
      })

      const paymentsTotal = await tx.payment.aggregate({
        _sum: { amount: true },
        where: { invoiceId: params.id },
      })
      const newPaidAmount = new Decimal(paymentsTotal._sum.amount?.toString() || '0')
      const outstanding = new Decimal(invoice.totalAmount.toString())
        .plus(new Decimal(invoice.adjustments.toString()))
        .minus(newPaidAmount)

      let newStatus = invoice.status
      if (outstanding.lessThanOrEqualTo(0)) {
        newStatus = 'PAID'
      } else if (newPaidAmount.greaterThan(0)) {
        newStatus = 'PARTIALLY_PAID'
      }

      await tx.invoice.update({
        where: { id: params.id },
        data: {
          paidAmount: newPaidAmount,
          outstanding,
          status: newStatus,
        },
      })

      return updatedPayment
    })

    await logPayment('Invoice', params.id, session.user.id, {
      paymentId: result.id,
      amount: paymentAmount.toString(),
      paymentDate: paymentDate,
      referenceNumber: referenceNumber || null,
      newStatus: 'UPDATED',
    })

    return NextResponse.json(result)
  } catch (error) {
    console.error('Error updating payment:', error)
    return NextResponse.json(
      { error: 'Failed to update payment' },
      { status: 500 }
    )
  }
}
