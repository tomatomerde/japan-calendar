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

  it('オフセットのない日時文字列を弾く（ホストのローカルタイムゾーンに依存させないため）', () => {
    // Date.parse に素通しすると、この形式はホストのローカルタイムゾーンで
    // 解釈されてしまう。過去に実際に「東京では国民の休日、Kiritimatiでは
    // 敬老の日」という TZ 依存の不具合を起こした形式そのもの。
    expect(() => toCivilDate('2026-09-22T00:00:00')).toThrow(InvalidDateInputError);
    expect(() => toCivilDate('2026-09-22 00:00:00')).toThrow(InvalidDateInputError);
  });

  it('ゼロ埋めされていない・非ISO形式の日付文字列を弾く', () => {
    // CALENDAR_DATE は YYYY-MM-DD の厳密な形しか受理しない。ゆるい形式は
    // Date.parse に流れず、ここで明示的に拒否される。
    expect(() => toCivilDate('2026-9-22')).toThrow(InvalidDateInputError);
    expect(() => toCivilDate('2026/09/22')).toThrow(InvalidDateInputError);
    expect(() => toCivilDate('2026')).toThrow(InvalidDateInputError);
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

describe('toCivilDate — 文字列入力の掃引（TZ非依存性そのものの網羅チェック）', () => {
  // 個別の文字列を1件ずつ手で書くのではなく、日付×オフセットの直積を
  // 総当りする。期待値は実装(civil.ts の整数演算)を一切経由せず、
  // Date.UTC / getUTC* とオフセットの自前パースだけで独立に計算する
  // ---「文字列入力はTZ非依存であるべき」という性質そのものを検証する。
  function parseOffsetMinutes(offset: string): number {
    if (offset === 'Z') return 0;
    const m = /^([+-])(\d{2}):?(\d{2})$/.exec(offset);
    if (m === null) throw new Error(`unsupported offset in test fixture: ${offset}`);
    const sign = m[1] === '-' ? -1 : 1;
    return sign * (Number(m[2]) * 60 + Number(m[3]));
  }

  function expectedJstCivilDate(
    dateStr: string,
    timeStr: string,
    offset: string,
  ): { year: number; month: number; day: number } {
    const [y, mo, d] = dateStr.split('-').map(Number);
    const [h, mi, s] = timeStr.split(':').map(Number);
    const offsetMinutes = parseOffsetMinutes(offset);
    const utcMs = Date.UTC(y as number, (mo as number) - 1, d, h, mi, s) - offsetMinutes * 60_000;
    const jst = new Date(utcMs + 9 * 60 * 60_000);
    return { year: jst.getUTCFullYear(), month: jst.getUTCMonth() + 1, day: jst.getUTCDate() };
  }

  const dates = ['2019-05-01', '2026-09-22', '1873-01-01', '2099-12-31', '2020-02-29', '1989-01-08'];
  const offsets = ['Z', '+09:00', '-05:00', '+0900', '-0500', '+14:00', '-11:00', '+00:00'];

  it('日付×オフセットの直積で、独立計算(Date.UTCベース)と一致する', () => {
    for (const dateStr of dates) {
      for (const offset of offsets) {
        const input = `${dateStr}T00:00:00${offset}`;
        const expected = expectedJstCivilDate(dateStr, '00:00:00', offset);
        expect(toCivilDate(input), input).toEqual(expected);
      }
    }
  });

  it('オフセットの無い日時・ISO以外の形式は、どの日付についても一律に拒否される', () => {
    for (const dateStr of dates) {
      for (const input of [`${dateStr}T00:00:00`, `${dateStr} 00:00:00`, dateStr.replace(/-/g, '/')]) {
        expect(() => toCivilDate(input), input).toThrow(InvalidDateInputError);
      }
    }
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
