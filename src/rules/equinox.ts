/**
 * 春分の日・秋分の日の近似式。
 *
 * 国立天文台がしばしば引用する式:
 *   day = floor(C + 0.242194 * (year - 1980) - floor((year - 1980) / 4))
 *
 * **注意: 閏年補正の除算は必ず `floor` を使う。** `Math.trunc` で実装すると
 * 1980年より前（除数が負）で1日ずれる。内閣府の公式データ（1955〜2027年、
 * 春分・秋分あわせて146件）と突き合わせたところ、`floor` 除算にすれば
 * 年代でCの値を分けなくても単一の係数で全件が一致した。書籍やWeb上に
 * 見られる「1900〜1979年は別係数」という記述は、大抵この除算方法の
 * 違いに起因すると思われる。
 *
 * 1955〜2027年は内閣府データで検証済み。それより古い年（1949〜1954年）は
 * 検証手段がなく、この式による外挿でしかない。文献上この式は概ね
 * 1980〜2099年で有効とされるが、上記の実データ検証によりこの範囲は
 * 少なくとも1955年まで安全に遡れることを確認している。
 */

const VERNAL_C = 20.8431;
const AUTUMNAL_C = 23.2488;

/** 負数でも正しく切り捨てる整数除算（除数は常に正）。 */
function floorDiv(a: number, b: number): number {
  return Math.floor(a / b);
}

function equinoxDay(year: number, c: number): number {
  return Math.floor(c + 0.242194 * (year - 1980) - floorDiv(year - 1980, 4));
}

export function vernalEquinoxDay(year: number): number {
  return equinoxDay(year, VERNAL_C);
}

export function autumnalEquinoxDay(year: number): number {
  return equinoxDay(year, AUTUMNAL_C);
}
