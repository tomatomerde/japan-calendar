/**
 * The comparison both READMEs open with, measured rather than asserted.
 *
 * The claim a reader meets first — "the other holiday libraries answer 'is
 * this a holiday?' and stop there" — used to be an unsourced superlative
 * ("it's the only one that flags the equinox"). It is now a table naming five
 * packages, and this file is where those sentences come from.
 *
 * Every comparison target is a devDependency pinned to an exact version, so
 * the comparison is deterministic: both sides are fixed code and fixed data,
 * no network and no clock. When a pin is raised by hand, whatever this file
 * reports is what the READMEs must say — that is the point of measuring it
 * here instead of quoting a survey nobody can re-run.
 *
 * Note that Dependabot is configured not to touch these (see
 * .github/dependabot.yml): a comparison target moving on its own would turn
 * this suite red for a reason that is not a defect in this package.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

import * as japaneseHolidays from 'japanese-holidays';
import holidayJp from '@holiday-jp/holiday_jp';
import Holidays from 'date-holidays';
import * as gahojin from '@gahojin-inc/holiday-japanese';
import { dateToWareki } from '@smarthr/wareki';

import {
  isHoliday,
  addBusinessDays,
  toWareki,
  holidaysForYear,
  OFFICIAL_META,
  MAX_SUPPORTED_YEAR,
} from '../src/index.ts';
import { OutOfRangeError, UnsupportedWarekiRangeError } from '../src/errors.ts';

const require = createRequire(import.meta.url);
const version = (name: string): string =>
  (require(`${name}/package.json`) as { version: string }).version;

const README_EN = readFileSync(new URL('../README.md', import.meta.url), 'utf8');
const README_JA = readFileSync(new URL('../README.ja.md', import.meta.url), 'utf8');

/**
 * A calendar date, built so the answer does not depend on the runner's
 * timezone. `new Date(y, m - 1, d)` is local midnight, and every library
 * below reads it back with local getters, so the fields survive; an ISO
 * string or a `+09:00` literal would not (the suite runs under Asia/Tokyo,
 * UTC, Pacific/Kiritimati and Pacific/Midway — see `npm run test:tz`).
 */
const localDate = (year: number, month: number, day: number): Date =>
  new Date(year, month - 1, day);

/** 2050 is far past the last year the Official Gazette has fixed. */
const EQUINOX_2050 = [
  { iso: '2050-03-20', date: localDate(2050, 3, 20), name: '春分の日' },
  { iso: '2050-09-23', date: localDate(2050, 9, 23), name: '秋分の日' },
] as const;

describe('この package が公開する、他が公開しないもの', () => {
  // Asserted one package at a time on purpose. "None of the four has it" is a
  // bundled claim, and a loop that only counts would stay green if one gained
  // the feature and another lost an unrelated export.
  const SURFACES: ReadonlyArray<readonly [string, string, readonly string[]]> = [
    ['japanese-holidays', version('japanese-holidays'), Object.keys(japaneseHolidays)],
    ['@holiday-jp/holiday_jp', version('@holiday-jp/holiday_jp'), Object.keys(holidayJp)],
    ['@gahojin-inc/holiday-japanese', version('@gahojin-inc/holiday-japanese'), Object.keys(gahojin)],
    // date-holidays exports one class; the surface that matters is its methods.
    [
      'date-holidays',
      version('date-holidays'),
      Object.getOwnPropertyNames(Object.getPrototypeOf(new Holidays('JP')) as object),
    ],
  ];

  for (const [name, pinned, surface] of SURFACES) {
    it(`${name} ${pinned} は営業日計算を公開していない`, () => {
      const businessDay = surface.filter((key) => /business|workday|working/i.test(key));
      expect(businessDay, `${name} の公開 API: ${surface.join(', ')}`).toEqual([]);
      // Named in both READMEs, so a package dropping out of the comparison
      // cannot leave a stale row behind.
      expect(README_EN).toContain(name);
      expect(README_JA).toContain(name);
    });
  }

  it('この package は営業日計算を持つ', () => {
    // GW を挟むので、単純な +3 日にはならない組み合わせ。
    expect(addBusinessDays('2026-05-01', 3)).toEqual({ year: 2026, month: 5, day: 11 });
  });
});

describe('春分・秋分が「確定した日付」なのか「計算した予測」なのか', () => {
  it(`公式データが確定させているのは ${OFFICIAL_META.equinoxConfirmedThrough} 年まで`, () => {
    // 2050 の比較が「まだ確定していない年」であることの前提。
    expect(OFFICIAL_META.equinoxConfirmedThrough).toBeLessThan(2050);
    expect(README_EN).toContain(String(OFFICIAL_META.equinoxConfirmedThrough));
    expect(README_JA).toContain(String(OFFICIAL_META.equinoxConfirmedThrough));
  });

  for (const { iso, date, name } of EQUINOX_2050) {
    it(`${iso}: この package は ${name} を confirmed: false で返す`, () => {
      expect(isHoliday(iso)).toMatchObject({ name, confirmed: false });
    });

    it(`${iso}: japanese-holidays は ${name} を返すが、確定かどうかは言わない`, () => {
      // 返り値が名前の文字列そのものなので、フラグを載せる場所が無い。
      expect(japaneseHolidays.isHoliday(date)).toBe(name);
    });

    it(`${iso}: @holiday-jp/holiday_jp は ${name} を返すが、確定かどうかは言わない`, () => {
      const found = holidayJp.between(date, date);
      expect(found.map((h) => h.name)).toEqual([name]);
      expect(Object.keys(found[0] ?? {}).filter(isConfidenceKey)).toEqual([]);
    });

    it(`${iso}: date-holidays は ${name} を返すが、確定かどうかは言わない`, () => {
      // 文字列で渡す: この library は自前でタイムゾーンを持っていて、
      // Date を渡すと runner の TZ 次第で前日の答えが返る。
      const found = new Holidays('JP').isHoliday(iso);
      expect(found).not.toBe(false);
      const entries = found as { name: string }[];
      expect(entries.map((h) => h.name)).toContain(name);
      expect(Object.keys(entries[0] ?? {}).filter(isConfidenceKey)).toEqual([]);
    });

    it(`${iso}: @gahojin-inc/holiday-japanese は真偽値しか返さない`, () => {
      expect(gahojin.isHoliday(date)).toBe(true);
      const [entry] = gahojin.between(date, date);
      expect(entry?.nameJa).toBe(name);
      expect(Object.keys(entry ?? {}).filter(isConfidenceKey)).toEqual([]);
    });
  }
});

describe('サポート範囲の終わり方', () => {
  // 2051年は4本のうち2本がデータを持たない年。持たないこと自体は問題ではなく、
  // **持たないことを言わずに false / [] を返す**のが問題。呼び出し側からは
  // 「祝日ではない」と区別が付かない。
  const NEW_YEARS_DAY_2051 = localDate(2051, 1, 1);

  it('@holiday-jp/holiday_jp は 2051年の元日を、祝日ではないものとして返す', () => {
    expect(holidayJp.between(localDate(2050, 1, 1), localDate(2050, 1, 1))).toHaveLength(1);
    expect(holidayJp.between(NEW_YEARS_DAY_2051, NEW_YEARS_DAY_2051)).toEqual([]);
  });

  it('@gahojin-inc/holiday-japanese は 2051年の元日を false で返す', () => {
    expect(gahojin.isHoliday(localDate(2050, 1, 1))).toBe(true);
    expect(gahojin.isHoliday(NEW_YEARS_DAY_2051)).toBe(false);
  });

  it('この package は範囲外を投げる（黙って「祝日ではない」と言わない）', () => {
    expect(MAX_SUPPORTED_YEAR).toBe(2099);
    expect(isHoliday('2099-01-01')).toMatchObject({ name: '元日' });
    expect(() => isHoliday('2100-01-01')).toThrow(OutOfRangeError);
  });

  // japanese-holidays と date-holidays は 2099年まで答える。答えが割れるかどうかは
  // 別の問題なので、そこは分けて測る。
  it('範囲を持っている2本とは、2028-2099年の春分・秋分 144件すべてで日付が一致する', () => {
    const dateHolidays = new Holidays('JP');
    const equinoxes: { iso: string; date: Date; name: string }[] = [];
    for (let year = MIN_EQUINOX_YEAR; year <= MAX_SUPPORTED_YEAR; year += 1) {
      for (const holiday of holidaysForYear(year)) {
        if (!/分の日/.test(holiday.name)) continue;
        const { month, day } = holiday.date;
        equinoxes.push({
          iso: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
          date: localDate(year, month, day),
          name: holiday.name,
        });
      }
    }
    expect(equinoxes).toHaveLength(144);

    const differs = equinoxes.filter(
      ({ iso, date, name }) =>
        japaneseHolidays.isHoliday(date) !== name ||
        !((dateHolidays.isHoliday(iso) || []) as { name: string }[]).some((h) => h.name === name),
    );
    // 「予測値だと言わない」が問題であって、「違う日を答える」ではない。
    // README がその区別を書いているので、区別が本当に成り立つかを固定する。
    expect(differs.map((d) => d.iso)).toEqual([]);
  });
});

/** The first year past what the Official Gazette has fixed. */
const MIN_EQUINOX_YEAR = 2028;

/** Anything a caller could read as "this date is not settled yet". */
function isConfidenceKey(key: string): boolean {
  return /confirm|tentative|provisional|forecast|estimate|official/i.test(key);
}

describe('和暦: 存在しない日付を返すかどうか', () => {
  // 明治5年12月2日の翌日が明治6年1月1日（改暦ノ布告）。明治5年12月は2日で
  // 終わっていて、12月31日は存在しない。
  const NONEXISTENT = localDate(1872, 12, 31);

  it(`@smarthr/wareki ${version('@smarthr/wareki')} は 明治5年12月31日 を isValid: true で返す`, () => {
    expect(dateToWareki(NONEXISTENT)).toMatchObject({ isValid: true, result: '明治5年12月31日' });
    expect(README_EN).toContain('明治5年12月31日');
    expect(README_JA).toContain('明治5年12月31日');
  });

  it('この package は改暦前を変換せず、拒否する', () => {
    expect(() => toWareki('1872-12-31')).toThrow(UnsupportedWarekiRangeError);
    // 改暦後の最初の日は通る。「範囲外だから全部拒否」ではないことの裏取り。
    expect(toWareki('1873-01-01')).toMatchObject({ era: '明治', eraYear: 6, month: 1, day: 1 });
  });
});
