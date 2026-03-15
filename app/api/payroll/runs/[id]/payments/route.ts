import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> | { id: string } }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id: runId } = await Promise.resolve(params)
    const body = await request.json()
    const {
      employeeId,
      paidAt,
      amount,
      method,
      reference,
      notes,
      payrollRunLineId,
    } = body

    if (!employeeId || !paidAt || !amount || !method) {
      return NextResponse.json(
        { error: 'Employee ID, paid date, amount, and method are required' },
        { status: 400 }
      )
    }

    // Get or find the payroll run line
    // @ts-ignore - Prisma client may not have payrollRunLine yet
    let runLine: any = null
    if (payrollRunLineId) {
      runLine = await (prisma as any).payrollRunLine?.findUnique({
        where: { id: payrollRunLineId },
      })
    } else {
      runLine = await (prisma as any).payrollRunLine?.findFirst({
        where: {
          runId,
          employeeId,
        },
      })
    }

    if (!runLine) {
      return NextResponse.json(
        { error: 'Payroll run line not found' },
        { status: 404 }
      )
    }

    // Create payment record
    // @ts-ignore - Prisma client may not have payrollPayment yet
    const payment = await (prisma as any).payrollPayment?.create({
      data: {
        runId,
        employeeId,
        paidAt: new Date(paidAt),
        amount: parseFloat(amount),
        method: method as any,
        reference: reference?.trim() || null,
        notes: notes?.trim() || null,
        createdById: session.user.id,
        payrollRunLineId: runLine.id,
      },
    })

    // Update run line with new payment totals
    const currentAmountPaid = parseFloat(runLine.amountPaid.toString())
    const currentAmountOwed = parseFloat(runLine.amountOwed.toString())
    const newAmountPaid = currentAmountPaid + parseFloat(amount)
    const newAmountOwed = Math.max(0, currentAmountOwed - parseFloat(amount))

    // @ts-ignore - Prisma client may not have payrollRunLine yet
    await (prisma as any).payrollRunLine?.update({
      where: { id: runLine.id },
      data: {
        amountPaid: newAmountPaid,
        amountOwed: newAmountOwed,
      },
    })

    // Update run status based on payment totals
    // @ts-ignore - Prisma client may not have payrollRun yet
    const run: any = await (prisma as any).payrollRun?.findUnique({
      where: { id: runId },
      include: { lines: true },
    })

    if (run) {
      const allPaid = (run.lines || []).every((line: any) => parseFloat((line.amountOwed?.toString() || '0')) <= 0)
      const somePaid = (run.lines || []).some((line: any) => parseFloat((line.amountPaid?.toString() || '0')) > 0)
      
      let newStatus = run.status
      if (allPaid && (run.lines || []).length > 0) {
        newStatus = 'PAID_FULL'
      } else if (somePaid) {
        newStatus = 'PAID_PARTIAL'
      }

      if (newStatus !== run.status) {
        // @ts-ignore - Prisma client may not have payrollRun yet
        await (prisma as any).payrollRun?.update({
          where: { id: runId },
          data: { status: newStatus },
        })
      }
    }

    return NextResponse.json({ payment })
  } catch (error: any) {
    console.error('Error creating payment:', error)
    return NextResponse.json(
      { error: 'Failed to create payment', details: error.message },
      { status: 500 }
    )
  }
}
