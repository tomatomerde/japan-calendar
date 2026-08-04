/**
 * 祝日API。`HOLIDAY_LAW` / 例外 / 春分秋分の近似式 / 振替休日 / 国民の休日を
 * すべて統合し、年ごとの祝日一覧を組み立てる。
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

/** 祝日APIが受け付ける年の範囲。1948年は祝日法が年の途中で施行された不完全な年なので除く。 */
export const MIN_SUPPORTED_YEAR = 1949;
export const MAX_SUPPORTED_YEAR = 2099;

function assertYearInRange(year: number): void {
  if (year < MIN_SUPPORTED_YEAR || year > MAX_SUPPORTED_YEAR) {
    throw new OutOfRangeError(
      `対応範囲外の年: ${year}。祝日APIは ${MIN_SUPPORTED_YEAR}〜${MAX_SUPPORTED_YEAR} 年のみ対応する。`,
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

function isEquinoxConfirmed(year: number): boolean {
  const boundary = OFFICIAL_META.equinoxConfirmedThrough;
  return boundary !== null && year <= boundary;
}

const statutoryCache = new Map<number, readonly Holiday[]>();

/** その年の法定祝日（振替休日・国民の休日を含まない）。 */
export function statutoryHolidaysForYear(year: number): readonly Holiday[] {
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
 * その年の祝日一覧（法定祝日・振替休日・国民の休日を全て含む）。
 *
 * 振替休日・国民の休日の判定には隣接年の法定祝日も必要になりうるため、
 * 前後1年ぶんも合わせて計算してから対象年だけを抜き出す。
 * （実際には祝日が年末年始をまたいで連鎖することは無いが、判定ロジックを
 * 年の内部だけに閉じた前提にしないための保険。）
 */
export function holidaysForYear(year: number): readonly Holiday[] {
  const cached = yearCache.get(year);
  if (cached !== undefined) return cached;

  const statutory: StatutoryHoliday[] = [];
  for (const y of [year - 1, year, year + 1]) {
    if (y < MIN_SUPPORTED_YEAR - 1 || y > MAX_SUPPORTED_YEAR + 1) continue;
    for (const holiday of statutoryHolidaysForYear(Math.max(MIN_SUPPORTED_YEAR, Math.min(MAX_SUPPORTED_YEAR, y)))) {
      if (holiday.date.year === y) statutory.push({ date: holiday.date, confirmed: holiday.confirmed });
    }
  }

  const derived = [...computeSubstituteHolidays(statutory), ...computeBridgeHolidays(statutory)];

  const all = [...statutoryHolidaysForYear(year), ...derived.filter((h) => h.date.year === year)];
  all.sort((a, b) => toDays(a.date) - toDays(b.date));

  yearCache.set(year, all);
  return all;
}

/** 指定の日付が祝日かどうか。祝日なら `Holiday`、そうでなければ `null`。 */
export function isHoliday(input: DateInput): Holiday | null {
  const date: CivilDate = toCivilDate(input);
  assertYearInRange(date.year);
  return (
    holidaysForYear(date.year).find(
      (h) => h.date.year === date.year && h.date.month === date.month && h.date.day === date.day,
    ) ?? null
  );
}
