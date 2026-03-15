/**
 * Week Utilities
 * Helper functions for calendar week calculations (Monday-Sunday)
 */

import { startOfWeek, endOfWeek, format } from 'date-fns'
import { utcToZonedTime, zonedTimeToUtc } from 'date-fns-tz'

const TIMEZONE = 'America/New_York'

/**
 * Get the start of the week (Monday) for a given date
 * @param date - The date to get the week start for
 * @returns Date object representing Monday 00:00:00 in NY timezone (converted to UTC)
 */
export function getWeekStart(date: Date): Date {
  const zonedDate = utcToZonedTime(date, TIMEZONE)
  // startOfWeek with { weekStartsOn: 1 } gives us Monday
  const weekStart = startOfWeek(zonedDate, { weekStartsOn: 1 })
  weekStart.setHours(0, 0, 0, 0)
  return zonedTimeToUtc(weekStart, TIMEZONE)
}

/**
 * Get the end of the week (Sunday) for a given date
 * @param date - The date to get the week end for
 * @returns Date object representing Sunday 23:59:59 in NY timezone (converted to UTC)
 */
export function getWeekEnd(date: Date): Date {
  const zonedDate = utcToZonedTime(date, TIMEZONE)
  // endOfWeek with { weekStartsOn: 1 } gives us Sunday
  const weekEnd = endOfWeek(zonedDate, { weekStartsOn: 1 })
  weekEnd.setHours(23, 59, 59, 999)
  return zonedTimeToUtc(weekEnd, TIMEZONE)
}

/**
 * Get a week key string for grouping (YYYY-MM-DD format of Monday)
 * @param date - Any date within the week
 * @returns String in format "YYYY-MM-DD" representing the Monday of that week
 */
export function getWeekKey(date: Date): string {
  const weekStart = getWeekStart(date)
  const zonedWeekStart = utcToZonedTime(weekStart, TIMEZONE)
  return format(zonedWeekStart, 'yyyy-MM-dd')
}
