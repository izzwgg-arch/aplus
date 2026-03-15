 import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { canAccessRoute, getTimesheetVisibilityScope } from '@/lib/permissions'
import {
  buildTimesheetWhereClause,
  buildEntryWhereClause,
  formatTime12Hour,
  computeReportSummary,
  type ReportFilters,
  type DetailedReportRow,
  type DetailedReportData,
} from '@/lib/reports/queryBuilder'

export async function GET(request: NextRequest) {
  const correlationId = `detailed-report-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
  
  try {
    console.log(`[DETAILED REPORT] ${correlationId} - Starting detailed report generation`)
    
    const session = await getServerSession(authOptions)
    if (!session) {
      console.warn(`[DETAILED REPORT] ${correlationId} - Unauthorized access attempt`)
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Check permissions
    const hasAccess = await canAccessRoute(session.user.id, '/reports')
    if (!hasAccess) {
      console.warn(`[DETAILED REPORT] ${correlationId} - Access denied for user ${session.user.id}`)
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }

    const searchParams = request.nextUrl.searchParams
    
    // Parse filters
    const filters: ReportFilters = {}
    
    const startDateStr = searchParams.get('startDate')
    const endDateStr = searchParams.get('endDate')
    if (startDateStr) filters.startDate = new Date(startDateStr)
    if (endDateStr) filters.endDate = new Date(endDateStr)
    
    const providerId = searchParams.get('providerId')
    if (providerId) filters.providerId = providerId
    
    const clientId = searchParams.get('clientId')
    if (clientId) filters.clientId = clientId
    
    const bcbaId = searchParams.get('bcbaId')
    if (bcbaId) filters.bcbaId = bcbaId
    
    const insuranceId = searchParams.get('insuranceId')
    if (insuranceId) filters.insuranceId = insuranceId
    
    const statusParam = searchParams.get('status')
    if (statusParam) {
      filters.status = statusParam.split(',').filter(Boolean)
    }
    
    const serviceTypeParam = searchParams.get('serviceType')
    if (serviceTypeParam) {
      filters.serviceType = serviceTypeParam.split(',').filter(Boolean) as ('DR' | 'SV')[]
    }
    
    const groupingParam = searchParams.get('grouping')
    if (groupingParam) {
      filters.grouping = groupingParam as 'client' | 'provider' | 'insurance' | 'week' | 'timesheet'
    }

    console.log(`[DETAILED REPORT] ${correlationId} - Filters:`, JSON.stringify(filters, null, 2))

    // Validate date range
    if (filters.startDate && filters.endDate && filters.startDate > filters.endDate) {
      return NextResponse.json(
        { error: 'Start date must be before end date', correlationId },
        { status: 400 }
      )
    }

    // Build query - first get timesheets that match filters (excluding date range for entries)
    const timesheetWhereNoDate = buildTimesheetWhereClause({
      ...filters,
      startDate: undefined,
      endDate: undefined,
    })
    
    // Apply timesheet visibility scope
    const visibilityScope = await getTimesheetVisibilityScope(session.user.id)
    if (!visibilityScope.viewAll) {
      timesheetWhereNoDate.userId = { in: visibilityScope.allowedUserIds }
    }
    
    // Entry date filter is applied separately
    const entryDateFilter: any = {}
    if (filters.startDate || filters.endDate) {
      entryDateFilter.date = {
        gte: filters.startDate || new Date(0),
        lte: filters.endDate || new Date(),
      }
    }

    console.log(`[DETAILED REPORT] ${correlationId} - Query where clause:`, JSON.stringify(timesheetWhereNoDate, null, 2))

    // Fetch timesheets with entries
    const timesheets = await prisma.timesheet.findMany({
      where: timesheetWhereNoDate,
      include: {
        client: {
          select: { id: true, name: true },
        },
        provider: {
          select: { id: true, name: true },
        },
        bcba: {
          select: { id: true, name: true },
        },
        insurance: {
          select: { id: true, name: true },
        },
        entries: {
          where: {
            ...entryDateFilter,
            ...(filters.serviceType && filters.serviceType.length > 0 && {
              notes: { in: filters.serviceType },
            }),
          },
          orderBy: { date: 'asc' },
        },
      },
      orderBy: { startDate: 'asc' },
    })

    console.log(`[DETAILED REPORT] ${correlationId} - Found ${timesheets.length} timesheets`)

    // Transform to detailed rows
    const rows: DetailedReportRow[] = []
    
    for (const timesheet of timesheets) {
      for (const entry of timesheet.entries) {
        // Determine service type from notes field (DR or SV)
        const serviceType = (entry.notes === 'DR' || entry.notes === 'SV') 
          ? (entry.notes as 'DR' | 'SV')
          : (entry.notes || '')

        rows.push({
          date: entry.date,
          clientName: timesheet.client?.name || '',
          clientId: timesheet.client?.id,
          providerName: timesheet.provider?.name || '',
          bcbaName: timesheet.bcba?.name || '',
          insuranceName: timesheet.insurance?.name || '',
          type: serviceType as 'DR' | 'SV' | '',
          inTime: formatTime12Hour(entry.startTime),
          outTime: formatTime12Hour(entry.endTime),
          hours: entry.minutes / 60,
          units: parseFloat(entry.units.toString()),
          location: undefined, // Location not in schema currently
          status: timesheet.status,
          timesheetId: timesheet.id,
          entryId: entry.id,
        })
      }
    }

    // Sort rows by date
    rows.sort((a, b) => a.date.getTime() - b.date.getTime())

    console.log(`[DETAILED REPORT] ${correlationId} - Generated ${rows.length} detailed rows`)

    // Compute summary
    const summary = computeReportSummary(rows)

    // Group if requested
    let groups: DetailedReportData['groups'] | undefined
    if (filters.grouping) {
      groups = groupRows(rows, filters.grouping)
    }

    const reportData: DetailedReportData = {
      meta: {
        generatedAt: new Date(),
        filtersApplied: filters,
        correlationId,
      },
      summary,
      rows,
      groups,
    }

    console.log(`[DETAILED REPORT] ${correlationId} - Report generated successfully`)

    return NextResponse.json(reportData)
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    const errorStack = error instanceof Error ? error.stack : undefined
    
    console.error(`[DETAILED REPORT] ${correlationId} - Error:`, {
      error: errorMessage,
      stack: errorStack,
      correlationId,
    })
    
    return NextResponse.json(
      {
        error: 'Failed to generate detailed report',
        message: errorMessage,
        correlationId,
      },
      { status: 500 }
    )
  }
}

/**
 * Group rows by the specified grouping option
 */
function groupRows(
  rows: DetailedReportRow[],
  grouping: 'client' | 'provider' | 'insurance' | 'week' | 'timesheet'
): DetailedReportData['groups'] {
  const groupMap = new Map<string, DetailedReportRow[]>()

  rows.forEach((row) => {
    let key: string
    let label: string

    switch (grouping) {
      case 'client':
        key = row.clientId || row.clientName
        label = row.clientName
        break
      case 'provider':
        key = row.providerName
        label = row.providerName
        break
      case 'insurance':
        key = row.insuranceName
        label = row.insuranceName
        break
      case 'week':
        // Group by week (Monday-Sunday)
        const date = new Date(row.date)
        const day = date.getDay()
        const diff = date.getDate() - day + (day === 0 ? -6 : 1) // Adjust to Monday
        const monday = new Date(date.setDate(diff))
        key = monday.toISOString().split('T')[0]
        label = `Week of ${monday.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
        break
      case 'timesheet':
        key = row.timesheetId || 'unknown'
        label = `Timesheet ${row.timesheetId?.substring(0, 8) || 'unknown'}`
        break
      default:
        key = 'ungrouped'
        label = 'Ungrouped'
    }

    if (!groupMap.has(key)) {
      groupMap.set(key, [])
    }
    groupMap.get(key)!.push(row)
  })

  return Array.from(groupMap.entries()).map(([key, groupRows]) => {
    // Determine label from first row in group
    const firstRow = groupRows[0]
    let label: string
    
    switch (grouping) {
      case 'client':
        label = firstRow.clientName
        break
      case 'provider':
        label = firstRow.providerName
        break
      case 'insurance':
        label = firstRow.insuranceName
        break
      case 'week':
        const date = new Date(firstRow.date)
        const day = date.getDay()
        const diff = date.getDate() - day + (day === 0 ? -6 : 1)
        const monday = new Date(date.setDate(diff))
        label = `Week of ${monday.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
        break
      case 'timesheet':
        label = `Timesheet ${firstRow.timesheetId?.substring(0, 8) || 'unknown'}`
        break
      default:
        label = 'Ungrouped'
    }
    
    return {
      key,
      label,
      summary: computeReportSummary(groupRows),
      rows: groupRows,
    }
  })
}
