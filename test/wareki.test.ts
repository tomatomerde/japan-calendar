import { describe, expect, it } from 'vitest';
import {
  InvalidDateInputError,
  InvalidWarekiDateError,
  MeijiReformError,
  UnsupportedWarekiRangeError,
} from '../src/errors.ts';
import { ERAS, formatWareki, fromWareki, toWareki } from '../src/wareki.ts';

/** 検証しやすいよう `元号年月日` の文字列にする。 */
function wareki(iso: string): string {
  return formatWareki(toWareki(iso));
}

describe('toWareki — 改元の境界', () => {
  it('昭和から平成（1989-01-07 / 01-08）', () => {
    expect(wareki('1989-01-07')).toBe('昭和64年1月7日');
    // 改元で変わるのは元号と年だけ。月日はそのまま引き継がれる。
    expect(wareki('1989-01-08')).toBe('平成元年1月8日');
  });

  it('平成から令和（2019-04-30 / 05-01）', () => {
    expect(wareki('2019-04-30')).toBe('平成31年4月30日');
    expect(wareki('2019-05-01')).toBe('令和元年5月1日');
  });

  it('明治から大正（1912-07-29 / 07-30）', () => {
    expect(wareki('1912-07-29')).toBe('明治45年7月29日');
    expect(wareki('1912-07-30')).toBe('大正元年7月30日');
  });

  it('大正から昭和（1926-12-24 / 12-25）', () => {
    expect(wareki('1926-12-24')).toBe('大正15年12月24日');
    expect(wareki('1926-12-25')).toBe('昭和元年12月25日');
  });

  it('元号の初日と最終日が漏れなく連続している', () => {
    for (let i = 0; i < ERAS.length - 1; i += 1) {
      const current = ERAS[i]!;
      const next = ERAS[i + 1]!;
      const last = toWareki(current.to!);
      const first = toWareki(next.from);
      expect(last.era).toBe(current.name);
      expect(first.era).toBe(next.name);
      expect(first.isGannen).toBe(true);
    }
  });
});

describe('toWareki — 元年と対応範囲', () => {
  it('対応開始日は明治6年1月1日', () => {
    expect(wareki('1873-01-01')).toBe('明治6年1月1日');
  });

  it('1872-12-31 以前は対応範囲外', () => {
    expect(() => toWareki('1872-12-31')).toThrow(UnsupportedWarekiRangeError);
    expect(() => toWareki('1868-01-25')).toThrow(UnsupportedWarekiRangeError);
  });

  it('元年フラグが立つのは改元年だけ', () => {
    expect(toWareki('2019-05-01').isGannen).toBe(true);
    expect(toWareki('2019-12-31').isGannen).toBe(true);
    expect(toWareki('2020-01-01').isGannen).toBe(false);
    expect(toWareki('2020-01-01').eraYear).toBe(2);
  });

  it('元号年が西暦から正しく求まる', () => {
    expect(toWareki('2026-08-04')).toMatchObject({ era: '令和', eraYear: 8, month: 8, day: 4 });
    expect(toWareki('1988-12-31')).toMatchObject({ era: '昭和', eraYear: 63 });
    expect(toWareki('2018-01-01')).toMatchObject({ era: '平成', eraYear: 30 });
  });
});

describe('formatWareki', () => {
  const reiwaGannen = toWareki('2019-05-01');
  const reiwa8 = toWareki('2026-08-04');

  it('元年を「元年」と書く', () => {
    expect(formatWareki(reiwaGannen, 'ja')).toBe('令和元年5月1日');
    expect(formatWareki(reiwaGannen, 'ja-numeric')).toBe('令和1年5月1日');
  });

  it('略号形式', () => {
    expect(formatWareki(reiwaGannen, 'abbr')).toBe('R1.5.1');
    expect(formatWareki(reiwaGannen, 'abbr-padded')).toBe('R01.05.01');
    expect(formatWareki(reiwa8, 'abbr-padded')).toBe('R08.08.04');
  });
});

describe('fromWareki', () => {
  it('境界日を西暦に戻せる', () => {
    expect(fromWareki('昭和', 64, 1, 7)).toEqual({ year: 1989, month: 1, day: 7 });
    expect(fromWareki('平成', 1, 1, 8)).toEqual({ year: 1989, month: 1, day: 8 });
    expect(fromWareki('平成', 31, 4, 30)).toEqual({ year: 2019, month: 4, day: 30 });
    expect(fromWareki('令和', 1, 5, 1)).toEqual({ year: 2019, month: 5, day: 1 });
    expect(fromWareki('明治', 6, 1, 1)).toEqual({ year: 1873, month: 1, day: 1 });
  });

  it('「元」を元年として受け付ける', () => {
    expect(fromWareki('令和', '元', 5, 1)).toEqual({ year: 2019, month: 5, day: 1 });
    expect(fromWareki('令和', 1, 5, 1)).toEqual(fromWareki('令和', '元', 5, 1));
  });

  it('ローマ字・略号でも指定できる', () => {
    const expected = { year: 2019, month: 5, day: 1 };
    expect(fromWareki('Reiwa', 1, 5, 1)).toEqual(expected);
    expect(fromWareki('reiwa', 1, 5, 1)).toEqual(expected);
    expect(fromWareki('R', 1, 5, 1)).toEqual(expected);
    expect(fromWareki('r', 1, 5, 1)).toEqual(expected);
  });

  it('元号の期間外を弾き、正しい和暦を示す', () => {
    expect(() => fromWareki('昭和', 64, 1, 8)).toThrow(InvalidWarekiDateError);
    expect(() => fromWareki('昭和', 64, 1, 8)).toThrow(/Heisei 1-1-8/);

    expect(() => fromWareki('平成', 31, 5, 1)).toThrow(/Reiwa 1-5-1/);
    expect(() => fromWareki('平成', 1, 1, 7)).toThrow(/Showa 64-1-7/);
    expect(() => fromWareki('大正', 15, 12, 25)).toThrow(/Showa 1-12-25/);
    expect(() => fromWareki('明治', 45, 7, 30)).toThrow(/Taisho 1-7-30/);
  });

  it('存在しない暦日を弾く', () => {
    expect(() => fromWareki('令和', 8, 2, 30)).toThrow(InvalidWarekiDateError);
    expect(() => fromWareki('令和', 8, 13, 1)).toThrow(InvalidWarekiDateError);
  });

  it('未知の元号・不正な年を弾く', () => {
    // @ts-expect-error 存在しない元号を渡している
    expect(() => fromWareki('大化', 1, 1, 1)).toThrow(InvalidDateInputError);
    expect(() => fromWareki('令和', 0, 5, 1)).toThrow(InvalidDateInputError);
    expect(() => fromWareki('令和', -1, 5, 1)).toThrow(InvalidDateInputError);
    expect(() => fromWareki('令和', 1.5, 5, 1)).toThrow(InvalidDateInputError);
  });
});

describe('fromWareki — 明治改暦', () => {
  it('明治5年12月3日〜31日は専用のエラーになる', () => {
    for (let day = 3; day <= 31; day += 1) {
      expect(() => fromWareki('明治', 5, 12, day)).toThrow(MeijiReformError);
    }
    expect(() => fromWareki('明治', 5, 12, 3)).toThrow(/calendar reform/);
  });

  it('明治5年12月2日以前は「対応範囲外」であって改暦エラーではない', () => {
    expect(() => fromWareki('明治', 5, 12, 2)).toThrow(UnsupportedWarekiRangeError);
    expect(() => fromWareki('明治', 5, 12, 2)).not.toThrow(MeijiReformError);
    expect(() => fromWareki('明治', 1, 1, 1)).toThrow(UnsupportedWarekiRangeError);
  });

  it('改暦の翌日は明治6年1月1日として扱える', () => {
    expect(fromWareki('明治', 6, 1, 1)).toEqual({ year: 1873, month: 1, day: 1 });
  });
});

describe('toWareki / fromWareki の往復', () => {
  it('対応範囲の全日で往復する（1873-01-01 〜 2100-12-31）', () => {
    const start = Date.UTC(1873, 0, 1);
    const end = Date.UTC(2100, 11, 31);
    for (let ms = start; ms <= end; ms += 86_400_000) {
      const civil = {
        year: new Date(ms).getUTCFullYear(),
        month: new Date(ms).getUTCMonth() + 1,
        day: new Date(ms).getUTCDate(),
      };
      const w = toWareki(civil);
      expect(fromWareki(w.era, w.eraYear, w.month, w.day)).toEqual(civil);
    }
  });
});
