import { describe, expect, it } from 'vitest';
import { InvalidDateInputError } from '../src/errors.ts';
import { civilFromInstant, toCivilDate } from '../src/input.ts';

describe('toCivilDate — 暦日入力', () => {
  it('YYYY-MM-DD をそのまま暦日として読む', () => {
    expect(toCivilDate('2019-05-01')).toEqual({ year: 2019, month: 5, day: 1 });
    expect(toCivilDate('1873-01-01')).toEqual({ year: 1873, month: 1, day: 1 });
  });

  it('オブジェクトをそのまま受け取る', () => {
    expect(toCivilDate({ year: 2026, month: 9, day: 22 })).toEqual({
      year: 2026,
      month: 9,
      day: 22,
    });
  });

  it('存在しない日付を弾く', () => {
    expect(() => toCivilDate('2026-02-30')).toThrow(InvalidDateInputError);
    expect(() => toCivilDate('2026-13-01')).toThrow(InvalidDateInputError);
    expect(() => toCivilDate({ year: 2026, month: 2, day: 30 })).toThrow(InvalidDateInputError);
  });

  it('解釈できない入力を弾く', () => {
    expect(() => toCivilDate('きのう')).toThrow(InvalidDateInputError);
    expect(() => toCivilDate(new Date('invalid'))).toThrow(InvalidDateInputError);
    // @ts-expect-error 想定外の型
    expect(() => toCivilDate(null)).toThrow(InvalidDateInputError);
    // @ts-expect-error 想定外の型
    expect(() => toCivilDate(20260922)).toThrow(InvalidDateInputError);
  });
});

describe('toCivilDate — 瞬間は JST で日付に落とす', () => {
  it('JST の日付境界をまたぐ瞬間を正しく振り分ける', () => {
    // 2019-04-30T15:00:00Z = 2019-05-01T00:00:00+09:00（令和最初の瞬間）
    expect(toCivilDate(new Date('2019-04-30T14:59:59Z'))).toEqual({
      year: 2019,
      month: 4,
      day: 30,
    });
    expect(toCivilDate(new Date('2019-04-30T15:00:00Z'))).toEqual({
      year: 2019,
      month: 5,
      day: 1,
    });
  });

  it('UTC で日付が変わっても JST の日付は変わらない', () => {
    // UTC では 5/1 だが JST ではまだ 5/1 の午前中。
    expect(toCivilDate(new Date('2019-05-01T00:00:00Z'))).toEqual({
      year: 2019,
      month: 5,
      day: 1,
    });
    // UTC では 4/30 の夕方だが JST ではすでに 5/1。
    expect(toCivilDate(new Date('2019-04-30T23:00:00Z'))).toEqual({
      year: 2019,
      month: 5,
      day: 1,
    });
  });

  it('オフセット付き文字列も瞬間として扱う', () => {
    expect(toCivilDate('2019-05-01T00:00:00+09:00')).toEqual({ year: 2019, month: 5, day: 1 });
    expect(toCivilDate('2019-04-30T23:59:59-05:00')).toEqual({ year: 2019, month: 5, day: 1 });
  });

  it('1970年より前（負のエポック）でも前日側に正しく丸まる', () => {
    // 1873-01-01T00:00:00+09:00 = 1872-12-31T15:00:00Z
    expect(civilFromInstant(Date.UTC(1872, 11, 31, 15, 0, 0))).toEqual({
      year: 1873,
      month: 1,
      day: 1,
    });
    expect(civilFromInstant(Date.UTC(1872, 11, 31, 14, 59, 59))).toEqual({
      year: 1872,
      month: 12,
      day: 31,
    });
  });

  it('有限でない値を弾く', () => {
    expect(() => civilFromInstant(Number.NaN)).toThrow(InvalidDateInputError);
    expect(() => civilFromInstant(Number.POSITIVE_INFINITY)).toThrow(InvalidDateInputError);
  });
});

describe('プロセスのタイムゾーンに依存しない', () => {
  it('TZ 環境変数が何であっても同じ結果になる', () => {
    // このテストは CI で TZ=UTC / Asia/Tokyo / Pacific/Kiritimati / Pacific/Midway
    // の4環境で実行される。ここでは「実装が local time API を使っていない」ことの
    // 回帰防止として、境界付近の瞬間を固定値と突き合わせる。
    const cases: ReadonlyArray<readonly [string, { year: number; month: number; day: number }]> = [
      ['2019-04-30T14:59:59.999Z', { year: 2019, month: 4, day: 30 }],
      ['2019-04-30T15:00:00.000Z', { year: 2019, month: 5, day: 1 }],
      ['1989-01-07T14:59:59.999Z', { year: 1989, month: 1, day: 7 }],
      ['1989-01-07T15:00:00.000Z', { year: 1989, month: 1, day: 8 }],
      ['2026-09-21T15:00:00.000Z', { year: 2026, month: 9, day: 22 }],
    ];
    for (const [instant, expected] of cases) {
      expect(toCivilDate(new Date(instant))).toEqual(expected);
      expect(toCivilDate(instant)).toEqual(expected);
    }
  });
});
