import { describe, expect, it } from 'vitest';
import {
  addDays,
  civilFromDays,
  compareCivil,
  daysFromCivil,
  daysInMonth,
  isLeapYear,
  isValidCivil,
  isWeekend,
  nthWeekdayOfMonth,
  toDays,
  toIsoDate,
  weekdayOf,
  type CivilDate,
} from '../src/civil.ts';

describe('daysFromCivil / civilFromDays', () => {
  it('エポックの基準日が 0 になる', () => {
    expect(daysFromCivil(1970, 1, 1)).toBe(0);
  });

  it('既知の通日と一致する', () => {
    expect(daysFromCivil(1969, 12, 31)).toBe(-1);
    expect(daysFromCivil(1970, 1, 2)).toBe(1);
    expect(daysFromCivil(2000, 3, 1)).toBe(11017);
    // 1873-01-01 〜 1970-01-01 は 97年 = 97*365 + うるう日23（1900年は非うるう）。
    expect(daysFromCivil(1873, 1, 1)).toBe(-(97 * 365 + 23));
  });

  it('往復して同じ暦日に戻る（1868〜2100年の全日）', () => {
    const start = daysFromCivil(1868, 1, 1);
    const end = daysFromCivil(2100, 12, 31);
    for (let days = start; days <= end; days += 1) {
      const civil = civilFromDays(days);
      expect(toDays(civil)).toBe(days);
    }
  });

  it('うるう日を正しく扱う', () => {
    expect(civilFromDays(daysFromCivil(2000, 2, 28) + 1)).toEqual({ year: 2000, month: 2, day: 29 });
    expect(civilFromDays(daysFromCivil(1900, 2, 28) + 1)).toEqual({ year: 1900, month: 3, day: 1 });
  });
});

describe('isLeapYear / daysInMonth / isValidCivil', () => {
  it('400年規則を守る', () => {
    expect(isLeapYear(2000)).toBe(true);
    expect(isLeapYear(1900)).toBe(false);
    expect(isLeapYear(2024)).toBe(true);
    expect(isLeapYear(2026)).toBe(false);
  });

  it('2月の日数がうるう年で変わる', () => {
    expect(daysInMonth(2024, 2)).toBe(29);
    expect(daysInMonth(2026, 2)).toBe(28);
  });

  it('存在しない日付を弾く', () => {
    expect(isValidCivil(2026, 2, 30)).toBe(false);
    expect(isValidCivil(2026, 13, 1)).toBe(false);
    expect(isValidCivil(2026, 0, 1)).toBe(false);
    expect(isValidCivil(2026, 4, 31)).toBe(false);
    expect(isValidCivil(2026, 1, 1.5)).toBe(false);
    expect(isValidCivil(2024, 2, 29)).toBe(true);
  });
});

describe('weekdayOf', () => {
  it('既知の曜日と一致する（0=日曜）', () => {
    expect(weekdayOf({ year: 1970, month: 1, day: 1 })).toBe(4); // 木
    expect(weekdayOf({ year: 2026, month: 1, day: 1 })).toBe(4); // 木
    expect(weekdayOf({ year: 2026, month: 5, day: 3 })).toBe(0); // 日
    expect(weekdayOf({ year: 2026, month: 9, day: 21 })).toBe(1); // 月
    expect(weekdayOf({ year: 2019, month: 5, day: 1 })).toBe(3); // 水
    expect(weekdayOf({ year: 1989, month: 1, day: 7 })).toBe(6); // 土
  });

  it('1970年より前（負の通日）でも 0〜6 に収まる', () => {
    for (let days = -40000; days < -39900; days += 1) {
      const weekday = weekdayOf(civilFromDays(days));
      expect(weekday).toBeGreaterThanOrEqual(0);
      expect(weekday).toBeLessThanOrEqual(6);
    }
    expect(weekdayOf({ year: 1873, month: 1, day: 1 })).toBe(3); // 水
  });

  it('土日を判定する', () => {
    expect(isWeekend({ year: 2026, month: 5, day: 2 })).toBe(true); // 土
    expect(isWeekend({ year: 2026, month: 5, day: 3 })).toBe(true); // 日
    expect(isWeekend({ year: 2026, month: 5, day: 4 })).toBe(false); // 月
  });
});

describe('nthWeekdayOfMonth', () => {
  it('ハッピーマンデーの日付を出せる', () => {
    // 2026-09-01 は火曜。月曜は 7, 14, 21 なので第3月曜は 9/21。
    expect(nthWeekdayOfMonth(2026, 9, 1, 3)).toEqual({ year: 2026, month: 9, day: 21 });
    // 2026-01-01 は木曜。月曜は 5, 12 なので第2月曜は 1/12。
    expect(nthWeekdayOfMonth(2026, 1, 1, 2)).toEqual({ year: 2026, month: 1, day: 12 });
    // 月初がちょうどその曜日のとき第1週は月初そのもの。
    expect(nthWeekdayOfMonth(2026, 6, 1, 1)).toEqual({ year: 2026, month: 6, day: 1 });
  });
});

describe('addDays / compareCivil / toIsoDate', () => {
  it('月と年をまたいで加算できる', () => {
    expect(addDays({ year: 2026, month: 12, day: 31 }, 1)).toEqual({ year: 2027, month: 1, day: 1 });
    expect(addDays({ year: 2024, month: 2, day: 28 }, 1)).toEqual({ year: 2024, month: 2, day: 29 });
    expect(addDays({ year: 2026, month: 1, day: 1 }, -1)).toEqual({ year: 2025, month: 12, day: 31 });
  });

  it('比較の符号が正しい', () => {
    const a: CivilDate = { year: 2026, month: 5, day: 3 };
    expect(compareCivil(a, { year: 2026, month: 5, day: 4 })).toBeLessThan(0);
    expect(compareCivil(a, { year: 2026, month: 4, day: 4 })).toBeGreaterThan(0);
    expect(compareCivil(a, { year: 2025, month: 12, day: 31 })).toBeGreaterThan(0);
    expect(compareCivil(a, a)).toBe(0);
  });

  it('ゼロ埋めして ISO 形式にする', () => {
    expect(toIsoDate({ year: 2026, month: 9, day: 5 })).toBe('2026-09-05');
    expect(toIsoDate({ year: 873, month: 12, day: 31 })).toBe('0873-12-31');
  });
});
