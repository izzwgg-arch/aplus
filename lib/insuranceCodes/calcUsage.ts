import { endOfMonth, endOfWeek, startOfMonth, startOfWeek } from 'date-fns'
import { prisma } from '@/lib/prisma'
import { minutesToUnits } from '@/lib/billing-client'
import { buildEntryWhereClause, buildTimesheetWhereClause } from '@/lib/reports/queryBuilder'
import { SERVICE_TYPE_OPTIONS, type InsuranceCodeServiceType } from './constants'
import { normalizeInsuranceCodesServiceType } from './normalizeServiceType'
import { getDefaultReportIncludedStatuses } from './reportStatusFilter'
import { parseDateOnly, toDateOnlyString, isDateOnlyBetween } from './dateOnly'

interface AuthorizationRow {
  id: string
  clientId: string
  insuranceId: string
  serviceType: string
  appliesTo: 'REGULAR' | 'BCBA' | 'BOTH'
  startDate: Date
  endDate: Date
  authorizedUnits: number
  isActive: boolean
  insurance?: {
    regularUnitMinutes?: number | null
    bcbaUnitMinutes?: number | null
  }
}

interface TimesheetEntryRow {
  id: string
  timesheetId: string
  date: Date
  units: number | string | null | { toNumber?: () => number }
  minutes: number
  notes?: string | null
  timesheet: {
    clientId: string
    insuranceId: string | null
    isBCBA: boolean
    serviceType: string | null
    status: string
  }
}

interface UnitMinutesByInsurance {
  [insuranceId: string]: { regular: number; bcba: number }
}

interface UsageContext {
  entries: TimesheetEntryRow[]
  unitMinutesByInsurance: UnitMinutesByInsurance
}

interface AuthorizationUsageResult {
  usedRegular: number
  usedBcba: number
  usedTotal: number
  usedUnitsWeek: number
  usedUnitsMonth: number
  remainingUnitsAuthRange: number
  remainingHoursAuthRange: number
  remainingUnitsWeek: number
  remainingUnitsMonth: number
  hoursUsedWeek: number
  hoursUsedMonth: number
  hoursRemainingWeek: number
  hoursRemainingMonth: number
  debug?: {
    entryIds: string[]
    timesheetIds: string[]
    entries: DebugEntry[]
  }
}

interface DebugEntry {
  entryId: string
  timesheetId: string
  serviceDate: string
  source: 'REGULAR' | 'BCBA'
  status: string
  rawType: string
  normalizedType: string | null
  units: number
  hours: number
}

const toNumber = (value: TimesheetEntryRow['units']) => {
  if (typeof value === 'number') return value
  if (value && typeof value === 'object' && typeof value.toNumber === 'function') {
    return value.toNumber()
  }
  if (value === null || value === undefined) return 0
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

const getAuthUnitMinutes = (auth: AuthorizationRow, unitMinutesByInsurance: UnitMinutesByInsurance) => {
  const unitMinutes = unitMinutesByInsurance[auth.insuranceId]
  if (auth.appliesTo === 'BCBA') {
    return unitMinutes?.bcba || unitMinutes?.regular || 15
  }
  return unitMinutes?.regular || unitMinutes?.bcba || 15
}

const normalizeEntryServiceType = (entry: TimesheetEntryRow): InsuranceCodeServiceType | null => {
  const source = entry.timesheet.isBCBA ? 'BCBA' : 'REGULAR'
  const rawType = entry.timesheet.isBCBA
    ? (entry.notes || entry.timesheet.serviceType)
    : (entry.notes || entry.timesheet.serviceType)
  return normalizeInsuranceCodesServiceType(source, rawType)
}

const rangesOverlap = (startA: string, endA: string, startB: string, endB: string) =>
  !(endA < startB || startA > endB)

const calcAuthorizationUsageInternal = (
  authRow: AuthorizationRow,
  context: UsageContext,
  weekRange: { start: string; end: string },
  monthRange: { start: string; end: string },
  includeDebug: boolean
): AuthorizationUsageResult => {
  const entries = context.entries
  const unitMinutes = getAuthUnitMinutes(authRow, context.unitMinutesByInsurance)
  const authStart = toDateOnlyString(authRow.startDate)
  const authEnd = toDateOnlyString(authRow.endDate)

  let usedRegular = 0
  let usedBcba = 0
  let usedUnitsWeek = 0
  let usedUnitsMonth = 0

  const entryIds = new Set<string>()
  const timesheetIds = new Set<string>()
  const debugEntries: DebugEntry[] = []

  const authServiceType = normalizeInsuranceCodesServiceType('REGULAR', authRow.serviceType) || authRow.serviceType

  for (const entry of entries) {
    const timesheet = entry.timesheet
    if (timesheet.clientId !== authRow.clientId) continue
    if (timesheet.insuranceId !== authRow.insuranceId) continue

    const entryServiceType = normalizeEntryServiceType(entry)
    if (!entryServiceType || entryServiceType !== authServiceType) continue

    const entryDate = toDateOnlyString(entry.date)
    if (!isDateOnlyBetween(entryDate, authStart, authEnd)) continue

    const isBCBA = timesheet.isBCBA === true
    if (authRow.appliesTo === 'REGULAR' && isBCBA) continue
    if (authRow.appliesTo === 'BCBA' && !isBCBA) continue

    let units = toNumber(entry.units)
    if (!units && entry.minutes) {
      const minutesPerUnit = isBCBA
        ? context.unitMinutesByInsurance?.[authRow.insuranceId]?.bcba
        : context.unitMinutesByInsurance?.[authRow.insuranceId]?.regular
      if (minutesPerUnit) {
        units = minutesToUnits(entry.minutes, minutesPerUnit)
      } else {
        // Fallback to 15 if no unit minutes exist for this insurance.
        units = minutesToUnits(entry.minutes, 15)
      }
    }

    if (isBCBA) {
      usedBcba += units
    } else {
      usedRegular += units
    }

    if (isDateOnlyBetween(entryDate, weekRange.start, weekRange.end)) {
      usedUnitsWeek += units
    }
    if (isDateOnlyBetween(entryDate, monthRange.start, monthRange.end)) {
      usedUnitsMonth += units
    }

    if (includeDebug) {
      entryIds.add(entry.id)
      timesheetIds.add(entry.timesheetId)
      debugEntries.push({
        entryId: entry.id,
        timesheetId: entry.timesheetId,
        serviceDate: entryDate,
        source: isBCBA ? 'BCBA' : 'REGULAR',
        status: timesheet.status,
        rawType: entry.timesheet.isBCBA
          ? (entry.notes || entry.timesheet.serviceType || '')
          : (entry.notes || entry.timesheet.serviceType || ''),
        normalizedType: entryServiceType,
        units,
        hours: (units * unitMinutes) / 60,
      })
    }
  }

  const usedTotal = usedRegular + usedBcba
  const remainingUnitsAuthRange = Math.max(0, authRow.authorizedUnits - usedTotal)
  const remainingHoursAuthRange = (remainingUnitsAuthRange * unitMinutes) / 60

  const overlapsWeek = rangesOverlap(authStart, authEnd, weekRange.start, weekRange.end)
  const overlapsMonth = rangesOverlap(authStart, authEnd, monthRange.start, monthRange.end)
  const remainingUnitsWeek = overlapsWeek ? Math.max(0, authRow.authorizedUnits - usedUnitsWeek) : 0
  const remainingUnitsMonth = overlapsMonth ? Math.max(0, authRow.authorizedUnits - usedUnitsMonth) : 0

  const hoursUsedWeek = (usedUnitsWeek * unitMinutes) / 60
  const hoursUsedMonth = (usedUnitsMonth * unitMinutes) / 60
  const hoursRemainingWeek = (remainingUnitsWeek * unitMinutes) / 60
  const hoursRemainingMonth = (remainingUnitsMonth * unitMinutes) / 60

  return {
    usedRegular,
    usedBcba,
    usedTotal,
    usedUnitsWeek,
    usedUnitsMonth,
    remainingUnitsAuthRange,
    remainingHoursAuthRange,
    remainingUnitsWeek,
    remainingUnitsMonth,
    hoursUsedWeek,
    hoursUsedMonth,
    hoursRemainingWeek,
    hoursRemainingMonth,
    debug: includeDebug
      ? { entryIds: Array.from(entryIds), timesheetIds: Array.from(timesheetIds), entries: debugEntries }
      : undefined,
  }
}

export async function computeInsuranceCodesAnalytics(params: {
  clientId?: string
  insuranceId?: string
  search?: string
  today?: Date
  debug?: boolean
}) {
  const baseDate = params.today || new Date()
  const weekStart = startOfWeek(baseDate, { weekStartsOn: 1 })
  const weekEnd = endOfWeek(baseDate, { weekStartsOn: 1 })
  const monthStart = startOfMonth(baseDate)
  const monthEnd = endOfMonth(baseDate)

  const weekRange = {
    start: toDateOnlyString(weekStart),
    end: toDateOnlyString(weekEnd),
  }
  const monthRange = {
    start: toDateOnlyString(monthStart),
    end: toDateOnlyString(monthEnd),
  }

  const where: any = {}
  if (params.clientId) where.clientId = params.clientId
  if (params.insuranceId) where.insuranceId = params.insuranceId
  if (params.search) {
    where.OR = [
      { cptCode: { contains: params.search, mode: 'insensitive' } },
      { codeName: { contains: params.search, mode: 'insensitive' } },
      { client: { name: { contains: params.search, mode: 'insensitive' } } },
      { insurance: { name: { contains: params.search, mode: 'insensitive' } } },
    ]
  }

  const authorizations = await prisma.insuranceCodeAuthorization.findMany({
    where,
    include: {
      client: { select: { id: true, name: true, insuranceId: true } },
      insurance: { select: { id: true, name: true, regularUnitMinutes: true, bcbaUnitMinutes: true } },
    },
    orderBy: { createdAt: 'desc' },
  })

  if (authorizations.length === 0) {
    return {
      items: [],
      summary: {
        totalAuthorized: 0,
        totalUsedWeek: 0,
        totalUsedMonth: 0,
        totalRemaining: 0,
        totalRemainingHours: 0,
      },
      serviceTypeSummary: {},
      serviceTypeBreakdown: {},
      debugBreakdown: params.debug ? [] : undefined,
    }
  }

  const minStartDate = authorizations.reduce(
    (min, auth) => (auth.startDate < min ? auth.startDate : min),
    authorizations[0].startDate
  )
  const maxEndDate = authorizations.reduce(
    (max, auth) => (auth.endDate > max ? auth.endDate : max),
    authorizations[0].endDate
  )
  const backfillStart = parseDateOnly('2026-01-19')
  const rangeStart = minStartDate < backfillStart ? backfillStart : minStartDate

  const defaultStatuses = getDefaultReportIncludedStatuses()
  const filters: any = {
    clientId: params.clientId,
    insuranceId: params.insuranceId,
    startDate: rangeStart,
    endDate: maxEndDate,
  }
  if (defaultStatuses.length) {
    filters.status = defaultStatuses
  }

  // Match Reports detailed logic: timesheet filters from buildTimesheetWhereClause,
  // entry date filtering from buildEntryWhereClause, using timesheetEntry rows.
  const timesheetWhereNoDate = buildTimesheetWhereClause({
    ...filters,
    startDate: undefined,
    endDate: undefined,
  })
  const entryWhere = buildEntryWhereClause(filters, timesheetWhereNoDate)

  const entries = await prisma.timesheetEntry.findMany({
    where: entryWhere,
    select: {
      id: true,
      timesheetId: true,
      date: true,
      units: true,
      minutes: true,
      notes: true,
      timesheet: {
        select: {
          clientId: true,
          insuranceId: true,
          isBCBA: true,
          serviceType: true,
          status: true,
        },
      },
    },
  })

  const unitMinutesByInsurance = authorizations.reduce<UnitMinutesByInsurance>((acc, auth) => {
    if (!acc[auth.insuranceId]) {
      acc[auth.insuranceId] = {
        regular: auth.insurance.regularUnitMinutes || auth.insurance.bcbaUnitMinutes || 15,
        bcba: auth.insurance.bcbaUnitMinutes || auth.insurance.regularUnitMinutes || 15,
      }
    }
    return acc
  }, {})

  const usageByAuth = new Map<string, AuthorizationUsageResult>()
  const debugBreakdown: Array<{
    authorizationId: string
    entryIds: string[]
    timesheetIds: string[]
    entries: DebugEntry[]
    totals: {
      usedUnitsAuthRange: number
      usedUnitsWeek: number
      usedUnitsMonth: number
    }
  }> = []

  for (const auth of authorizations) {
    const usage = calcAuthorizationUsageInternal(auth, { entries, unitMinutesByInsurance }, weekRange, monthRange, !!params.debug)
    usageByAuth.set(auth.id, usage)
    if (params.debug && usage.debug) {
      debugBreakdown.push({
        authorizationId: auth.id,
        entryIds: usage.debug.entryIds,
        timesheetIds: usage.debug.timesheetIds,
        entries: usage.debug.entries,
        totals: {
          usedUnitsAuthRange: usage.usedTotal,
          usedUnitsWeek: usage.usedUnitsWeek,
          usedUnitsMonth: usage.usedUnitsMonth,
        },
      })
    }
  }

  let totalAuthorized = 0
  let totalUsedWeek = 0
  let totalUsedMonth = 0
  let totalRemaining = 0
  let totalRemainingHours = 0

  const serviceTypeBreakdown: Record<string, any> = {}
  const serviceTypeSummary: Record<string, { used: number; remaining: number }> = {}

  for (const serviceType of SERVICE_TYPE_OPTIONS) {
    serviceTypeBreakdown[serviceType.value] = {
      unitsUsedAuthRange: 0,
      unitsRemainingAuthRange: 0,
      hoursUsedWeek: 0,
      hoursRemainingWeek: 0,
      hoursUsedMonth: 0,
      hoursRemainingMonth: 0,
    }
    serviceTypeSummary[serviceType.value] = { used: 0, remaining: 0 }
  }

  const items = authorizations.map((auth) => {
    const usage = usageByAuth.get(auth.id)!
    const unitMinutes = getAuthUnitMinutes(auth, unitMinutesByInsurance)

    if (auth.isActive) {
      totalAuthorized += auth.authorizedUnits
      totalRemaining += usage.remainingUnitsAuthRange
      totalRemainingHours += usage.remainingHoursAuthRange
      // Overlap is intentionally double-counted in summary totals for simplicity.
      totalUsedWeek += usage.usedUnitsWeek
      totalUsedMonth += usage.usedUnitsMonth
    }

    if (serviceTypeBreakdown[auth.serviceType]) {
      serviceTypeBreakdown[auth.serviceType].unitsUsedAuthRange += usage.usedTotal
      serviceTypeBreakdown[auth.serviceType].unitsRemainingAuthRange += usage.remainingUnitsAuthRange
      serviceTypeBreakdown[auth.serviceType].hoursUsedWeek += usage.hoursUsedWeek
      serviceTypeBreakdown[auth.serviceType].hoursRemainingWeek += usage.hoursRemainingWeek
      serviceTypeBreakdown[auth.serviceType].hoursUsedMonth += usage.hoursUsedMonth
      serviceTypeBreakdown[auth.serviceType].hoursRemainingMonth += usage.hoursRemainingMonth

      serviceTypeSummary[auth.serviceType].used += usage.usedTotal
      serviceTypeSummary[auth.serviceType].remaining += usage.remainingUnitsAuthRange
    }

    return {
      ...auth,
      startDate: toDateOnlyString(auth.startDate),
      endDate: toDateOnlyString(auth.endDate),
      usedUnitsRegular: usage.usedRegular,
      usedUnitsBcba: usage.usedBcba,
      usedUnitsTotal: usage.usedTotal,
      usedUnitsAuthRange: usage.usedTotal,
      remainingUnitsAuthRange: usage.remainingUnitsAuthRange,
      remainingHoursAuthRange: usage.remainingHoursAuthRange,
      usedUnitsWeek: usage.usedUnitsWeek,
      usedUnitsMonth: usage.usedUnitsMonth,
      remainingUnitsWeek: usage.remainingUnitsWeek,
      remainingUnitsMonth: usage.remainingUnitsMonth,
      unitMinutes,
    }
  })

  return {
    items,
    summary: {
      totalAuthorized,
      totalUsedWeek,
      totalUsedMonth,
      totalRemaining,
      totalRemainingHours,
    },
    serviceTypeSummary,
    serviceTypeBreakdown,
    debugBreakdown: params.debug ? debugBreakdown : undefined,
  }
}

export function calcAuthorizationUsage(authRow: AuthorizationRow, context?: UsageContext) {
  if (!context) {
    return {
      usedRegular: 0,
      usedBcba: 0,
      usedTotal: 0,
      remainingUnitsAuthRange: authRow.authorizedUnits,
      remainingHoursAuthRange: 0,
    }
  }

  const authStart = toDateOnlyString(authRow.startDate)
  const authEnd = toDateOnlyString(authRow.endDate)
  const usage = calcAuthorizationUsageInternal(
    authRow,
    context,
    { start: authStart, end: authEnd },
    { start: authStart, end: authEnd },
    false
  )

  return {
    usedRegular: usage.usedRegular,
    usedBcba: usage.usedBcba,
    usedTotal: usage.usedTotal,
    remainingUnits: usage.remainingUnitsAuthRange,
    remainingHours: usage.remainingHoursAuthRange,
  }
}

export function calcSummary() {
  return {
    summary: {
      totalAuthorized: 0,
      totalUsedWeek: 0,
      totalUsedMonth: 0,
      totalRemaining: 0,
      totalRemainingHours: 0,
    },
    serviceTypeSummary: {},
  }
}
