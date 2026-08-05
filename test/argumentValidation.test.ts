/**
 * 日付以外の引数の検証。
 *
 * ここにある入力は、修正前はすべて「例外ではなく、それらしい間違った答え」を
 * 返していた。TypeScript を使わない利用者、あるいは JSON やフォーム値のように
 * 型が `string` のまま渡ってくる経路では、型定義は何の防御にもならない。
 */

import { describe, expect, it } from 'vitest';
import {
  InvalidArgumentError,
  JapanCalendarError,
  addBusinessDays,
  businessDaysBetween,
  formatWareki,
  holidaysForYear,
  isBusinessDay,
  statutoryHolidaysForYear,
  toWareki,
} from '../src/index.ts';

describe('CalendarKind の検証', () => {
  // 修正前: isBusinessDay('2026-12-31', 'Bank') は true を返していた。
  // 正しい 'bank' では false。大文字小文字を間違えただけで、
  // 例外ではなく national カレンダーの答えが静かに返っていた。
  const typos = ['Bank', 'BANK', 'banks', 'National', '', ' bank', 'bank ', null, undefined, 0, {}];

  for (const bad of typos) {
    it(`isBusinessDay は calendar=${JSON.stringify(bad)} を拒否する`, () => {
      // undefined は既定値 'national' として正当なので、明示的に除く。
      if (bad === undefined) return;
      expect(() => isBusinessDay('2026-12-31', bad as never)).toThrow(InvalidArgumentError);
    });
  }

  it('大文字違いが national の答えに落ちない（修正前の実害そのもの）', () => {
    expect(isBusinessDay('2026-12-31', 'bank')).toBe(false);
    expect(isBusinessDay('2026-12-31', 'national')).toBe(true);
    expect(() => isBusinessDay('2026-12-31', 'Bank' as never)).toThrow(InvalidArgumentError);
  });

  it('addBusinessDays と businessDaysBetween も同じく拒否する', () => {
    expect(() => addBusinessDays('2026-08-03', 1, 'Bank' as never)).toThrow(InvalidArgumentError);
    expect(() => businessDaysBetween('2026-08-03', '2026-08-08', 'BANK' as never)).toThrow(InvalidArgumentError);
  });

  it('正当な値は通る', () => {
    expect(() => isBusinessDay('2026-08-03', 'national')).not.toThrow();
    expect(() => isBusinessDay('2026-08-03', 'bank')).not.toThrow();
    expect(() => isBusinessDay('2026-08-03')).not.toThrow();
  });

  it('メッセージに受け取った値が出る', () => {
    expect(() => isBusinessDay('2026-12-31', 'Bank' as never)).toThrow(/"Bank"/);
  });
});

describe('addBusinessDays の days 引数の検証', () => {
  // 修正前: NaN と undefined は 0 と同じ挙動（入力日をそのまま返す）、
  // 1.5 は2営業日進み、'3' は偶然動いていた。
  const bad: [string, unknown][] = [
    ['NaN', NaN],
    ['undefined', undefined],
    ['null', null],
    ['1.5', 1.5],
    ['-1.5', -1.5],
    ['Infinity', Infinity],
    ['-Infinity', -Infinity],
    ['文字列の "3"', '3'],
    ['安全整数を超える値', Number.MAX_SAFE_INTEGER + 2],
  ];

  for (const [label, value] of bad) {
    it(`days=${label} を拒否する`, () => {
      expect(() => addBusinessDays('2026-08-03', value as never)).toThrow(InvalidArgumentError);
    });
  }

  it('NaN が「変化なし」として通らない（修正前の実害そのもの）', () => {
    // 修正前は 2026-08-03 がそのまま返り、呼び出し側は成功したと信じてしまった。
    expect(() => addBusinessDays('2026-08-03', NaN)).toThrow(InvalidArgumentError);
  });

  it('正当な整数は通る', () => {
    expect(addBusinessDays('2026-08-03', 0)).toEqual({ year: 2026, month: 8, day: 3 });
    expect(addBusinessDays('2026-08-03', 1)).toEqual({ year: 2026, month: 8, day: 4 });
    expect(addBusinessDays('2026-08-04', -1)).toEqual({ year: 2026, month: 8, day: 3 });
    expect(() => addBusinessDays('2026-08-03', -0)).not.toThrow();
  });
});

describe('年の検証', () => {
  // 修正前: NaN との比較はすべて false なので範囲チェックを素通りし、
  // holidaysForYear(NaN) が「17件の祝日」を計算して NaN をキーに記憶していた。
  const bad: [string, unknown][] = [
    ['NaN', NaN],
    ['undefined', undefined],
    ['null', null],
    ['2026.5', 2026.5],
    ['文字列の "2026"', '2026'],
    ['Infinity', Infinity],
  ];

  for (const [label, value] of bad) {
    it(`holidaysForYear(${label}) を拒否する`, () => {
      expect(() => holidaysForYear(value as never)).toThrow(JapanCalendarError);
    });
    it(`statutoryHolidaysForYear(${label}) を拒否する`, () => {
      expect(() => statutoryHolidaysForYear(value as never)).toThrow(JapanCalendarError);
    });
  }

  it('NaN は InvalidArgumentError（範囲外ではなく型の誤り）', () => {
    expect(() => holidaysForYear(NaN)).toThrow(InvalidArgumentError);
  });

  it('正当な年は通る', () => {
    expect(holidaysForYear(2026).length).toBeGreaterThan(0);
  });
});

describe('formatWareki の引数の検証', () => {
  const wareki = toWareki('2019-05-01');

  it('未知の format は undefined を返さず例外になる', () => {
    // 修正前: switch が default を持たず、返り値の型が string なのに
    // undefined が返り、UI に文字列 "undefined" が出ていた。
    expect(() => formatWareki(wareki, 'nonsense' as never)).toThrow(InvalidArgumentError);
    expect(() => formatWareki(wareki, 'JA' as never)).toThrow(InvalidArgumentError);
  });

  it('手組みの Wareki もどきは "令和undefined年" を返さず例外になる', () => {
    const handBuilt = { era: '令和', year: 1, month: 5, day: 1 };
    expect(() => formatWareki(handBuilt as never)).toThrow(InvalidArgumentError);
    expect(() => formatWareki(handBuilt as never)).toThrow(/eraYear/);
  });

  it('null / 非オブジェクトを拒否する', () => {
    expect(() => formatWareki(null as never)).toThrow(InvalidArgumentError);
    expect(() => formatWareki('令和元年' as never)).toThrow(InvalidArgumentError);
  });

  it('abbr 系は eraAbbr の欠落を検出する', () => {
    const { eraAbbr: _dropped, ...withoutAbbr } = wareki;
    expect(() => formatWareki(withoutAbbr as never, 'abbr')).toThrow(/eraAbbr/);
    // 'ja' は eraAbbr を使わないので通る。
    expect(() => formatWareki(withoutAbbr as never, 'ja')).not.toThrow();
  });

  it('正当な組み合わせは全形式で通る', () => {
    expect(formatWareki(wareki, 'ja')).toBe('令和元年5月1日');
    expect(formatWareki(wareki, 'ja-numeric')).toBe('令和1年5月1日');
    expect(formatWareki(wareki, 'abbr')).toBe('R1.5.1');
    expect(formatWareki(wareki, 'abbr-padded')).toBe('R01.05.01');
  });
});

describe('新しい例外は既存の階層に収まる', () => {
  it('InvalidArgumentError は JapanCalendarError で捕まえられる', () => {
    expect(() => isBusinessDay('2026-08-03', 'Bank' as never)).toThrow(JapanCalendarError);
  });

  it('name は文字列リテラル（ミニファイ後も壊れない）', () => {
    expect(new InvalidArgumentError('x').name).toBe('InvalidArgumentError');
  });
});

describe('エラーメッセージが受け取った値を示す', () => {
  it('近いが違う形のオブジェクトで [object Object] を出さない', () => {
    // 修正前は "Value cannot be interpreted as a date: [object Object]" で、
    // どのキーが違うのか利用者には手がかりがなかった。
    let message = '';
    try {
      isBusinessDay({ y: 2026, m: 9, d: 22 } as never);
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).not.toContain('[object Object]');
    expect(message).toContain('{"y":2026,"m":9,"d":22}');
  });
});
