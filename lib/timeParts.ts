/**
 * Time Parts Utilities
 * 
 * Single source of truth for time conversions using parts (hour12, minute, ampm).
 * Internal value: minutes since midnight (0-1439) or null
 * 
 * NEVER returns NaN. Ever.
 */

/**
 * Convert hour (1-12), minute (0-59), and AM/PM to minutes since midnight
 * Returns null if invalid (never NaN)
 */
export function partsToMinutes(
  hour12: number,
  minute: number,
  ampm: 'AM' | 'PM'
): number | null {
  // Validate inputs
  if (typeof hour12 !== 'number' || isNaN(hour12)) return null
  if (typeof minute !== 'number' || isNaN(minute)) return null
  if (hour12 < 1 || hour12 > 12) return null
  if (minute < 0 || minute > 59) return null

  let hours24 = hour12
  if (ampm === 'PM' && hour12 !== 12) hours24 += 12
  if (ampm === 'AM' && hour12 === 12) hours24 = 0

  const result = hours24 * 60 + minute
  // Double-check result is valid
  if (result < 0 || result >= 1440) return null
  return result
}

/**
 * Convert minutes since midnight to {hour12, minute, ampm}
 * Returns null values if invalid
 */
export function minutesToParts(minutes: number | null): {
  hour12: number | null
  minute: number | null
  ampm: 'AM' | 'PM' | null
} {
  if (minutes === null || minutes < 0 || minutes >= 1440) {
    return { hour12: null, minute: null, ampm: null }
  }

  const hours24 = Math.floor(minutes / 60)
  const mins = minutes % 60

  let hour12 = hours24 % 12
  if (hour12 === 0) hour12 = 12
  const ampm: 'AM' | 'PM' = hours24 >= 12 ? 'PM' : 'AM'

  return {
    hour12,
    minute: mins,
    ampm,
  }
}

/**
 * Calculate duration in minutes between start and end
 * Returns null if invalid (never NaN)
 */
export function durationMinutes(
  startMins: number | null,
  endMins: number | null
): number | null {
  if (startMins === null || endMins === null) return null
  if (startMins < 0 || startMins >= 1440) return null
  if (endMins < 0 || endMins >= 1440) return null
  if (endMins < startMins) return null // Overnight not supported

  return endMins - startMins
}
