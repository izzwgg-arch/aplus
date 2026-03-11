/**
 * HTML Template for Employee Monthly Payroll Report
 * 
 * Generates a professional monthly report for a specific employee
 */

import { format } from 'date-fns'

interface EmployeeMonthlyReportData {
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
}

export function generateEmployeeMonthlyReportHTML(data: EmployeeMonthlyReportData): string {
  const { employee, period, summary, breakdown, payments } = data

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
    }).format(value)
  }

  const formatDate = (date: Date | string) => {
    const d = typeof date === 'string' ? new Date(date) : date
    return format(d, 'MMM d, yyyy')
  }

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Employee Monthly Report - ${employee.fullName} - ${period.monthName} ${period.year}</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    
    body {
      font-family: Arial, Helvetica, sans-serif;
      font-size: 12px;
      color: #000;
      background: #fff;
      padding: 0.5in;
      line-height: 1.4;
    }
    
    .header {
      text-align: center;
      margin-bottom: 24px;
      border-bottom: 2px solid #000;
      padding-bottom: 16px;
    }
    
    .header h1 {
      font-size: 24px;
      font-weight: bold;
      margin-bottom: 8px;
    }
    
    .header .subtitle {
      font-size: 18px;
      color: #666;
    }
    
    .employee-info {
      margin-bottom: 24px;
    }
    
    .employee-info h2 {
      font-size: 16px;
      font-weight: bold;
      margin-bottom: 12px;
      border-bottom: 1px solid #ccc;
      padding-bottom: 8px;
    }
    
    .info-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 12px;
    }
    
    .info-item {
      margin-bottom: 8px;
    }
    
    .info-label {
      font-weight: bold;
      display: inline-block;
      width: 120px;
    }
    
    .summary-cards {
      display: grid;
      grid-template-columns: repeat(5, 1fr);
      gap: 12px;
      margin-bottom: 24px;
    }
    
    .summary-card {
      background: #f5f5f5;
      border: 1px solid #ddd;
      padding: 12px;
      border-radius: 4px;
      text-align: center;
    }
    
    .summary-card-label {
      font-size: 10px;
      color: #666;
      margin-bottom: 4px;
      text-transform: uppercase;
    }
    
    .summary-card-value {
      font-size: 16px;
      font-weight: bold;
      color: #000;
    }
    
    .section {
      margin-bottom: 32px;
    }
    
    .section-title {
      font-size: 14px;
      font-weight: bold;
      margin-bottom: 12px;
      border-bottom: 1px solid #ccc;
      padding-bottom: 6px;
    }
    
    table {
      width: 100%;
      border-collapse: collapse;
      border: 1px solid #000;
      margin-bottom: 16px;
    }
    
    th {
      background-color: #f0f0f0;
      border: 1px solid #000;
      padding: 8px;
      text-align: left;
      font-weight: bold;
      font-size: 11px;
    }
    
    td {
      border: 1px solid #000;
      padding: 6px 8px;
      font-size: 11px;
    }
    
    .text-right {
      text-align: right;
    }
    
    .text-center {
      text-align: center;
    }
    
    .footer {
      margin-top: 32px;
      padding-top: 16px;
      border-top: 1px solid #ccc;
      font-size: 10px;
      color: #666;
      text-align: center;
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>Smart Steps ABA</h1>
    <div class="subtitle">Employee Monthly Payroll Report</div>
  </div>
  
  <div class="employee-info">
    <h2>Employee Information</h2>
    <div class="info-grid">
      <div class="info-item">
        <span class="info-label">Name:</span> ${employee.fullName}
      </div>
      <div class="info-item">
        <span class="info-label">Period:</span> ${period.monthName} ${period.year}
      </div>
      ${employee.email ? `
      <div class="info-item">
        <span class="info-label">Email:</span> ${employee.email}
      </div>
      ` : ''}
      ${employee.phone ? `
      <div class="info-item">
        <span class="info-label">Phone:</span> ${employee.phone}
      </div>
      ` : ''}
    </div>
  </div>
  
  <div class="summary-cards">
    <div class="summary-card">
      <div class="summary-card-label">Total Hours</div>
      <div class="summary-card-value">${summary.totalHours.toFixed(2)}</div>
    </div>
    <div class="summary-card">
      <div class="summary-card-label">Hourly Rate</div>
      <div class="summary-card-value">${formatCurrency(summary.hourlyRate)}</div>
    </div>
    <div class="summary-card">
      <div class="summary-card-label">Gross Pay</div>
      <div class="summary-card-value">${formatCurrency(summary.grossPay)}</div>
    </div>
    <div class="summary-card">
      <div class="summary-card-label">Total Paid</div>
      <div class="summary-card-value">${formatCurrency(summary.totalPaid)}</div>
    </div>
    <div class="summary-card">
      <div class="summary-card-label">Amount Owed</div>
      <div class="summary-card-value">${formatCurrency(summary.totalOwed)}</div>
    </div>
  </div>
  
  <div class="section">
    <div class="section-title">Detailed Breakdown</div>
    <table>
      <thead>
        <tr>
          <th>Date</th>
          <th>Source Import</th>
          <th class="text-right">Hours</th>
          <th class="text-right">Rate</th>
          <th class="text-right">Gross Pay</th>
        </tr>
      </thead>
      <tbody>
        ${breakdown.length > 0 ? breakdown.map((row) => `
        <tr>
          <td>${formatDate(row.date)}</td>
          <td>${row.sourceImport || '-'}</td>
          <td class="text-right">${row.hours.toFixed(2)}</td>
          <td class="text-right">${formatCurrency(row.rate)}</td>
          <td class="text-right">${formatCurrency(row.gross)}</td>
        </tr>
        `).join('') : `
        <tr>
          <td colspan="5" class="text-center">No breakdown data available</td>
        </tr>
        `}
      </tbody>
    </table>
  </div>
  
  ${payments.length > 0 ? `
  <div class="section">
    <div class="section-title">Payments</div>
    <table>
      <thead>
        <tr>
          <th>Payment Date</th>
          <th class="text-right">Amount</th>
          <th>Method</th>
          <th>Reference</th>
        </tr>
      </thead>
      <tbody>
        ${payments.map((payment) => `
        <tr>
          <td>${formatDate(payment.date)}</td>
          <td class="text-right">${formatCurrency(payment.amount)}</td>
          <td>${payment.method}</td>
          <td>${payment.reference || '-'}</td>
        </tr>
        `).join('')}
      </tbody>
    </table>
  </div>
  ` : ''}
  
  <div class="footer">
    Generated on ${format(new Date(), 'MMMM d, yyyy \'at\' h:mm:ss a')}
  </div>
</body>
</html>`
}
