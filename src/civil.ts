/**
 * Conversion between civil (calendar) dates and day numbers.
 *
 * All date arithmetic in this library is built on top of this module.
 * `Date`'s local-timezone APIs (`getFullYear`, etc.) are **never used**.
 * Everything is computed from civil dates (year/month/day) and an integer
 * day number counted from 1970-01-01 = 0, so the result never depends on
 * the runtime's timezone.
 *
 * Conversion follows Howard Hinnant's `days_from_civil` / `civil_from_days`
 * (proleptic Gregorian, extending the leap-year rule indefinitely into the past).
 */

export interface CivilDate {
  readonly year: number;
  readonly month: number;
  readonly day: number;
}

/** 0=Sunday, 1=Monday, ... 6=Saturday. */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export const SUNDAY = 0;
export const SATURDAY = 6;

/** Integer division that truncates toward zero, even for negative numbers. */
function idiv(a: number, b: number): number {
  return Math.trunc(a / b);
}

export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

export function daysInMonth(year: number, month: number): number {
  switch (month) {
    case 1:
    case 3:
    case 5:
    case 7:
    case 8:
    case 10:
    case 12:
      return 31;
    case 4:
    case 6:
    case 9:
    case 11:
      return 30;
    case 2:
      return isLeapYear(year) ? 29 : 28;
    default:
      return 0;
  }
}

/** Whether this civil date actually exists: month and day in range, and all integers. */
export function isValidCivil(year: number, month: number, day: number): boolean {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return false;
  if (month < 1 || month > 12) return false;
  return day >= 1 && day <= daysInMonth(year, month);
}

/** Converts to a day number counted from 1970-01-01 = 0. */
export function daysFromCivil(year: number, month: number, day: number): number {
  const y = year - (month <= 2 ? 1 : 0);
  const era = idiv(y >= 0 ? y : y - 399, 400);
  const yoe = y - era * 400; // [0, 399]
  const doy = idiv(153 * (month + (month > 2 ? -3 : 9)) + 2, 5) + day - 1; // [0, 365]
  const doe = yoe * 365 + idiv(yoe, 4) - idiv(yoe, 100) + doy; // [0, 146096]
  return era * 146097 + doe - 719468;
}

/** Converts a day number back to a civil date. */
export function civilFromDays(days: number): CivilDate {
  const z = days + 719468;
  const era = idiv(z >= 0 ? z : z - 146096, 146097);
  const doe = z - era * 146097; // [0, 146096]
  const yoe = idiv(doe - idiv(doe, 1460) + idiv(doe, 36524) - idiv(doe, 146096), 365); // [0, 399]
  const y = yoe + era * 400;
  const doy = doe - (365 * yoe + idiv(yoe, 4) - idiv(yoe, 100)); // [0, 365]
  const mp = idiv(5 * doy + 2, 153); // [0, 11]
  const day = doy - idiv(153 * mp + 2, 5) + 1; // [1, 31]
  const month = mp + (mp < 10 ? 3 : -9); // [1, 12]
  return { year: y + (month <= 2 ? 1 : 0), month, day };
}

export function toDays(date: CivilDate): number {
  return daysFromCivil(date.year, date.month, date.day);
}

/**
 * Day of week. 1970-01-01 was a Thursday, so day number 0 maps to 4 (Thu).
 * The double modulo keeps negative day numbers in the 0..6 range too.
 */
export function weekdayFromDays(days: number): Weekday {
  return (((days + 4) % 7) + 7) % 7 as Weekday;
}

export function weekdayOf(date: CivilDate): Weekday {
  return weekdayFromDays(toDays(date));
}

export function isWeekend(date: CivilDate): boolean {
  const weekday = weekdayOf(date);
  return weekday === SUNDAY || weekday === SATURDAY;
}

export function addDays(date: CivilDate, count: number): CivilDate {
  return civilFromDays(toDays(date) + count);
}

/** Negative if a < b, positive if a > b, zero if they're the same date. */
export function compareCivil(a: CivilDate, b: CivilDate): number {
  if (a.year !== b.year) return a.year - b.year;
  if (a.month !== b.month) return a.month - b.month;
  return a.day - b.day;
}

export function isSameCivil(a: CivilDate, b: CivilDate): boolean {
  return compareCivil(a, b) === 0;
}

/** Formats as `YYYY-MM-DD`. */
export function toIsoDate(date: CivilDate): string {
  const year = String(date.year).padStart(4, '0');
  const month = String(date.month).padStart(2, '0');
  const day = String(date.day).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * The nth occurrence of a given weekday in a month (e.g. the 3rd Monday of
 * September). Used to compute "Happy Monday" holidays.
 */
export function nthWeekdayOfMonth(
  year: number,
  month: number,
  weekday: Weekday,
  nth: number,
): CivilDate {
  const firstDay = daysFromCivil(year, month, 1);
  const shift = (weekday - weekdayFromDays(firstDay) + 7) % 7;
  return civilFromDays(firstDay + shift + (nth - 1) * 7);
}
