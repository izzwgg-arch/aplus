/**
 * PDF Generator for Employee Monthly Payroll Reports
 * Uses Playwright to convert HTML to PDF
 */

import { generateEmployeeMonthlyReportHTML } from './payrollEmployeeMonthlyReportHtml'
import { generatePDFFromHTML } from './playwrightPDF'

export async function generateEmployeeMonthlyReportPDF(data: {
  employee: {
    id: string
    fullName: string
    email?: string | null
    phone?: string | null
    defaultHourlyRate: number
  }
  period: {
    year: number
    month: number
    monthName: string
  }
  summary: {
    totalHours: number
    hourlyRate: number
    grossPay: number
    totalPaid: number
    totalOwed: number
  }
  breakdown: Array<{
    date: Date | string
    sourceImport?: string | null
    hours: number
    rate: number
    gross: number
  }>
  payments: Array<{
    date: Date | string
    amount: number
    method: string
    reference?: string | null
  }>
}): Promise<Buffer> {
  const html = generateEmployeeMonthlyReportHTML(data)
  return await generatePDFFromHTML(html)
}
