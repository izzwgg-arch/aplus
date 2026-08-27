/**
 * How long an appointment for a given service should run.
 *
 * The scheduler used to open every new appointment as a flat 60 minutes,
 * whatever the service was — so a Phone Appointment (15 min) and a
 * "2 H Mercier Therapy" both had to be corrected by hand every single time.
 *
 * Order of precedence:
 *   1. `Service.durationMinutes` — what Settings -> Services stores. This is
 *      the authoritative value; edit it there to change a service's length.
 *   2. A length spelled out in the service NAME ("2 H Mercier Therapy",
 *      "Therapy 1 hour", "45 min consult"). Several live services carry their
 *      length in the name and have no durationMinutes set; reading the name
 *      means those book at the right length without re-typing the config.
 *   3. null -> the caller keeps DEFAULT_APPT_MINUTES.
 */

export const DEFAULT_APPT_MINUTES = 60;

/** Sanity band. A booked slot shorter than 5 min or longer than a work day is
 *  a parsing accident, not a real service length. */
const MIN_MINUTES = 5;
const MAX_MINUTES = 12 * 60;

// "2 H", "2hr", "1.5 hours" / "45 min", "90 minutes".  The unit is required and
// word-bounded, so a code or a dosage in a name ("Vitamin B12") never matches.
const HOUR_RE   = /(?:^|[^\d.])(\d+(?:\.\d+)?)\s*(?:h|hr|hrs|hour|hours)\b/i;
const MINUTE_RE = /(?:^|[^\d.])(\d+(?:\.\d+)?)\s*(?:m|min|mins|minute|minutes)\b/i;

function clamp(minutes) {
  if (!Number.isFinite(minutes)) return null;
  const rounded = Math.round(minutes);
  if (rounded < MIN_MINUTES || rounded > MAX_MINUTES) return null;
  return rounded;
}

/** Minutes spelled out in a service name, or null. */
export function durationFromName(name) {
  if (!name || typeof name !== "string") return null;
  const h = HOUR_RE.exec(name);
  if (h) return clamp(parseFloat(h[1]) * 60);
  const m = MINUTE_RE.exec(name);
  if (m) return clamp(parseFloat(m[1]));
  return null;
}

/**
 * The configured length of a service in minutes, or null when the service
 * says nothing about its length.
 */
export function serviceDurationMinutes(service) {
  if (!service) return null;
  const configured = clamp(Number(service.durationMinutes));
  if (configured) return configured;
  return durationFromName(service.name);
}

/** Same, but always a usable number — falls back to the 60-minute default. */
export function serviceDurationOrDefault(service) {
  return serviceDurationMinutes(service) ?? DEFAULT_APPT_MINUTES;
}

/** "15 min" / "1 hr" / "1 hr 30 min" / "2 hrs" — for labels. */
export function formatMinutes(minutes) {
  const total = Math.round(Number(minutes) || 0);
  if (total <= 0) return "";
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (!h) return `${m} min`;
  const hourPart = `${h} ${h === 1 ? "hr" : "hrs"}`;
  return m ? `${hourPart} ${m} min` : hourPart;
}
