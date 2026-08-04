/**
 * Pins the package's public API surface.
 *
 * `src/index.ts` is the barrel every npm consumer imports through, but
 * nothing referenced it except incidentally, so dropping an export from
 * it changed the published API without failing a single test or
 * type-check. For a library heading for npm that's a silent breaking
 * change.
 *
 * This list is deliberately exhaustive rather than a spot check: it
 * fails both on an accidental removal (a breaking change) and on an
 * accidental addition (a wider API than intended, which is then
 * expensive to walk back). Adding or removing an export here is a
 * deliberate act -- update the list, and treat it as an API change.
 */

import { describe, expect, it } from 'vitest';
import * as api from '../src/index.ts';

const EXPECTED_EXPORTS = [
  // civil.ts — the date foundation
  'addDays',
  'civilFromDays',
  'compareCivil',
  'daysFromCivil',
  'daysInMonth',
  'isLeapYear',
  'isSameCivil',
  'isValidCivil',
  'isWeekend',
  'nthWeekdayOfMonth',
  'toDays',
  'toIsoDate',
  'weekdayOf',
  // input.ts
  'civilFromInstant',
  'toCivilDate',
  // errors.ts
  'InvalidDateInputError',
  'InvalidWarekiDateError',
  'JapanCalendarError',
  'MeijiReformError',
  'OutOfRangeError',
  'UnsupportedWarekiRangeError',
  // wareki.ts
  'ERAS',
  'WAREKI_SUPPORTED_FROM',
  'formatWareki',
  'fromWareki',
  'toWareki',
  // data
  'OFFICIAL_META',
  // holidays.ts
  'MAX_SUPPORTED_YEAR',
  'MIN_SUPPORTED_YEAR',
  'holidaysForYear',
  'isHoliday',
  'statutoryHolidaysForYear',
  // businessDays.ts
  'addBusinessDays',
  'businessDaysBetween',
  'isBusinessDay',
].sort();

describe('公開APIの表面', () => {
  it('エクスポートの集合が意図どおり（増減があれば失敗する）', () => {
    expect(Object.keys(api).sort()).toEqual(EXPECTED_EXPORTS);
  });

  it('関数として公開しているものはすべて呼び出せる', () => {
    // 「エクスポート名は在るが undefined」のような壊れ方を検出する。
    const callables = [
      'addDays',
      'civilFromDays',
      'compareCivil',
      'daysFromCivil',
      'daysInMonth',
      'isLeapYear',
      'isSameCivil',
      'isValidCivil',
      'isWeekend',
      'nthWeekdayOfMonth',
      'toDays',
      'toIsoDate',
      'weekdayOf',
      'civilFromInstant',
      'toCivilDate',
      'formatWareki',
      'fromWareki',
      'toWareki',
      'holidaysForYear',
      'isHoliday',
      'statutoryHolidaysForYear',
      'addBusinessDays',
      'businessDaysBetween',
      'isBusinessDay',
    ] as const;
    for (const name of callables) {
      expect(typeof (api as unknown as Record<string, unknown>)[name], name).toBe('function');
    }
  });

  it('エラークラスはすべて JapanCalendarError を継承している', () => {
    for (const name of [
      'InvalidDateInputError',
      'InvalidWarekiDateError',
      'MeijiReformError',
      'OutOfRangeError',
      'UnsupportedWarekiRangeError',
    ] as const) {
      const ctor = (api as unknown as Record<string, new (...args: never[]) => unknown>)[name];
      expect(typeof ctor, name).toBe('function');
      expect(Object.create(ctor!.prototype as object)).toBeInstanceOf(api.JapanCalendarError);
    }
  });

  it('定数が期待する値・型で公開されている', () => {
    expect(api.MIN_SUPPORTED_YEAR).toBe(1949);
    expect(api.MAX_SUPPORTED_YEAR).toBe(2099);
    expect(api.WAREKI_SUPPORTED_FROM).toEqual({ year: 1873, month: 1, day: 1 });
    expect(Array.isArray(api.ERAS)).toBe(true);
    expect(api.ERAS.map((e) => e.name)).toEqual(['明治', '大正', '昭和', '平成', '令和']);
    expect(typeof api.OFFICIAL_META.sourceUrl).toBe('string');
  });
});
