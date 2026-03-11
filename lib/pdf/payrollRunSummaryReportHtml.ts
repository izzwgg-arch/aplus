/**
 * HTML Template for Payroll Run Summary Report
 * 
 * Generates a professional summary report for a payroll run
 */

import { format } from 'date-fns'

interface RunSummaryReportData {
  run: {
    id: string
    name: string
    periodStart: Date | string
    periodEnd: Date | string
    status: string
    createdAt: Date | string
  }
  summary: {
    totalGross: number
    totalPaid: number
    totalOwed: number
    employeeCount: number
  }
  employees: Array<{
    employeeName: string
    totalHours: number
    hourlyRate: number
    grossPay: number
    amountPaid: number
    amountOwed: number
  }>
}

export function generateRunSummaryReportHTML(data: RunSummaryReportData): string {
  const { run, summary, employees } = data

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

  const periodStart = typeof run.periodStart === 'string' ? new Date(run.periodStart) : run.periodStart
  const periodEnd = typeof run.periodEnd === 'string' ? new Date(run.periodEnd) : run.periodEnd

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Payroll Run Summary - ${run.name}</title>
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
    
    .run-info {
      margin-bottom: 24px;
    }
    
    .run-info h2 {
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
      width: 140px;
    }
    
    .summary-cards {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
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
    <div class="subtitle">Payroll Run Summary Report</div>
  </div>
  
  <div class="run-info">
    <h2>Run Information</h2>
    <div class="info-grid">
      <div class="info-item">
        <span class="info-label">Run Name:</span> ${run.name}
      </div>
      <div class="info-item">
        <span class="info-label">Status:</span> ${run.status}
      </div>
      <div class="info-item">
        <span class="info-label">Period:</span> ${formatDate(periodStart)} - ${formatDate(periodEnd)}
      </div>
      <div class="info-item">
        <span class="info-label">Created:</span> ${formatDate(run.createdAt)}
      </div>
    </div>
  </div>
  
  <div class="summary-cards">
    <div class="summary-card">
      <div class="summary-card-label">Total Gross</div>
      <div class="summary-card-value">${formatCurrency(summary.totalGross)}</div>
    </div>
    <div class="summary-card">
      <div class="summary-card-label">Total Paid</div>
      <div class="summary-card-value">${formatCurrency(summary.totalPaid)}</div>
    </div>
    <div class="summary-card">
      <div class="summary-card-label">Total Owed</div>
      <div class="summary-card-value">${formatCurrency(summary.totalOwed)}</div>
    </div>
    <div class="summary-card">
      <div class="summary-card-label">Employees</div>
      <div class="summary-card-value">${summary.employeeCount}</div>
    </div>
  </div>
  
  <div class="section">
    <div class="section-title">Employee Totals</div>
    <table>
      <thead>
        <tr>
          <th>Employee Name</th>
          <th class="text-right">Hours</th>
          <th class="text-right">Rate</th>
          <th class="text-right">Gross Pay</th>
          <th class="text-right">Amount Paid</th>
          <th class="text-right">Amount Owed</th>
        </tr>
      </thead>
      <tbody>
        ${employees.length > 0 ? employees.map((emp) => `
        <tr>
          <td>${emp.employeeName}</td>
          <td class="text-right">${emp.totalHours.toFixed(2)}</td>
          <td class="text-right">${formatCurrency(emp.hourlyRate)}</td>
          <td class="text-right">${formatCurrency(emp.grossPay)}</td>
          <td class="text-right">${formatCurrency(emp.amountPaid)}</td>
          <td class="text-right">${formatCurrency(emp.amountOwed)}</td>
        </tr>
        `).join('') : `
        <tr>
          <td colspan="6" class="text-center">No employees in this run</td>
        </tr>
        `}
      </tbody>
      <tfoot>
        <tr style="font-weight: bold; background-color: #f0f0f0;">
          <td>Totals</td>
          <td class="text-right">${employees.reduce((sum, e) => sum + e.totalHours, 0).toFixed(2)}</td>
          <td class="text-right">-</td>
          <td class="text-right">${formatCurrency(summary.totalGross)}</td>
          <td class="text-right">${formatCurrency(summary.totalPaid)}</td>
          <td class="text-right">${formatCurrency(summary.totalOwed)}</td>
        </tr>
      </tfoot>
    </table>
  </div>
  
  <div class="footer">
    Generated on ${format(new Date(), 'MMMM d, yyyy \'at\' h:mm:ss a')}
  </div>
</body>
</html>`
}
