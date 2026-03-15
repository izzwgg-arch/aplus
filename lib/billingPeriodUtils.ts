/**
 * Billing Period Utilities
 * Handles weekly billing period calculations for automatic invoice generation
 */

import { startOfDay, endOfDay, subDays, setDay, format } from 'date-fns'
import { utcToZonedTime, zonedTimeToUtc } from 'date-fns-tz'

const TIMEZONE = 'America/New_York'

/**
 * Calculate the weekly billing period for automatic invoice generation
 * 
 * Billing Period: Monday 12:00 AM → Monday 11:59 PM (whole week, Monday to Monday)
 * 
 * Example:
 * - If today is Tuesday, Jan 7, 2025 at 7:00 AM
 * - Billing period: Monday, Dec 30, 2024 12:00 AM → Monday, Jan 6, 2025 11:59 PM
 * 
 * @param referenceDate - The date to calculate the billing period from (defaults to now)
 * @returns Object with startDate and endDate in the billing period timezone
 */
export function calculateWeeklyBillingPeriod(referenceDate: Date = new Date()): {
  startDate: Date
  endDate: Date
  periodLabel: string
} {
  // Convert reference date to billing timezone
  const zonedRefDate = utcToZonedTime(referenceDate, TIMEZONE)
  
  // Get current day of week (0 = Sunday, 1 = Monday, ..., 6 = Saturday)
  const currentDay = zonedRefDate.getDay()
  const currentHour = zonedRefDate.getHours()
  
  // Billing Period: Monday 12:00 AM → Monday 11:59 PM (whole week, Monday to Monday)
  // If today is Tuesday and it's after 7:00 AM, the period that just ended is:
  //   Last Monday 12:00 AM → Yesterday (Monday) 11:59 PM
  // Otherwise, find the most recent completed period (Monday to Monday)
  
  let endDate: Date
  let startDate: Date
  
  if (currentDay === 2 && currentHour >= 7) {
    // Today is Tuesday after 7 AM - the period that just ended is last Monday to yesterday (Monday)
    endDate = new Date(zonedRefDate)
    endDate.setDate(endDate.getDate() - 1) // Yesterday (Monday)
    endDate.setHours(23, 59, 59, 999)
    
    startDate = new Date(endDate)
    startDate.setDate(startDate.getDate() - 7) // Go back 7 days to get last Monday
    startDate.setHours(0, 0, 0, 0)
  } else {
    // Find the most recent Monday (end of billing period)
    const daysSinceMonday = currentDay === 0 ? 6 : (currentDay === 1 ? 0 : currentDay - 1)
    endDate = new Date(zonedRefDate)
    endDate.setDate(endDate.getDate() - daysSinceMonday)
    endDate.setHours(23, 59, 59, 999)
    
    // Start date is 7 days before (previous Monday)
    startDate = new Date(endDate)
    startDate.setDate(startDate.getDate() - 7)
    startDate.setHours(0, 0, 0, 0)
  }
  
  // Convert back to UTC for database storage
  const startDateUTC = zonedTimeToUtc(startDate, TIMEZONE)
  const endDateUTC = zonedTimeToUtc(endDate, TIMEZONE)
  
  // Create period label (use zoned dates for display)
  const periodLabel = `${format(startDate, 'EEE M/d/yyyy')} - ${format(endDate, 'EEE M/d/yyyy')}`
  
  return {
    startDate: startDateUTC,
    endDate: endDateUTC,
    periodLabel,
  }
}

/**
 * Get the next billing period (for display/preview)
 */
export function getNextBillingPeriod(): {
  startDate: Date
  endDate: Date
  periodLabel: string
} {
  // Calculate next week's period
  const nextTuesday = new Date()
  const currentDay = nextTuesday.getDay()
  
  // Find next Tuesday
  let daysUntilNextTuesday: number
  if (currentDay === 2) {
    // Today is Tuesday, next Tuesday is in 7 days
    daysUntilNextTuesday = 7
  } else if (currentDay < 2) {
    // Sunday (0) or Monday (1)
    daysUntilNextTuesday = 2 - currentDay
  } else {
    // Wednesday (3) through Saturday (6)
    daysUntilNextTuesday = 7 - (currentDay - 2)
  }
  
  const referenceDate = new Date()
  referenceDate.setDate(referenceDate.getDate() + daysUntilNextTuesday)
  referenceDate.setHours(7, 0, 0, 0)
  
  return calculateWeeklyBillingPeriod(referenceDate)
}

/**
 * Format billing period for display
 */
export function formatBillingPeriod(startDate: Date, endDate: Date): string {
  const zonedStart = utcToZonedTime(startDate, TIMEZONE)
  const zonedEnd = utcToZonedTime(endDate, TIMEZONE)
  return `${format(zonedStart, 'EEE M/d/yyyy')} - ${format(zonedEnd, 'EEE M/d/yyyy')}`
}
