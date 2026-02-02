/**
 * Name normalization and matching utilities for signature import
 */

/**
 * Normalize a name string for matching
 * - lower-case
 * - trim
 * - replace multiple spaces with single
 * - remove punctuation (.,#,'" etc)
 * - convert spaces to underscores for consistent matching with filenames
 * - keep letters/numbers/underscores
 */
export function normalizeName(name: string): string {
  if (!name) return ''
  
  return name
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ') // Multiple spaces to single
    .replace(/[^\w\s]/g, '') // Remove punctuation
    .replace(/\s+/g, '_') // Convert spaces to underscores for consistent matching
    .trim()
}

/**
 * Extract first and last name from various formats
 * Handles: "First Last", "Last, First", "First Middle Last", etc.
 */
export function parseName(name: string): { firstName: string; lastName: string } {
  if (!name) return { firstName: '', lastName: '' }
  
  const trimmed = name.trim()
  
  // Handle "Last, First" format
  if (trimmed.includes(',')) {
    const parts = trimmed.split(',').map(p => p.trim())
    if (parts.length >= 2) {
      return {
        firstName: parts[1] || '',
        lastName: parts[0] || '',
      }
    }
  }
  
  // Handle "First Last" or "First Middle Last" format
  const parts = trimmed.split(/\s+/)
  if (parts.length === 1) {
    return { firstName: parts[0] || '', lastName: '' }
  } else if (parts.length >= 2) {
    return {
      firstName: parts[0] || '',
      lastName: parts[parts.length - 1] || '',
    }
  }
  
  return { firstName: '', lastName: '' }
}

/**
 * Build full name from parts
 */
export function buildFullName(firstName: string, lastName: string): string {
  return `${firstName} ${lastName}`.trim()
}

/**
 * Normalize full name from parts
 */
export function normalizeFullName(firstName: string, lastName: string): string {
  return normalizeName(buildFullName(firstName, lastName))
}
