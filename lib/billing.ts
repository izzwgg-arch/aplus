import { Decimal } from '@prisma/client/runtime/library'

/**
 * Billing utility functions for invoice calculations
 * Ensures consistent unit conversion and calculation logic across all invoice generation
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
 * Calculate invoice totals from timesheet entries
 * 
 * @param timesheetEntries - Array of timesheet entries with minutes and notes (DR/SV)
 * @param ratePerUnit - Rate per unit from Insurance
 * @param isRegularTimesheet - True if regular timesheet (SV entries = $0), false if BCBA (all entries charged)
 * @param unitMinutes - Unit duration in minutes from Insurance (default: 15)
 * @returns Object with totalMinutes, totalUnits (all units), billableUnits (charged units), and amount
 */
export function calculateInvoiceTotals(
  timesheetEntries: Array<{ minutes: number; notes?: string | null }>,
  ratePerUnit: Decimal | number,
  isRegularTimesheet: boolean = true,
  unitMinutes: number = 15
): {
  totalMinutes: number
  totalUnits: number // All units (DR + SV) for display
  billableUnits: number // Only charged units (DR for regular, all for BCBA)
  amount: Decimal
} {
  const rate = ratePerUnit instanceof Decimal ? ratePerUnit : new Decimal(ratePerUnit)
  
  let totalMinutes = 0
  let totalUnits = 0 // All units (for display)
  let billableUnits = 0 // Only charged units
  let amount = new Decimal(0)
  
  for (const entry of timesheetEntries) {
    const minutes = entry.minutes || 0
    const units = minutesToUnits(minutes, unitMinutes)
    const isSV = entry.notes === 'SV'
    
    totalMinutes += minutes
    totalUnits += units // Always add to total units (for display)
    
    // For regular timesheets: SV entries = $0 (not added to billable)
    // For BCBA timesheets: All entries are billable
    if (isRegularTimesheet && isSV) {
      // SV on regular timesheet: count units for display but $0 charge
      billableUnits += 0 // Don't add to billable
      // amount stays the same (no charge)
    } else {
      // DR entries on regular, or all entries on BCBA
      billableUnits += units
      amount = amount.plus(new Decimal(units).times(rate))
    }
  }
  
  return {
    totalMinutes,
    totalUnits,
    billableUnits,
    amount,
  }
}

/**
 * Calculate invoice totals per entry (for line items)
 * 
 * @param entryMinutes - Minutes for a single entry
 * @param entryNotes - Notes field ('DR' or 'SV' or null)
 * @param ratePerUnit - Rate per unit from Insurance
 * @param isRegularTimesheet - True if regular timesheet (SV = $0), false if BCBA (all charged)
 * @param unitMinutes - Unit duration in minutes from Insurance (default: 15)
 * @returns Object with units and amount for this entry
 */
export function calculateEntryTotals(
  entryMinutes: number,
  entryNotes: string | null | undefined,
  ratePerUnit: Decimal | number,
  isRegularTimesheet: boolean = true,
  unitMinutes: number = 15
): {
  units: number
  amount: Decimal
} {
  const units = minutesToUnits(entryMinutes, unitMinutes)
  const rate = ratePerUnit instanceof Decimal ? ratePerUnit : new Decimal(ratePerUnit)
  const isSV = entryNotes === 'SV'
  
  // For regular timesheets: SV entries = $0
  // For BCBA timesheets: All entries charged normally
  const amount = (isRegularTimesheet && isSV)
    ? new Decimal(0) // SV on regular = $0
    : new Decimal(units).times(rate) // Normal charge
  
  return {
    units,
    amount,
  }
}
