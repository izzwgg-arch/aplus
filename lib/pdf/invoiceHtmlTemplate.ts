/**
 * HTML Template for Invoice PDF Generation
 * 
 * This template generates a self-contained HTML document with modern styling
 * matching the timesheet PDF design.
 * 
 * Used by Playwright to render PDFs with consistent styling.
 */

import { format } from 'date-fns'

export interface InvoiceForHTML {
  id: string
  invoiceNumber?: string
  createdAt: Date | string
  serviceDate?: Date | string
  totalAmount: number | string
  units?: number
  notes?: string | null
  client: {
    firstName?: string
    lastName?: string
    name?: string
    address?: string | null
    city?: string | null
    state?: string | null
    zipCode?: string | null
    medicaidId?: string | null
    idNumber?: string | null
  }
  class?: {
    name: string
  } | null
  description?: string
  entries?: Array<{
    date: Date | string
    description: string
    units?: number
    amount: number | string
  }>
  branding?: {
    orgName: string
    tagline?: string
    addressLine?: string
    phoneLine?: string
    emailLine?: string
  }
}

/**
 * Generate HTML string for invoice PDF
 */
export function generateInvoiceHTML(invoice: InvoiceForHTML): string {
  const serviceDate = invoice.serviceDate ? new Date(invoice.serviceDate) : new Date(invoice.createdAt)
  const monthYear = format(serviceDate, 'MMMM yyyy')
  const dateStr = format(serviceDate, 'M/dd')
  
  // Client name - support both name format (regular) and firstName/lastName (community)
  const clientName = invoice.client.name 
    ? invoice.client.name
    : `${invoice.client.firstName || ''} ${invoice.client.lastName || ''}`.trim()
  
  const medicaidIdDisplay = invoice.client?.medicaidId || invoice.client?.idNumber || 'N/A'
  
  const description = invoice.class?.name || invoice.description || 'N/A'
  
  const entries = invoice.entries || []
  let totalAmount = 0
  
  if (entries.length > 0) {
    entries.forEach(entry => {
      const entryAmount = typeof entry.amount === 'number' 
        ? entry.amount 
        : (typeof entry.amount === 'string' ? Number(entry.amount) || 0 : 0)
      totalAmount += entryAmount
    })
  } else {
    const invTotal = typeof invoice.totalAmount === 'number' 
      ? invoice.totalAmount 
      : (typeof invoice.totalAmount === 'string' ? Number(invoice.totalAmount) || 0 : 0)
    totalAmount = invTotal
  }
  
  const orgName = invoice.branding?.orgName || 'INVOICE'
  const tagline = invoice.branding?.tagline
  const addressLine = invoice.branding?.addressLine
  const phoneLine = invoice.branding?.phoneLine
  const emailLine = invoice.branding?.emailLine
  
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Invoice - ${invoice.invoiceNumber || invoice.id}</title>
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
      padding: 0.4in;
      line-height: 1.3;
    }
    
    /* Modern Header with Gradient */
    .modern-header {
      margin-bottom: 12px;
    }
    
    .header-gradient {
      background: linear-gradient(135deg, #0066cc 0%, #004499 100%);
      padding: 10px 20px;
      border-radius: 8px;
      box-shadow: 0 2px 6px rgba(0, 102, 204, 0.3);
      position: relative;
      overflow: hidden;
    }
    
    /* KJ Play Center Header Style (for community invoices) */
    .kj-header {
      margin-bottom: 20px;
      text-align: center;
    }
    
    .kj-header-company-name {
      color: #0066CC;
      font-size: 48px;
      font-weight: 700;
      margin: 0;
      margin-bottom: 12px;
      letter-spacing: 2px;
    }
    
    .kj-header-tagline {
      color: #333;
      font-size: 16px;
      margin: 0;
      margin-bottom: 10px;
      font-weight: 500;
    }
    
    .kj-header-contact {
      color: #666;
      font-size: 13px;
      margin: 0;
      line-height: 1.6;
      font-weight: 500;
    }
    
    .header-gradient::before {
      content: '';
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      height: 3px;
      background: linear-gradient(90deg, #00aaff 0%, #0066cc 50%, #004499 100%);
    }
    
    .header-gradient h1 {
      color: #ffffff;
      font-size: 24px;
      font-weight: 700;
      margin: 0;
      text-align: center;
      letter-spacing: 0.5px;
      text-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
    }
    
    .header-accent-line {
      height: 2px;
      background: rgba(255, 255, 255, 0.3);
      margin-top: 8px;
      border-radius: 2px;
    }
    
    .header-tagline {
      color: #ffffff;
      font-size: 10px;
      text-align: center;
      margin-top: 6px;
      opacity: 0.9;
    }
    
    .header-contact {
      color: #ffffff;
      font-size: 9px;
      text-align: center;
      margin-top: 4px;
      opacity: 0.85;
    }
    
    /* Modern Info Cards */
    .info-card {
      background: #f8fafc;
      border: 2px solid #e2e8f0;
      border-radius: 8px;
      padding: 10px 12px;
      margin-bottom: 12px;
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 16px;
    }
    
    /* Info card for community invoices (2 columns, no Invoice ID) */
    .info-card-community {
      background: #f8fafc;
      border: 2px solid #e2e8f0;
      border-radius: 8px;
      padding: 10px 12px;
      margin-bottom: 12px;
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 16px;
    }
    
    .info-item {
      margin-bottom: 0;
    }
    
    .info-label {
      font-weight: 600;
      color: #475569;
      text-transform: uppercase;
      font-size: 9px;
      letter-spacing: 0.5px;
      margin-bottom: 2px;
    }
    
    .info-value {
      font-weight: 600;
      color: #1e293b;
      font-size: 13px;
      margin-top: 2px;
    }
    
    /* Modern Table Design */
    .modern-table-container {
      background: #ffffff;
      border-radius: 8px;
      overflow: hidden;
      box-shadow: 0 2px 6px rgba(0, 0, 0, 0.08);
      border: 1px solid #e2e8f0;
      margin-bottom: 12px;
    }
    
    table {
      width: 100%;
      border-collapse: separate;
      border-spacing: 0;
    }
    
    th {
      background: linear-gradient(135deg, #0066cc 0%, #004499 100%);
      color: #ffffff;
      font-size: 10px;
      font-weight: 700;
      padding: 8px 10px;
      text-align: left;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      border: none;
    }
    
    th:first-child {
      border-top-left-radius: 8px;
    }
    
    th:last-child {
      border-top-right-radius: 8px;
    }
    
    td {
      border-bottom: 1px solid #e2e8f0;
      padding: 6px 10px;
      font-size: 12px;
    }
    
    tbody tr:nth-child(even) {
      background: #ffffff;
    }
    
    tbody tr:nth-child(odd) {
      background: #f8fafc;
    }
    
    .date-badge {
      display: inline-block;
      background: linear-gradient(135deg, #e0f2fe 0%, #bae6fd 100%);
      color: #0369a1;
      padding: 4px 8px;
      border-radius: 6px;
      font-weight: 600;
      font-size: 12px;
      border: 1px solid #7dd3fc;
      box-shadow: 0 1px 3px rgba(3, 105, 161, 0.1);
    }
    
    .totals {
      display: flex;
      justify-content: flex-end;
      gap: 24px;
      margin-bottom: 12px;
      font-weight: bold;
      font-size: 13px;
      background: #f8fafc;
      border: 2px solid #e2e8f0;
      border-radius: 8px;
      padding: 10px 14px;
    }
    
    .notes {
      background: #f8fafc;
      border: 2px solid #e2e8f0;
      border-radius: 8px;
      padding: 10px 12px;
      margin-bottom: 12px;
      font-size: 10px;
      color: #475569;
    }
    
    .notes-label {
      font-weight: 600;
      color: #475569;
      text-transform: uppercase;
      font-size: 9px;
      letter-spacing: 0.5px;
      margin-bottom: 4px;
    }
    
    /* Print Styles */
    @media print {
      body {
        padding: 0.3in;
      }
      
      /* Prevent page breaks inside timesheet entry rows */
      tbody tr {
        page-break-inside: avoid;
        break-inside: avoid;
      }
      
      /* Keep header on first page only */
      .modern-header {
        page-break-after: avoid;
        break-after: avoid;
      }
      
      /* Keep info card together */
      .info-card {
        page-break-after: avoid;
        break-after: avoid;
      }
      
      /* Keep table header with content */
      thead {
        display: table-header-group;
      }
      
      /* Keep totals with last entry */
      .totals {
        page-break-inside: avoid;
        break-inside: avoid;
        page-break-after: auto;
        break-after: auto;
      }
      
      /* Ensure notes stay with totals if possible */
      .notes {
        page-break-inside: avoid;
        break-inside: avoid;
      }
      
      /* Prevent orphaned rows */
      tbody tr:first-child {
        page-break-before: avoid;
        break-before: avoid;
      }
    }
  </style>
</head>
<body>
  ${invoice.branding?.orgName === 'KJ PLAY CENTER' ? `
  <!-- KJ Play Center Header -->
  <div class="kj-header">
    <div class="kj-header-company-name">${orgName}</div>
    ${tagline ? `<div class="kj-header-tagline">${tagline}</div>` : ''}
    ${(addressLine || phoneLine || emailLine) ? `
    <div class="kj-header-contact">
      ${addressLine || ''}${addressLine && (phoneLine || emailLine) ? ' / ' : ''}
      ${phoneLine ? `P.${phoneLine}` : ''}${phoneLine && emailLine ? ' / ' : ''}
      ${emailLine ? `E.${emailLine}` : ''}
    </div>
    ` : ''}
  </div>
  ` : `
  <!-- Regular Modern Header -->
  <div class="modern-header">
    <div class="header-gradient">
      <h1>${orgName}</h1>
      ${tagline ? `<div class="header-tagline">${tagline}</div>` : ''}
      ${(addressLine || phoneLine || emailLine) ? `
      <div class="header-contact">
        ${addressLine || ''}${addressLine && (phoneLine || emailLine) ? ' / ' : ''}
        ${phoneLine ? `P.${phoneLine}` : ''}${phoneLine && emailLine ? ' / ' : ''}
        ${emailLine ? `E.${emailLine}` : ''}
      </div>
      ` : ''}
      <div class="header-accent-line"></div>
    </div>
  </div>
  `}
  
  <!-- Info card with Bill To, Date, Invoice Number, Medicaid ID, Description -->
  <div class="${invoice.branding?.orgName === 'KJ PLAY CENTER' ? 'info-card-community' : 'info-card'}">
    <div class="info-item">
      <span class="info-label">Bill To</span>
      <div class="info-value">${clientName}</div>
    </div>
    <div class="info-item">
      <span class="info-label">Date</span>
      <div class="info-value">${monthYear}</div>
    </div>
    <div class="info-item">
      <span class="info-label">Invoice Number</span>
      <div class="info-value">${invoice.invoiceNumber || invoice.id}</div>
    </div>
    <div class="info-item">
      <span class="info-label">Medicaid ID</span>
      <div class="info-value">${medicaidIdDisplay}</div>
    </div>
    <div class="info-item">
      <span class="info-label">${invoice.class ? 'Class Name' : 'Description'}</span>
      <div class="info-value">${description}</div>
    </div>
    ${invoice.branding?.orgName !== 'KJ PLAY CENTER' ? `
    <div class="info-item">
      <span class="info-label">Invoice ID</span>
      <div class="info-value">${invoice.id}</div>
    </div>
    ` : ''}
  </div>
  
  <div class="modern-table-container">
  <table>
    <thead>
      <tr>
        <th>Date</th>
        <th>Description</th>
        <th>Units</th>
        <th>Total</th>
      </tr>
    </thead>
    <tbody>
      ${entries.length > 0 ? entries.map((entry) => {
        const entryDate = entry.date ? new Date(entry.date) : serviceDate
        const entryDateStr = format(entryDate, 'M/dd')
        const entryAmount = typeof entry.amount === 'number' 
          ? entry.amount 
          : (typeof entry.amount === 'string' ? Number(entry.amount) || 0 : 0)
        return `
        <tr>
          <td><span class="date-badge">${entryDateStr}</span></td>
          <td>${entry.description || 'N/A'}</td>
          <td>${entry.units || 0}</td>
          <td>$${entryAmount.toFixed(2)}</td>
        </tr>
        `
      }).join('') : `
        <tr>
          <td><span class="date-badge">${dateStr}</span></td>
          <td>${description}</td>
          <td>${invoice.units || 0}</td>
          <td>$${totalAmount.toFixed(2)}</td>
        </tr>
      `}
    </tbody>
  </table>
  </div>
  
  <div class="totals">
    <div>Total: <span>$${totalAmount.toFixed(2)}</span></div>
  </div>
  
  ${invoice.notes ? `
  <div class="notes">
    <div class="notes-label">Notes</div>
    <div>${invoice.notes}</div>
  </div>
  ` : ''}
</body>
</html>`
}
