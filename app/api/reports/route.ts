import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { generateTimesheetSummaryPDF, generateInvoiceSummaryPDF, generateInsuranceBillingPDF, generateProviderPerformancePDF } from '@/lib/pdf/reportGenerator'
import { generateTimesheetSummaryCSV, generateInvoiceSummaryCSV, generateInsuranceBillingCSV, generateProviderPerformanceCSV } from '@/lib/csv/reportGenerator'
import { generateTimesheetSummaryExcel, generateInvoiceSummaryExcel, generateInsuranceBillingExcel, generateProviderPerformanceExcel } from '@/lib/excel/reportGenerator'
import { getTimesheetVisibilityScope } from '@/lib/permissions'

export async function GET(request: NextRequest) {
  const correlationId = `report-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
  
  try {
    console.log(`[REPORT GENERATION] ${correlationId} - Starting report generation`)
    
    const session = await getServerSession(authOptions)
    if (!session) {
      console.warn(`[REPORT GENERATION] ${correlationId} - Unauthorized access attempt`)
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const searchParams = request.nextUrl.searchParams
    const reportType = searchParams.get('type') // 'timesheets' | 'invoices' | 'insurance' | 'providers'
    const format = searchParams.get('format') // 'pdf' | 'csv' | 'xlsx'
    const startDate = searchParams.get('startDate')
    const endDate = searchParams.get('endDate')
    const providerId = searchParams.get('providerId')
    const clientId = searchParams.get('clientId')
    const insuranceId = searchParams.get('insuranceId')

    console.log(`[REPORT GENERATION] ${correlationId} - Params:`, {
      reportType,
      format,
      startDate,
      endDate,
      providerId: providerId || 'all',
      clientId: clientId || 'all',
      insuranceId: insuranceId || 'all',
    })

    if (!reportType || !format) {
      console.error(`[REPORT GENERATION] ${correlationId} - Missing required params: reportType=${reportType}, format=${format}`)
      return NextResponse.json(
        { error: 'Report type and format are required', correlationId },
        { status: 400 }
      )
    }

    const dateStart = startDate ? new Date(startDate) : new Date(0)
    const dateEnd = endDate ? new Date(endDate) : new Date()

    let reportData: any
    let filename: string

    // Fetch data based on report type
    switch (reportType) {
      case 'timesheets': {
        const where: any = {
          deletedAt: null,
          createdAt: { gte: dateStart, lte: dateEnd },
        }

        if (providerId) where.providerId = providerId
        if (clientId) where.clientId = clientId
        if (insuranceId) where.insuranceId = insuranceId

        // Apply timesheet visibility scope
        const visibilityScope = await getTimesheetVisibilityScope(session.user.id)
        if (!visibilityScope.viewAll) {
          where.userId = { in: visibilityScope.allowedUserIds }
        }

        const timesheets = await prisma.timesheet.findMany({
          where,
          include: {
            client: true,
            provider: true,
            bcba: true,
            entries: true,
          },
        })

        const processedTimesheets = timesheets.map((ts) => {
          const totalMinutes = ts.entries.reduce((sum, e) => sum + e.minutes, 0)
          const totalUnits = ts.entries.reduce(
            (sum, e) => sum + parseFloat(e.units.toString()),
            0
          )
          return {
            ...ts,
            totalMinutes,
            totalUnits,
          }
        })

        reportData = {
          timesheets: processedTimesheets,
          total: processedTimesheets.length,
          approved: processedTimesheets.filter((ts) => ts.status === 'APPROVED')
            .length,
          rejected: processedTimesheets.filter((ts) => ts.status === 'REJECTED')
            .length,
          draft: processedTimesheets.filter((ts) => ts.status === 'DRAFT').length,
          startDate: dateStart,
          endDate: dateEnd,
        }
        filename = `timesheet-summary-${formatDateForFilename(dateStart)}-${formatDateForFilename(dateEnd)}`
        break
      }

      case 'invoices': {
        const where: any = {
          deletedAt: null,
          createdAt: { gte: dateStart, lte: dateEnd },
        }

        if (clientId) where.clientId = clientId
        if (insuranceId) {
          where.entries = {
            some: { insuranceId },
          }
        }

        const invoices = await prisma.invoice.findMany({
          where,
          include: {
            client: true,
            entries: {
              include: {
                insurance: true,
              },
            },
            payments: true,
          },
        })

        const totalBilled = invoices.reduce(
          (sum, inv) => sum + parseFloat(inv.totalAmount.toString()),
          0
        )
        const totalPaid = invoices.reduce(
          (sum, inv) => sum + parseFloat(inv.paidAmount.toString()),
          0
        )
        const totalOutstanding = invoices.reduce(
          (sum, inv) => sum + parseFloat(inv.outstanding.toString()),
          0
        )

        reportData = {
          invoices,
          total: invoices.length,
          totalBilled,
          totalPaid,
          totalOutstanding,
          startDate: dateStart,
          endDate: dateEnd,
        }
        filename = `invoice-summary-${formatDateForFilename(dateStart)}-${formatDateForFilename(dateEnd)}`
        break
      }

      case 'insurance': {
        const where: any = {
          deletedAt: null,
          createdAt: { gte: dateStart, lte: dateEnd },
        }

        if (insuranceId) {
          where.entries = {
            some: { insuranceId },
          }
        }

        const invoices = await prisma.invoice.findMany({
          where,
          include: {
            entries: {
              include: {
                insurance: true,
              },
            },
            payments: true,
          },
        })

        // Group by insurance
        const insuranceMap = new Map<string, any>()
        invoices.forEach((inv) => {
          inv.entries.forEach((entry) => {
            const insId = entry.insuranceId
            const insName = entry.insurance.name

            if (!insuranceMap.has(insId)) {
              insuranceMap.set(insId, {
                insuranceId: insId,
                insuranceName: insName,
                totalBilled: 0,
                totalPaid: 0,
                outstanding: 0,
                invoiceCount: 0,
              })
            }

            const ins = insuranceMap.get(insId)!
            ins.totalBilled += parseFloat(entry.amount.toString())
            
            // Distribute paid amount proportionally
            const invoiceTotal = parseFloat(inv.totalAmount.toString())
            const paidAmount = parseFloat(inv.paidAmount.toString())
            const ratio = invoiceTotal > 0 ? paidAmount / invoiceTotal : 0
            ins.totalPaid += parseFloat(entry.amount.toString()) * ratio
            ins.outstanding = ins.totalBilled - ins.totalPaid
          })
          insuranceMap.forEach((ins) => {
            if (inv.entries.some((e) => e.insuranceId === ins.insuranceId)) {
              ins.invoiceCount++
            }
          })
        })

        reportData = {
          insuranceBreakdown: Array.from(insuranceMap.values()),
          startDate: dateStart,
          endDate: dateEnd,
        }
        filename = `insurance-billing-${formatDateForFilename(dateStart)}-${formatDateForFilename(dateEnd)}`
        break
      }

      case 'providers': {
        const where: any = {
          deletedAt: null,
          createdAt: { gte: dateStart, lte: dateEnd },
        }

        if (providerId) where.providerId = providerId

        // Apply timesheet visibility scope
        const visibilityScope = await getTimesheetVisibilityScope(session.user.id)
        if (!visibilityScope.viewAll) {
          where.userId = { in: visibilityScope.allowedUserIds }
        }

        const timesheets = await prisma.timesheet.findMany({
          where,
          include: {
            provider: true,
            client: true,
            entries: true,
          },
        })

        // Group by provider
        const providerMap = new Map<string, any>()
        timesheets.forEach((ts) => {
          const provId = ts.providerId
          const provName = ts.provider.name

          if (!providerMap.has(provId)) {
            providerMap.set(provId, {
              providerId: provId,
              name: provName,
              totalHours: 0,
              totalUnits: 0,
              timesheetCount: 0,
              clientsServed: new Set<string>(),
            })
          }

          const provider = providerMap.get(provId)!
          provider.timesheetCount++
          provider.clientsServed.add(ts.clientId)

          ts.entries.forEach((entry) => {
            provider.totalHours += entry.minutes / 60
            provider.totalUnits += parseFloat(entry.units.toString())
          })
        })

        reportData = {
          providers: Array.from(providerMap.values()).map((p) => ({
            ...p,
            clientsServed: p.clientsServed.size,
          })),
          startDate: dateStart,
          endDate: dateEnd,
        }
        filename = `provider-performance-${formatDateForFilename(dateStart)}-${formatDateForFilename(dateEnd)}`
        break
      }

      default:
        return NextResponse.json(
          { error: 'Invalid report type' },
          { status: 400 }
        )
    }

    // Generate report based on format
    let buffer: Buffer
    let contentType: string
    let extension: string

    switch (format) {
      case 'pdf': {
        switch (reportType) {
          case 'timesheets':
            buffer = await generateTimesheetSummaryPDF(reportData)
            break
          case 'invoices':
            buffer = await generateInvoiceSummaryPDF(reportData)
            break
          case 'insurance':
            buffer = await generateInsuranceBillingPDF(reportData)
            break
          case 'providers':
            buffer = await generateProviderPerformancePDF(reportData)
            break
          default:
            return NextResponse.json(
              { error: 'Invalid report type for PDF' },
              { status: 400 }
            )
        }
        contentType = 'application/pdf'
        extension = 'pdf'
        break
      }

      case 'csv': {
        let csvContent: string
        switch (reportType) {
          case 'timesheets':
            csvContent = generateTimesheetSummaryCSV(reportData)
            break
          case 'invoices':
            csvContent = generateInvoiceSummaryCSV(reportData)
            break
          case 'insurance':
            csvContent = generateInsuranceBillingCSV(reportData)
            break
          case 'providers':
            csvContent = generateProviderPerformanceCSV(reportData)
            break
          default:
            return NextResponse.json(
              { error: 'Invalid report type for CSV' },
              { status: 400 }
            )
        }
        buffer = Buffer.from(csvContent, 'utf-8')
        contentType = 'text/csv'
        extension = 'csv'
        break
      }

      case 'xlsx': {
        switch (reportType) {
          case 'timesheets':
            buffer = generateTimesheetSummaryExcel(reportData)
            break
          case 'invoices':
            buffer = generateInvoiceSummaryExcel(reportData)
            break
          case 'insurance':
            buffer = generateInsuranceBillingExcel(reportData)
            break
          case 'providers':
            buffer = generateProviderPerformanceExcel(reportData)
            break
          default:
            return NextResponse.json(
              { error: 'Invalid report type for Excel' },
              { status: 400 }
            )
        }
        contentType =
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        extension = 'xlsx'
        break
      }

      default:
        return NextResponse.json(
          { error: 'Invalid format' },
          { status: 400 }
        )
    }

    console.log(`[REPORT GENERATION] ${correlationId} - Report generated successfully: ${filename}.${extension}`)
    
    return new NextResponse(buffer as any, {
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `attachment; filename="${filename}.${extension}"`,
      },
    })
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    const errorStack = error instanceof Error ? error.stack : undefined
    
    console.error(`[REPORT GENERATION] ${correlationId} - Error generating report:`, {
      error: errorMessage,
      stack: errorStack,
      correlationId,
    })
    
    return NextResponse.json(
      { 
        error: 'Failed to generate report',
        message: errorMessage,
        correlationId,
      },
      { status: 500 }
    )
  }
}

function formatDateForFilename(date: Date): string {
  return date.toISOString().split('T')[0]
}
