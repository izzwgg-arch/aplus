/**
 * PDF Generator for Payroll Run Reports
 * Uses Playwright to convert HTML to PDF
 */

import { generateRunSummaryReportHTML } from './payrollRunSummaryReportHtml'
import { generatePDFFromHTML } from './playwrightPDF'

export async function generatePayrollRunPDF(run: any): Promise<Buffer> {
  // Calculate summary data
  const lines = run.lines || []
  const summary = {
    totalGross: lines.reduce((sum: number, line: any) => sum + parseFloat(line.grossPay?.toString() || '0'), 0),
    totalPaid: lines.reduce((sum: number, line: any) => sum + parseFloat(line.amountPaid?.toString() || '0'), 0),
    totalOwed: lines.reduce((sum: number, line: any) => sum + parseFloat(line.amountOwed?.toString() || '0'), 0),
    employeeCount: lines.length,
  }

  const employees = lines.map((line: any) => ({
    employeeName: line.employee?.fullName || 'Unknown',
    totalHours: parseFloat(line.totalHours?.toString() || '0'),
    hourlyRate: parseFloat(line.hourlyRateUsed?.toString() || '0'),
    grossPay: parseFloat(line.grossPay?.toString() || '0'),
    amountPaid: parseFloat(line.amountPaid?.toString() || '0'),
    amountOwed: parseFloat(line.amountOwed?.toString() || '0'),
  }))

  const html = generateRunSummaryReportHTML({
    run: {
      id: run.id,
      name: run.name || 'Payroll Run',
      periodStart: run.periodStart,
      periodEnd: run.periodEnd,
      status: run.status,
      createdAt: run.createdAt,
    },
    summary,
    employees,
  })

  return await generatePDFFromHTML(html)
}
