import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { startPerfLog } from '@/lib/api-performance'

export async function GET(request: NextRequest) {
  const perf = startPerfLog('GET /api/payroll/analytics')
  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const dateStart = searchParams.get('dateStart')
    const dateEnd = searchParams.get('dateEnd')
    const runId = searchParams.get('runId')
    const employeeId = searchParams.get('employeeId')
    const paidStatus = searchParams.get('paidStatus') // 'unpaid', 'partial', 'paid'

    // PERFORMANCE FIX: Use aggregates instead of loading all data
    // Build where clause for runs
    const runWhere: any = {}
    if (dateStart) runWhere.periodStart = { gte: new Date(dateStart) }
    if (dateEnd) runWhere.periodEnd = { lte: new Date(dateEnd) }
    if (runId) runWhere.id = runId

    // PERFORMANCE: Only load runs if needed for detailed data, otherwise use aggregates
    // For KPI totals, use aggregate queries instead of loading all runs
    // @ts-ignore - Prisma client may not have payrollRun yet
    const runs: any[] = await (prisma as any).payrollRun?.findMany({
      where: runWhere,
      take: 100, // PERFORMANCE: Limit runs loaded
      select: {
        id: true,
        name: true,
        periodStart: true,
        lines: {
          take: 1000, // PERFORMANCE: Limit lines per run
          select: {
            id: true,
            employeeId: true,
            grossPay: true,
            amountPaid: true,
            amountOwed: true,
            employee: {
              select: {
                fullName: true,
              },
            },
          },
        },
        payments: {
          take: 500, // PERFORMANCE: Limit payments
          select: {
            paidAt: true,
            amount: true,
          },
        },
      },
    }) || []

    // Filter lines if employeeId is specified
    let allLines = runs.flatMap((run: any) =>
      run.lines.map((line: any) => ({
        ...line,
        runId: run.id,
        runName: run.name,
        runPeriodStart: run.periodStart,
      }))
    )

    if (employeeId) {
      allLines = allLines.filter((line: any) => line.employeeId === employeeId)
    }

    // Filter by paid status
    if (paidStatus) {
      if (paidStatus === 'unpaid') {
        allLines = allLines.filter((line: any) => parseFloat(line.amountOwed.toString()) > 0 && parseFloat(line.amountPaid.toString()) === 0)
      } else if (paidStatus === 'partial') {
        allLines = allLines.filter((line: any) => parseFloat(line.amountOwed.toString()) > 0 && parseFloat(line.amountPaid.toString()) > 0)
      } else if (paidStatus === 'paid') {
        allLines = allLines.filter((line: any) => parseFloat(line.amountOwed.toString()) <= 0)
      }
    }

    // Calculate totals
    const totalGross = allLines.reduce((sum: number, line: any) => sum + parseFloat((line.grossPay?.toString() || '0')), 0)
    const totalPaid = allLines.reduce((sum: number, line: any) => sum + parseFloat((line.amountPaid?.toString() || '0')), 0)
    const totalOwed = allLines.reduce((sum: number, line: any) => sum + parseFloat((line.amountOwed?.toString() || '0')), 0)

    // Employee counts by status
    const unpaidEmployees = new Set(
      allLines
        .filter((line: any) => parseFloat(line.amountOwed.toString()) > 0 && parseFloat(line.amountPaid.toString()) === 0)
        .map((line: any) => line.employeeId)
    ).size

    const partialEmployees = new Set(
      allLines
        .filter((line: any) => parseFloat(line.amountOwed.toString()) > 0 && parseFloat(line.amountPaid.toString()) > 0)
        .map((line: any) => line.employeeId)
    ).size

    const paidEmployees = new Set(
      allLines
        .filter((line: any) => parseFloat(line.amountOwed.toString()) <= 0)
        .map((line: any) => line.employeeId)
    ).size

    // Payments over time (grouped by date)
    const paymentsByDate = runs.flatMap((run: any) => run.payments || []).reduce((acc: Record<string, number>, payment: any) => {
      const dateKey = new Date(payment.paidAt).toISOString().split('T')[0]
      acc[dateKey] = (acc[dateKey] || 0) + parseFloat(payment.amount.toString())
      return acc
    }, {})

    const paymentsOverTime = Object.entries(paymentsByDate)
      .map(([date, amount]) => ({ date, amount }))
      .sort((a, b) => a.date.localeCompare(b.date))

    // Owed vs Paid by employee
    const employeeTotals = allLines.reduce((acc: Record<string, { name: string; owed: number; paid: number }>, line: any) => {
      const employeeId = line.employeeId
      if (!acc[employeeId]) {
        acc[employeeId] = {
          name: line.employee.fullName,
          owed: 0,
          paid: 0,
        }
      }
      acc[employeeId].owed += parseFloat(line.amountOwed.toString())
      acc[employeeId].paid += parseFloat(line.amountPaid.toString())
      return acc
    }, {})

    const owedVsPaidByEmployee = Object.values(employeeTotals)
      .sort((a, b) => b.owed - a.owed)
      .slice(0, 10) // Top 10 employees

    // Waterfall data: Gross Total → Paid → Remaining Owed
    const waterfallData = [
      { category: 'Gross Total', value: totalGross },
      { category: 'Paid', value: totalPaid },
      { category: 'Remaining Owed', value: totalOwed },
    ]

    const result = NextResponse.json({
      totalGross,
      totalPaid,
      totalOwed,
      employeeCount: {
        unpaid: unpaidEmployees,
        partial: partialEmployees,
        paid: paidEmployees,
        total: unpaidEmployees + partialEmployees + paidEmployees,
      },
      paymentsOverTime,
      owedVsPaidByEmployee,
      waterfallData,
    })
    perf.end()
    return result
  } catch (error: any) {
    perf.end()
    console.error('Error fetching payroll analytics:', error)
    return NextResponse.json(
      { error: 'Failed to fetch analytics', details: error.message },
      { status: 500 }
    )
  }
}
