/**
 * Holiday detection — US federal holidays + Jewish/Hebrew holidays.
 * Pure JS, no external dependencies. Uses hebrewDate.js for conversions.
 */

import { gregorianToHebrewFromYMD } from "./hebrewDate.js";

/* ─── Helpers ───────────────────────────────────────────────────────────────── */

function p(n) { return String(n).padStart(2, "0"); }
export function dateKey(d) {
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** nth occurrence of a weekday in a month. n=-1 = last. */
function nthWeekday(year, month1, weekday, n) {
  if (n === -1) {
    const last = new Date(year, month1, 0); // last day of month
    const diff = (last.getDay() - weekday + 7) % 7;
    return new Date(year, month1 - 1, last.getDate() - diff);
  }
  const first = new Date(year, month1 - 1, 1);
  const diff  = (weekday - first.getDay() + 7) % 7;
  return new Date(year, month1 - 1, 1 + diff + (n - 1) * 7);
}

/* ─── US Federal Holidays ───────────────────────────────────────────────────── */

const _usCache = {};

function buildUSHolidays(year) {
  if (_usCache[year]) return _usCache[year];
  const h = {};
  const add = (d, name) => {
    const k = dateKey(d);
    (h[k] = h[k] ?? []).push({ name, type: "us" });
  };

  add(new Date(year, 0, 1),              "New Year's Day");
  add(nthWeekday(year, 1, 1, 3),         "MLK Day");
  add(nthWeekday(year, 2, 1, 3),         "Presidents' Day");
  add(nthWeekday(year, 5, 1, -1),        "Memorial Day");
  add(new Date(year, 6, 4),              "Independence Day");
  add(nthWeekday(year, 9, 1, 1),         "Labor Day");
  add(nthWeekday(year, 10, 1, 2),        "Columbus Day");
  add(new Date(year, 10, 11),            "Veterans Day");
  add(nthWeekday(year, 11, 4, 4),        "Thanksgiving");
  add(new Date(year, 11, 25),            "Christmas");

  return (_usCache[year] = h);
}

/** Return US holiday names for a given JS Date. */
export function getUSHolidays(jsDate) {
  const map = buildUSHolidays(jsDate.getFullYear());
  return (map[dateKey(jsDate)] ?? []).map((h) => h.name);
}

/* ─── Hebrew / Jewish Holidays ──────────────────────────────────────────────── */
// Holidays keyed by [hebrewMonth, hebrewDay].
// Hebrew months: 1=Nisan, 2=Iyar, 3=Sivan, 4=Tammuz, 5=Av, 6=Elul,
//                7=Tishrei, 8=Cheshvan, 9=Kislev, 10=Tevet, 11=Shevat,
//                12=Adar (13=Adar II in leap years)

const HEB_HOLIDAYS = [
  // High Holidays / Yamim Noraim
  [7,  1,  "Rosh Hashanah"],
  [7,  2,  "Rosh Hashanah"],
  [7,  3,  "Tzom Gedaliah"],
  [7,  10, "Yom Kippur"],

  // Sukkot / Shmini Atzeret
  [7,  15, "Sukkot"],
  [7,  16, "Sukkot"],
  [7,  17, "Sukkot"],
  [7,  18, "Sukkot"],
  [7,  19, "Sukkot"],
  [7,  20, "Sukkot"],
  [7,  21, "Hoshana Raba"],
  [7,  22, "Shemini Atzeret"],
  [7,  23, "Simchat Torah"],

  // Hanukkah (25 Kislev – 2/3 Tevet, 8 days)
  [9,  25, "Hanukkah"],
  [9,  26, "Hanukkah"],
  [9,  27, "Hanukkah"],
  [9,  28, "Hanukkah"],
  [9,  29, "Hanukkah"],
  [10,  1, "Hanukkah"],
  [10,  2, "Hanukkah"],
  [10,  3, "Hanukkah"],
  [10, 10, "Asara B'Tevet"],

  // Shevat / Adar
  [11, 15, "Tu BiShvat"],
  [12, 13, "Ta'anit Esther"],
  [12, 14, "Purim"],
  [12, 15, "Shushan Purim"],
  [13, 14, "Purim"],         // Adar II in leap year
  [13, 15, "Shushan Purim"],

  // Nisan (Passover)
  [1,  14, "Erev Pesach"],
  [1,  15, "Passover"],
  [1,  16, "Passover"],
  [1,  17, "Passover"],
  [1,  18, "Passover"],
  [1,  19, "Passover"],
  [1,  20, "Passover"],
  [1,  21, "Passover"],

  // Iyar
  [2,  14, "Pesach Sheni"],
  [2,  18, "Lag B'Omer"],

  // Sivan
  [3,   6, "Shavuot"],
  [3,   7, "Shavuot"],

  // Tammuz / Av
  [4,  17, "Shiva Asar B'Tammuz"],
  [5,   9, "Tisha B'Av"],
  [6,  29, "Erev Rosh Hashanah"],

  // Modern Israeli holidays
  [1,  27, "Yom HaShoah"],
  [2,   4, "Yom HaZikaron"],
  [2,   5, "Yom HaAtzmaut"],
  [2,  28, "Yom Yerushalayim"],
];

/** Return Hebrew/Jewish holiday names for a given JS Date (uses local calendar day only). */
export function getHebrewHolidays(jsDate) {
  const { month, day } = gregorianToHebrewFromYMD(
    jsDate.getFullYear(),
    jsDate.getMonth() + 1,
    jsDate.getDate(),
  );
  return HEB_HOLIDAYS
    .filter(([m, d]) => m === month && d === day)
    .map(([, , name]) => name);
}

/**
 * Return all holidays for a date.
 * @returns {{ us: string[], hebrew: string[], all: string[] }}
 */
export function getAllHolidays(jsDate) {
  const us     = getUSHolidays(jsDate);
  const hebrew = getHebrewHolidays(jsDate);
  return { us, hebrew, all: [...us, ...hebrew] };
}
