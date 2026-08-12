/**
 * Gregorian → Hebrew calendar conversion.
 * Algorithm: Reingold & Dershowitz "Calendrical Calculations" (3rd ed.).
 * Pure JS, no dependencies.
 */

const HEB_MONTHS_HE = [
  "", "ניסן", "אייר", "סיון", "תמוז", "אב", "אלול",
  "תשרי", "חשון", "כסלו", "טבת", "שבט", "אדר", "אדר ב׳",
];

const HEB_MONTHS_EN = [
  "", "Nisan", "Iyar", "Sivan", "Tammuz", "Av", "Elul",
  "Tishrei", "Cheshvan", "Kislev", "Tevet", "Shevat", "Adar", "Adar II",
];

// Hebrew gematria pairs ordered descending
const HEB_VALS = [
  [400,"ת"],[300,"ש"],[200,"ר"],[100,"ק"],
  [90,"צ"],[80,"פ"],[70,"ע"],[60,"ס"],[50,"נ"],
  [40,"מ"],[30,"ל"],[20,"כ"],[19,"יט"],[18,"יח"],
  [17,"יז"],[16,"טז"],[15,"טו"],[10,"י"],
  [9,"ט"],[8,"ח"],[7,"ז"],[6,"ו"],[5,"ה"],
  [4,"ד"],[3,"ג"],[2,"ב"],[1,"א"],
];

export function toHebrewNumeral(n) {
  if (n <= 0 || n > 400) return String(n);
  let result = "";
  let rem = n;
  for (const [val, letter] of HEB_VALS) {
    while (rem >= val) { result += letter; rem -= val; }
  }
  if (result.length === 1) return result + "׳";
  return result.slice(0, -1) + "״" + result.slice(-1);
}

function isHLeap(y)   { return (7 * y + 1) % 19 < 7; }

function hElapsed(y) {
  const m = Math.floor((235 * y - 234) / 19);
  const p = 12084 + 13753 * m;
  let d = 29 * m + Math.floor(p / 25920);
  if ((3 * (d + 1)) % 7 < 3) d++;
  return d;
}

function hDelay(y) {
  const a = hElapsed(y - 1), b = hElapsed(y), c = hElapsed(y + 1);
  if (c - b === 356) return 2;
  if (b - a === 382) return 1;
  return 0;
}

const H_EPOCH = 347997;

function hNewYear(y)  { return H_EPOCH + hElapsed(y) + hDelay(y); }
function hYearLen(y)  { return hNewYear(y + 1) - hNewYear(y); }

function hMonthLen(y, m) {
  if ([1, 3, 5, 7, 11].includes(m)) return 30;
  if (m === 8)  return hYearLen(y) % 10 === 5 ? 30 : 29;
  if (m === 9)  return hYearLen(y) % 10 === 3 ? 29 : 30;
  if (m === 12) return isHLeap(y) ? 30 : 29;
  return 29;
}

function gToJDN(y, mo, d) {
  const a = Math.floor((14 - mo) / 12);
  const Y = y + 4800 - a;
  const M = mo + 12 * a - 3;
  return d + Math.floor((153 * M + 2) / 5) + 365 * Y
    + Math.floor(Y / 4) - Math.floor(Y / 100) + Math.floor(Y / 400) - 32045;
}

function jdnToHeb(jdn) {
  let y = Math.floor(98496 * (jdn - H_EPOCH) / 35975351) + 1;
  while (hNewYear(y)     > jdn) y--;
  while (hNewYear(y + 1) <= jdn) y++;

  let doy = jdn - hNewYear(y);
  const order = isHLeap(y)
    ? [7, 8, 9, 10, 11, 12, 13, 1, 2, 3, 4, 5, 6]
    : [7, 8, 9, 10, 11, 12, 1, 2, 3, 4, 5, 6];

  let month = 7;
  for (const m of order) {
    const len = hMonthLen(y, m);
    if (doy < len) { month = m; break; }
    doy -= len;
  }
  return { year: y, month, day: doy + 1 };
}

/**
 * Sunset hour (local) used to roll Hebrew date: before this time, "today" shows
 * the previous day's Hebrew date (Jewish day starts at sunset).
 */
const SUNSET_HOUR_LOCAL = 18;
const SUNSET_MINUTE_LOCAL = 0;

/**
 * Convert Gregorian (year, month1, day) to Hebrew date.
 * Use this when you have a calendar date in the user's local timezone so the result
 * is not affected by Date timezone/UTC parsing. month1 = 1..12.
 * @param {number} year
 * @param {number} month1 1 = January, 12 = December
 * @param {number} day
 * @returns {{ year, month, day, monthNameHe, monthNameEn, numeral, short, full }}
 */
export function gregorianToHebrewFromYMD(year, month1, day) {
  const jdn = gToJDN(year, month1, day);
  const { year: hy, month, day: hd } = jdnToHeb(jdn);
  const numeral = toHebrewNumeral(hd);
  return {
    year: hy,
    month,
    day: hd,
    monthNameHe: HEB_MONTHS_HE[month] ?? "",
    monthNameEn: HEB_MONTHS_EN[month] ?? "",
    numeral,
    short: `${numeral} ${HEB_MONTHS_HE[month] ?? ""}`,
    full:  `${numeral} ${HEB_MONTHS_HE[month] ?? ""} ${toHebrewNumeral(hy)}`,
  };
}

/**
 * Hebrew date for display: uses local (y,m,d). For the local "today", if current
 * time is before sunset (6 PM local), returns the previous day's Hebrew date so
 * the calendar matches the traditional "day starts at sunset" rule.
 * @param {number} year
 * @param {number} month1 1 = January, 12 = December
 * @param {number} day
 * @param {Date} [now] optional current time (default new Date())
 * @returns {{ year, month, day, monthNameHe, monthNameEn, numeral, short, full }}
 */
export function gregorianToHebrewForDisplay(year, month1, day, now = new Date()) {
  const isToday =
    now.getFullYear() === year &&
    now.getMonth() + 1 === month1 &&
    now.getDate() === day;
  const beforeSunset =
    now.getHours() < SUNSET_HOUR_LOCAL ||
    (now.getHours() === SUNSET_HOUR_LOCAL && now.getMinutes() < SUNSET_MINUTE_LOCAL);
  if (isToday && beforeSunset) {
    const prev = new Date(year, month1 - 1, day - 1);
    return gregorianToHebrewFromYMD(
      prev.getFullYear(),
      prev.getMonth() + 1,
      prev.getDate(),
    );
  }
  return gregorianToHebrewFromYMD(year, month1, day);
}

/**
 * Convert a JS Date to a Hebrew date object.
 * Uses the date's LOCAL calendar day (getFullYear/getMonth/getDate) so the Hebrew
 * date matches the displayed local day, not UTC or Israel timezone.
 * @param {Date} jsDate
 * @returns {{ year, month, day, monthNameHe, monthNameEn, numeral, short, full }}
 */
export function gregorianToHebrew(jsDate) {
  return gregorianToHebrewFromYMD(
    jsDate.getFullYear(),
    jsDate.getMonth() + 1,
    jsDate.getDate(),
  );
}
