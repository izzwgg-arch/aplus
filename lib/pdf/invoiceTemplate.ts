import PDFDocument from 'pdfkit'
import { format } from 'date-fns'

/**
 * Branding configuration for invoice PDFs
 */
export interface InvoiceBranding {
  orgName: string
  tagline?: string
  addressLine?: string
  phoneLine?: string
  emailLine?: string
  borderColor: string
  headerColor: string
  headerLogoPath?: string
}

/**
 * Invoice data structure for PDF rendering
 */
export interface InvoiceForPDF {
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
}

/**
 * Render invoice PDF using shared template with configurable branding
 * This is the SINGLE source of truth for invoice PDF generation
 * Used by both Community and Regular invoices
 */
export function renderInvoicePdf(
  invoice: InvoiceForPDF,
  branding: InvoiceBranding
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 0, size: 'LETTER' })
      const buffers: Buffer[] = []

      doc.on('data', buffers.push.bind(buffers))
      doc.on('end', () => resolve(Buffer.concat(buffers)))
      doc.on('error', reject)

      // Layout constants (SAME for all invoices)
      const pageWidth = 612
      const pageHeight = 792
      const outerMargin = 36
      const innerMargin = 54
      const leftMargin = 40
      const rightMargin = 40
      const gap = 16

      // Compute content width and box dimensions
      const contentWidth = pageWidth - leftMargin - rightMargin
      const leftBoxW = Math.floor((contentWidth - gap) * 0.62)
      const rightBoxW = contentWidth - gap - leftBoxW
      const leftBoxX = leftMargin
      const rightBoxX = leftBoxX + leftBoxW + gap
      const boxesY = 220
      const boxesHeight = 60

      // Assertion: verify no overlap
      if (rightBoxX < leftBoxX + leftBoxW + gap) {
        const error = new Error(`Layout assertion failed: rightBoxX (${rightBoxX}) < leftBoxX + leftBoxW + gap (${leftBoxX + leftBoxW + gap})`)
        reject(error)
        return
      }

      // 1) Draw page border with branding color
      doc.strokeColor(branding.borderColor)
      doc.lineWidth(3)
      doc.rect(outerMargin, outerMargin, pageWidth - 2 * outerMargin, pageHeight - 2 * outerMargin).stroke()
      doc.strokeColor('black')
      doc.lineWidth(1)

      // 2) Header block - CENTERED at the top
      const headerStartY = 55
      doc.fontSize(44).font('Helvetica-Bold').fillColor(branding.headerColor)
      doc.text(branding.orgName, 0, headerStartY, { align: 'center', width: pageWidth })
      doc.fillColor('black')

      // Tagline (if provided)
      let currentY = headerStartY + 50
      if (branding.tagline) {
        doc.fontSize(13).font('Helvetica')
        doc.text(branding.tagline, 0, currentY, { align: 'center', width: pageWidth })
        currentY += 18
      }

      // Contact info (if provided)
      const contactParts: string[] = []
      if (branding.addressLine) contactParts.push(branding.addressLine)
      if (branding.phoneLine) contactParts.push(`P.${branding.phoneLine}`)
      if (branding.emailLine) contactParts.push(`E.${branding.emailLine}`)
      
      if (contactParts.length > 0) {
        doc.fontSize(10)
        doc.text(contactParts.join(' / '), 0, currentY, { align: 'center', width: pageWidth })
        currentY += 18
      }

      // 3) Date/Medicaid ID box on the RIGHT
      doc.strokeColor('black')
      doc.lineWidth(1)
      doc.rect(rightBoxX, boxesY, rightBoxW, boxesHeight).stroke()

      const serviceDate = invoice.serviceDate ? new Date(invoice.serviceDate) : new Date(invoice.createdAt)
      const monthYear = format(serviceDate, 'MMMM yyyy')
      const boxPadding = 8
      const textWidth = rightBoxW - (boxPadding * 2)

      doc.fontSize(10).font('Helvetica-Bold')
      doc.text('Date:', rightBoxX + boxPadding, boxesY + 10, { width: textWidth })
      doc.font('Helvetica').text(monthYear, rightBoxX + boxPadding + 40, boxesY + 10, { width: textWidth - 40, ellipsis: true })

      // Medicaid ID (for both Community and Regular invoices - pull from client)
      doc.font('Helvetica-Bold').text('Medicaid ID:', rightBoxX + boxPadding, boxesY + 28, { width: textWidth })
      const medicaidIdDisplay = invoice.client?.medicaidId || invoice.client?.idNumber || ''
      doc.font('Helvetica').text(medicaidIdDisplay, rightBoxX + boxPadding + 75, boxesY + 28, { width: textWidth - 75, ellipsis: true })

      // 4) Bill To / Description box on the LEFT
      doc.rect(leftBoxX, boxesY, leftBoxW, boxesHeight).stroke()

      // Draw vertical split line
      const splitX = leftBoxX + Math.floor(leftBoxW * 0.44)
      doc.moveTo(splitX, boxesY).lineTo(splitX, boxesY + boxesHeight).stroke()

      // Left column: Bill To
      const leftColWidth = splitX - leftBoxX - (boxPadding * 2)
      const leftColTextX = leftBoxX + boxPadding

      doc.fontSize(11).font('Helvetica-Bold')
      doc.text('Bill To:', leftColTextX, boxesY + 8, { width: leftColWidth, ellipsis: true })
      doc.font('Helvetica').fontSize(10)
      
      // Client name - support both name format (regular) and firstName/lastName (community)
      const clientName = invoice.client.name 
        ? invoice.client.name
        : `${invoice.client.firstName || ''} ${invoice.client.lastName || ''}`.trim()
      doc.text(clientName, leftColTextX, boxesY + 22, { width: leftColWidth, ellipsis: true })

      // Right column: Description (Class Name for community, or description for regular)
      const rightColX = splitX + boxPadding
      const rightColWidth = (leftBoxX + leftBoxW) - splitX - (boxPadding * 2)

      doc.font('Helvetica-Bold').fontSize(11)
      const descriptionLabel = invoice.class ? 'Class Name:' : 'Description:'
      doc.text(descriptionLabel, rightColX, boxesY + 8, { width: rightColWidth, ellipsis: true })
      doc.font('Helvetica').fontSize(10)
      const description = invoice.class?.name || invoice.description || 'N/A'
      doc.text(description, rightColX, boxesY + 22, { width: rightColWidth, ellipsis: true })

      // 5) Main table grid
      const tableStartY = 320
      const tableX = innerMargin
      const tableWidth = pageWidth - (innerMargin * 2)

      const colDateWidth = 90
      const colDescWidth = 260
      const colUnitsWidth = 90
      const colTotalWidth = tableWidth - colDateWidth - colDescWidth - colUnitsWidth

      const colDateX = tableX
      const colDescX = colDateX + colDateWidth
      const colUnitsX = colDescX + colDescWidth
      const colTotalX = colUnitsX + colUnitsWidth

      const rowHeight = 25
      const headerY = tableStartY

      // Table header row
      doc.fontSize(10).font('Helvetica-Bold')
      doc.text('Date', colDateX + 5, headerY + 8, { width: colDateWidth - 10, ellipsis: true })
      doc.text('Description', colDescX + 5, headerY + 8, { width: colDescWidth - 10, ellipsis: true })
      doc.text('Units', colUnitsX + 5, headerY + 8, { width: colUnitsWidth - 10, ellipsis: true })
      doc.text('Total', colTotalX + 5, headerY + 8, { width: colTotalWidth - 10, ellipsis: true })

      // Draw header row bottom border
      doc.lineWidth(1.5)
      doc.moveTo(tableX, headerY + rowHeight).lineTo(tableX + tableWidth, headerY + rowHeight).stroke()
      doc.lineWidth(1)

      // Table data rows
      const entries = invoice.entries || []
      let dataRowY = headerY + rowHeight
      let totalAmount = 0

      if (entries.length > 0) {
        // Multiple entries (regular invoice)
        entries.forEach((entry, idx) => {
          if (idx > 0) {
            dataRowY += rowHeight
          }

          doc.fontSize(10).font('Helvetica')
          const entryDate = entry.date ? format(new Date(entry.date), 'M/dd') : format(serviceDate, 'M/dd')
          doc.text(entryDate, colDateX + 5, dataRowY + 8, { width: colDateWidth - 10, ellipsis: true })
          doc.text(entry.description || 'N/A', colDescX + 5, dataRowY + 8, { width: colDescWidth - 10, ellipsis: true })
          
          const units = entry.units || 0
          doc.text(units.toString(), colUnitsX + 5, dataRowY + 8, { width: colUnitsWidth - 10, ellipsis: true })
          
          const entryAmount = typeof entry.amount === 'number' 
            ? entry.amount 
            : (typeof entry.amount === 'string' ? Number(entry.amount) || 0 : 0)
          totalAmount += entryAmount
          doc.text(`$${entryAmount.toFixed(2)}`, colTotalX + 5, dataRowY + 8, { width: colTotalWidth - 10, ellipsis: true })
        })
      } else {
        // Single row (community invoice)
        doc.fontSize(10).font('Helvetica')
        const dateStr = format(serviceDate, 'M/dd')
        doc.text(dateStr, colDateX + 5, dataRowY + 8, { width: colDateWidth - 10, ellipsis: true })
        
        const desc = invoice.class?.name || invoice.description || 'N/A'
        doc.text(desc, colDescX + 5, dataRowY + 8, { width: colDescWidth - 10, ellipsis: true })
        
        const units = invoice.units || 0
        doc.text(units.toString(), colUnitsX + 5, dataRowY + 8, { width: colUnitsWidth - 10, ellipsis: true })
        
        const invTotal = typeof invoice.totalAmount === 'number' 
          ? invoice.totalAmount 
          : (typeof invoice.totalAmount === 'string' ? Number(invoice.totalAmount) || 0 : 0)
        totalAmount = invTotal
        doc.text(`$${invTotal.toFixed(2)}`, colTotalX + 5, dataRowY + 8, { width: colTotalWidth - 10, ellipsis: true })
      }

      // Draw data row bottom border
      doc.lineWidth(1.5)
      doc.moveTo(tableX, dataRowY + rowHeight).lineTo(tableX + tableWidth, dataRowY + rowHeight).stroke()
      doc.lineWidth(1)

      // Total row at bottom
      const totalRowY = dataRowY + rowHeight + 10
      doc.fontSize(11).font('Helvetica-Bold')
      doc.text('Total', colUnitsX + 5, totalRowY, { width: colUnitsWidth - 10, ellipsis: true })
      
      // Use totalAmount from entries or invoice.totalAmount
      if (entries.length > 0) {
        doc.text(`$${totalAmount.toFixed(2)}`, colTotalX + 5, totalRowY, { width: colTotalWidth - 10, ellipsis: true })
      } else {
        const invTotal = typeof invoice.totalAmount === 'number' 
          ? invoice.totalAmount 
          : (typeof invoice.totalAmount === 'string' ? Number(invoice.totalAmount) || 0 : 0)
        doc.text(`$${invTotal.toFixed(2)}`, colTotalX + 5, totalRowY, { width: colTotalWidth - 10, ellipsis: true })
      }

      doc.end()
    } catch (error: any) {
      reject(new Error(`PDF generation failed: ${error?.message || 'Unknown error'}`))
    }
  })
}

/**
 * Branding presets
 */
export const BRANDING_PRESETS = {
  KJ_PLAY_CENTER: {
    orgName: 'KJ PLAY CENTER',
    tagline: 'Where you Discover Intelligence Creativity, Excitement and Fun.',
    addressLine: 'Address 68 Jefferson St. Highland Mills N.Y.10930',
    phoneLine: '845-827-9585',
    emailLine: 'kjplaycanter@gmail.com',
    borderColor: '#1f5fae',
    headerColor: '#1f5fae',
  } as InvoiceBranding,
  
  SMART_STEPS_ABA: {
    orgName: 'Smart Steps ABA',
    tagline: undefined,
    addressLine: undefined,
    phoneLine: undefined,
    emailLine: undefined,
    borderColor: '#1E73BE',
    headerColor: '#1E73BE',
  } as InvoiceBranding,
}
