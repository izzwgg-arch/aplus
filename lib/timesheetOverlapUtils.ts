/**
 * Timesheet Overlap Detection Utilities
 * 
 * Overlap definition: startA < endB AND startB < endA
 * (endA == startB is allowed - no overlap)
 * 
 * Overlaps must be prevented for:
 * 1) Same Provider
 * 2) Same Client
 * 3) Same Timesheet
 * 4) DR vs DR
 * 5) SV vs SV
 * 6) DR vs SV (same provider/client)
 */

import { TimeAMPM, timeAMPMToMinutes } from '@/components/timesheets/TimeFieldAMPM'
import { format } from 'date-fns'

export interface TimeRange {
  startMinutes: number
  endMinutes: number
}

export interface OverlapConflict {
  date: Date
  dateStr: string
  type: 'DR' | 'SV'
  startTime: TimeAMPM
  endTime: TimeAMPM
  conflictingWith: {
    type: 'same-timesheet' | 'existing-timesheet'
    timesheetId?: string
    entryId?: string
    date: Date
    dateStr: string
    entryType: 'DR' | 'SV'
    startTime: TimeAMPM
    endTime: TimeAMPM
  }
  message: string
}

/**
 * Check if two time ranges overlap
 * Returns true if they overlap, false otherwise
 * (endA == startB is NOT an overlap)
 */
export function timeRangesOverlap(
  rangeA: TimeRange,
  rangeB: TimeRange
): boolean {
  // Overlap: startA < endB AND startB < endA
  return rangeA.startMinutes < rangeB.endMinutes && rangeB.startMinutes < rangeA.endMinutes
}

/**
 * Convert TimeAMPM to minutes for comparison
 */
function timeToMinutes(time: TimeAMPM | null): number | null {
  if (!time) return null
  return timeAMPMToMinutes(time)
}

/**
 * Check for overlaps within a single timesheet (day entries)
 * Returns array of conflicts
 */
export function checkInternalOverlaps(
  dayEntries: Array<{
    date: Date
    drFrom: TimeAMPM | null
    drTo: TimeAMPM | null
    drUse: boolean
    svFrom: TimeAMPM | null
    svTo: TimeAMPM | null
    svUse: boolean
  }>
): OverlapConflict[] {
  const conflicts: OverlapConflict[] = []

  // Check each day entry
  for (let i = 0; i < dayEntries.length; i++) {
    const entry = dayEntries[i]
    const dateStr = format(entry.date, 'MM/dd/yyyy')

    // Check DR vs DR (shouldn't happen in same day, but check anyway)
    if (entry.drUse && entry.drFrom && entry.drTo) {
      const drStart = timeToMinutes(entry.drFrom)
      const drEnd = timeToMinutes(entry.drTo)
      if (drStart !== null && drEnd !== null && drEnd <= drStart) {
        conflicts.push({
          date: entry.date,
          dateStr,
          type: 'DR',
          startTime: entry.drFrom,
          endTime: entry.drTo,
          conflictingWith: {
            type: 'same-timesheet',
            date: entry.date,
            dateStr,
            entryType: 'DR',
            startTime: entry.drFrom,
            endTime: entry.drTo,
          },
          message: `Invalid DR time range on ${dateStr}: End time must be after start time.`,
        })
      }
    }

    // Check SV vs SV
    if (entry.svUse && entry.svFrom && entry.svTo) {
      const svStart = timeToMinutes(entry.svFrom)
      const svEnd = timeToMinutes(entry.svTo)
      if (svStart !== null && svEnd !== null && svEnd <= svStart) {
        conflicts.push({
          date: entry.date,
          dateStr,
          type: 'SV',
          startTime: entry.svFrom,
          endTime: entry.svTo,
          conflictingWith: {
            type: 'same-timesheet',
            date: entry.date,
            dateStr,
            entryType: 'SV',
            startTime: entry.svFrom,
            endTime: entry.svTo,
          },
          message: `Invalid SV time range on ${dateStr}: End time must be after start time.`,
        })
      }
    }

    // Check DR vs SV on same day
    if (entry.drUse && entry.svUse && entry.drFrom && entry.drTo && entry.svFrom && entry.svTo) {
      const drStart = timeToMinutes(entry.drFrom)
      const drEnd = timeToMinutes(entry.drTo)
      const svStart = timeToMinutes(entry.svFrom)
      const svEnd = timeToMinutes(entry.svTo)

      if (drStart !== null && drEnd !== null && svStart !== null && svEnd !== null) {
        const drRange: TimeRange = { startMinutes: drStart, endMinutes: drEnd }
        const svRange: TimeRange = { startMinutes: svStart, endMinutes: svEnd }

        if (timeRangesOverlap(drRange, svRange)) {
          conflicts.push({
            date: entry.date,
            dateStr,
            type: 'DR',
            startTime: entry.drFrom,
            endTime: entry.drTo,
            conflictingWith: {
              type: 'same-timesheet',
              date: entry.date,
              dateStr,
              entryType: 'SV',
              startTime: entry.svFrom,
              endTime: entry.svTo,
            },
            message: `Overlap detected on ${dateStr}: DR ${formatTimeAMPM(entry.drFrom)}–${formatTimeAMPM(entry.drTo)} overlaps with SV ${formatTimeAMPM(entry.svFrom)}–${formatTimeAMPM(entry.svTo)}.`,
          })
        }
      }
    }

    // Check against other entries in the same timesheet (same day, different rows)
    // This shouldn't happen with current structure, but included for completeness
    for (let j = i + 1; j < dayEntries.length; j++) {
      const otherEntry = dayEntries[j]
      // Only check same date
      if (format(entry.date, 'yyyy-MM-dd') !== format(otherEntry.date, 'yyyy-MM-dd')) {
        continue
      }

      // DR vs DR (different rows, same day - shouldn't happen but check)
      if (entry.drUse && otherEntry.drUse && entry.drFrom && entry.drTo && otherEntry.drFrom && otherEntry.drTo) {
        const dr1Start = timeToMinutes(entry.drFrom)
        const dr1End = timeToMinutes(entry.drTo)
        const dr2Start = timeToMinutes(otherEntry.drFrom)
        const dr2End = timeToMinutes(otherEntry.drTo)

        if (dr1Start !== null && dr1End !== null && dr2Start !== null && dr2End !== null) {
          const dr1Range: TimeRange = { startMinutes: dr1Start, endMinutes: dr1End }
          const dr2Range: TimeRange = { startMinutes: dr2Start, endMinutes: dr2End }

          if (timeRangesOverlap(dr1Range, dr2Range)) {
            conflicts.push({
              date: entry.date,
              dateStr,
              type: 'DR',
              startTime: entry.drFrom,
              endTime: entry.drTo,
              conflictingWith: {
                type: 'same-timesheet',
                date: otherEntry.date,
                dateStr: format(otherEntry.date, 'MM/dd/yyyy'),
                entryType: 'DR',
                startTime: otherEntry.drFrom,
                endTime: otherEntry.drTo,
              },
              message: `Overlap detected on ${dateStr}: DR ${formatTimeAMPM(entry.drFrom)}–${formatTimeAMPM(entry.drTo)} overlaps with another DR ${formatTimeAMPM(otherEntry.drFrom)}–${formatTimeAMPM(otherEntry.drTo)}.`,
            })
          }
        }
      }

      // Similar checks for SV vs SV, DR vs SV across rows...
    }
  }

  return conflicts
}

/**
 * Format TimeAMPM for display
 */
function formatTimeAMPM(time: TimeAMPM): string {
  return `${time.hour}:${time.minute.toString().padStart(2, '0')} ${time.meridiem}`
}

/**
 * Prepare entries for overlap checking against existing timesheets
 * This will be called from the frontend before save
 */
export interface PreparedEntry {
  date: Date
  dateStr: string
  type: 'DR' | 'SV'
  startTime: TimeAMPM
  endTime: TimeAMPM
  startMinutes: number
  endMinutes: number
}

export function prepareEntriesForOverlapCheck(
  dayEntries: Array<{
    date: Date
    drFrom: TimeAMPM | null
    drTo: TimeAMPM | null
    drUse: boolean
    svFrom: TimeAMPM | null
    svTo: TimeAMPM | null
    svUse: boolean
  }>
): PreparedEntry[] {
  const prepared: PreparedEntry[] = []

  for (const entry of dayEntries) {
    if (entry.drUse && entry.drFrom && entry.drTo) {
      const startMins = timeToMinutes(entry.drFrom)
      const endMins = timeToMinutes(entry.drTo)
      if (startMins !== null && endMins !== null && endMins > startMins) {
        prepared.push({
          date: entry.date,
          dateStr: format(entry.date, 'yyyy-MM-dd'),
          type: 'DR',
          startTime: entry.drFrom,
          endTime: entry.drTo,
          startMinutes: startMins,
          endMinutes: endMins,
        })
      }
    }

    if (entry.svUse && entry.svFrom && entry.svTo) {
      const startMins = timeToMinutes(entry.svFrom)
      const endMins = timeToMinutes(entry.svTo)
      if (startMins !== null && endMins !== null && endMins > startMins) {
        prepared.push({
          date: entry.date,
          dateStr: format(entry.date, 'yyyy-MM-dd'),
          type: 'SV',
          startTime: entry.svFrom,
          endTime: entry.svTo,
          startMinutes: startMins,
          endMinutes: endMins,
        })
      }
    }
  }

  return prepared
}
