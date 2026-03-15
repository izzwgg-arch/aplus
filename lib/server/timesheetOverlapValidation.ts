import { prisma } from '@/lib/prisma'
import { utcToZonedTime, format } from 'date-fns-tz'

export type TimesheetEntryType = 'DR' | 'SV' | 'UNKNOWN'
export type OverlapScope = 'provider' | 'client' | 'both' | 'internal'

export interface IncomingTimesheetEntry {
  date: string // ISO string
  startTime: string // HH:mm (24h)
  endTime: string // HH:mm (24h)
  notes?: string | null // DR | SV | null
}

export interface OverlapConflict {
  code: 'OVERLAP_CONFLICT'
  date: string // YYYY-MM-DD
  startTime: string // HH:mm
  endTime: string // HH:mm
  entryType: TimesheetEntryType
  scope: OverlapScope
  provider: { id: string; name: string }
  client: { id: string; name: string }
  conflicting?: {
    timesheetId: string
    entryId: string
    startTime: string
    endTime: string
    entryType: TimesheetEntryType
  }
  message: string
}

function parseHHMMToMinutes(hhmm: string): number | null {
  if (!hhmm) return null
  const match = hhmm.match(/^([0-1]?[0-9]|2[0-3]):([0-5][0-9])$/)
  if (!match) return null
  const h = Number(match[1])
  const m = Number(match[2])
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null
  return h * 60 + m
}

function normalizeDateStr(dateIso: string): string {
  // Always compare by UTC date portion (stored dates use ISO in this app)
  return new Date(dateIso).toISOString().slice(0, 10)
}

function toEntryType(notes?: string | null): TimesheetEntryType {
  if (notes === 'DR') return 'DR'
  if (notes === 'SV') return 'SV'
  return 'UNKNOWN'
}

function rangesOverlap(startA: number, endA: number, startB: number, endB: number): boolean {
  // Overlap: startA < endB AND startB < endA (end == start is allowed)
  return startA < endB && startB < endA
}

export async function detectTimesheetOverlaps(params: {
  providerId: string
  clientId: string
  providerName: string
  clientName: string
  entries: IncomingTimesheetEntry[]
  excludeTimesheetId?: string
}): Promise<OverlapConflict[]> {
  const { providerId, clientId, providerName, clientName, entries, excludeTimesheetId } = params

  // Build normalized entries with minutes
  const normalized = entries
    .map((e) => {
      const date = normalizeDateStr(e.date)
      const startMinutes = parseHHMMToMinutes(e.startTime)
      const endMinutes = parseHHMMToMinutes(e.endTime)
      return {
        raw: e,
        date,
        startMinutes,
        endMinutes,
        entryType: toEntryType(e.notes),
      }
    })
    .filter((e) => e.startMinutes !== null && e.endMinutes !== null) as Array<{
    raw: IncomingTimesheetEntry
    date: string
    startMinutes: number
    endMinutes: number
    entryType: TimesheetEntryType
  }>

  const conflicts: OverlapConflict[] = []

  // Internal overlap check (within incoming payload)
  const byDate = new Map<string, typeof normalized>()
  for (const e of normalized) {
    if (!byDate.has(e.date)) byDate.set(e.date, [])
    byDate.get(e.date)!.push(e)
  }

  for (const [date, list] of byDate.entries()) {
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i]
        const b = list[j]
        if (rangesOverlap(a.startMinutes, a.endMinutes, b.startMinutes, b.endMinutes)) {
          conflicts.push({
            code: 'OVERLAP_CONFLICT',
            date,
            startTime: a.raw.startTime,
            endTime: a.raw.endTime,
            entryType: a.entryType,
            scope: 'internal',
            provider: { id: providerId, name: providerName },
            client: { id: clientId, name: clientName },
            message: `Overlap detected on ${date}: ${a.entryType} ${a.raw.startTime}–${a.raw.endTime} overlaps with ${b.entryType} ${b.raw.startTime}–${b.raw.endTime} in this timesheet.`,
          })
        }
      }
    }
  }

  const uniqueDates = Array.from(new Set(normalized.map((e) => e.date)))
  if (uniqueDates.length === 0) return conflicts

  // Fetch existing entries on those dates for:
  // - same provider OR same client (as required), excluding deleted timesheets and (optionally) current timesheet
  // CRITICAL: Query dates need to account for timezone - we need to fetch entries that fall within
  // the date range when converted to NY timezone. Since dates are stored as UTC, we need to expand
  // the range to catch entries that might be on the previous or next day in UTC but same day in NY.
  const NY_TIMEZONE = 'America/New_York'
  const { zonedTimeToUtc } = await import('date-fns-tz')
  const dateOr = uniqueDates.flatMap((date) => {
    // Parse the date as midnight in NY timezone, then convert to UTC for query
    const startOfDayNY = zonedTimeToUtc(`${date}T00:00:00`, NY_TIMEZONE)
    const endOfDayNY = zonedTimeToUtc(`${date}T23:59:59`, NY_TIMEZONE)
    // Expand range slightly to catch edge cases (add/subtract 1 day in UTC)
    return [
      {
        date: {
          gte: new Date(startOfDayNY.getTime() - 24 * 60 * 60 * 1000), // 1 day before in UTC
          lte: new Date(endOfDayNY.getTime() + 24 * 60 * 60 * 1000), // 1 day after in UTC
        },
      },
    ]
  })

  // CRITICAL: Only fetch entries from active (non-deleted) timesheets
  // CRITICAL: Exclude BCBA timesheets - they allow overlaps
  // Double-check that deletedAt is explicitly null
  const existing = await prisma.timesheetEntry.findMany({
    where: {
      AND: [
        { OR: dateOr },
        {
          timesheet: {
            deletedAt: null, // CRITICAL: Only check entries from non-deleted timesheets
            isBCBA: false, // CRITICAL: Exclude BCBA timesheets - they allow overlaps
            ...(excludeTimesheetId ? { id: { not: excludeTimesheetId } } : {}),
            OR: [{ providerId }, { clientId }],
          },
        },
      ],
    },
    include: {
      timesheet: {
        select: {
          id: true,
          providerId: true,
          clientId: true,
          deletedAt: true, // Include deletedAt to verify filtering
          provider: { select: { name: true } },
          client: { select: { name: true } },
        },
      },
    },
  })

  // Compare each incoming entry to each existing entry on the same date
  // CRITICAL: Use NY timezone for date comparison to match timesheet timezone
  for (const inc of normalized) {
    for (const ex of existing) {
      // Convert existing entry date from UTC to NY timezone, then get date string
      const exDateInNY = utcToZonedTime(ex.date, NY_TIMEZONE)
      const exDate = format(exDateInNY, 'yyyy-MM-dd')
      if (exDate !== inc.date) continue

      const exStart = parseHHMMToMinutes(ex.startTime)
      const exEnd = parseHHMMToMinutes(ex.endTime)
      if (exStart === null || exEnd === null) continue

      // Check if times actually overlap
      if (!rangesOverlap(inc.startMinutes, inc.endMinutes, exStart, exEnd)) continue

      const providerMatch = ex.timesheet.providerId === providerId
      const clientMatch = ex.timesheet.clientId === clientId
      
      // CRITICAL: Only report overlap if there's an actual match (provider OR client)
      // AND the times actually overlap
      if (!providerMatch && !clientMatch) continue
      
      const scope: OverlapScope = providerMatch && clientMatch ? 'both' : providerMatch ? 'provider' : 'client'
      
      // Additional validation: Verify the timesheet is not deleted
      // Double-check that we're not comparing against deleted timesheets
      if (ex.timesheet.deletedAt !== null && ex.timesheet.deletedAt !== undefined) {
        console.warn('[OVERLAP_CHECK] WARNING: Found entry from deleted timesheet!', {
          entryId: ex.id,
          timesheetId: ex.timesheet.id,
          deletedAt: ex.timesheet.deletedAt,
        })
        continue // Skip this entry - it's from a deleted timesheet
      }
      
      // Additional validation: Log the comparison for debugging
      console.log('[OVERLAP_CHECK]', {
        incoming: {
          date: inc.date,
          time: `${inc.raw.startTime}-${inc.raw.endTime}`,
          minutes: `${inc.startMinutes}-${inc.endMinutes}`,
          type: inc.entryType,
        },
        existing: {
          timesheetId: ex.timesheet.id,
          entryId: ex.id,
          date: exDate,
          time: `${ex.startTime}-${ex.endTime}`,
          minutes: `${exStart}-${exEnd}`,
          type: toEntryType(ex.notes),
          providerId: ex.timesheet.providerId,
          clientId: ex.timesheet.clientId,
          deletedAt: ex.timesheet.deletedAt,
        },
        matches: { providerMatch, clientMatch },
        timesOverlap: rangesOverlap(inc.startMinutes, inc.endMinutes, exStart, exEnd),
      })

      const exType = toEntryType(ex.notes)
      const providerLabel = ex.timesheet.provider?.name || providerName
      const clientLabel = ex.timesheet.client?.name || clientName

      conflicts.push({
        code: 'OVERLAP_CONFLICT',
        date: inc.date,
        startTime: inc.raw.startTime,
        endTime: inc.raw.endTime,
        entryType: inc.entryType,
        scope,
        provider: { id: providerId, name: providerName },
        client: { id: clientId, name: clientName },
        conflicting: {
          timesheetId: ex.timesheet.id,
          entryId: ex.id,
          startTime: ex.startTime,
          endTime: ex.endTime,
          entryType: exType,
        },
        message:
          scope === 'both'
            ? `Overlap detected on ${inc.date}: ${inc.entryType} ${inc.raw.startTime}–${inc.raw.endTime} overlaps with existing ${exType} ${ex.startTime}–${ex.endTime} for Provider ${providerLabel} and Client ${clientLabel}.`
            : scope === 'provider'
              ? `Overlap detected on ${inc.date}: Provider ${providerLabel} already scheduled ${ex.startTime}–${ex.endTime}.`
              : `Overlap detected on ${inc.date}: Client ${clientLabel} already scheduled ${ex.startTime}–${ex.endTime}.`,
      })
    }
  }

  return conflicts
}

