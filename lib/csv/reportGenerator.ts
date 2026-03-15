import { formatDate } from '../utils'

export function generateTimesheetSummaryCSV(data: any): string {
  const headers = [
    'ID',
    'Client',
    'Provider',
    'BCBA',
    'Start Date',
    'End Date',
    'Status',
    'Total Hours',
    'Total Units',
  ]

  const records = (data.timesheets || []).map((ts: any) => [
    ts.id,
    ts.client?.name || '',
    ts.provider?.name || '',
    ts.bcba?.name || '',
    formatDate(ts.startDate),
    formatDate(ts.endDate),
    ts.status,
    ((ts.totalMinutes || 0) / 60).toFixed(2),
    (ts.totalUnits || 0).toFixed(2),
  ])

  const rows = [headers, ...records].map((row) =>
    row.map((val: any) => `"${String(val).replace(/"/g, '""')}"`).join(',')
  )

  return rows.join('\n')
}

export function generateInvoiceSummaryCSV(data: any): string {
  const headers = [
    'Invoice Number',
    'Client',
    'Start Date',
    'End Date',
    'Status',
    'Total Amount',
    'Paid Amount',
    'Outstanding',
    'Created Date',
  ]

  const records = (data.invoices || []).map((inv: any) => [
    inv.invoiceNumber,
    inv.client?.name || '',
    formatDate(inv.startDate),
    formatDate(inv.endDate),
    inv.status,
    parseFloat(inv.totalAmount.toString()).toFixed(2),
    parseFloat(inv.paidAmount.toString()).toFixed(2),
    parseFloat(inv.outstanding.toString()).toFixed(2),
    formatDate(inv.createdAt),
  ])

  const rows = [headers, ...records].map((row) =>
    row.map((val: any) => `"${String(val).replace(/"/g, '""')}"`).join(',')
  )

  return rows.join('\n')
}

export function generateInsuranceBillingCSV(data: any): string {
  const headers = [
    'Insurance',
    'Total Billed',
    'Total Paid',
    'Outstanding',
    'Number of Invoices',
  ]

  const records = (data.insuranceBreakdown || []).map((item: any) => [
    item.insuranceName,
    item.totalBilled.toFixed(2),
    item.totalPaid.toFixed(2),
    item.outstanding.toFixed(2),
    item.invoiceCount,
  ])

  const rows = [headers, ...records].map((row) =>
    row.map((val: any) => `"${String(val).replace(/"/g, '""')}"`).join(',')
  )

  return rows.join('\n')
}

export function generateProviderPerformanceCSV(data: any): string {
  const headers = [
    'Provider',
    'Total Hours',
    'Total Units',
    'Timesheet Count',
    'Clients Served',
  ]

  const records = (data.providers || []).map((provider: any) => [
    provider.name,
    provider.totalHours.toFixed(2),
    provider.totalUnits.toFixed(2),
    provider.timesheetCount,
    provider.clientsServed || 0,
  ])

  const rows = [headers, ...records].map((row) =>
    row.map((val: any) => `"${String(val).replace(/"/g, '""')}"`).join(',')
  )

  return rows.join('\n')
}
