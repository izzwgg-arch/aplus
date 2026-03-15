/**
 * Timesheet ID Generation Utilities
 * 
 * Generates unique timesheet numbers:
 * - Regular timesheets: T-1001, T-1002, etc.
 * - BCBA timesheets: BT-1001, BT-1002, etc.
 */

import { prisma } from './prisma'

/**
 * Format a timesheet number from sequence and type
 * @param sequence - Sequential number (starting from 1001)
 * @param isBCBA - Whether this is a BCBA timesheet
 * @returns Formatted timesheet number (e.g., "T-1001" or "BT-1002")
 */
export function formatTimesheetNumber(sequence: number, isBCBA: boolean): string {
  const prefix = isBCBA ? 'BT' : 'T'
  return `${prefix}-${String(sequence).padStart(4, '0')}`
}

/**
 * Get the next sequence number for timesheet ID generation
 * @param isBCBA - Whether this is a BCBA timesheet
 * @returns Next sequence number to use
 */
export async function getNextTimesheetSequence(isBCBA: boolean): Promise<number> {
  // Find the highest existing sequence number for this type
  const prefix = isBCBA ? 'BT' : 'T'
  
  // Query for the highest numbered timesheet of this type
  const highestTimesheet = await prisma.timesheet.findFirst({
    where: {
      timesheetNumber: {
        startsWith: prefix,
      },
    },
    orderBy: {
      timesheetNumber: 'desc',
    },
    select: {
      timesheetNumber: true,
    },
  })

  if (!highestTimesheet || !highestTimesheet.timesheetNumber) {
    // No existing timesheets of this type, start at 1001
    return 1001
  }

  // Extract the sequence number from the timesheet number
  // Format: T-1001 or BT-1002
  const match = highestTimesheet.timesheetNumber.match(/-(\d+)$/)
  if (match) {
    const currentSequence = parseInt(match[1], 10)
    return currentSequence + 1
  }

  // Fallback: start at 1001 if parsing fails
  return 1001
}

/**
 * Generate the next timesheet number
 * @param isBCBA - Whether this is a BCBA timesheet
 * @returns Next timesheet number (e.g., "T-1001" or "BT-1002")
 */
export async function generateTimesheetNumber(isBCBA: boolean): Promise<string> {
  const sequence = await getNextTimesheetSequence(isBCBA)
  return formatTimesheetNumber(sequence, isBCBA)
}

/**
 * Validate a timesheet number format
 * @param timesheetNumber - The timesheet number to validate
 * @returns True if valid format, false otherwise
 */
export function isValidTimesheetNumber(timesheetNumber: string): boolean {
  // Match T-#### or BT-#### format
  return /^(T|BT)-\d{4,}$/.test(timesheetNumber)
}

/**
 * Parse a timesheet number to extract type and sequence
 * @param timesheetNumber - The timesheet number to parse
 * @returns Object with isBCBA and sequence, or null if invalid
 */
export function parseTimesheetNumber(timesheetNumber: string): { isBCBA: boolean; sequence: number } | null {
  const match = timesheetNumber.match(/^(T|BT)-(\d+)$/)
  if (!match) {
    return null
  }

  const isBCBA = match[1] === 'BT'
  const sequence = parseInt(match[2], 10)
  
  return { isBCBA, sequence }
}

/**
 * Format an invoice number for display (compressed format)
 * Converts INV-2026-XXXX to I-XXXX for display purposes
 * @param invoiceNumber - The full invoice number (e.g., "INV-2026-0001")
 * @returns Compressed display format (e.g., "I-0001")
 */
export function formatInvoiceNumberForDisplay(invoiceNumber: string): string {
  if (!invoiceNumber) return invoiceNumber
  
  // If already in I-XXXX format, return as-is
  if (/^I-\d+$/.test(invoiceNumber)) {
    return invoiceNumber
  }
  
  // Extract sequence from INV-YYYY-XXXX format
  // Matches: INV-2026-0001, INV-2025-0123, etc.
  const match = invoiceNumber.match(/^INV-\d{4}-(\d+)$/)
  if (match) {
    const sequence = match[1]
    return `I-${sequence}`
  }
  
  // Fallback: try to extract any trailing digits
  const fallbackMatch = invoiceNumber.match(/(\d+)$/)
  if (fallbackMatch) {
    return `I-${fallbackMatch[1]}`
  }
  
  // If no pattern matches, return original
  return invoiceNumber
}
