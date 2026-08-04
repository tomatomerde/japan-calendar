/**
 * Tests for the parts of `scripts/fetch-syukujitsu.ts` that don't need
 * network access. The fetch itself can only run on a GitHub Actions
 * runner (the dev environment's egress policy blocks cao.go.jp), but
 * everything downstream of it -- parsing, sanity checks, and the
 * regression guard -- is pure and testable here.
 */

import { describe, expect, it } from 'vitest';
import { assertSane, parseCsv } from '../scripts/fetch-syukujitsu.ts';
import { computeEquinoxConfirmedThrough, findAnomalies } from '../scripts/report.ts';
import { OFFICIAL_HOLIDAYS, OFFICIAL_META } from '../src/data/official.ts';
import type { OfficialHolidayRow } from '../src/data/official-types.ts';

describe('parseCsv', () => {
  it('BOM・CRLF・ヘッダ行・全角空白・引用符を正しく処理する', () => {
    const csv =
      '﻿国民の祝日・休日月日,国民の祝日・休日名称\r\n' +
      '1955/1/1,元日\r\n' +
      '2026/9/22,　休日　\r\n' +
      '2027/1/1,"元日"\r\n' +
      '\r\n';
    expect(parseCsv(csv)).toEqual([
      ['1955-01-01', '元日'],
      ['2026-09-22', '休日'],
      ['2027-01-01', '元日'],
    ]);
  });

  it('日付が昇順になるよう並べ替える', () => {
    const csv = '2027/1/1,元日\r\n1955/1/1,元日\r\n';
    expect(parseCsv(csv).map(([d]) => d)).toEqual(['1955-01-01', '2027-01-01']);
  });

  it('HTMLエラーページからは1行も取れない（assertSane の minRows で弾かれる）', () => {
    expect(parseCsv('<!DOCTYPE html>\n<html><body>404 Not Found</body></html>')).toEqual([]);
  });
});

describe('assertSane — 明らかに壊れた取得結果を弾く', () => {
  it('行数が少なすぎるものを弾く', () => {
    expect(() => assertSane([['1955-01-01', '元日']])).toThrow(/Too few rows/);
  });

  it('正常なデータ（現在コミット済みのもの）は通す', () => {
    expect(() => assertSane(OFFICIAL_HOLIDAYS)).not.toThrow();
  });
});

describe('assertSane — 退行ガード', () => {
  // 上流CSVが再公開時に直近の年を失った場合、絶対値のしきい値
  // （minRows / minLastYear）は全部通過してしまう。その結果
  // equinoxConfirmedThrough が後退し、いま confirmed:true の日付が
  // 静かに confirmed:false に変わる。コミット済みデータとの比較で防ぐ。
  function truncateAfter(year: number): OfficialHolidayRow[] {
    return OFFICIAL_HOLIDAYS.filter(([date]) => Number(date.slice(0, 4)) <= year);
  }

  it('直近1年ぶんだけ失われたケースを弾く（絶対値しきい値はすべて通過する）', () => {
    const lastYear = OFFICIAL_META.lastYear as number;
    const shrunk = truncateAfter(lastYear - 1);
    // 絶対値のしきい値は素通りすることを先に確かめておく
    expect(shrunk.length).toBeGreaterThanOrEqual(500);
    expect(Number((shrunk[shrunk.length - 1] as OfficialHolidayRow)[0].slice(0, 4))).toBeGreaterThanOrEqual(2020);
    // それでも退行ガードが止める
    expect(() => assertSane(shrunk)).toThrow(/smaller than what is already committed/);
  });

  it('大きく失われたケースも弾く', () => {
    expect(() => assertSane(truncateAfter(2020))).toThrow(/smaller than what is already committed/);
  });

  it('エラーメッセージに行数と年の変化を含む', () => {
    const lastYear = OFFICIAL_META.lastYear as number;
    expect(() => assertSane(truncateAfter(lastYear - 1))).toThrow(/row count went down/);
    expect(() => assertSane(truncateAfter(lastYear - 1))).toThrow(/latest year went down/);
  });

  it('データが増えるぶんには通す', () => {
    const lastYear = OFFICIAL_META.lastYear as number;
    const grown: OfficialHolidayRow[] = [...OFFICIAL_HOLIDAYS, [`${lastYear + 1}-01-01`, '元日']];
    expect(() => assertSane(grown)).not.toThrow();
  });
});

describe('computeEquinoxConfirmedThrough — confirmed フラグの境界年', () => {
  // この関数の返り値がそのまま OFFICIAL_META.equinoxConfirmedThrough に
  // なり、春分・秋分（とそれに依存する振替休日・国民の休日）の
  // confirmed を決める。CONTRIBUTING が「手書き定数にしてはいけない」と
  // 明記している箇所だが、これまでテストが1件も無く、最大値を最小値に
  // 変えても「両方揃っている年」の条件を外しても誰も気づかなかった。
  it('春分・秋分が両方そろっている最大の年を返す', () => {
    expect(
      computeEquinoxConfirmedThrough([
        ['2025-03-20', '春分の日'],
        ['2025-09-23', '秋分の日'],
        ['2026-03-20', '春分の日'],
        ['2026-09-23', '秋分の日'],
      ]),
    ).toBe(2026);
  });

  it('片方しか無い年は確定扱いしない（年途中で部分的に追記されたCSV対策）', () => {
    // 2027年は春分だけ。境界は両方そろう 2026 に留まるべき。
    expect(
      computeEquinoxConfirmedThrough([
        ['2026-03-20', '春分の日'],
        ['2026-09-23', '秋分の日'],
        ['2027-03-21', '春分の日'],
      ]),
    ).toBe(2026);
  });

  it('秋分だけの年も同様に確定扱いしない', () => {
    expect(
      computeEquinoxConfirmedThrough([
        ['2026-03-20', '春分の日'],
        ['2026-09-23', '秋分の日'],
        ['2027-09-23', '秋分の日'],
      ]),
    ).toBe(2026);
  });

  it('春分・秋分が1件も無ければ null（名称の表記が変わった場合の検出）', () => {
    expect(computeEquinoxConfirmedThrough([['2026-01-01', '元日']])).toBeNull();
  });

  it('コミット済みデータに対して OFFICIAL_META と一致する', () => {
    expect(computeEquinoxConfirmedThrough(OFFICIAL_HOLIDAYS)).toBe(OFFICIAL_META.equinoxConfirmedThrough);
  });
});

describe('findAnomalies — 取得データの健全性チェック', () => {
  // assertSane はこの結果が空でないと throw する。つまりこれが
  // 壊れたCSVを取り込ませない最後の砦だが、テストが無かった。
  it('正常なデータには異常を報告しない', () => {
    expect(
      findAnomalies([
        ['2026-01-01', '元日'],
        ['2026-01-12', '成人の日'],
      ]),
    ).toEqual([]);
  });

  it('日付の重複を検出する', () => {
    const kinds = findAnomalies([
      ['2026-01-01', '元日'],
      ['2026-01-01', '重複'],
    ]).map((a) => a.kind);
    expect(kinds).toContain('duplicate');
  });

  it('日付の順序の乱れを検出する', () => {
    const kinds = findAnomalies([
      ['2026-01-12', '成人の日'],
      ['2026-01-01', '元日'],
    ]).map((a) => a.kind);
    expect(kinds).toContain('out-of-order');
  });

  it('存在しない日付を検出する', () => {
    const kinds = findAnomalies([['2026-02-30', 'ありえない日']]).map((a) => a.kind);
    expect(kinds).toContain('invalid-date');
  });

  it('空の名称を検出する', () => {
    const kinds = findAnomalies([['2026-01-01', '']]).map((a) => a.kind);
    expect(kinds).toContain('empty-name');
  });

  it('うるう年を正しく扱う（400年ルールまで含めて）', () => {
    // 4で割れる年だけを見る実装だと 1900-02-29 を通してしまう。
    // 100年ルール・400年ルールの両方が効く年で固定する。
    expect(findAnomalies([['2024-02-29', 'うるう日']])).toEqual([]);
    expect(findAnomalies([['2000-02-29', 'うるう日（400年ルール）']])).toEqual([]);
    expect(findAnomalies([['2026-02-29', 'ありえない日']]).map((a) => a.kind)).toContain('invalid-date');
    expect(findAnomalies([['1900-02-29', 'ありえない日（100年ルール）']]).map((a) => a.kind)).toContain(
      'invalid-date',
    );
    expect(findAnomalies([['2100-02-29', 'ありえない日（100年ルール）']]).map((a) => a.kind)).toContain(
      'invalid-date',
    );
  });
});
