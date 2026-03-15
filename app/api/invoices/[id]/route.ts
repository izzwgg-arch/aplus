import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { Decimal } from '@prisma/client/runtime/library'

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const invoice = await prisma.invoice.findUnique({
      where: { id: params.id },
      include: {
        client: {
          include: { insurance: true },
        },
        entries: {
          include: {
            provider: true,
            timesheet: {
              include: {
                entries: true,
                bcba: true,
              },
            },
          },
        },
        timesheets: {
          where: {
            deletedAt: null,
          },
          include: {
            entries: {
              orderBy: {
                date: 'asc',
              },
            },
            client: {
              include: {
                insurance: true,
              },
            },
            provider: true,
            bcba: true,
          },
        },
        payments: {
          orderBy: { paymentDate: 'desc' },
        },
        adjustmentsList: {
          orderBy: { createdAt: 'desc' },
        },
        creator: {
          select: { email: true },
        },
      },
    })

    if (!invoice || invoice.deletedAt) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })
    }

    return NextResponse.json(invoice)
  } catch (error) {
    console.error('Error fetching invoice:', error)
    return NextResponse.json(
      { error: 'Failed to fetch invoice' },
      { status: 500 }
    )
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session || session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const invoice = await prisma.invoice.findUnique({
      where: { id: params.id },
    })

    if (!invoice || invoice.deletedAt) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })
    }

    // Only DRAFT and READY invoices can be edited
    if (!['DRAFT', 'READY'].includes(invoice.status)) {
      return NextResponse.json(
        { error: 'Only draft or ready invoices can be edited' },
        { status: 400 }
      )
    }

    const data = await request.json()
    const { status, checkNumber, notes, regularRatePerUnit, bcbaRatePerUnit } = data

    const shouldUpdateRates =
      (regularRatePerUnit !== null && regularRatePerUnit !== undefined) ||
      (bcbaRatePerUnit !== null && bcbaRatePerUnit !== undefined)

    const updated = await prisma.$transaction(async (tx) => {
      if (shouldUpdateRates) {
        const entries = await tx.invoiceEntry.findMany({
          where: { invoiceId: params.id },
          include: { timesheet: { select: { isBCBA: true } } },
        })

        let totalAmount = new Decimal(0)
        for (const entry of entries) {
          const isBCBA = entry.timesheet?.isBCBA === true
          const rate =
            isBCBA && bcbaRatePerUnit !== null && bcbaRatePerUnit !== undefined
              ? new Decimal(bcbaRatePerUnit)
              : !isBCBA && regularRatePerUnit !== null && regularRatePerUnit !== undefined
                ? new Decimal(regularRatePerUnit)
                : new Decimal(entry.rate.toString())

          const units = new Decimal(entry.units.toString())
          const shouldCharge = isBCBA || new Decimal(entry.amount.toString()).greaterThan(0)
          const amount = shouldCharge ? units.times(rate) : new Decimal(0)

          await tx.invoiceEntry.update({
            where: { id: entry.id },
            data: {
              rate: rate,
              amount: amount,
            },
          })

          totalAmount = totalAmount.plus(amount)
        }

        const paidAmount = new Decimal(invoice.paidAmount.toString())
        const adjustments = new Decimal(invoice.adjustments.toString())
        const outstanding = totalAmount.plus(adjustments).minus(paidAmount)
        let newStatus = status || invoice.status
        if (outstanding.lessThanOrEqualTo(0)) {
          newStatus = 'PAID'
        } else if (paidAmount.greaterThan(0)) {
          newStatus = 'PARTIALLY_PAID'
        }

        return tx.invoice.update({
          where: { id: params.id },
          data: {
            status: newStatus,
            checkNumber: checkNumber !== undefined ? checkNumber : invoice.checkNumber,
            notes: notes !== undefined ? notes : invoice.notes,
            totalAmount,
            outstanding,
          },
        })
      }

      return tx.invoice.update({
        where: { id: params.id },
        data: {
          status: status || invoice.status,
          checkNumber: checkNumber !== undefined ? checkNumber : invoice.checkNumber,
          notes: notes !== undefined ? notes : invoice.notes,
        },
      })
    })

    return NextResponse.json(updated)
  } catch (error) {
    console.error('Error updating invoice:', error)
    return NextResponse.json(
      { error: 'Failed to update invoice' },
      { status: 500 }
    )
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session || session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const invoice = await prisma.invoice.findUnique({
      where: { id: params.id },
    })

    if (!invoice || invoice.deletedAt) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })
    }

    // Only DRAFT invoices can be deleted
    if (invoice.status !== 'DRAFT') {
      return NextResponse.json(
        { error: 'Only draft invoices can be deleted' },
        { status: 400 }
      )
    }

    await prisma.invoice.update({
      where: { id: params.id },
      data: { deletedAt: new Date() },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting invoice:', error)
    return NextResponse.json(
      { error: 'Failed to delete invoice' },
      { status: 500 }
    )
  }
}
