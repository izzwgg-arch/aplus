/**
 * Shared date-of-birth validation for the client create/edit forms and API
 * routes.
 *
 * Why this exists: a stray digit in the date input's year ("20009", "62025")
 * still parses as a VALID JavaScript Date, so a bare isNaN check let it
 * through — and Prisma cannot store a year-20009 timestamp, so
 * POST /api/clients died with the generic "Failed to create client" 500.
 * A birth date must lie between MIN_DOB_YEAR and today.
 */

export const MIN_DOB_YEAR = 1900;

export const DOB_ERROR = `Invalid date of birth — the year must be between ${MIN_DOB_YEAR} and today. Check for extra digits in the year.`;

/** Parses a DOB into a Date, or null when missing, unparseable, before
 * MIN_DOB_YEAR, or in the future (with a day of slack for timezones). */
export function parseDob(value: unknown): Date | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const d = new Date(value);
  if (isNaN(d.getTime())) return null;
  if (d.getUTCFullYear() < MIN_DOB_YEAR) return null;
  if (d.getTime() > Date.now() + 24 * 60 * 60 * 1000) return null;
  return d;
}

/** Today's LOCAL date as "YYYY-MM-DD", for a date input's `max` attribute. */
export function todayDateInputValue(): string {
  const now = new Date();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${m}-${day}`;
}
