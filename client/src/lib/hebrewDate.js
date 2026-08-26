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

/**
 * Does Hebrew year `y` have a leap month? A leap year runs Adar I (month 12)
 * then Adar II (month 13); Purim and Ta'anit Esther belong to Adar II.
 * @param {number} y Hebrew year
 */
export function isHebrewLeapYear(y) { return isHLeap(y); }

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

/**
 * Julian Day Number of 1 Tishrei AM 1 (the Hebrew epoch).
 *
 * Do NOT change this without re-checking the anchors below — it was 347997,
 * one day low, which pushed EVERY Hebrew date one day forward. That is what
 * made the calendar read as though it were on Israeli time: 12 Sep 2026 showed
 * as 2 Tishrei instead of 1 Tishrei, and Pesach/Yom Kippur were flagged on the
 * Gregorian day before the one American calendars print.
 *
 * Anchors (daytime of the Gregorian date -> Hebrew date):
 *   2026-09-12 -> 1 Tishrei 5787   2026-09-21 -> 10 Tishrei 5787
 *   2026-04-02 -> 15 Nisan 5786    2026-12-05 -> 25 Kislev 5787
 *   2027-03-23 -> 14 Adar II 5787  2027-04-22 -> 15 Nisan 5787
 */
const H_EPOCH = 347998;

function hNewYear(y)  { return H_EPOCH + hElapsed(y) + hDelay(y); }
function hYearLen(y)  { return hNewYear(y + 1) - hNewYear(y); }

/**
 * Length in days of Hebrew month `m` in year `y`.
 * Exported because Chanukah's length in Kislev depends on it: Kislev has 30 days
 * in some years and 29 in others, which moves where the 8 days land in Tevet.
 * @param {number} y Hebrew year
 * @param {number} m 1 = Nisan .. 7 = Tishrei .. 12 = Adar (13 = Adar II)
 * @returns {number} 29 or 30
 */
export function hebrewMonthLength(y, m) { return hMonthLen(y, m); }

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
 * Hebrew date to print for a Gregorian calendar day.
 *
 * This is the AMERICAN-calendar convention: the label on a Gregorian square is
 * that day's DAYTIME Hebrew date, exactly as a printed US Jewish calendar shows
 * it, and it does not change as the evening wears on.
 *
 * The Hebrew day really does begin at sunset, and this used to roll the label
 * over at 6 PM local. Two problems: it rolled the WRONG way (it returned the
 * PREVIOUS day's Hebrew date before sunset), and even done correctly it puts
 * one cell a day ahead of its own neighbours and a day ahead of the holiday
 * chip drawn beside it -- holidayService.js keys holidays off the daytime date.
 * A grid where "today" disagrees with the cell next to it is what reads as a
 * calendar running on Israeli time, so the label now stays on the civil day.
 *
 * @param {number} year
 * @param {number} month1 1 = January, 12 = December
 * @param {number} day
 * @returns {{ year, month, day, monthNameHe, monthNameEn, numeral, short, full }}
 */
export function gregorianToHebrewForDisplay(year, month1, day) {
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
