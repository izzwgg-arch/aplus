import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { generatePDFFromHTML } from '@/lib/pdf/playwrightPDF'
import { generateEmployeeMonthlyReportHTML } from '@/lib/pdf/payrollEmployeeMonthlyReportHtml'
import { format } from 'date-fns'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ employeeId: string }> | { employeeId: string } }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const monthParam = searchParams.get('month') // Format: YYYY-MM

    if (!monthParam) {
      return NextResponse.json({ error: 'Month parameter is required (format: YYYY-MM)' }, { status: 400 })
    }

    const [year, month] = monthParam.split('-').map(Number)
    if (!year || !month || month < 1 || month > 12) {
      return NextResponse.json({ error: 'Invalid month format. Use YYYY-MM' }, { status: 400 })
    }

    const { employeeId } = await Promise.resolve(params)

    // Fetch employee
    const employee = await (prisma as any).payrollEmployee.findUnique({
      where: { id: employeeId },
    })

    if (!employee) {
      return NextResponse.json({ error: 'Employee not found' }, { status: 404 })
    }

    // Calculate period dates
    const periodStart = new Date(year, month - 1, 1)
    const periodEnd = new Date(year, month, 0, 23, 59, 59)

    // Get all run lines for this employee in the period
    // @ts-ignore - Prisma client may not have payrollRunLine yet
    const runLines: any[] = await (prisma as any).payrollRunLine?.findMany({
      where: {
        employeeId: employeeId,
        run: {
          periodStart: { lte: periodEnd },
          periodEnd: { gte: periodStart },
        },
      },
      include: {
        run: true,
        payments: {
          orderBy: { paidAt: 'asc' },
        },
      },
      orderBy: { run: { periodStart: 'asc' } },
    })

    // Get payments for this employee in the period (from all runs)
    const allPayments = runLines.flatMap((line: any) => 
      (line.payments || []).map((p: any) => ({
        date: p.paidAt,
        amount: parseFloat(p.amount.toString()),
        method: p.method,
        reference: p.reference,
      }))
    ).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())

    // Calculate summary
    const totalHours = runLines.reduce((sum, line) => sum + parseFloat(line.totalHours.toString()), 0)
    const grossPay = runLines.reduce((sum, line) => sum + parseFloat(line.grossPay.toString()), 0)
    const totalPaid = allPayments.reduce((sum, p) => sum + p.amount, 0)
    const totalOwed = grossPay - totalPaid

    // Build breakdown from run lines
    const breakdown = runLines.map((line: any) => ({
      date: line.run.periodStart,
      sourceImport: null, // We can add this if needed
      hours: parseFloat(line.totalHours.toString()),
      rate: parseFloat(line.hourlyRateUsed.toString()),
      gross: parseFloat(line.grossPay.toString()),
    }))

    // Generate HTML
    const html = generateEmployeeMonthlyReportHTML({
      employee: {
        id: employee.id,
        fullName: employee.fullName,
        email: employee.email,
        phone: employee.phone,
        defaultHourlyRate: parseFloat(employee.defaultHourlyRate.toString()),
      },
      period: {
        year,
        month,
        monthName: format(periodStart, 'MMMM'),
      },
      summary: {
        totalHours,
        hourlyRate: parseFloat(employee.defaultHourlyRate.toString()),
        grossPay,
        totalPaid,
        totalOwed,
      },
      breakdown,
      payments: allPayments,
    })

    // Generate PDF
    const pdfBuffer = await generatePDFFromHTML(html, `employee-monthly-${employeeId}-${monthParam}`)

    // Save artifact (optional - for tracking generated reports)
    try {
      // @ts-ignore - Prisma client may not have payrollReportArtifact yet
      await (prisma as any).payrollReportArtifact?.create({
        data: {
          type: 'EMPLOYEE_MONTHLY',
          employeeId: employeeId,
          year: year,
          month: month,
          storageKeyOrPath: `employee-${employeeId}-${year}-${month}.pdf`,
          generatedByUserId: session.user.id,
        },
      })
    } catch (artifactError) {
      // Log but don't fail if artifact creation fails
      console.warn('Failed to save report artifact:', artifactError)
    }

    // Return PDF
    return new NextResponse(new Uint8Array(pdfBuffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="employee-monthly-${employee.fullName.replace(/\s+/g, '-')}-${format(periodStart, 'yyyy-MM')}.pdf"`,
        'Content-Length': pdfBuffer.length.toString(),
      },
    })
  } catch (error: any) {
    console.error('Error generating employee monthly report PDF:', error)
    return NextResponse.json(
      { error: 'Failed to generate PDF', details: error.message },
      { status: 500 }
    )
  }
}
