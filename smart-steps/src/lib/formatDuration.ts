/**
 * Session / note length formatting.
 *
 * Clinical staff read and bill service time in HOURS, so every duration in the
 * Tracker is rendered as decimal hours ("2.5 hrs") rather than a raw minute
 * count ("150 min"). One helper so the wording stays identical on the session
 * cards, the session snapshot drawer, the data-entry history, the note list,
 * the printed notes, and the parent portal.
 */

/** A single clinical session realistically caps out around 8 hours. */
export const MAX_PLAUSIBLE_SESSION_MINUTES = 8 * 60;

/**
 * Decimal hours with the trailing zeros trimmed:
 * 150 → "2.5 hrs", 60 → "1 hr", 20 → "0.33 hrs", 120 → "2 hrs".
 */
export function formatMinutesAsHours(minutes: number): string {
  const hours = Math.round((minutes / 60) * 100) / 100;
  const text = hours.toFixed(2).replace(/\.?0+$/, "");
  return `${text} ${hours === 1 ? "hr" : "hrs"}`;
}

/** Whole minutes between two timestamps, or null when either side is missing. */
export function minutesBetween(
  startedAt: string | Date | null | undefined,
  endedAt: string | Date | null | undefined,
): number | null {
  if (!startedAt || !endedAt) return null;
  const ms = new Date(endedAt).getTime() - new Date(startedAt).getTime();
  if (!Number.isFinite(ms) || ms <= 0) return null;
  return Math.round(ms / 60000);
}

/**
 * Session length in hours, or null when it cannot be trusted — no end time, a
 * negative span, or a span past `MAX_PLAUSIBLE_SESSION_MINUTES` (a session left
 * open overnight would otherwise read as "17.4 hrs" of service).
 */
export function formatSessionHours(
  startedAt: string | Date | null | undefined,
  endedAt: string | Date | null | undefined,
): string | null {
  const minutes = minutesBetween(startedAt, endedAt);
  if (minutes === null || minutes > MAX_PLAUSIBLE_SESSION_MINUTES) return null;
  return formatMinutesAsHours(Math.max(1, minutes));
}

/**
 * Note length in hours from the "HH:MM" strings a note stores for time in /
 * time out. Returns null for a missing, malformed, or non-positive range.
 * A time-out before time-in is treated as crossing midnight.
 */
export function formatClockRangeHours(
  timeIn: string | null | undefined,
  timeOut: string | null | undefined,
): string | null {
  const toMinutes = (value: string | null | undefined): number | null => {
    const match = /^(\d{1,2}):(\d{2})/.exec((value ?? "").trim());
    if (!match) return null;
    const h = Number(match[1]);
    const m = Number(match[2]);
    if (h > 23 || m > 59) return null;
    return h * 60 + m;
  };

  const start = toMinutes(timeIn);
  const end = toMinutes(timeOut);
  if (start === null || end === null) return null;

  const minutes = end >= start ? end - start : end + 24 * 60 - start;
  if (minutes <= 0 || minutes > MAX_PLAUSIBLE_SESSION_MINUTES) return null;
  return formatMinutesAsHours(minutes);
}
