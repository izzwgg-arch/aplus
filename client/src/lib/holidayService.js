/**
 * Holiday detection — US federal holidays + Jewish/Hebrew holidays.
 * Pure JS, no external dependencies. Uses hebrewDate.js for conversions.
 */

import { gregorianToHebrewFromYMD, hebrewMonthLength, isHebrewLeapYear } from "./hebrewDate.js";

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
//                7=Tishrei, 8=Cheshvan, 9=Kislev, 10=Tevet, 11=Shevat.
//
// Adar needs care. A leap year runs Adar I (raw month 12) then Adar II (raw 13),
// and Purim belongs to Adar II -- so a table keyed on the RAW month number puts
// Purim in the wrong month every leap year. hebrewLookupMonth() below remaps the
// raw month first, so this table is written in terms of:
//   ADAR    = the Adar that carries Purim (Adar II in a leap year, Adar in a plain one)
//   ADAR_I  = the extra Adar, which exists only in a leap year
const ADAR   = 12;
const ADAR_I = 14;

/**
 * Map a raw Hebrew month onto the number HEB_HOLIDAYS is keyed by.
 * In a plain year Adar is 12 and there is no Adar I. In a leap year the raw
 * months are 12 (Adar I) and 13 (Adar II); Purim is in Adar II, so Adar II
 * takes the ADAR slot and Adar I gets its own.
 */
function hebrewLookupMonth(hebYear, month) {
  if (!isHebrewLeapYear(hebYear)) return month;
  if (month === 12) return ADAR_I;
  if (month === 13) return ADAR;
  return month;
}

const HEB_HOLIDAYS = [
  // High Holidays / Yamim Noraim
  [7,  1,  "Rosh Hashanah"],
  [7,  2,  "Rosh Hashanah"],
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

  // Hanukkah is NOT listed here -- see isHanukkah(). It runs 8 days from
  // 25 Kislev, but Kislev has 30 days in some years and 29 in others, so its
  // tail lands on 1-2 Tevet or 1-3 Tevet depending on the year. The old fixed
  // list (25-29 Kislev + 1-3 Tevet) assumed a 29-day Kislev, so in every
  // 30-day-Kislev year it punched a HOLE in the middle of Hanukkah and added a
  // bogus 9th day: 5787 lost Thu 10 Dec 2026 (30 Kislev) and gained 13 Dec.
  [10, 10, "Asara B'Tevet"],

  // Shevat / Adar   (Ta'anit Esther is in SHIFTED_FASTS -- it moves off Shabbat)
  [11, 15, "Tu BiShvat"],
  [ADAR,   14, "Purim"],
  [ADAR,   15, "Shushan Purim"],
  [ADAR_I, 14, "Purim Katan"],          // leap years only -- NOT the real Purim
  [ADAR_I, 15, "Shushan Purim Katan"],

  // Nisan (Passover)
  [1,  14, "Erev Pesach"],
  [1,  15, "Passover"],
  [1,  16, "Passover"],
  [1,  17, "Passover"],
  [1,  18, "Passover"],
  [1,  19, "Passover"],
  [1,  20, "Passover"],
  [1,  21, "Passover"],
  [1,  22, "Passover"],   // 8th day - kept in the DIASPORA (New York); Israel keeps 7

  // Iyar
  [2,  14, "Pesach Sheni"],
  [2,  18, "Lag B'Omer"],

  // Sivan
  [3,   6, "Shavuot"],
  [3,   7, "Shavuot"],

  // Tammuz / Av
  [6,  29, "Erev Rosh Hashanah"],

  // Modern Israeli holidays
  [1,  27, "Yom HaShoah"],
  [2,   4, "Yom HaZikaron"],
  [2,   5, "Yom HaAtzmaut"],
  [2,  28, "Yom Yerushalayim"],
];

/**
 * Fasts that are never observed on Shabbat.
 *
 * Four of the minor fasts move when they land on Shabbat: three are postponed to
 * the Sunday after, and Ta'anit Esther is pulled BACK to the Thursday before,
 * because the day before Purim is a Friday there. Each alternate weekday below
 * happens only when the nominal day was Shabbat (11 Adar is a Thursday exactly
 * when 13 Adar is a Shabbat, and so on), so testing the weekday is enough.
 *
 * Asara B'Tevet is deliberately absent -- it is the one fast that is never moved,
 * and 10 Tevet can never fall on Shabbat anyway.
 */
const SHIFTED_FASTS = [
  { month: 7,    day: 3,  name: "Tzom Gedaliah",       altDay: 4,  altDow: 0 },
  { month: 4,    day: 17, name: "Shiva Asar B'Tammuz", altDay: 18, altDow: 0 },
  { month: 5,    day: 9,  name: "Tisha B'Av",          altDay: 10, altDow: 0 },
  { month: ADAR, day: 13, name: "Ta'anit Esther",      altDay: 11, altDow: 4 },
];

/** Names of any shifted fast observed on this date. `dow` is the JS weekday, 6 = Shabbat. */
function shiftedFastsOn(lookupMonth, day, dow) {
  return SHIFTED_FASTS
    .filter((f) => f.month === lookupMonth &&
      ((day === f.day && dow !== 6) || (day === f.altDay && dow === f.altDow)))
    .map((f) => f.name);
}

/**
 * Is this Hebrew date one of the 8 days of Hanukkah?
 *
 * Hanukkah starts on 25 Kislev and runs 8 days. Kislev has 30 days in some
 * years and 29 in others, so the days that spill into Tevet are 1-2 Tevet after
 * a 30-day Kislev and 1-3 Tevet after a 29-day one. Deriving it from the actual
 * month length is the only way to get 8 CONSECUTIVE days in every year.
 */
function isHanukkah(hebYear, month, day) {
  if (month === 9) return day >= 25;                      // 25 Kislev -> end of Kislev
  if (month !== 10) return false;
  const inKislev = hebrewMonthLength(hebYear, 9) - 24;    // days of Hanukkah inside Kislev
  return day <= 8 - inKislev;                             // the remainder open Tevet
}

/** Return Hebrew/Jewish holiday names for a given JS Date (uses local calendar day only). */
export function getHebrewHolidays(jsDate) {
  const { year, month, day } = gregorianToHebrewFromYMD(
    jsDate.getFullYear(),
    jsDate.getMonth() + 1,
    jsDate.getDate(),
  );
  const lookupMonth = hebrewLookupMonth(year, month);
  const names = HEB_HOLIDAYS
    .filter(([m, d]) => m === lookupMonth && d === day)
    .map(([, , name]) => name);
  if (isHanukkah(year, month, day)) names.unshift("Hanukkah");
  names.push(...shiftedFastsOn(lookupMonth, day, jsDate.getDay()));
  return names;
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
