/**
 * Wall-clock performance assertions. Kept separate from the rest of the
 * suite because timing is inherently sensitive to the runner's hardware
 * and load -- unlike every other test file, this one is NOT run as part
 * of the pre-push gate in `.github/workflows/update-holidays.yml` (a slow
 * CI runner could otherwise fail a routine monthly data update for a
 * reason that has nothing to do with the data). Correctness assertions
 * for the same code path live in `test/businessDays.test.ts` instead,
 * where they run unconditionally.
 */

import { describe, expect, it } from 'vitest';
import { businessDaysBetween, isBusinessDay } from '../src/businessDays.ts';
import { civilFromDays, daysFromCivil, toIsoDate } from '../src/civil.ts';
import { MAX_SUPPORTED_YEAR, MIN_SUPPORTED_YEAR } from '../src/holidays.ts';

function naiveBetween(from: string, to: string): number {
  const [fy, fm, fd] = from.split('-').map(Number) as [number, number, number];
  const [ty, tm, td] = to.split('-').map(Number) as [number, number, number];
  let lo = daysFromCivil(fy, fm, fd);
  let hi = daysFromCivil(ty, tm, td);
  const sign = lo <= hi ? 1 : -1;
  if (lo > hi) [lo, hi] = [hi, lo];
  let count = 0;
  for (let d = lo; d < hi; d += 1) {
    if (isBusinessDay(civilFromDays(d))) count += 1;
  }
  return count * sign;
}

describe('businessDaysBetween performance', () => {
  it('対応範囲の全域でも素朴な日単位実装よりずっと高速（O(年数)であることの担保）', () => {
    // 絶対時間の閾値はCI環境の速度でブレるため使わない。代わりに、同じ
    // フルレンジ問い合わせを素朴な日単位実装と比較し、十分に高速である
    // ことを相対的に確認する。O(日数)に戻る回帰が起きれば、この比は
    // 1に近づく（=対象実装も遅くなる）ため検出できる。
    //
    // 両実装は holidaysForYear の結果をモジュール内で共有キャッシュする
    // ため、先に呼んだ方が後に呼ぶ方のキャッシュを温めてしまい、
    // 素朴実装が不当に速く見える。両方を一度ずつ呼んでキャッシュを
    // 温めてから、warm な状態で計測する。
    const from = toIsoDate({ year: MIN_SUPPORTED_YEAR, month: 1, day: 1 });
    const to = toIsoDate({ year: MAX_SUPPORTED_YEAR, month: 12, day: 31 });

    businessDaysBetween(from, to, 'national');
    naiveBetween(from, to);

    const fastStart = performance.now();
    const fastResult = businessDaysBetween(from, to, 'national');
    const fastMs = performance.now() - fastStart;

    const naiveStart = performance.now();
    const naiveResult = naiveBetween(from, to);
    const naiveMs = performance.now() - naiveStart;

    expect(fastResult).toBe(naiveResult);
    expect(fastResult).toBeGreaterThan(0);
    expect(fastMs).toBeLessThan(naiveMs / 5);
  });
});
