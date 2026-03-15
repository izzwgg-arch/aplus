import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { generatePDFFromHTML } from '@/lib/pdf/playwrightPDF'
import { generateRunSummaryReportHTML } from '@/lib/pdf/payrollRunSummaryReportHtml'
import { format } from 'date-fns'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ runId: string }> | { runId: string } }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { runId } = await Promise.resolve(params)

    // Fetch run with all related data
    // @ts-ignore - Prisma client may not have payrollRun yet
    const run: any = await (prisma as any).payrollRun?.findUnique({
      where: { id: runId },
      include: {
        lines: {
          include: {
            employee: true,
          },
          orderBy: { employee: { fullName: 'asc' } },
        },
      },
    })

    if (!run) {
      return NextResponse.json({ error: 'Payroll run not found' }, { status: 404 })
    }

    // Calculate summary
    const totalGross = (run.lines || []).reduce((sum: number, line: any) => sum + parseFloat((line.grossPay?.toString() || '0')), 0)
    const totalPaid = (run.lines || []).reduce((sum: number, line: any) => sum + parseFloat((line.amountPaid?.toString() || '0')), 0)
    const totalOwed = (run.lines || []).reduce((sum: number, line: any) => sum + parseFloat((line.amountOwed?.toString() || '0')), 0)
    const employeeCount = (run.lines || []).length

    // Fetch detailed time entries for each employee from the source import
    const sourceImportId = run.sourceImportId
    let detailedEntriesByEmployee: Map<string, any[]> = new Map()
    
    if (sourceImportId) {
      const periodStart = new Date(run.periodStart)
      const periodEnd = new Date(run.periodEnd)
      periodEnd.setHours(23, 59, 59, 999)

      const employeeIds = (run.lines || []).map((line: any) => line.employeeId)
      
      if (employeeIds.length > 0) {
        const allEntries: any[] = await (prisma as any).payrollImportRow?.findMany({
          where: {
            importId: sourceImportId,
            linkedEmployeeId: { in: employeeIds },
            workDate: {
              gte: periodStart,
              lte: periodEnd,
            },
          },
          orderBy: [
            { linkedEmployeeId: 'asc' },
            { workDate: 'asc' },
          ],
        }) || []

        // Group entries by employee
        for (const entry of allEntries) {
          const empId = entry.linkedEmployeeId
          if (!detailedEntriesByEmployee.has(empId)) {
            detailedEntriesByEmployee.set(empId, [])
          }
          detailedEntriesByEmployee.get(empId)!.push(entry)
        }
      }
    }

    // Build employee data with detailed entries
    const employees = (run.lines || []).map((line: any) => {
      const entries = detailedEntriesByEmployee.get(line.employeeId) || []
      
      // Format detailed entries
      const formatTime = (date: Date | string | null) => {
        if (!date) return '-'
        const d = typeof date === 'string' ? new Date(date) : date
        return format(d, 'h:mm a')
      }

      const detailedTimeEntries = entries.map((entry: any) => {
        const hours = entry.hoursWorked 
          ? parseFloat(entry.hoursWorked.toString())
          : entry.minutesWorked 
            ? entry.minutesWorked / 60
            : 0
        
        return {
          date: entry.workDate,
          inTime: entry.inTime,
          outTime: entry.outTime,
          inTimeFormatted: formatTime(entry.inTime),
          outTimeFormatted: formatTime(entry.outTime),
          hours: hours,
        }
      })

      return {
        employeeName: line.employee.fullName,
        employeeId: line.employeeId,
        totalHours: parseFloat(line.totalHours.toString()),
        hourlyRate: parseFloat(line.hourlyRateUsed.toString()),
        grossPay: parseFloat(line.grossPay.toString()),
        amountPaid: parseFloat(line.amountPaid.toString()),
        amountOwed: parseFloat(line.amountOwed.toString()),
        detailedEntries: detailedTimeEntries,
      }
    })

    // Generate HTML
    const html = generateRunSummaryReportHTML({
      run: {
        id: run.id,
        name: run.name,
        periodStart: run.periodStart,
        periodEnd: run.periodEnd,
        status: run.status,
        createdAt: run.createdAt,
      },
      summary: {
        totalGross,
        totalPaid,
        totalOwed,
        employeeCount,
      },
      employees,
    })

    // Generate PDF
    const pdfBuffer = await generatePDFFromHTML(html, `run-summary-${runId}`)

    // Save artifact (optional - for tracking generated reports)
    try {
      // @ts-ignore - Prisma client may not have payrollReportArtifact yet
      await (prisma as any).payrollReportArtifact?.create({
        data: {
          type: 'RUN_SUMMARY',
          runId: runId,
          storageKeyOrPath: `run-${runId}-${format(new Date(), 'yyyy-MM-dd')}.pdf`,
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
        'Content-Disposition': `attachment; filename="payroll-run-${run.name.replace(/\s+/g, '-')}-${format(run.periodStart, 'yyyy-MM-dd')}.pdf"`,
        'Content-Length': pdfBuffer.length.toString(),
      },
    })
  } catch (error: any) {
    console.error('Error generating run summary report PDF:', error)
    return NextResponse.json(
      { error: 'Failed to generate PDF', details: error.message },
      { status: 500 }
    )
  }
}
