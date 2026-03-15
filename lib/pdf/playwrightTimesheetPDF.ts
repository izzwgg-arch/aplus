/**
 * Playwright-based Timesheet PDF Generator
 * 
 * Replaces PDFKit with Playwright for reliable HTML→PDF generation
 */

import { prisma } from '@/lib/prisma'
import { generateTimesheetHTML } from './timesheetHtmlTemplate'
import { generatePDFFromHTML } from './playwrightPDF'
import { randomBytes } from 'crypto'

/**
 * Generate timesheet PDF using Playwright (HTML→PDF)
 * 
 * This is the shared function used by both API routes and Email Queue
 */
export async function generateTimesheetPDFFromId(
  timesheetId: string,
  prismaClient: any,
  correlationId?: string
): Promise<Buffer> {
  const corrId = correlationId || `pdf-${Date.now()}-${randomBytes(4).toString('hex')}`
  
  console.log(`[TIMESHEET_PDF_PLAYWRIGHT] ${corrId} Fetching timesheet data`, { timesheetId })
  
  try {
    const timesheet = await prismaClient.timesheet.findUnique({
      where: { id: timesheetId, deletedAt: null },
      include: {
        client: {
          select: {
            id: true,
            name: true,
            address: true,
            phone: true,
            dlb: true,
            signature: true,
          },
        },
        provider: {
          select: {
            name: true,
            phone: true,
            signature: true,
            dlb: true,
          },
        },
        bcba: {
          select: {
            name: true,
            signature: true,
          },
        },
        entries: {
          orderBy: { date: 'asc' },
          select: {
            date: true,
            startTime: true,
            endTime: true,
            minutes: true,
            notes: true,
          },
        },
      },
    })
    
    if (!timesheet) {
      throw new Error(`Timesheet ${timesheetId} not found`)
    }
    
    if (timesheet.entries.length === 0) {
      throw new Error(`NO_ROWS_TO_PRINT: Timesheet ${timesheetId} has no entries to print.`)
    }
    
    console.log(`[TIMESHEET_PDF_PLAYWRIGHT] ${corrId} Timesheet data fetched`, {
      timesheetId,
      isBCBA: timesheet.isBCBA,
      entriesCount: timesheet.entries.length,
    })
    
    // Generate HTML
    const html = generateTimesheetHTML({
      id: timesheet.id,
      client: timesheet.client as any,
      provider: timesheet.provider as any,
      bcba: timesheet.bcba,
      startDate: timesheet.startDate,
      endDate: timesheet.endDate,
      isBCBA: timesheet.isBCBA,
      serviceType: timesheet.serviceType || undefined,
      sessionData: timesheet.sessionData || undefined,
      entries: timesheet.entries.map((entry: any) => ({
        date: entry.date,
        startTime: entry.startTime,
        endTime: entry.endTime,
        minutes: entry.minutes,
        notes: entry.notes,
      })),
    })
    
    // Generate PDF from HTML
    const pdfBuffer = await generatePDFFromHTML(html, corrId)
    
    console.log(`[TIMESHEET_PDF_PLAYWRIGHT] ${corrId} PDF generated successfully`, {
      timesheetId,
      bytes: pdfBuffer.length,
    })
    
    return pdfBuffer
  } catch (error: any) {
    console.error(`[TIMESHEET_PDF_PLAYWRIGHT] ${corrId} Failed to generate PDF from ID`, {
      timesheetId,
      error: error?.message,
      stack: error?.stack,
    })
    throw error
  }
}
