/**
 * Normalized Time Utilities
 * 
 * Internal format: minutes since midnight (0-1439)
 * Display format: "HH:mm AM/PM" (12-hour)
 * Storage format: "HH:mm" (24-hour)
 * 
 * This ensures a single source of truth and prevents NaN issues.
 */

export const INVALID_TIME = -1
export const PLACEHOLDER_TIME = '--:--'

/**
 * Convert time string (12-hour or 24-hour) to minutes since midnight
 * Returns INVALID_TIME (-1) if parsing fails
 */
export function parseTimeToMinutes(timeStr: string): number {
  if (!timeStr || timeStr === PLACEHOLDER_TIME || timeStr.trim() === '') {
    return INVALID_TIME
  }

  // Try 12-hour format first (HH:mm AM/PM)
  const ampmMatch = timeStr.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i)
  if (ampmMatch) {
    let hours = parseInt(ampmMatch[1], 10)
    const minutes = parseInt(ampmMatch[2], 10)
    const ampm = ampmMatch[3].toUpperCase()

    // Validate
    if (isNaN(hours) || isNaN(minutes)) return INVALID_TIME
    if (hours < 1 || hours > 12 || minutes < 0 || minutes > 59) return INVALID_TIME

    // Convert to 24-hour
    if (ampm === 'PM' && hours !== 12) hours += 12
    if (ampm === 'AM' && hours === 12) hours = 0

    return hours * 60 + minutes
  }

  // Try 24-hour format (HH:mm)
  const time24Match = timeStr.match(/^([0-1]?[0-9]|2[0-3]):([0-5][0-9])$/)
  if (time24Match) {
    const hours = parseInt(time24Match[1], 10)
    const minutes = parseInt(time24Match[2], 10)

    // Validate
    if (isNaN(hours) || isNaN(minutes)) return INVALID_TIME
    if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return INVALID_TIME

    return hours * 60 + minutes
  }

  return INVALID_TIME
}

/**
 * Convert minutes since midnight to 12-hour display format
 */
export function formatMinutesToDisplay(minutes: number): string {
  if (minutes === INVALID_TIME || minutes < 0 || minutes >= 1440) {
    return PLACEHOLDER_TIME
  }

  const hours24 = Math.floor(minutes / 60)
  const mins = minutes % 60
  const hours12 = hours24 % 12 || 12
  const ampm = hours24 >= 12 ? 'PM' : 'AM'

  return `${hours12}:${mins.toString().padStart(2, '0')} ${ampm}`
}

/**
 * Convert minutes since midnight to 24-hour storage format
 */
export function formatMinutesTo24Hour(minutes: number): string {
  if (minutes === INVALID_TIME || minutes < 0 || minutes >= 1440) {
    return PLACEHOLDER_TIME
  }

  const hours = Math.floor(minutes / 60)
  const mins = minutes % 60

  return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`
}

/**
 * Calculate duration in minutes between two times
 * Returns 0 if either time is invalid or end < start
 */
export function calcDurationMinutes(startMinutes: number, endMinutes: number): number {
  if (startMinutes === INVALID_TIME || endMinutes === INVALID_TIME) {
    return 0
  }

  if (endMinutes < startMinutes) {
    // Overnight session - not supported, return 0
    // Could be extended to handle overnight if needed
    return 0
  }

  return endMinutes - startMinutes
}

/**
 * Parse user input (while typing) and return formatted 12-hour string
 * Handles partial input and AM/PM toggling
 */
export function parseUserTimeInput(
  input: string,
  currentValue?: string
): string {
  if (!input || input.trim() === '') return ''

  const trimmed = input.trim()

  // Handle AM/PM only toggle (user types just 'a', 'p', 'am', 'pm')
  const ampmOnly = /^[ap]m?$/i.test(trimmed)
  if (ampmOnly && currentValue) {
    const timeMatch = currentValue.match(/^(\d{1,2}:\d{2})\s*(AM|PM)/i)
    if (timeMatch && timeMatch[1]) {
      const timePart = timeMatch[1]
      const newAMPM = trimmed.toUpperCase().startsWith('P') ? 'PM' : 'AM'
      return `${timePart} ${newAMPM}`
    }
  }

  // Handle appending 'p' or 'P' to existing time (e.g., "10:00 AM" + "p" -> "10:00 PM")
  if (currentValue) {
    const currentTimeMatch = currentValue.match(/^(\d{1,2}:\d{2})\s*(AM|PM)/i)
    if (currentTimeMatch) {
      const timePart = currentTimeMatch[1]
      const currentAMPM = currentTimeMatch[2]

      // Check if input is current value + 'p' or 'P'
      if (
        trimmed === `${currentValue}p` ||
        trimmed === `${currentValue}P` ||
        trimmed === `${timePart} ${currentAMPM}p` ||
        trimmed === `${timePart} ${currentAMPM}P`
      ) {
        const newAMPM = currentAMPM === 'AM' ? 'PM' : 'AM'
        return `${timePart} ${newAMPM}`
      }
    }
  }

  // Extract existing AM/PM if present
  const ampmMatch = trimmed.match(/(AM|PM)/i)
  const existingAMPM = ampmMatch ? ampmMatch[1].toUpperCase() : ''

  // Extract numbers
  const numbers = trimmed.replace(/\D/g, '')

  if (numbers.length === 0) {
    return existingAMPM ? ` ${existingAMPM}` : ''
  }

  // Format based on input length
  if (numbers.length === 1) {
    const hour = parseInt(numbers, 10)
    if (isNaN(hour)) return ''
    return `${hour}:${existingAMPM ? ` ${existingAMPM}` : ''}`.trim()
  }

  if (numbers.length === 2) {
    const hour = parseInt(numbers, 10)
    if (isNaN(hour)) return ''
    if (hour > 12) {
      return `12:00 ${existingAMPM || 'AM'}`
    }
    return `${hour.toString().padStart(2, '0')}:${existingAMPM ? ` ${existingAMPM}` : ''}`.trim()
  }

  if (numbers.length === 3) {
    const hour = numbers.slice(0, 2)
    const min = numbers.slice(2)
    const h = parseInt(hour, 10)
    if (isNaN(h) || isNaN(parseInt(min, 10))) return ''
    if (h > 12) {
      return `12:${min.padEnd(2, '0')} ${existingAMPM || 'AM'}`
    }
    return `${h}:${min.padEnd(2, '0')} ${existingAMPM || 'AM'}`
  }

  // Four or more digits - full time
  const hour = numbers.slice(0, 2)
  const minutes = numbers.slice(2, 4).padEnd(2, '0')
  const h = parseInt(hour, 10)
  const m = parseInt(minutes, 10)

  if (isNaN(h) || isNaN(m)) return ''

  // Clamp to valid ranges
  const validH = Math.min(Math.max(h, 1), 12)
  const validM = Math.min(Math.max(m, 0), 59)

  // Use existing AM/PM if present, otherwise default
  const defaultAMPM = existingAMPM || (validH === 12 ? 'PM' : 'AM')
  return `${validH}:${validM.toString().padStart(2, '0')} ${defaultAMPM}`
}

/**
 * Validate time range (end >= start)
 */
export function validateTimeRange(
  startMinutes: number,
  endMinutes: number
): { valid: boolean; error?: string } {
  if (startMinutes === INVALID_TIME) {
    return { valid: false, error: 'Invalid start time' }
  }
  if (endMinutes === INVALID_TIME) {
    return { valid: false, error: 'Invalid end time' }
  }
  if (endMinutes < startMinutes) {
    return { valid: false, error: 'End time must be after start time' }
  }
  return { valid: true }
}
