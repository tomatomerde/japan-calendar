/**
 * 営業日API。
 *
 * - `'national'` — 祝日のみを非営業日とする（土日は両カレンダーとも非営業日）。
 * - `'bank'` — 祝日に加え、12/31〜1/3 の銀行休業日も非営業日とする
 *   （1/1 は既に元日として祝日なので、実質 12/31・1/2・1/3 が追加される）。
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

/** 12/31・1/2・1/3。1/1は元日として既に祝日なのでここには含めない。 */
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
 * `n` 営業日後（`n` が負なら前）の日付を返す。`n === 0` の場合、`date` 自身が
 * 非営業日であっても補正せずそのまま返す。
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
 * `from` から `to` までの半開区間 `[from, to)` に含まれる営業日数。
 * `to < from` なら負値。`from === to` なら 0。
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
