/**
 * Holiday API. Combines `HOLIDAY_LAW`, the exceptions, the equinox
 * approximation formula, substitute holidays, and national holidays into
 * a per-year list of holidays.
 */

import { nthWeekdayOfMonth, toDays, type CivilDate, type Weekday } from './civil.js';
import { OFFICIAL_META } from './data/official.js';
import { OutOfRangeError } from './errors.js';
import { toCivilDate, type DateInput } from './input.js';
import { autumnalEquinoxDay, vernalEquinoxDay } from './rules/equinox.js';
import { ONE_OFF_HOLIDAYS, OLYMPIC_OVERRIDES } from './rules/exceptions.js';
import { HOLIDAY_LAW, type HolidayDefinition } from './rules/holidayLaw.js';
import { computeBridgeHolidays, computeSubstituteHolidays, type StatutoryHoliday } from './rules/observed.js';
import type { Holiday } from './types.js';

/** Range of years the holiday API accepts. 1948 is excluded because the Public Holiday Law took effect partway through that year. */
export const MIN_SUPPORTED_YEAR = 1949;
export const MAX_SUPPORTED_YEAR = 2099;

export function assertYearInRange(year: number): void {
  if (year < MIN_SUPPORTED_YEAR || year > MAX_SUPPORTED_YEAR) {
    throw new OutOfRangeError(
      `Year out of range: ${year}. The holiday API only supports ${MIN_SUPPORTED_YEAR}-${MAX_SUPPORTED_YEAR}.`,
    );
  }
}

function resolveRuleDate(rule: HolidayDefinition['rule'], year: number): { month: number; day: number } {
  switch (rule.kind) {
    case 'fixed':
      return { month: rule.month, day: rule.day };
    case 'nth-weekday': {
      const date = nthWeekdayOfMonth(year, rule.month, rule.weekday as Weekday, rule.nth);
      return { month: date.month, day: date.day };
    }
    case 'equinox':
      return {
        month: rule.which === 'vernal' ? 3 : 9,
        day: rule.which === 'vernal' ? vernalEquinoxDay(year) : autumnalEquinoxDay(year),
      };
  }
}

/**
 * Whether the equinox date for `year` has been validated against the
 * official Cabinet Office data. This requires the year to be within the
 * data's actual coverage (`firstYear`-`equinoxConfirmedThrough`) -- a year
 * before `firstYear` may coincidentally match the approximation formula,
 * but that's unverified extrapolation, not a confirmed fact.
 */
function isEquinoxConfirmed(year: number): boolean {
  const { firstYear, equinoxConfirmedThrough } = OFFICIAL_META;
  if (firstYear === null || equinoxConfirmedThrough === null) return false;
  return year >= firstYear && year <= equinoxConfirmedThrough;
}

const statutoryCache = new Map<number, readonly Holiday[]>();

/** The statutory holidays for a given year (excludes substitute holidays and national holidays). */
export function statutoryHolidaysForYear(year: number): readonly Holiday[] {
  assertYearInRange(year);
  const cached = statutoryCache.get(year);
  if (cached !== undefined) return cached;

  const byName = new Map<string, { month: number; day: number }>();

  for (const definition of HOLIDAY_LAW) {
    if (year < definition.fromYear) continue;
    if (definition.throughYear !== undefined && year > definition.throughYear) continue;
    byName.set(definition.name, resolveRuleDate(definition.rule, year));
  }

  const overrides = OLYMPIC_OVERRIDES.get(year);
  if (overrides !== undefined) {
    for (const [name, date] of overrides) {
      if (byName.has(name)) byName.set(name, date);
    }
  }

  const holidays: Holiday[] = [];
  for (const [name, { month, day }] of byName) {
    const confirmed = name === '春分の日' || name === '秋分の日' ? isEquinoxConfirmed(year) : true;
    holidays.push({ date: { year, month, day }, name, category: 'statutory', confirmed });
  }

  for (const oneOff of ONE_OFF_HOLIDAYS) {
    if (oneOff.year !== year) continue;
    holidays.push({
      date: { year, month: oneOff.month, day: oneOff.day },
      name: oneOff.name,
      category: 'statutory',
      confirmed: true,
    });
  }

  holidays.sort((a, b) => toDays(a.date) - toDays(b.date));
  statutoryCache.set(year, holidays);
  return holidays;
}

const yearCache = new Map<number, readonly Holiday[]>();

/**
 * The full list of holidays for a given year (statutory holidays,
 * substitute holidays, and national holidays combined).
 *
 * Determining substitute holidays and national holidays can require the
 * statutory holidays of adjacent years, so this computes the surrounding
 * year on each side too before extracting just the target year.
 * (In practice, holiday placement never produces a chain that crosses a
 * year boundary, but this avoids assuming the logic is confined to a
 * single year.)
 */
export function holidaysForYear(year: number): readonly Holiday[] {
  assertYearInRange(year);
  const cached = yearCache.get(year);
  if (cached !== undefined) return cached;

  const statutory: StatutoryHoliday[] = [];
  for (const y of [year - 1, year, year + 1]) {
    if (y < MIN_SUPPORTED_YEAR - 1 || y > MAX_SUPPORTED_YEAR + 1) continue;
    for (const holiday of statutoryHolidaysForYear(Math.max(MIN_SUPPORTED_YEAR, Math.min(MAX_SUPPORTED_YEAR, y)))) {
      if (holiday.date.year === y) statutory.push({ date: holiday.date, confirmed: holiday.confirmed });
    }
  }

  const substitutes = computeSubstituteHolidays(statutory);
  const derived = [...substitutes, ...computeBridgeHolidays(statutory, substitutes)];

  const all = [...statutoryHolidaysForYear(year), ...derived.filter((h) => h.date.year === year)];
  all.sort((a, b) => toDays(a.date) - toDays(b.date));

  yearCache.set(year, all);
  return all;
}

/** Whether the given date is a holiday. Returns a `Holiday` if so, otherwise `null`. */
export function isHoliday(input: DateInput): Holiday | null {
  const date: CivilDate = toCivilDate(input);
  assertYearInRange(date.year);
  return (
    holidaysForYear(date.year).find(
      (h) => h.date.year === date.year && h.date.month === date.month && h.date.day === date.day,
    ) ?? null
  );
}
