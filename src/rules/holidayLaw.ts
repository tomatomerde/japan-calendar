/**
 * 祝日法・特例法による法定祝日の定義。
 *
 * 各エントリは「ある名称の祝日が、ある期間、どのルールで日付を持つか」を表す。
 * 期間は改正の施行年で区切ってある。同じ名称でもルールが変われば別エントリに
 * なる（例: 成人の日は2000年にハッピーマンデー化するので2エントリ）。
 *
 * 2020年・2021年の海の日・スポーツの日・山の日（オリンピック特措法による
 * 移動）は、このテーブルの通常ルールをそのまま使い、`OLYMPIC_OVERRIDES`
 * （exceptions.ts）で日付だけ上書きする。名称自体は変わらない。
 */

import type { Weekday } from '../civil.js';

export type HolidayRule =
  | { readonly kind: 'fixed'; readonly month: number; readonly day: number }
  | { readonly kind: 'nth-weekday'; readonly month: number; readonly weekday: Weekday; readonly nth: number }
  | { readonly kind: 'equinox'; readonly which: 'vernal' | 'autumnal' };

export interface HolidayDefinition {
  readonly name: string;
  readonly rule: HolidayRule;
  /** この定義が適用される最初の年（この年の祝日から反映される）。 */
  readonly fromYear: number;
  /** この定義が適用される最後の年。省略時は現在も継続。 */
  readonly throughYear?: number;
}

const MONDAY: Weekday = 1;

/**
 * 祝日法は1948-07-20施行だが、施行年は1月・成人の日など既に過ぎた日付を
 * 含み「祝日の初年」として扱いにくいため、このライブラリの対応開始年は
 * 1949年からとする（1948年は範囲外エラーになる）。
 */
export const HOLIDAY_LAW: readonly HolidayDefinition[] = [
  { name: '元日', rule: { kind: 'fixed', month: 1, day: 1 }, fromYear: 1949 },

  { name: '成人の日', rule: { kind: 'fixed', month: 1, day: 15 }, fromYear: 1949, throughYear: 1999 },
  { name: '成人の日', rule: { kind: 'nth-weekday', month: 1, weekday: MONDAY, nth: 2 }, fromYear: 2000 },

  // 1966年の改正で追加。祝日法上の施行は1966年だが、実際にカレンダーに
  // 反映されたのは翌1967年から（内閣府データで確認済み）。
  { name: '建国記念の日', rule: { kind: 'fixed', month: 2, day: 11 }, fromYear: 1967 },

  { name: '天皇誕生日', rule: { kind: 'fixed', month: 4, day: 29 }, fromYear: 1949, throughYear: 1988 },
  { name: '天皇誕生日', rule: { kind: 'fixed', month: 12, day: 23 }, fromYear: 1989, throughYear: 2018 },
  // 2019年は先帝(平成)の誕生日を過ぎてから即位したため天皇誕生日が存在しない年になる。
  { name: '天皇誕生日', rule: { kind: 'fixed', month: 2, day: 23 }, fromYear: 2020 },

  { name: '春分の日', rule: { kind: 'equinox', which: 'vernal' }, fromYear: 1949 },

  { name: '憲法記念日', rule: { kind: 'fixed', month: 5, day: 3 }, fromYear: 1949 },

  { name: 'みどりの日', rule: { kind: 'fixed', month: 4, day: 29 }, fromYear: 1989, throughYear: 2006 },
  { name: 'みどりの日', rule: { kind: 'fixed', month: 5, day: 4 }, fromYear: 2007 },

  { name: 'こどもの日', rule: { kind: 'fixed', month: 5, day: 5 }, fromYear: 1949 },

  { name: '海の日', rule: { kind: 'fixed', month: 7, day: 20 }, fromYear: 1996, throughYear: 2002 },
  { name: '海の日', rule: { kind: 'nth-weekday', month: 7, weekday: MONDAY, nth: 3 }, fromYear: 2003 },

  { name: '山の日', rule: { kind: 'fixed', month: 8, day: 11 }, fromYear: 2016 },

  { name: '敬老の日', rule: { kind: 'fixed', month: 9, day: 15 }, fromYear: 1966, throughYear: 2002 },
  { name: '敬老の日', rule: { kind: 'nth-weekday', month: 9, weekday: MONDAY, nth: 3 }, fromYear: 2003 },

  { name: '秋分の日', rule: { kind: 'equinox', which: 'autumnal' }, fromYear: 1949 },

  { name: '体育の日', rule: { kind: 'fixed', month: 10, day: 10 }, fromYear: 1966, throughYear: 1999 },
  { name: '体育の日', rule: { kind: 'nth-weekday', month: 10, weekday: MONDAY, nth: 2 }, fromYear: 2000, throughYear: 2019 },
  { name: 'スポーツの日', rule: { kind: 'nth-weekday', month: 10, weekday: MONDAY, nth: 2 }, fromYear: 2020 },

  { name: '文化の日', rule: { kind: 'fixed', month: 11, day: 3 }, fromYear: 1949 },

  { name: '勤労感謝の日', rule: { kind: 'fixed', month: 11, day: 23 }, fromYear: 1949 },

  // 2007年改正: 4/29は昭和の日に、みどりの日は5/4に移った。
  { name: '昭和の日', rule: { kind: 'fixed', month: 4, day: 29 }, fromYear: 2007 },
];
