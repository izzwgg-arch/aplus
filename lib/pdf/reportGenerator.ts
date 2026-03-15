import PDFDocument from 'pdfkit'
import { formatDate } from '../utils'
import { format } from 'date-fns'

export function generateTimesheetSummaryPDF(data: any): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50 })
    const buffers: Buffer[] = []

    doc.on('data', buffers.push.bind(buffers))
    doc.on('end', () => resolve(Buffer.concat(buffers)))
    doc.on('error', reject)

  // Header
  doc.fontSize(20).text('Timesheet Summary Report', { align: 'center' })
  doc.moveDown()

  // Report metadata
  doc.fontSize(12).text(`Generated: ${format(new Date(), 'MM/dd/yyyy h:mm aa')}`, {
    align: 'right',
  })
  doc.moveDown(2)

  // Summary
  doc.fontSize(14).text('Summary', { underline: true })
  doc.moveDown(0.5)
  doc.fontSize(11).text(`Total Timesheets: ${data.total}`)
  doc.text(`Approved: ${data.approved}`)
  doc.text(`Rejected: ${data.rejected}`)
  doc.text(`Draft: ${data.draft}`)
  doc.text(`Date Range: ${formatDate(data.startDate)} - ${formatDate(data.endDate)}`)
  doc.moveDown()

  // Timesheet details
  if (data.timesheets && data.timesheets.length > 0) {
    doc.fontSize(14).text('Timesheet Details', { underline: true })
    doc.moveDown(0.5)

    data.timesheets.forEach((ts: any, index: number) => {
      if (index > 0) doc.moveDown()
      
      doc.fontSize(11)
      doc.font('Helvetica-Bold').text(`Timesheet ${index + 1}`, { continued: false })
      doc.font('Helvetica')
      doc.text(`Client: ${ts.client?.name || 'N/A'}`)
      doc.text(`Provider: ${ts.provider?.name || 'N/A'}`)
      doc.text(`BCBA: ${ts.bcba?.name || 'N/A'}`)
      doc.text(`Period: ${formatDate(ts.startDate)} - ${formatDate(ts.endDate)}`)
      doc.text(`Status: ${ts.status}`)
      doc.text(`Total Hours: ${(ts.totalMinutes / 60).toFixed(2)}`)
      
      if (index < data.timesheets.length - 1) {
        doc.moveDown(0.5)
        doc.moveTo(50, doc.y).lineTo(550, doc.y).stroke()
      }
    })
  }

  doc.end()
  })
}

export function generateInvoiceSummaryPDF(data: any): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50 })
    const buffers: Buffer[] = []

    doc.on('data', buffers.push.bind(buffers))
    doc.on('end', () => resolve(Buffer.concat(buffers)))
    doc.on('error', reject)

  // Header
  doc.fontSize(20).text('Invoice Summary Report', { align: 'center' })
  doc.moveDown()

  // Report metadata
  doc.fontSize(12).text(`Generated: ${format(new Date(), 'MM/dd/yyyy h:mm aa')}`, {
    align: 'right',
  })
  doc.moveDown(2)

  // Summary
  doc.fontSize(14).text('Summary', { underline: true })
  doc.moveDown(0.5)
  doc.fontSize(11)
  doc.text(`Total Invoices: ${data.total}`)
  doc.text(`Total Billed: $${data.totalBilled.toFixed(2)}`)
  doc.text(`Total Paid: $${data.totalPaid.toFixed(2)}`)
  doc.text(`Outstanding: $${data.totalOutstanding.toFixed(2)}`)
  doc.text(`Date Range: ${formatDate(data.startDate)} - ${formatDate(data.endDate)}`)
  doc.moveDown()

  // Invoice details
  if (data.invoices && data.invoices.length > 0) {
    doc.fontSize(14).text('Invoice Details', { underline: true })
    doc.moveDown(0.5)

    data.invoices.forEach((inv: any, index: number) => {
      if (index > 0) doc.moveDown()
      
      doc.fontSize(11)
      doc.font('Helvetica-Bold').text(`Invoice ${inv.invoiceNumber}`, { continued: false })
      doc.font('Helvetica')
      doc.text(`Client: ${inv.client?.name || 'N/A'}`)
      doc.text(`Period: ${formatDate(inv.startDate)} - ${formatDate(inv.endDate)}`)
      doc.text(`Status: ${inv.status}`)
      doc.text(`Amount: $${parseFloat(inv.totalAmount.toString()).toFixed(2)}`)
      doc.text(`Paid: $${parseFloat(inv.paidAmount.toString()).toFixed(2)}`)
      doc.text(`Outstanding: $${parseFloat(inv.outstanding.toString()).toFixed(2)}`)
      
      if (index < data.invoices.length - 1) {
        doc.moveDown(0.5)
        doc.moveTo(50, doc.y).lineTo(550, doc.y).stroke()
      }
    })
  }

    doc.end()
  })
}

export function generateInsuranceBillingPDF(data: any): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50 })
    const buffers: Buffer[] = []

    doc.on('data', buffers.push.bind(buffers))
    doc.on('end', () => resolve(Buffer.concat(buffers)))
    doc.on('error', reject)

    // Header
    doc.fontSize(20).text('Insurance Billing Report', { align: 'center' })
  doc.moveDown()

    // Report metadata
    doc.fontSize(12).text(`Generated: ${format(new Date(), 'MM/dd/yyyy h:mm aa')}`, {
      align: 'right',
    })
    doc.moveDown(2)

    // Summary by insurance
    doc.fontSize(14).text('Summary by Insurance', { underline: true })
    doc.moveDown(0.5)

    if (data.insuranceBreakdown && data.insuranceBreakdown.length > 0) {
      data.insuranceBreakdown.forEach((item: any, index: number) => {
        doc.fontSize(11)
        doc.font('Helvetica-Bold').text(item.insuranceName, { continued: false })
        doc.font('Helvetica')
        doc.text(`Total Billed: $${item.totalBilled.toFixed(2)}`)
        doc.text(`Total Paid: $${item.totalPaid.toFixed(2)}`)
        doc.text(`Outstanding: $${item.outstanding.toFixed(2)}`)
        doc.text(`Number of Invoices: ${item.invoiceCount}`)
        
        if (index < data.insuranceBreakdown.length - 1) {
          doc.moveDown(0.5)
          doc.moveTo(50, doc.y).lineTo(550, doc.y).stroke()
          doc.moveDown(0.5)
        }
      })
    }

    doc.end()
  })
}

export function generateProviderPerformancePDF(data: any): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50 })
    const buffers: Buffer[] = []

    doc.on('data', buffers.push.bind(buffers))
    doc.on('end', () => resolve(Buffer.concat(buffers)))
    doc.on('error', reject)

    // Header
    doc.fontSize(20).text('Provider Performance Report', { align: 'center' })
  doc.moveDown()

    // Report metadata
    doc.fontSize(12).text(`Generated: ${format(new Date(), 'MM/dd/yyyy h:mm aa')}`, {
      align: 'right',
    })
    doc.moveDown(2)

    // Provider performance
    doc.fontSize(14).text('Provider Performance', { underline: true })
    doc.moveDown(0.5)

    if (data.providers && data.providers.length > 0) {
      data.providers.forEach((provider: any, index: number) => {
        doc.fontSize(11)
        doc.font('Helvetica-Bold').text(provider.name, { continued: false })
        doc.font('Helvetica')
        doc.text(`Total Hours: ${provider.totalHours.toFixed(2)}`)
        doc.text(`Total Units: ${provider.totalUnits.toFixed(2)}`)
        doc.text(`Timesheet Count: ${provider.timesheetCount}`)
        doc.text(`Clients Served: ${provider.clientsServed || 0}`)
        
        if (index < data.providers.length - 1) {
          doc.moveDown(0.5)
          doc.moveTo(50, doc.y).lineTo(550, doc.y).stroke()
          doc.moveDown(0.5)
        }
      })
    }

    doc.end()
  })
}
