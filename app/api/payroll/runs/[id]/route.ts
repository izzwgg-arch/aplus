import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> | { id: string } }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await Promise.resolve(params)

    const run = await prisma.payrollRun.findUnique({
      where: { id },
      include: {
        createdBy: {
          select: {
            id: true,
            username: true,
            email: true,
          },
        },
        lines: {
          include: {
            employee: true,
          },
          orderBy: { employee: { fullName: 'asc' } },
        },
        payments: {
          include: {
            employee: true,
            createdBy: {
              select: {
                id: true,
                username: true,
                email: true,
              },
            },
          },
          orderBy: { paidAt: 'desc' },
        },
      },
    })

    if (!run) {
      return NextResponse.json({ error: 'Payroll run not found' }, { status: 404 })
    }

    return NextResponse.json({ run })
  } catch (error: any) {
    console.error('Error fetching payroll run:', error)
    return NextResponse.json(
      { error: 'Failed to fetch payroll run', details: error.message },
      { status: 500 }
    )
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> | { id: string } }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await Promise.resolve(params)
    const body = await request.json()
    const { status, name, periodStart, periodEnd } = body

    const updateData: any = {}
    if (status !== undefined) updateData.status = status
    if (name !== undefined) updateData.name = name.trim()
    if (periodStart !== undefined) updateData.periodStart = new Date(periodStart)
    if (periodEnd !== undefined) updateData.periodEnd = new Date(periodEnd)

    // If status changed to APPROVED or PAID_FULL, update run status
    const run = await prisma.payrollRun.findUnique({
      where: { id },
      include: { lines: true },
    })

    if (!run) {
      return NextResponse.json({ error: 'Payroll run not found' }, { status: 404 })
    }

    // Update status based on payment status
    if (status === undefined) {
      const allPaid = run.lines.every(line => parseFloat(line.amountOwed.toString()) <= 0)
      const somePaid = run.lines.some(line => parseFloat(line.amountPaid.toString()) > 0)
      
      if (allPaid && run.lines.length > 0) {
        updateData.status = 'PAID_FULL'
      } else if (somePaid) {
        updateData.status = 'PAID_PARTIAL'
      }
    }

    const updatedRun = await prisma.payrollRun.update({
      where: { id },
      data: updateData,
    })

    return NextResponse.json({ run: updatedRun })
  } catch (error: any) {
    console.error('Error updating payroll run:', error)
    return NextResponse.json(
      { error: 'Failed to update payroll run', details: error.message },
      { status: 500 }
    )
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> | { id: string } }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await Promise.resolve(params)

    // Check if run exists
    const run = await prisma.payrollRun.findUnique({
      where: { id },
      include: {
        lines: true,
        payments: true,
      },
    })

    if (!run) {
      return NextResponse.json({ error: 'Payroll run not found' }, { status: 404 })
    }

    // Prevent deletion if there are payments (unless admin)
    if (run.payments.length > 0 && session.user.role !== 'ADMIN' && session.user.role !== 'SUPER_ADMIN') {
      return NextResponse.json(
        { error: 'Cannot delete payroll run with existing payments. Please remove payments first.' },
        { status: 400 }
      )
    }

    // Delete the run (cascade will delete lines and payments)
    await prisma.payrollRun.delete({
      where: { id },
    })

    return NextResponse.json({ success: true, message: 'Payroll run deleted successfully' })
  } catch (error: any) {
    console.error('Error deleting payroll run:', error)
    return NextResponse.json(
      { error: 'Failed to delete payroll run', details: error.message },
      { status: 500 }
    )
  }
}
