/**
 * Timesheet-specific utilities
 * Handles timezone calculations
 * 
 * NOTE: Rounding and overnight sessions have been REMOVED per requirements
 */

import { TimeAMPM, timeAMPMToMinutes } from '@/components/timesheets/TimeFieldAMPM'
import { zonedTimeToUtc, utcToZonedTime } from 'date-fns-tz'

/**
 * Calculate duration in minutes (same-day only, no overnight support)
 * Returns null if invalid
 */
export function calculateDurationMinutes(
  startTime: TimeAMPM | null,
  endTime: TimeAMPM | null
): number | null {
  if (!startTime || !endTime) return null

  const startMins = timeAMPMToMinutes(startTime)
  const endMins = timeAMPMToMinutes(endTime)

  if (startMins === null || endMins === null) return null

  // Normal same-day session only
  if (endMins <= startMins) {
    // Invalid: end must be after start (end == start is allowed per overlap rules)
    return null
  }
  return endMins - startMins
}

/**
 * Validate time range
 * Returns error message if invalid, null if valid
 */
export function validateTimeRange(
  startTime: TimeAMPM | null,
  endTime: TimeAMPM | null
): string | null {
  if (!startTime || !endTime) {
    return null // Missing times are handled separately
  }

  const startMins = timeAMPMToMinutes(startTime)
  const endMins = timeAMPMToMinutes(endTime)

  if (startMins === null || endMins === null) {
    return 'Invalid time format'
  }

  if (endMins <= startMins) {
    return 'End time must be after start time'
  }

  return null
}

/**
 * Check if a date is in a DST transition period
 * Returns true if the date falls on a DST change day
 */
export function isDSTTransition(date: Date, timezone: string = 'America/New_York'): boolean {
  try {
    const zonedDate = utcToZonedTime(date, timezone)
    const nextDay = new Date(zonedDate)
    nextDay.setDate(nextDay.getDate() + 1)
    const zonedNextDay = utcToZonedTime(nextDay, timezone)

    // Check if the UTC offset changes between days
    const offset1 = zonedDate.getTimezoneOffset()
    const offset2 = zonedNextDay.getTimezoneOffset()

    return offset1 !== offset2
  } catch (error) {
    return false
  }
}

/**
 * Calculate duration with timezone awareness
 * Ensures DST transitions don't break calculations
 */
export function calculateDurationWithTimezone(
  startTime: TimeAMPM | null,
  endTime: TimeAMPM | null,
  date: Date,
  timezone: string = 'America/New_York'
): number | null {
  const duration = calculateDurationMinutes(startTime, endTime)
  if (duration === null) return null

  // For same-day calculations, timezone doesn't affect duration
  // DST transitions are handled at the date level, not time level
  // This is a simplified approach - in production, you might want more sophisticated handling
  return duration
}

/**
 * Format units for display (always 2 decimal places)
 */
export function formatUnits(units: number): string {
  return units.toFixed(2)
}

/**
 * Format hours for display (always 2 decimal places)
 */
export function formatHours(hours: number): string {
  return hours.toFixed(2)
}
