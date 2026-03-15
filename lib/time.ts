/**
 * Centralized Time Utilities
 * 
 * Single source of truth for time conversions.
 * Internal format: minutes since midnight (0-1439) or null
 * 
 * NEVER returns NaN - always returns a number or null
 */

export const INVALID_TIME = -1

export type TimeParts = {
  hour12: number | null
  minute2: string | null
  ampm: 'AM' | 'PM' | null
}

/**
 * Convert hour (1-12), minute (0-59), and AM/PM to minutes since midnight
 * Returns null if invalid (never NaN)
 */
export function toMinutes(
  hour12: number | string,
  minute: number | string,
  ampm: 'AM' | 'PM'
): number | null {
  const hourNum = typeof hour12 === 'string' ? parseInt(hour12, 10) : hour12
  const minuteNum = typeof minute === 'string' ? parseInt(minute, 10) : minute

  if (isNaN(hourNum) || isNaN(minuteNum)) return null
  if (hourNum < 1 || hourNum > 12) return null
  if (minuteNum < 0 || minuteNum > 59) return null

  let hours24 = hourNum
  if (ampm === 'PM' && hourNum !== 12) hours24 += 12
  if (ampm === 'AM' && hourNum === 12) hours24 = 0

  return hours24 * 60 + minuteNum
}

/**
 * Convert minutes since midnight to {hour12, minute2, ampm}
 * Returns null values if invalid
 */
export function fromMinutes(minutes: number | null): TimeParts {
  if (minutes === null || minutes === INVALID_TIME || minutes < 0 || minutes >= 1440) {
    return { hour12: null, minute2: null, ampm: null }
  }

  const hours24 = Math.floor(minutes / 60)
  const mins = minutes % 60

  let hour12 = hours24 % 12
  if (hour12 === 0) hour12 = 12
  const ampm: 'AM' | 'PM' = hours24 >= 12 ? 'PM' : 'AM'

  return {
    hour12,
    minute2: mins.toString().padStart(2, '0'),
    ampm,
  }
}

/**
 * Calculate duration in minutes between start and end
 * Returns null if invalid (never NaN)
 */
export function duration(startMinutes: number | null, endMinutes: number | null): number | null {
  if (startMinutes === null || startMinutes === INVALID_TIME) return null
  if (endMinutes === null || endMinutes === INVALID_TIME) return null
  if (endMinutes < startMinutes) return null // Overnight not supported

  return endMinutes - startMinutes
}

/**
 * Convert minutes to 24-hour format string (HH:mm)
 */
export function to24Hour(minutes: number | null): string {
  if (minutes === null || minutes === INVALID_TIME || minutes < 0 || minutes >= 1440) {
    return '--:--'
  }

  const hours = Math.floor(minutes / 60)
  const mins = minutes % 60

  return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`
}

/**
 * Convert minutes to 12-hour display format (H:MM AM/PM)
 */
export function to12Hour(minutes: number | null): string {
  if (minutes === null || minutes === INVALID_TIME || minutes < 0 || minutes >= 1440) {
    return '--:--'
  }

  const { hour12, minute2, ampm } = fromMinutes(minutes)
  if (hour12 === null || minute2 === null || ampm === null) {
    return '--:--'
  }

  return `${hour12}:${minute2} ${ampm}`
}

/**
 * Validate time range
 */
export function validateRange(
  startMinutes: number | null,
  endMinutes: number | null
): { valid: boolean; error?: string } {
  if (startMinutes === null || startMinutes === INVALID_TIME) {
    return { valid: false, error: 'Invalid start time' }
  }
  if (endMinutes === null || endMinutes === INVALID_TIME) {
    return { valid: false, error: 'Invalid end time' }
  }
  if (endMinutes < startMinutes) {
    return { valid: false, error: 'End time must be after start time' }
  }
  return { valid: true }
}
