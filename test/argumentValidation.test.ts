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
  // undefined は既定値 'national' として正当なので、ここには入れない
  // （テスト本体で early return させると、何も検証しないテストが1件増えるだけになる）。
  const typos = ['Bank', 'BANK', 'banks', 'National', '', ' bank', 'bank ', null, 0, {}];

  for (const bad of typos) {
    it(`isBusinessDay は calendar=${JSON.stringify(bad)} を拒否する`, () => {
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

  it("'ja' で isGannen の欠落を検出する（レビューで見つかった取りこぼし）", () => {
    // 検証を通過してしまう手組みオブジェクト。era/eraAbbr/eraYear/month/day は揃っている。
    // 修正前はこれが '令和1年5月1日' を返し、正規の '令和元年5月1日' と静かに食い違った。
    const hand = { era: '令和', eraAbbr: 'R', eraYear: 1, month: 5, day: 1 };
    // 「矛盾」ではなく「欠落」として報告されること。両方が /isGannen/ に
    // 一致してしまうので、文面まで見ないとメッセージの出し分けを固定できない。
    expect(() => formatWareki(hand as never, 'ja')).toThrow(/isGannen is missing or invalid/);
    // isGannen を読まない形式は通る。
    expect(formatWareki(hand as never, 'abbr')).toBe('R1.5.1');
    expect(formatWareki(hand as never, 'ja-numeric')).toBe('令和1年5月1日');
  });

  it("'ja' で isGannen と eraYear の矛盾を検出する", () => {
    // isGannen は eraYear === 1 の別名であって独立したスイッチではない。
    // 食い違うオブジェクトは、どちらを採っても推測になるので拒否する。
    const contradictory = { ...wareki, isGannen: false };
    expect(() => formatWareki(contradictory as never, 'ja')).toThrow(/contradicts/);
    const alsoBad = { ...toWareki('2020-05-01'), isGannen: true };
    expect(() => formatWareki(alsoBad as never, 'ja')).toThrow(/contradicts/);
  });

  it('正当な組み合わせは全形式で通る', () => {
    expect(formatWareki(wareki, 'ja')).toBe('令和元年5月1日');
    expect(formatWareki(wareki, 'ja-numeric')).toBe('令和1年5月1日');
    expect(formatWareki(wareki, 'abbr')).toBe('R1.5.1');
    expect(formatWareki(wareki, 'abbr-padded')).toBe('R01.05.01');
  });
});

describe('formatWareki は実在しない和暦日を拒否する（レビューで見つかった取りこぼし）', () => {
  // 修正前はここまで挙げたケースがすべて形だけの検証(型・欠落)を素通りし、
  // 存在しない日付をもっともらしく描画していた。fromWareki を再利用して、
  // 実際に存在する和暦日かどうかまで見る。

  it('存在しない日付（4月31日）を拒否する', () => {
    const bad = { era: '令和', eraAbbr: 'R', eraYear: 8, isGannen: false, month: 4, day: 31 };
    // 修正前: '令和8年4月31日' をそのまま返していた。
    expect(() => formatWareki(bad as never, 'ja')).toThrow(InvalidArgumentError);
    expect(() => formatWareki(bad as never, 'ja')).toThrow(/does not describe a date that actually exists/);
  });

  it('eraYear が 1 未満、month が 0 の組み合わせを拒否する', () => {
    const bad = { era: '令和', eraAbbr: 'R', eraYear: -5, isGannen: false, month: 0, day: 99 };
    // 修正前: '令和-5年0月99日' をそのまま返していた。
    expect(() => formatWareki(bad as never, 'ja')).toThrow(InvalidArgumentError);
  });

  it('元号の在位期間外の組み合わせを拒否する（昭和64年1月8日は存在しない）', () => {
    // 昭和は 1989-01-07 まで、翌日は平成1-1-8。日付自体は実在するが、
    // 昭和64年1月8日という「その元号内の日付」としては存在しない。
    const bad = { era: '昭和', eraAbbr: 'S', eraYear: 64, isGannen: false, month: 1, day: 8 };
    expect(() => formatWareki(bad as never, 'ja')).toThrow(InvalidArgumentError);
  });

  it("era フィールドにローマ字（'Reiwa'）を許さない", () => {
    // fromWareki はローマ字・略称も受け付けるが、Wareki.era 自体は
    // EraName（'令和' 等の正式表記）のはず。resolveEra が解決できてしまう
    // という理由で通してしまうと、'Reiwa8年5月1日' のような描画が起こり得た。
    const bad = { era: 'Reiwa', eraAbbr: 'R', eraYear: 8, isGannen: false, month: 5, day: 1 };
    expect(() => formatWareki(bad as never, 'ja')).toThrow(InvalidArgumentError);
    expect(() => formatWareki(bad as never, 'ja')).toThrow(/canonical/);
  });

  it('存在しない era / eraAbbr を拒否する', () => {
    const badEra = { era: '大化', eraAbbr: 'R', eraYear: 1, isGannen: true, month: 5, day: 1 };
    expect(() => formatWareki(badEra as never, 'ja')).toThrow(/does not name a known era/);
    const badAbbr = { era: '令和', eraAbbr: 'X', eraYear: 1, isGannen: true, month: 5, day: 1 };
    expect(() => formatWareki(badAbbr as never, 'abbr')).toThrow(/does not name a known era/);
  });

  it('format が読まない側の識別フィールドの食い違いは許容される（既知の割り切り）', () => {
    // era と eraAbbr が別の元号を指していても、各 format は自分が読む
    // フィールドしか見ない。isGannen と同じく、この関数の担当は
    // 「読むフィールドが実在の和暦日を成すか」であって、
    // オブジェクト全体の内部整合性の保証ではない。
    const crossEra = { era: '令和', eraAbbr: 'S', eraYear: 8, isGannen: false, month: 5, day: 1 };
    expect(formatWareki(crossEra as never, 'abbr')).toBe('S8.5.1');
    expect(formatWareki(crossEra as never, 'ja')).toBe('令和8年5月1日');
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
  it('巨大な値でもメッセージが際限なく伸びない', () => {
    // メッセージはログに載り、Worker は 400 の本文にそのまま echo する。
    // 上限が無いと、呼び出し側のデータがそのまま反射されて 200KB になった。
    let message = '';
    try {
      isBusinessDay({ data: 'x'.repeat(200_000) } as never);
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message.length).toBeLessThan(500);
    expect(message).toContain('…');
  });

  it('壊れた値でも describeValue 自身が例外を投げない', () => {
    // メッセージ生成で落ちると、本来のエラーが握りつぶされて別物になる。
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    const throwingToJson = { toJSON() { throw new Error('boom'); } };
    for (const value of [circular, throwingToJson, Symbol('s'), 10n, function named() {}]) {
      expect(() => isBusinessDay(value as never)).toThrow(JapanCalendarError);
    }
  });

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
