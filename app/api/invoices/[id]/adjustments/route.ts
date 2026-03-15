import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { Decimal } from '@prisma/client/runtime/library'
import { logAdjustment } from '@/lib/audit'

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
    const { amount, reason } = data

    if (!amount || !reason || !reason.trim()) {
      return NextResponse.json(
        { error: 'Amount and reason are required' },
        { status: 400 }
      )
    }

    const invoice = await prisma.invoice.findUnique({
      where: { id: params.id },
    })

    if (!invoice || invoice.deletedAt) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })
    }

    const adjustmentAmount = new Decimal(amount)
    const newAdjustments = new Decimal(invoice.adjustments.toString()).plus(
      adjustmentAmount
    )
    const outstanding = new Decimal(invoice.totalAmount.toString())
      .plus(newAdjustments)
      .minus(new Decimal(invoice.paidAmount.toString()))

    const result = await prisma.$transaction(async (tx) => {
      // Create adjustment
      const adjustment = await tx.invoiceAdjustment.create({
        data: {
          invoiceId: params.id,
          amount: adjustmentAmount,
          reason: reason.trim(),
          createdBy: session.user.id,
        },
      })

      // Update invoice
      await tx.invoice.update({
        where: { id: params.id },
        data: {
          adjustments: newAdjustments,
          outstanding,
        },
      })

      return adjustment
    })

    // Log audit
    await logAdjustment('Invoice', params.id, session.user.id, {
      adjustmentId: result.id,
      amount: adjustmentAmount.toString(),
      reason: reason.trim(),
      newAdjustments: newAdjustments.toString(),
      newOutstanding: outstanding.toString(),
    })

    return NextResponse.json(result, { status: 201 })
  } catch (error) {
    console.error('Error creating adjustment:', error)
    return NextResponse.json(
      { error: 'Failed to create adjustment' },
      { status: 500 }
    )
  }
}
