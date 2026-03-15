import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getUserPermissions } from '@/lib/permissions'
import { prisma } from '@/lib/prisma'
import { generateEmployeeMonthlyReportPDF } from '@/lib/pdf/employeeMonthlyReportPDF'

/**
 * GET /api/payroll/employee-reports/[employeeId]
 * 
 * Generate monthly employee report PDF
 * Permission: payroll.employee_reports
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ employeeId: string }> | { employeeId: string } }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const permissions = await getUserPermissions(session.user.id)
    const canGenerate = 
                        session.user.role === 'ADMIN' || 
                        session.user.role === 'SUPER_ADMIN'

    if (!canGenerate) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { employeeId } = await Promise.resolve(params)
    const searchParams = request.nextUrl.searchParams
    const monthParam = searchParams.get('month')
    const yearParam = searchParams.get('year')
    const month = monthParam ? parseInt(monthParam) : 1
    const year = yearParam ? parseInt(yearParam) : new Date().getFullYear()

    if (month < 1 || month > 12) {
      return NextResponse.json({ error: 'Invalid month' }, { status: 400 })
    }

    // Fetch employee
    const employee = await (prisma as any).payrollEmployee.findUnique({
      where: { id: employeeId },
    })

    if (!employee) {
      return NextResponse.json({ error: 'Employee not found' }, { status: 404 })
    }

    // Calculate date range for the month
    const startDate = new Date(year, month - 1, 1)
    const endDate = new Date(year, month, 0, 23, 59, 59, 999)

    // Fetch payroll run lines for the month
    const runLines = await prisma.payrollRunLine.findMany({
      where: {
        employeeId,
        run: {
          periodStart: { lte: endDate },
          periodEnd: { gte: startDate },
        },
      },
      include: {
        run: true,
        payments: true,
      },
      orderBy: { run: { periodStart: 'asc' } },
    })

    // Calculate summary
    const totalHours = runLines.reduce((sum, line) => sum + Number(line.totalHours), 0)
    const avgRate = runLines.length > 0 
      ? runLines.reduce((sum, line) => sum + Number(line.hourlyRateUsed), 0) / runLines.length
      : Number(employee.defaultHourlyRate)
    const totalGross = runLines.reduce((sum, line) => sum + Number(line.grossPay), 0)
    const totalPaid = runLines.reduce((sum, line) => sum + Number(line.amountPaid), 0)
    const totalOwed = runLines.reduce((sum, line) => sum + Number(line.amountOwed), 0)

    // Transform runLines to breakdown
    const breakdown = runLines.flatMap(line => {
      const days = Math.ceil((new Date(line.run.periodEnd).getTime() - new Date(line.run.periodStart).getTime()) / (1000 * 60 * 60 * 24)) + 1
      const dailyHours = Number(line.totalHours) / days
      const dailyGross = Number(line.grossPay) / days
      const dailyPaid = Number(line.amountPaid) / days
      const dailyOwed = Number(line.amountOwed) / days
      
      const entries = []
      const startDate = new Date(line.run.periodStart)
      for (let i = 0; i < days; i++) {
        const date = new Date(startDate)
        date.setDate(startDate.getDate() + i)
        entries.push({
          date,
          sourceImport: line.run.name || null,
          hours: dailyHours,
          rate: Number(line.hourlyRateUsed),
          gross: dailyGross,
        })
      }
      return entries
    })

    // Collect all payments
    const payments = runLines.flatMap(line => 
      line.payments.map(pay => ({
        date: pay.paidAt,
        amount: Number(pay.amount),
        method: pay.method || 'Unknown',
        reference: pay.reference || null,
      }))
    )

    // Generate PDF using the new report generator
    const pdfBuffer: Buffer = await generateEmployeeMonthlyReportPDF({
      employee: {
        id: employee.id,
        fullName: employee.fullName,
        email: employee.email || null,
        phone: employee.phone || null,
        defaultHourlyRate: Number(employee.defaultHourlyRate),
      },
      period: {
        year,
        month,
        monthName: new Date(year, month - 1).toLocaleString('default', { month: 'long' }),
      },
      summary: {
        totalHours,
        hourlyRate: avgRate,
        grossPay: totalGross,
        totalPaid,
        totalOwed,
      },
      breakdown,
      payments,
    })

    const safeFileName = employee.displayName.replace(/[^a-zA-Z0-9]/g, '_')
    const fileName = `employee-report-${safeFileName}-${month}-${year}.pdf`
    return new NextResponse(new Uint8Array(pdfBuffer), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${fileName}"`,
      },
    })
  } catch (error: any) {
    console.error('Error generating employee report:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to generate report' },
      { status: 500 }
    )
  }
}
