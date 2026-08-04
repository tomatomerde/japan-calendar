/**
 * Business day API.
 *
 * - `'national'` — Only holidays are treated as non-business days
 *   (weekends are non-business days on both calendars).
 * - `'bank'` — In addition to holidays, the bank holiday window of
 *   12/31-1/3 is also treated as non-business days (1/1 is already a
 *   holiday as New Year's Day, so this effectively adds 12/31, 1/2, and 1/3).
 */

import { civilFromDays, isWeekend, toDays, type CivilDate } from './civil.js';
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

  let count = 0;
  for (let days = lo; days < hi; days += 1) {
    const date = civilFromDays(days);
    if (isBusinessDayCivil(date, days, calendar)) count += 1;
  }

  return count * sign;
}
