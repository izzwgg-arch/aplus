import PDFDocument from 'pdfkit'
import { format } from 'date-fns'

interface CommunityInvoiceForPDF {
  id: string
  client: {
    firstName: string
    lastName: string
    email?: string | null
    phone?: string | null
    address?: string | null
    city?: string | null
    state?: string | null
    zipCode?: string | null
    medicaidId?: string | null
  }
  class: {
    name: string
    ratePerUnit: number
  }
  units: number
  ratePerUnit: number
  totalAmount: number
  serviceDate?: string | null
  notes?: string | null
  createdAt: string
}

export async function generateCommunityInvoicePDF(invoice: CommunityInvoiceForPDF): Promise<Buffer> {
  const correlationId = `pdf-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
  
  console.error(`[COMMUNITY PDF] ${correlationId} Starting PDF generation for invoice ${invoice.id}`)
  
  return new Promise((resolve, reject) => {
    try {
      // Validate required data
      if (!invoice || !invoice.client || !invoice.class) {
        const error = new Error('Invalid invoice data: missing required fields')
        console.error(`[COMMUNITY PDF] ${correlationId} Validation failed:`, {
          hasInvoice: !!invoice,
          hasClient: !!invoice?.client,
          hasClass: !!invoice?.class,
        })
        reject(error)
        return
      }

      console.error(`[COMMUNITY PDF] ${correlationId} Creating PDFDocument...`)
      const doc = new PDFDocument({ margin: 50, size: 'LETTER' })
      const buffers: Buffer[] = []

      doc.on('data', buffers.push.bind(buffers))
      doc.on('end', () => {
        console.error(`[COMMUNITY PDF] ${correlationId} PDF generation completed successfully, buffer size: ${Buffer.concat(buffers).length} bytes`)
        resolve(Buffer.concat(buffers))
      })
      doc.on('error', (err: any) => {
        console.error(`[COMMUNITY PDF] ${correlationId} PDF generation error:`, {
          message: err?.message,
          code: err?.code,
          stack: err?.stack,
        })
        reject(err)
      })

      const pageWidth = doc.page.width
      const pageHeight = doc.page.height
      const margin = 50
      let currentY = 50

      // Draw border around entire page (blue border from reference image)
      doc.strokeColor('#0066CC')
      doc.lineWidth(2)
      doc.rect(margin - 5, margin - 5, pageWidth - (margin - 5) * 2, pageHeight - (margin - 5) * 2).stroke()
      doc.strokeColor('black')
      doc.lineWidth(1)

      // Top right: Date and Medicaid ID (positioned at top right BEFORE header)
      const rightX = pageWidth - margin - 150
      const topRightY = currentY + 10
      
      const serviceDate = invoice.serviceDate ? new Date(invoice.serviceDate) : new Date(invoice.createdAt)
      const monthYear = format(serviceDate, 'MMMM yyyy')
      
      doc.fontSize(10).font('Helvetica-Bold')
      doc.text('Date:', rightX, topRightY)
      doc.font('Helvetica').text(monthYear, rightX + 35, topRightY)
      
      doc.font('Helvetica-Bold').text('Medicaid ID:', rightX, topRightY + 15)
      doc.font('Helvetica').text(invoice.client.medicaidId || 'DS36509H', rightX + 75, topRightY + 15)

      // Header - KJ PLAY CENTER (large, bold, blue, centered)
      currentY = 50
      doc.y = currentY
      doc.fontSize(32).font('Helvetica-Bold').fillColor('#0066CC')
      doc.text('KJ PLAY CENTER', { align: 'center' })
      doc.fillColor('black') // Reset to black
      
      // Slogan (smaller, centered)
      currentY = doc.y + 5
      doc.y = currentY
      doc.fontSize(11).font('Helvetica')
      doc.text('Where you Discover Intelligence Creativity, Excitement and Fun.', { align: 'center' })
      
      // Contact info (smallest, centered)
      currentY = doc.y + 5
      doc.y = currentY
      doc.fontSize(9).text('Address 68 Jefferson St. Highland Mills N.Y.10930 / P.845-827-9585 / E.kjplaycanter@gmail.com', { align: 'center' })
      
      currentY = doc.y + 15

      // Bill To section (left side, after header)
      doc.y = currentY
      doc.fontSize(12).font('Helvetica-Bold')
      doc.text('Bill To:', margin, currentY)
      doc.font('Helvetica').fontSize(11)
      let billToY = currentY + 15
      doc.text(`${invoice.client.firstName || ''} ${invoice.client.lastName || ''}`, margin, billToY)
      
      // Add client address lines
      if (invoice.client.address) {
        billToY = doc.y + 5
        doc.text(invoice.client.address, margin, billToY)
      }
      
      // Add city, state, zip on one line
      if (invoice.client.city || invoice.client.state || invoice.client.zipCode) {
        let cityStateZip = ''
        if (invoice.client.city) cityStateZip += invoice.client.city
        if (invoice.client.state) cityStateZip += (cityStateZip ? ', ' : '') + invoice.client.state
        if (invoice.client.zipCode) cityStateZip += (cityStateZip ? ' ' : '') + invoice.client.zipCode
        if (cityStateZip) {
          billToY = doc.y + 5
          doc.text(cityStateZip, margin, billToY)
        }
      }
      
      // Add phone
      if (invoice.client.phone) {
        billToY = doc.y + 5
        doc.text(`Phone: ${invoice.client.phone}`, margin, billToY)
      }
      
      // Add email
      if (invoice.client.email) {
        billToY = doc.y + 5
        doc.text(`Email: ${invoice.client.email}`, margin, billToY)
      }
      
      // Class Name (below Bill To)
      currentY = doc.y + 15
      doc.y = currentY
      doc.fontSize(12).font('Helvetica-Bold')
      doc.text('Class Name:', margin, currentY)
      doc.font('Helvetica').fontSize(11)
      doc.text(invoice.class.name || 'N/A', margin + 85, currentY)

      currentY = doc.y + 20

      // Table header
      const tableTop = currentY
      const col1X = margin // Date
      const col2X = margin + 80 // Description
      const col3X = margin + 280 // Units
      const col4X = margin + 340 // Total
      const rowHeight = 20

      doc.fontSize(10).font('Helvetica-Bold')
      doc.text('Date', col1X, tableTop)
      doc.text('Description', col2X, tableTop)
      doc.text('Units', col3X, tableTop)
      doc.text('Total', col4X, tableTop)
      
      // Draw header line (thicker line)
      doc.lineWidth(1.5)
      doc.moveTo(margin, tableTop + 15).lineTo(pageWidth - margin, tableTop + 15).stroke()
      doc.lineWidth(1)
      
      // Table row
      const rowY = tableTop + rowHeight
      doc.fontSize(10).font('Helvetica')
      
      // Date (format as M/dd like "9/02")
      const dateStr = format(serviceDate, 'M/dd')
      doc.text(dateStr, col1X, rowY)
      
      // Description (Class name)
      doc.text(invoice.class.name || 'N/A', col2X, rowY)
      
      // Units
      doc.text((invoice.units || 0).toString(), col3X, rowY)
      
      // Total
      const totalAmount = typeof invoice.totalAmount === 'number' ? invoice.totalAmount : (Number(invoice.totalAmount) || 0)
      doc.text(`$${totalAmount.toFixed(2)}`, col4X, rowY)
      
      // Draw bottom line (thicker line)
      doc.lineWidth(1.5)
      doc.moveTo(margin, rowY + 15).lineTo(pageWidth - margin, rowY + 15).stroke()
      doc.lineWidth(1)
      
      // Total row (below table, aligned right with total column)
      const totalY = rowY + rowHeight + 10
      doc.fontSize(11).font('Helvetica-Bold')
      doc.text('Total', col3X, totalY)
      doc.text(`$${totalAmount.toFixed(2)}`, col4X, totalY)

      // Notes (if present)
      if (invoice.notes) {
        const notesY = totalY + rowHeight + 15
        doc.y = notesY
        doc.fontSize(10).font('Helvetica-Bold').text('Notes:')
        doc.font('Helvetica').fontSize(10)
        doc.text(invoice.notes, { align: 'left', width: pageWidth - margin * 2 })
      }

      console.error(`[COMMUNITY PDF] ${correlationId} Rendering PDF content...`)
      doc.end()
      console.error(`[COMMUNITY PDF] ${correlationId} PDF document ended, waiting for buffers...`)
    } catch (error: any) {
      console.error(`[COMMUNITY PDF] ${correlationId} PDF generation exception:`, {
        message: error?.message,
        code: error?.code,
        stack: error?.stack,
        name: error?.name,
      })
      reject(new Error(`PDF generation failed: ${error?.message || 'Unknown error'}`))
    }
  })
}
