import * as XLSX from 'xlsx'
import { formatDate } from '../utils'

export function generateTimesheetSummaryExcel(data: any): Buffer {
  const records = (data.timesheets || []).map((ts: any) => ({
    ID: ts.id,
    Client: ts.client?.name || '',
    Provider: ts.provider?.name || '',
    BCBA: ts.bcba?.name || '',
    'Start Date': formatDate(ts.startDate),
    'End Date': formatDate(ts.endDate),
    Status: ts.status,
    'Total Hours': parseFloat(((ts.totalMinutes || 0) / 60).toFixed(2)),
    'Total Units': parseFloat((ts.totalUnits || 0).toFixed(2)),
  }))

  const worksheet = XLSX.utils.json_to_sheet(records)
  const workbook = XLSX.utils.book_new()

  // Add summary sheet
  const summaryData = [
    ['Timesheet Summary Report'],
    [`Generated: ${new Date().toLocaleString()}`],
    [],
    ['Summary'],
    [`Total Timesheets: ${data.total}`],
    [`Approved: ${data.approved}`],
    [`Rejected: ${data.rejected}`],
    [`Draft: ${data.draft}`],
    [`Date Range: ${formatDate(data.startDate)} - ${formatDate(data.endDate)}`],
  ]

  const summarySheet = XLSX.utils.aoa_to_sheet(summaryData)
  XLSX.utils.book_append_sheet(workbook, summarySheet, 'Summary')
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Timesheets')

  return Buffer.from(XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }))
}

export function generateInvoiceSummaryExcel(data: any): Buffer {
  const records = (data.invoices || []).map((inv: any) => ({
    'Invoice Number': inv.invoiceNumber,
    Client: inv.client?.name || '',
    'Start Date': formatDate(inv.startDate),
    'End Date': formatDate(inv.endDate),
    Status: inv.status,
    'Total Amount': parseFloat(inv.totalAmount.toString()),
    'Paid Amount': parseFloat(inv.paidAmount.toString()),
    Outstanding: parseFloat(inv.outstanding.toString()),
    'Created Date': formatDate(inv.createdAt),
  }))

  const worksheet = XLSX.utils.json_to_sheet(records)
  const workbook = XLSX.utils.book_new()

  // Add summary sheet
  const summaryData = [
    ['Invoice Summary Report'],
    [`Generated: ${new Date().toLocaleString()}`],
    [],
    ['Summary'],
    [`Total Invoices: ${data.total}`],
    [`Total Billed: $${data.totalBilled.toFixed(2)}`],
    [`Total Paid: $${data.totalPaid.toFixed(2)}`],
    [`Outstanding: $${data.totalOutstanding.toFixed(2)}`],
    [`Date Range: ${formatDate(data.startDate)} - ${formatDate(data.endDate)}`],
  ]

  const summarySheet = XLSX.utils.aoa_to_sheet(summaryData)
  XLSX.utils.book_append_sheet(workbook, summarySheet, 'Summary')
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Invoices')

  return Buffer.from(XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }))
}

export function generateInsuranceBillingExcel(data: any): Buffer {
  const records = (data.insuranceBreakdown || []).map((item: any) => ({
    Insurance: item.insuranceName,
    'Total Billed': parseFloat(item.totalBilled.toFixed(2)),
    'Total Paid': parseFloat(item.totalPaid.toFixed(2)),
    Outstanding: parseFloat(item.outstanding.toFixed(2)),
    'Number of Invoices': item.invoiceCount,
  }))

  const worksheet = XLSX.utils.json_to_sheet(records)
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Insurance Billing')

  return Buffer.from(XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }))
}

export function generateProviderPerformanceExcel(data: any): Buffer {
  const records = (data.providers || []).map((provider: any) => ({
    Provider: provider.name,
    'Total Hours': parseFloat(provider.totalHours.toFixed(2)),
    'Total Units': parseFloat(provider.totalUnits.toFixed(2)),
    'Timesheet Count': provider.timesheetCount,
    'Clients Served': provider.clientsServed || 0,
  }))

  const worksheet = XLSX.utils.json_to_sheet(records)
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Provider Performance')

  return Buffer.from(XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }))
}
