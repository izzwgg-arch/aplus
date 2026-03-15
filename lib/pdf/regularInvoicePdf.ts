import { prisma } from '@/lib/prisma'
import { generateInvoiceHTML, InvoiceForHTML } from './invoiceHtmlTemplate'
import { generatePDFFromHTML } from './playwrightPDF'
import { format } from 'date-fns'

/**
 * Generate Regular Invoice PDF from invoiceId
 * Uses shared invoice template with Smart Steps ABA branding
 */
export async function generateRegularInvoicePdf(invoiceId: string): Promise<Buffer> {
  const startTime = Date.now()
  const correlationId = `pdf-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
  
  console.error(`[REGULAR_INVOICE_PDF] ${correlationId} Starting PDF generation for invoiceId: ${invoiceId}`)
  
  try {
    // Fetch invoice with full timesheet data including entries
    const invoice = await prisma.invoice.findUnique({
      where: { id: invoiceId, deletedAt: null },
      include: {
        client: {
          include: {
            insurance: true,
          },
        },
        timesheets: {
          where: {
            deletedAt: null,
          },
          include: {
            entries: {
              orderBy: {
                date: 'asc',
              },
            },
            provider: true,
            bcba: true,
          },
        },
      },
    })

    if (!invoice) {
      throw new Error(`Invoice ${invoiceId} not found`)
    }

    if (!invoice.client) {
      throw new Error(`Client not found for invoice ${invoiceId}`)
    }

    console.error(`[REGULAR_INVOICE_PDF] ${correlationId} Invoice data fetched`, {
      invoiceId,
      invoiceNumber: invoice.invoiceNumber,
      clientId: invoice.clientId,
      timesheetsCount: invoice.timesheets?.length || 0,
      clientName: invoice.client.name,
    })

    // Get Insurance unit duration
    const insurance = invoice.client.insurance
    const regularUnitMinutes = insurance?.regularUnitMinutes || 15
    const bcbaUnitMinutes = insurance?.bcbaUnitMinutes || regularUnitMinutes
    const ratePerUnit = parseFloat(insurance?.ratePerUnit?.toString() || '0')

    // Process all timesheets and their entries to create detailed PDF entries
    const pdfEntries: Array<{
      date: Date
      description: string
      units: number
      amount: number
      provider: string
      drTime?: string
      svTime?: string
      minutes: number
    }> = []

    if (invoice.timesheets && invoice.timesheets.length > 0) {
      for (const timesheet of invoice.timesheets) {
        if (!timesheet.entries || timesheet.entries.length === 0) continue

        const unitMinutes = timesheet.isBCBA ? bcbaUnitMinutes : regularUnitMinutes
        const providerName = timesheet.provider?.name || 'Unknown'

        // Group entries by date (similar to InvoiceDetail logic)
        const entriesByDate = new Map<string, {
          date: Date
          provider: string
          drTime: string | null
          svTime: string | null
          drMinutes: number
          svMinutes: number
          drUnits: number
          svUnits: number
        }>()

        for (const tsEntry of timesheet.entries) {
          const entryDate = new Date(tsEntry.date)
          const dateKey = format(entryDate, 'yyyy-MM-dd')
          
          let dateEntry = entriesByDate.get(dateKey)
          if (!dateEntry) {
            dateEntry = {
              date: entryDate,
              provider: providerName,
              drTime: null,
              svTime: null,
              drMinutes: 0,
              svMinutes: 0,
              drUnits: 0,
              svUnits: 0,
            }
            entriesByDate.set(dateKey, dateEntry)
          }

          const units = tsEntry.minutes / unitMinutes
          const isSV = tsEntry.notes === 'SV'
          // SV entries are $0 for regular timesheets, but billable for BCBA timesheets
          const entryAmount = (timesheet.isBCBA || !isSV) ? units * ratePerUnit : 0

          if (isSV) {
            if (!dateEntry.svTime) {
              const startTime = tsEntry.startTime
              const endTime = tsEntry.endTime
              dateEntry.svTime = `${startTime} - ${endTime}`
            }
            dateEntry.svMinutes += tsEntry.minutes
            dateEntry.svUnits += units
          } else {
            if (!dateEntry.drTime) {
              const startTime = tsEntry.startTime
              const endTime = tsEntry.endTime
              dateEntry.drTime = `${startTime} - ${endTime}`
            }
            dateEntry.drMinutes += tsEntry.minutes
            dateEntry.drUnits += units
          }
        }

        // Convert grouped entries to PDF entries
        for (const [dateKey, dateEntry] of entriesByDate.entries()) {
          const totalMinutes = dateEntry.drMinutes + dateEntry.svMinutes
          const totalUnits = dateEntry.drUnits + dateEntry.svUnits
          // Calculate amount: DR units * rate + SV units * rate (SV is $0 for regular timesheets)
          const drAmount = dateEntry.drUnits * ratePerUnit
          const svAmount = timesheet.isBCBA ? dateEntry.svUnits * ratePerUnit : 0
          const totalAmount = drAmount + svAmount

          // Create description with time ranges
          let description = providerName
          if (dateEntry.drTime) {
            description += ` (DR: ${dateEntry.drTime}`
            if (dateEntry.svTime) {
              description += `, SV: ${dateEntry.svTime}`
            }
            description += ')'
          } else if (dateEntry.svTime) {
            description += ` (SV: ${dateEntry.svTime})`
          }

          pdfEntries.push({
            date: dateEntry.date,
            description,
            units: totalUnits,
            amount: totalAmount,
            provider: providerName,
            drTime: dateEntry.drTime || undefined,
            svTime: dateEntry.svTime || undefined,
            minutes: totalMinutes,
          })
        }
      }
    }

    // Sort entries by date
    pdfEntries.sort((a, b) => a.date.getTime() - b.date.getTime())

    // Prepare invoice data for HTML template
    const invoiceForHtml: InvoiceForHTML = {
      id: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      createdAt: invoice.createdAt,
      serviceDate: invoice.startDate, // Use start date as service date
      totalAmount: invoice.totalAmount.toNumber(),
      notes: invoice.notes,
      client: {
        name: invoice.client.name,
        address: invoice.client.address,
        idNumber: invoice.client.idNumber, // Use idNumber as Medicaid ID
      },
      entries: pdfEntries,
      branding: {
        orgName: 'Smart Steps ABA',
      },
    }

    // Generate HTML and convert to PDF using Playwright
    const html = generateInvoiceHTML(invoiceForHtml)
    const pdfBuffer = await generatePDFFromHTML(html, correlationId)
    const duration = Date.now() - startTime

    console.error(`[REGULAR_INVOICE_PDF] ${correlationId} PDF generated successfully`, {
      invoiceId,
      invoiceNumber: invoice.invoiceNumber,
      bytes: pdfBuffer.length,
      ms: duration,
      success: true,
    })

    return pdfBuffer
  } catch (error: any) {
    const duration = Date.now() - startTime
    console.error(`[REGULAR_INVOICE_PDF] ${correlationId} PDF generation failed`, {
      invoiceId,
      bytes: 0,
      ms: duration,
      success: false,
      error: error?.message || 'Unknown error',
      stack: error?.stack,
    })
    throw error
  }
}
