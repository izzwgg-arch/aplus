import { toZonedTime, fromZonedTime } from "date-fns-tz";

export function offsetJsonToMinutes(entry) {
  if (!entry || typeof entry !== "object") return null;
  const v = Number(entry.value);
  if (!Number.isFinite(v) || v < 0) return null;
  const u = String(entry.unit || "MINUTES").toUpperCase();
  if (u === "DAYS") return Math.round(v * 24 * 60);
  if (u === "HOURS") return Math.round(v * 60);
  if (u === "MINUTES") return Math.round(v);
  return null;
}

export function parseOffsetsJson(jsonStr) {
  if (!jsonStr) return [];
  try {
    const arr = JSON.parse(jsonStr);
    if (!Array.isArray(arr)) return [];
    return arr.map(offsetJsonToMinutes).filter((n) => n != null && n > 0);
  } catch {
    return [];
  }
}

/**
 * Ideal send = appointmentStart - offsetMinutes (in absolute UTC).
 * Clamp into local [windowStartMinutes, windowEndMinutes] on the same local calendar day as `ideal`.
 */
export function adjustToSendWindow(idealUtc, appointmentStartUtc, timezone, windowStartMin, windowEndMin) {
  const zIdeal = toZonedTime(idealUtc, timezone);
  const minOfDay = zIdeal.getHours() * 60 + zIdeal.getMinutes();
  const zAdj = new Date(zIdeal);

  if (minOfDay < windowStartMin) {
    zAdj.setHours(Math.floor(windowStartMin / 60), windowStartMin % 60, 0, 0);
  } else if (minOfDay > windowEndMin) {
    zAdj.setHours(Math.floor(windowEndMin / 60), windowEndMin % 60, 0, 0);
  } else {
    return idealUtc;
  }

  let out = fromZonedTime(zAdj, timezone);
  if (out.getTime() >= appointmentStartUtc.getTime()) {
    out = new Date(Math.min(idealUtc.getTime(), appointmentStartUtc.getTime() - 60_000));
  }
  return out;
}

export function computeScheduledFor({
  appointmentStartsAt,
  offsetMinutes,
  timezone,
  sendWindowStartMinutes,
  sendWindowEndMinutes
}) {
  const start = new Date(appointmentStartsAt);
  const ideal = new Date(start.getTime() - offsetMinutes * 60_000);
  return adjustToSendWindow(ideal, start, timezone, sendWindowStartMinutes, sendWindowEndMinutes);
}
