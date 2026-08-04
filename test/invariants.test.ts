/**
 * Exhaustive invariant checks across the full supported year range
 * (1949-2099). These are cheap to run and catch the class of bug found
 * during review: a holiday-rule interaction producing a duplicate date
 * that only manifests in specific years (e.g. when a fixed-date holiday
 * happens to fall on a Sunday), which point-in-time test cases can easily
 * miss.
 */

import { describe, expect, it } from 'vitest';
import { toIsoDate, weekdayOf, SUNDAY } from '../src/civil.ts';
import { isBusinessDay } from '../src/businessDays.ts';
import {
  holidaysForYear,
  isHoliday,
  statutoryHolidaysForYear,
  MAX_SUPPORTED_YEAR,
  MIN_SUPPORTED_YEAR,
} from '../src/holidays.ts';
import { OFFICIAL_HOLIDAYS, OFFICIAL_META } from '../src/data/official.ts';
import { computeBridgeHolidays, computeSubstituteHolidays } from '../src/rules/observed.ts';
import type { Holiday } from '../src/types.ts';

describe('invariants across the full supported range', () => {
  it('never produces two holidays on the same date within a year', () => {
    const duplicates: string[] = [];
    for (let year = MIN_SUPPORTED_YEAR; year <= MAX_SUPPORTED_YEAR; year += 1) {
      const seen = new Map<string, string>();
      for (const holiday of holidaysForYear(year)) {
        const iso = toIsoDate(holiday.date);
        const label = `${holiday.name}(${holiday.category})`;
        const existing = seen.get(iso);
        if (existing !== undefined) {
          duplicates.push(`${iso}: ${existing} + ${label}`);
        }
        seen.set(iso, label);
      }
    }
    expect(duplicates).toEqual([]);
  });

  it('never places a substitute holiday or a national holiday on a Sunday', () => {
    const violations: string[] = [];
    for (let year = MIN_SUPPORTED_YEAR; year <= MAX_SUPPORTED_YEAR; year += 1) {
      for (const holiday of holidaysForYear(year)) {
        if (
          (holiday.category === 'substitute' || holiday.category === 'bridge') &&
          weekdayOf(holiday.date) === SUNDAY
        ) {
          violations.push(`${toIsoDate(holiday.date)} ${holiday.name} (${holiday.category})`);
        }
      }
    }
    expect(violations).toEqual([]);
  });

  it('every holiday is a non-business day, on both calendars', () => {
    const violations: string[] = [];
    for (let year = MIN_SUPPORTED_YEAR; year <= MAX_SUPPORTED_YEAR; year += 1) {
      for (const holiday of holidaysForYear(year)) {
        if (isBusinessDay(holiday.date, 'national') || isBusinessDay(holiday.date, 'bank')) {
          violations.push(`${toIsoDate(holiday.date)} ${holiday.name}`);
        }
      }
    }
    expect(violations).toEqual([]);
  });
});

describe('公開する値は凍結されている（共有キャッシュを利用者が壊せない）', () => {
  // 年ごとの結果はメモ化され、同じ配列インスタンスが全呼び出し元に
  // 渡る。凍結していないと `holidaysForYear(y).sort(...)` や
  // `.length = 0` といったごく普通の操作でプロセス全体のキャッシュが
  // 壊れ、以降の isHoliday / isBusinessDay が壊れたデータを返す。
  // Workers では isolate を共有するリクエスト間に波及する。
  // `readonly Holiday[]` はコンパイル時にしか効かず、JS利用者には無力。
  it('holidaysForYear の返り値は配列も要素も凍結されている', () => {
    const holidays = holidaysForYear(2026);
    expect(Object.isFrozen(holidays)).toBe(true);
    for (const holiday of holidays) {
      expect(Object.isFrozen(holiday)).toBe(true);
      expect(Object.isFrozen(holiday.date)).toBe(true);
    }
  });

  it('statutoryHolidaysForYear の返り値も凍結されている', () => {
    const holidays = statutoryHolidaysForYear(2026);
    expect(Object.isFrozen(holidays)).toBe(true);
    expect(Object.isFrozen(holidays[0])).toBe(true);
  });

  it('破壊的な操作はすべて TypeError になる', () => {
    expect(() => {
      (holidaysForYear(2026) as Holiday[]).push({} as Holiday);
    }).toThrow(TypeError);
    expect(() => {
      (holidaysForYear(2026) as Holiday[]).length = 0;
    }).toThrow(TypeError);
    expect(() => {
      (holidaysForYear(2026) as Holiday[]).sort();
    }).toThrow(TypeError);
    expect(() => {
      (isHoliday('2026-01-01') as { name: string }).name = 'ニセ祝日';
    }).toThrow(TypeError);
    expect(() => {
      (isHoliday('2026-01-01') as unknown as { date: { day: number } }).date.day = 9;
    }).toThrow(TypeError);
  });

  it('破壊を試みたあともデータは健全なまま', () => {
    try {
      (holidaysForYear(2026) as Holiday[]).length = 0;
    } catch {
      /* 凍結されているので落ちるのが正しい */
    }
    expect(holidaysForYear(2026).length).toBeGreaterThan(0);
    expect(isHoliday('2026-01-01')?.name).toBe('元日');
    expect(isBusinessDay('2026-01-01')).toBe(false);
  });

  it('生成データ（OFFICIAL_HOLIDAYS / OFFICIAL_META）も凍結されている', () => {
    expect(Object.isFrozen(OFFICIAL_HOLIDAYS)).toBe(true);
    expect(Object.isFrozen(OFFICIAL_META)).toBe(true);
  });
});

describe('年をまたぐ導出は現時点で発生しない（防御的コードの必要性を監視する）', () => {
  // holidaysForYear は振替休日・国民の休日を導出する際、前後年の法定祝日も
  // 材料に入れている。「年境界をまたぐ連鎖は実際には起きないが、単年に
  // 閉じていると仮定しないため」という防御的な作りで、その前後年ぶんを
  // 取り除いても現状はどのテストも落ちない = 通常の方法では守れない。
  //
  // そこで「防御が現時点では不要である」こと自体を固定する。将来の法改正や
  // ルール変更で年をまたぐ導出が発生するようになると、このテストが落ちて
  // 「あの防御コードがいま効き始めた」と気づける。
  it('当年の法定祝日だけから導出しても、前後年を含めた結果と一致する', () => {
    const mismatches: string[] = [];
    for (let year = MIN_SUPPORTED_YEAR; year <= MAX_SUPPORTED_YEAR; year += 1) {
      const singleYear = statutoryHolidaysForYear(year).map((h) => ({
        date: h.date,
        confirmed: h.confirmed,
      }));
      const substitutes = computeSubstituteHolidays(singleYear);
      const derivedFromSingleYear = [...substitutes, ...computeBridgeHolidays(singleYear, substitutes)]
        .filter((h) => h.date.year === year)
        .map((h) => `${toIsoDate(h.date)} ${h.name} ${h.category} ${h.confirmed}`)
        .sort();

      const derivedFromFullEngine = holidaysForYear(year)
        .filter((h) => h.category !== 'statutory')
        .map((h) => `${toIsoDate(h.date)} ${h.name} ${h.category} ${h.confirmed}`)
        .sort();

      if (JSON.stringify(derivedFromSingleYear) !== JSON.stringify(derivedFromFullEngine)) {
        mismatches.push(
          `${year}: 単年=${JSON.stringify(derivedFromSingleYear)} 前後年込み=${JSON.stringify(derivedFromFullEngine)}`,
        );
      }
    }
    expect(mismatches).toEqual([]);
  });
});
