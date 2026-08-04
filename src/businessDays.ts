/**
 * Business day API.
 *
 * - `'national'` — Only holidays are treated as non-business days
 *   (weekends are non-business days on both calendars).
 * - `'bank'` — In addition to holidays, the bank holiday window of
 *   12/31-1/3 is also treated as non-business days (1/1 is already a
 *   holiday as New Year's Day, so this effectively adds 12/31, 1/2, and 1/3).
 */

import {
  SATURDAY,
  SUNDAY,
  civilFromDays,
  isLeapYear,
  isWeekend,
  toDays,
  weekdayOf,
  type CivilDate,
  type Weekday,
} from './civil.js';
import { assertYearInRange, holidaysForYear } from './holidays.js';
import { toCivilDate, type DateInput } from './input.js';

export type CalendarKind = 'national' | 'bank';

const holidayDaysCache = new Map<number, ReadonlySet<number>>();

function holidayDaysForYear(year: number): ReadonlySet<number> {
  let set = holidayDaysCache.get(year);
  if (set === undefined) {
    set = new Set(holidaysForYear(year).map((h) => toDays(h.date)));
    holidayDaysCache.set(year, set);
  }
  return set;
}

/** 12/31, 1/2, 1/3. 1/1 is excluded since it's already a holiday as New Year's Day. */
function isBankOnlyClosure(date: CivilDate): boolean {
  return (date.month === 12 && date.day === 31) || (date.month === 1 && (date.day === 2 || date.day === 3));
}

function isBusinessDayCivil(date: CivilDate, days: number, calendar: CalendarKind): boolean {
  if (isWeekend(date)) return false;
  if (holidayDaysForYear(date.year).has(days)) return false;
  if (calendar === 'bank' && isBankOnlyClosure(date)) return false;
  return true;
}

export function isBusinessDay(input: DateInput, calendar: CalendarKind = 'national'): boolean {
  const date = toCivilDate(input);
  assertYearInRange(date.year);
  return isBusinessDayCivil(date, toDays(date), calendar);
}

/**
 * Returns the date `n` business days after `date` (or before, if `n` is
 * negative). When `n === 0`, returns `date` unchanged even if it's not
 * itself a business day.
 */
export function addBusinessDays(input: DateInput, n: number, calendar: CalendarKind = 'national'): CivilDate {
  const start = toCivilDate(input);
  assertYearInRange(start.year);
  if (n === 0) return start;

  const step = n > 0 ? 1 : -1;
  let remaining = Math.abs(n);
  let days = toDays(start);

  while (remaining > 0) {
    days += step;
    const date = civilFromDays(days);
    assertYearInRange(date.year);
    if (isBusinessDayCivil(date, days, calendar)) remaining -= 1;
  }

  return civilFromDays(days);
}

/** Number of occurrences of `targetWeekday` among `count` consecutive days starting at `startWeekday`. */
function countWeekdayOccurrences(count: number, startWeekday: Weekday, targetWeekday: Weekday): number {
  const offset = ((targetWeekday - startWeekday) % 7 + 7) % 7;
  if (offset >= count) return 0;
  return Math.floor((count - 1 - offset) / 7) + 1;
}

const yearCountCache = new Map<string, number>();

/**
 * Business days in the entire calendar year `year`, computed in O(1) (plus
 * the already-cached `holidaysForYear(year)`, typically ~20 entries) rather
 * than by iterating all ~365 days. This is what keeps `businessDaysBetween`
 * fast even for a range spanning the full supported year span: without it,
 * a single query like `businessDaysBetween('1949-01-01', '2099-12-31')`
 * would need to visit on the order of 55,000 days, which is enough to blow
 * a Cloudflare Workers request's CPU budget on a single request -- caching
 * the day-by-day result doesn't help there, since it's still the first,
 * uncached call that has to pay for every one of those days.
 */
function fullYearBusinessDayCount(year: number, calendar: CalendarKind): number {
  const cacheKey = `${year}:${calendar}`;
  const cached = yearCountCache.get(cacheKey);
  if (cached !== undefined) return cached;

  const daysInYear = isLeapYear(year) ? 366 : 365;
  const jan1Weekday = weekdayOf({ year, month: 1, day: 1 });
  const weekendDays =
    countWeekdayOccurrences(daysInYear, jan1Weekday, SUNDAY) +
    countWeekdayOccurrences(daysInYear, jan1Weekday, SATURDAY);

  let count = daysInYear - weekendDays;
  for (const holiday of holidaysForYear(year)) {
    if (!isWeekend(holiday.date)) count -= 1;
  }
  if (calendar === 'bank') {
    const holidays = holidayDaysForYear(year);
    for (const date of [
      { year, month: 12, day: 31 },
      { year, month: 1, day: 2 },
      { year, month: 1, day: 3 },
    ]) {
      if (!isWeekend(date) && !holidays.has(toDays(date))) count -= 1;
    }
  }

  yearCountCache.set(cacheKey, count);
  return count;
}

/** Business days in the half-open interval `[days(rangeStartOfYear), toDayNumber)`, day-by-day. Only used for the partial year at each end of a range. */
function countBusinessDaysInDayRange(lo: number, hi: number, calendar: CalendarKind): number {
  let count = 0;
  for (let days = lo; days < hi; days += 1) {
    if (isBusinessDayCivil(civilFromDays(days), days, calendar)) count += 1;
  }
  return count;
}

/**
 * Number of business days in the half-open interval `[from, to)`.
 * Negative if `to < from`. `0` if `from === to`.
 */
export function businessDaysBetween(from: DateInput, to: DateInput, calendar: CalendarKind = 'national'): number {
  const fromDate = toCivilDate(from);
  const toDate = toCivilDate(to);
  assertYearInRange(fromDate.year);
  assertYearInRange(toDate.year);

  const fromDayNumber = toDays(fromDate);
  const toDayNumber = toDays(toDate);
  if (fromDayNumber === toDayNumber) return 0;

  const [lo, hi, sign] =
    fromDayNumber < toDayNumber ? [fromDayNumber, toDayNumber, 1] : [toDayNumber, fromDayNumber, -1];

  const loDate = civilFromDays(lo);
  const hiDate = civilFromDays(hi);

  let count: number;
  if (loDate.year === hiDate.year) {
    count = countBusinessDaysInDayRange(lo, hi, calendar);
  } else {
    const endOfLoYear = toDays({ year: loDate.year, month: 12, day: 31 }) + 1;
    const startOfHiYear = toDays({ year: hiDate.year, month: 1, day: 1 });

    count = countBusinessDaysInDayRange(lo, endOfLoYear, calendar);
    for (let year = loDate.year + 1; year < hiDate.year; year += 1) {
      count += fullYearBusinessDayCount(year, calendar);
    }
    count += countBusinessDaysInDayRange(startOfHiYear, hi, calendar);
  }

  return count * sign;
}
