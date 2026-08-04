/**
 * ルールエンジンの出力を、内閣府の公式データ（1955〜収録最終年）と
 * 全日付・全名称で突き合わせる。差分が1件でもあれば失敗する。
 *
 * CSVは振替休日・国民の休日を区別せず「休日」という総称で記録している。
 * また2019年の即位関連2日と体育の日は、その年に限って特有の表記になる。
 * これらは「CSV上どう表記されるか」の変換であって、ライブラリが公開する
 * 意味のある名称（`天皇の即位の日` など）を変えるものではない。
 */

import { describe, expect, it } from 'vitest';
import { OFFICIAL_HOLIDAYS, OFFICIAL_META } from '../src/data/official.ts';
import { toIsoDate } from '../src/civil.ts';
import { holidaysForYear } from '../src/holidays.ts';
import type { Holiday } from '../src/types.ts';

/** CSV側の特有表記になる、年代限定の名称上書き。 */
const CSV_NAME_OVERRIDES: ReadonlyMap<string, string> = new Map([
  ['2019-05-01', '休日（祝日扱い）'],
  ['2019-10-22', '休日（祝日扱い）'],
  ['2019-10-14', '体育の日（スポーツの日）'],
]);

function toCsvName(holiday: Holiday, iso: string): string {
  const override = CSV_NAME_OVERRIDES.get(iso);
  if (override !== undefined) return override;
  return holiday.category === 'statutory' ? holiday.name : '休日';
}

if (OFFICIAL_META.firstYear === null || OFFICIAL_META.lastYear === null) {
  // This is the strongest test in the suite; it must never disappear
  // silently. `official.ts` only ships without data before the very first
  // CSV fetch (see scripts/fetch-syukujitsu.ts) -- that bootstrap step has
  // already happened for this repository, so reaching this branch now
  // means the generated data file was wiped or corrupted. Fail loudly
  // rather than skipping.
  describe('公式データ突き合わせ', () => {
    it('official.ts にデータが焼き込まれていること', () => {
      expect(OFFICIAL_META.firstYear, 'src/data/official.ts appears empty. Run node scripts/fetch-syukujitsu.ts to regenerate it.').not.toBeNull();
    });
  });
} else {
  const firstYear = OFFICIAL_META.firstYear;
  const lastYear = OFFICIAL_META.lastYear;

  const officialByYear = new Map<number, Array<readonly [string, string]>>();
  for (const [date, name] of OFFICIAL_HOLIDAYS) {
    const year = Number(date.slice(0, 4));
    const list = officialByYear.get(year) ?? [];
    list.push([date, name]);
    officialByYear.set(year, list);
  }

  describe(`公式データ突き合わせ（${firstYear}〜${lastYear}年、全${OFFICIAL_HOLIDAYS.length}件）`, () => {
    for (let year = firstYear; year <= lastYear; year += 1) {
      it(`${year}年`, () => {
        const official = (officialByYear.get(year) ?? []).map(([date, name]) => `${date} ${name}`);

        const computed = holidaysForYear(year)
          .map((holiday) => {
            const iso = toIsoDate(holiday.date);
            return `${iso} ${toCsvName(holiday, iso)}`;
          })
          .sort();

        expect(computed).toEqual([...official].sort());
      });
    }
  });
}
