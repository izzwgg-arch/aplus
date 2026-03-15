import { Prisma } from '@prisma/client'

export interface ReportFilters {
  startDate?: Date
  endDate?: Date
  providerId?: string
  clientId?: string
  bcbaId?: string
  insuranceId?: string
  status?: string[]
  serviceType?: ('DR' | 'SV')[]
  location?: string
  includeEmptyDays?: boolean
  grouping?: 'client' | 'provider' | 'insurance' | 'week' | 'timesheet' | null
}

export interface DetailedReportRow {
  date: Date
  clientName: string
  clientId?: string
  providerName: string
  bcbaName?: string
  insuranceName: string
  type: 'DR' | 'SV' | ''
  inTime: string // 12-hour format with AM/PM
  outTime: string // 12-hour format with AM/PM
  hours: number
  units: number
  location?: string
  status: string
  timesheetId?: string
  entryId?: string
}

export interface ReportSummary {
  totalHoursDR: number
  totalHoursSV: number
  totalHours: number
  totalUnits: number
  totalUnitsDR: number
  totalUnitsSV: number
  sessionCount: number
  timesheetCount: number
}

export interface DetailedReportData {
  meta: {
    generatedAt: Date
    filtersApplied: ReportFilters
    correlationId: string
  }
  summary: ReportSummary
  rows: DetailedReportRow[]
  groups?: Array<{
    key: string
    label: string
    summary: ReportSummary
    rows: DetailedReportRow[]
  }>
}

/**
 * Build Prisma where clause for timesheet queries based on filters
 */
export function buildTimesheetWhereClause(filters: ReportFilters): Prisma.TimesheetWhereInput {
  const where: Prisma.TimesheetWhereInput = {
    deletedAt: null,
  }

  // Date range filter - filter by timesheet date range overlapping with filter range
  if (filters.startDate || filters.endDate) {
    where.OR = [
      // Timesheet starts within range
      {
        startDate: {
          gte: filters.startDate || new Date(0),
          lte: filters.endDate || new Date(),
        },
      },
      // Timesheet ends within range
      {
        endDate: {
          gte: filters.startDate || new Date(0),
          lte: filters.endDate || new Date(),
        },
      },
      // Timesheet spans the entire range
      {
        AND: [
          { startDate: { lte: filters.startDate || new Date(0) } },
          { endDate: { gte: filters.endDate || new Date() } },
        ],
      },
    ]
  }

  if (filters.providerId) {
    where.providerId = filters.providerId
  }

  if (filters.clientId) {
    where.clientId = filters.clientId
  }

  if (filters.bcbaId) {
    where.bcbaId = filters.bcbaId
  }

  if (filters.insuranceId) {
    where.insuranceId = filters.insuranceId
  }

  if (filters.status && filters.status.length > 0) {
    where.status = {
      in: filters.status as any,
    }
  }

  return where
}

/**
 * Build Prisma where clause for timesheet entry queries
 */
export function buildEntryWhereClause(
  filters: ReportFilters,
  timesheetWhere?: Prisma.TimesheetWhereInput
): Prisma.TimesheetEntryWhereInput {
  const where: Prisma.TimesheetEntryWhereInput = {}

  // Date range filter for entries
  if (filters.startDate || filters.endDate) {
    where.date = {
      gte: filters.startDate || new Date(0),
      lte: filters.endDate || new Date(),
    }
  }

  // Service type filter (DR/SV) - stored in notes field
  if (filters.serviceType && filters.serviceType.length > 0) {
    where.notes = {
      in: filters.serviceType,
    }
  }

  // Link to timesheet filters
  if (timesheetWhere) {
    where.timesheet = timesheetWhere
  }

  return where
}

/**
 * Convert 24-hour time (HH:mm) to 12-hour format with AM/PM
 */
export function formatTime12Hour(time24: string): string {
  if (!time24 || time24 === '--:--') return ''
  const [hours, minutes] = time24.split(':').map(Number)
  const hour12 = hours % 12 || 12
  const ampm = hours >= 12 ? 'PM' : 'AM'
  return `${hour12}:${minutes.toString().padStart(2, '0')} ${ampm}`
}

/**
 * Compute report summary from rows
 */
export function computeReportSummary(rows: DetailedReportRow[]): ReportSummary {
  const summary: ReportSummary = {
    totalHoursDR: 0,
    totalHoursSV: 0,
    totalHours: 0,
    totalUnits: 0,
    totalUnitsDR: 0,
    totalUnitsSV: 0,
    sessionCount: rows.length,
    timesheetCount: new Set(rows.map((r) => r.timesheetId).filter(Boolean)).size,
  }

  rows.forEach((row) => {
    summary.totalHours += row.hours
    summary.totalUnits += row.units

    if (row.type === 'DR') {
      summary.totalHoursDR += row.hours
      summary.totalUnitsDR += row.units
    } else if (row.type === 'SV') {
      summary.totalHoursSV += row.hours
      summary.totalUnitsSV += row.units
    }
  })

  return summary
}
