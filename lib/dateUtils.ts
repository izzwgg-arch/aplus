import { startOfDay, endOfDay, eachDayOfInterval, format, getDay, parse } from 'date-fns'
import { zonedTimeToUtc, utcToZonedTime } from 'date-fns-tz'

/**
 * Some older records can have date-only values stored at exactly 00:00:00Z.
 * In local timezones, that can display as the previous calendar day, which can
 * incorrectly classify Sundays as Saturdays (and get filtered out).
 *
 * Heuristic:
 * - If the timestamp is exactly midnight in UTC, treat the day-of-week as UTC.
 * - Otherwise, treat it as local (DatePicker-created values are usually not UTC-midnight).
 */
export function getSafeDayOfWeek(date: Date): number {
  const isUtcMidnight =
    date.getUTCHours() === 0 &&
    date.getUTCMinutes() === 0 &&
    date.getUTCSeconds() === 0 &&
    date.getUTCMilliseconds() === 0

  return isUtcMidnight ? date.getUTCDay() : date.getDay()
}

export function getDaysInRange(startDate: Date, endDate: Date): Date[] {
  const allDays = eachDayOfInterval({
    start: startOfDay(startDate),
    end: endOfDay(endDate),
  })
  // Filter out Saturdays - timesheets cannot be created on Saturdays
  return allDays.filter((date) => getSafeDayOfWeek(date) !== 6)
}

export function getDayName(date: Date): string {
  return format(date, 'EEEE')
}

export function getDayShortName(date: Date): string {
  return format(date, 'EEE')
}

export function isSunday(date: Date): boolean {
  return getSafeDayOfWeek(date) === 0
}

export function isFriday(date: Date): boolean {
  return getSafeDayOfWeek(date) === 5
}

export function isSaturday(date: Date): boolean {
  return getSafeDayOfWeek(date) === 6
}

/**
 * Check if a date is Saturday in a specific timezone
 * @param date - The date to check (can be a date string or Date object)
 * @param timezone - IANA timezone identifier (e.g., "America/New_York", "Asia/Jerusalem")
 * @returns true if the date is Saturday in the specified timezone
 */
export function isSaturdayInTimezone(date: Date | string, timezone: string = 'America/New_York'): boolean {
  try {
    let dateObj: Date
    
    if (typeof date === 'string') {
      // Parse date string - if it's just a date (YYYY-MM-DD), treat it as midnight in the target timezone
      // If it has time info, parse it normally
      if (date.match(/^\d{4}-\d{2}-\d{2}$/)) {
        // Date-only string: create date at midnight in the target timezone
        const [year, month, day] = date.split('-').map(Number)
        // Create a date string with time in the target timezone, then convert
        const dateStr = `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}T00:00:00`
        // Parse as if it's in the target timezone by using zonedTimeToUtc
        dateObj = zonedTimeToUtc(dateStr, timezone)
      } else {
        // Has time info, parse normally
        dateObj = new Date(date)
      }
    } else {
      dateObj = date
    }
    
    // Convert the UTC date to the specified timezone
    const zonedDate = utcToZonedTime(dateObj, timezone)
    
    // Get day of week in that timezone (0 = Sunday, 6 = Saturday)
    return zonedDate.getDay() === 6
  } catch (error) {
    console.error('[DATE_UTILS] Error checking Saturday in timezone:', error, { date, timezone })
    // Fallback to safe day of week check
    const dateObj = typeof date === 'string' ? new Date(date) : date
    return isSaturday(dateObj)
  }
}

export function isWeekday(date: Date): boolean {
  const day = getSafeDayOfWeek(date)
  return day > 0 && day < 5 // Monday to Friday
}

export function formatTimeForInput(time: string): string {
  if (!time || time === '--:--') return ''
  return time
}

/**
 * Format a Date object as a date-only string (YYYY-MM-DD) in the specified timezone
 * This prevents timezone conversion issues when sending dates to the API
 * @param date - The date to format
 * @param timezone - IANA timezone identifier (e.g., "America/New_York", "Asia/Jerusalem")
 * @returns Date string in YYYY-MM-DD format representing the date in the specified timezone
 */
export function formatDateOnly(date: Date, timezone: string = 'America/New_York'): string {
  try {
    // Treat the Date as a date-only value from the picker (no TZ shift).
    const year = date.getFullYear()
    const month = `${date.getMonth() + 1}`.padStart(2, '0')
    const day = `${date.getDate()}`.padStart(2, '0')
    return `${year}-${month}-${day}`
  } catch (error) {
    console.error('[DATE_UTILS] Error formatting date only:', error, { date, timezone })
    // Fallback to simple date formatting
    return format(date, 'yyyy-MM-dd')
  }
}

/**
 * Parse a date-only string (YYYY-MM-DD) or ISO string as a Date object in the specified timezone
 * This ensures dates are interpreted correctly regardless of server timezone
 * @param dateStr - Date string in YYYY-MM-DD format or ISO string (e.g., "2025-06-08T04:00:00.000Z")
 * @param timezone - IANA timezone identifier (e.g., "America/New_York", "Asia/Jerusalem")
 * @returns Date object representing midnight in the specified timezone
 */
export function parseDateOnly(dateStr: string, timezone: string = 'America/New_York'): Date {
  try {
    // If it's an ISO string or YYYY-MM-DD, try timezone-aware parsing
    let dateOnlyStr = dateStr
    if (dateStr.includes('T')) {
      // ISO string format: extract the date portion before 'T'
      dateOnlyStr = dateStr.split('T')[0]
    }
    
    // Validate the extracted date portion is in YYYY-MM-DD format
    if (dateOnlyStr.match(/^\d{4}-\d{2}-\d{2}$/)) {
      // Parse as midnight in the target timezone
      const [year, month, day] = dateOnlyStr.split('-').map(Number)
      const dateStrWithTime = `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}T00:00:00`
      // Convert to UTC Date object
      return zonedTimeToUtc(dateStrWithTime, timezone)
    }
    
    // Third try: fallback to simple Date parsing (handles any format JavaScript can parse)
    return new Date(dateStr)
  } catch (error) {
    console.error('[DATE_UTILS] Error parsing date only:', error, { dateStr, timezone })
    // Final fallback: simple Date parsing
    return new Date(dateStr)
  }
}

/**
 * Convert a database DateTime (UTC) to a date string in NY timezone
 * This ensures dates are always displayed consistently regardless of viewer location
 * @param dbDate - Date from database (UTC DateTime)
 * @param timezone - Timesheet timezone (default: America/New_York)
 * @returns Date string in YYYY-MM-DD format as it appears in the specified timezone
 */
export function getDateInTimezone(dbDate: Date | string, timezone: string = 'America/New_York'): string {
  try {
    const dateObj = typeof dbDate === 'string' ? new Date(dbDate) : dbDate
    if (isNaN(dateObj.getTime())) {
      console.error('[DATE_UTILS] Invalid date:', dbDate)
      return ''
    }
    // Convert UTC date to the timesheet's timezone and get the date string
    const zonedDate = utcToZonedTime(dateObj, timezone)
    return format(zonedDate, 'yyyy-MM-dd')
  } catch (error) {
    console.error('[DATE_UTILS] Error getting date in timezone:', error, { dbDate, timezone })
    // Fallback: try to extract date from ISO string
    if (typeof dbDate === 'string' && dbDate.match(/^\d{4}-\d{2}-\d{2}/)) {
      return dbDate.substring(0, 10)
    }
    return ''
  }
}

/**
 * Convert a database DateTime (UTC) to a Date object representing the date in NY timezone
 * This ensures dates are always interpreted consistently regardless of viewer location
 * @param dbDate - Date from database (UTC DateTime)
 * @param timezone - Timesheet timezone (default: America/New_York)
 * @returns Date object representing midnight in the specified timezone
 */
export function getDateObjectInTimezone(dbDate: Date | string, timezone: string = 'America/New_York'): Date {
  try {
    const dateStr = getDateInTimezone(dbDate, timezone)
    if (!dateStr) {
      throw new Error('Invalid date string')
    }
    // Parse the date string as midnight in the target timezone
    return parseDateOnly(dateStr, timezone)
  } catch (error) {
    console.error('[DATE_UTILS] Error getting date object in timezone:', error, { dbDate, timezone })
    // Fallback
    const dateObj = typeof dbDate === 'string' ? new Date(dbDate) : dbDate
    return dateObj
  }
}

/**
 * Format a database DateTime (UTC) for display in NY timezone
 * This ensures dates are always displayed consistently regardless of viewer location
 * @param dbDate - Date from database (UTC DateTime)
 * @param formatStr - Format string (e.g., 'EEE M/d/yyyy', 'MM/dd/yyyy')
 * @param timezone - Timesheet timezone (default: America/New_York)
 * @returns Formatted date string as it appears in the specified timezone
 */
export function formatDateInTimezone(dbDate: Date | string, formatStr: string, timezone: string = 'America/New_York'): string {
  try {
    const dateObj = getDateObjectInTimezone(dbDate, timezone)
    return format(dateObj, formatStr)
  } catch (error) {
    console.error('[DATE_UTILS] Error formatting date in timezone:', error, { dbDate, formatStr, timezone })
    // Fallback
    const dateObj = typeof dbDate === 'string' ? new Date(dbDate) : dbDate
    return format(dateObj, formatStr)
  }
}

export function parseTime(time: string): { hours: number; minutes: number } {
  if (!time || time === '--:--') return { hours: 0, minutes: 0 }
  
  // Handle 12-hour format with AM/PM
  const ampmMatch = time.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i)
  if (ampmMatch) {
    let hours = parseInt(ampmMatch[1])
    const minutes = parseInt(ampmMatch[2])
    const ampm = ampmMatch[3].toUpperCase()
    
    if (ampm === 'PM' && hours !== 12) hours += 12
    if (ampm === 'AM' && hours === 12) hours = 0
    
    return { hours, minutes }
  }
  
  // Handle 24-hour format
  const [hours, minutes] = time.split(':').map(Number)
  return { hours, minutes }
}

// Convert 24-hour to 12-hour format with AM/PM
export function to12Hour(time24: string): string {
  if (!time24 || time24 === '--:--') return '--:--'
  
  // Check if already in 12-hour format (has AM/PM)
  const ampmMatch = time24.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i)
  if (ampmMatch) {
    // Validate the time part even if it has AM/PM
    const hours = parseInt(ampmMatch[1], 10)
    const minutes = parseInt(ampmMatch[2], 10)
    const ampm = ampmMatch[3].toUpperCase()
    
    // Validate numbers
    if (isNaN(hours) || isNaN(minutes)) return '--:--'
    if (hours < 1 || hours > 12 || minutes < 0 || minutes > 59) return '--:--'
    
    // Return validated 12-hour format
    return `${hours}:${minutes.toString().padStart(2, '0')} ${ampm}`
  }
  
  // Parse 24-hour format
  const parts = time24.split(':')
  if (parts.length !== 2) return '--:--'
  
  const hours = parseInt(parts[0], 10)
  const minutes = parseInt(parts[1], 10)
  
  // Validate numbers
  if (isNaN(hours) || isNaN(minutes)) return '--:--'
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return '--:--'
  
  const hour = hours % 12 || 12
  const ampm = hours >= 12 ? 'PM' : 'AM'
  return `${hour}:${minutes.toString().padStart(2, '0')} ${ampm}`
}

// Convert 12-hour format to 24-hour format
export function to24Hour(time12: string): string {
  if (!time12 || time12 === '--:--' || time12.trim() === '') return '--:--'
  
  const ampmMatch = time12.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i)
  if (ampmMatch) {
    let hours = parseInt(ampmMatch[1], 10)
    const minutes = parseInt(ampmMatch[2], 10)
    const ampm = ampmMatch[3].toUpperCase()
    
    // Validate parsed values
    if (isNaN(hours) || isNaN(minutes)) return '--:--'
    if (hours < 1 || hours > 12 || minutes < 0 || minutes > 59) return '--:--'
    
    if (ampm === 'PM' && hours !== 12) hours += 12
    if (ampm === 'AM' && hours === 12) hours = 0
    
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`
  }
  
  // If already in 24-hour format, validate and return
  const time24Match = time12.match(/^([0-1]?[0-9]|2[0-3]):([0-5][0-9])$/)
  if (time24Match) {
    return time12
  }
  
  // Invalid format, return placeholder
  return '--:--'
}

export function calculateMinutes(startTime: string, endTime: string): number {
  if (!startTime || !endTime || startTime === '--:--' || endTime === '--:--') {
    return 0
  }
  
  const start = parseTime(startTime)
  const end = parseTime(endTime)
  
  const startMinutes = start.hours * 60 + start.minutes
  const endMinutes = end.hours * 60 + end.minutes
  
  return Math.max(0, endMinutes - startMinutes)
}

export function formatTime(hours: number, minutes: number): string {
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`
}

export function calculateUnits(minutes: number): number {
  return Math.round((minutes / 15) * 100) / 100
}
