/**
 * Client-side billing utility functions
 * These are safe to use in client components (no Prisma dependencies)
 */

/**
 * Convert minutes to units based on Insurance unit duration
 * Formula: Units = Minutes / UnitDuration
 * 
 * @param minutes - Total service minutes
 * @param unitMinutes - Unit duration in minutes from Insurance (default: 15)
 * @returns Number of units (rounded to 2 decimals)
 * 
 * Examples (with 15-minute units):
 * - 90 minutes / 15 = 6.00 units
 * - 120 minutes / 15 = 8.00 units
 * - 60 minutes / 15 = 4.00 units
 * - 30 minutes / 15 = 2.00 units
 * 
 * Examples (with 30-minute units):
 * - 90 minutes / 30 = 3.00 units
 * - 120 minutes / 30 = 4.00 units
 */
export function minutesToUnits(minutes: number, unitMinutes: number = 15): number {
  if (minutes <= 0) return 0
  if (unitMinutes <= 0) unitMinutes = 15 // Safety fallback
  // Formula: Units = Minutes / UnitDuration
  const units = minutes / unitMinutes
  // Round to 2 decimal places
  return Math.round(units * 100) / 100
}

/**
 * Calculate invoice totals per entry (for line items) - Client version
 * 
 * @param entryMinutes - Minutes for a single entry
 * @param entryNotes - Notes field ('DR' or 'SV' or null)
 * @param ratePerUnit - Rate per unit from Insurance (as number)
 * @param isRegularTimesheet - True if regular timesheet (SV = $0), false if BCBA (all charged)
 * @param unitMinutes - Unit duration in minutes from Insurance (default: 15)
 * @returns Object with units and amount for this entry
 */
export function calculateEntryTotals(
  entryMinutes: number,
  entryNotes: string | null | undefined,
  ratePerUnit: number,
  isRegularTimesheet: boolean = true,
  unitMinutes: number = 15
): {
  units: number
  amount: number
} {
  const units = minutesToUnits(entryMinutes, unitMinutes)
  const isSV = entryNotes === 'SV'
  
  // For regular timesheets: SV entries = $0
  // For BCBA timesheets: All entries charged normally
  const amount = (isRegularTimesheet && isSV)
    ? 0 // SV on regular = $0
    : units * ratePerUnit // Normal charge
  
  return {
    units,
    amount,
  }
}
