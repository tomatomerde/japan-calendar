/**
 * 法定祝日の中でも、通常のルールに乗らない2種類の例外。
 *
 * 1. `ONE_OFF_HOLIDAYS` — 一回限りの特例法による祝日（皇室の儀式など）。
 * 2. `OLYMPIC_OVERRIDES` — 2020/2021年、東京オリンピック・パラリンピック
 *    特別措置法により海の日・スポーツの日・山の日の日付だけが一時的に
 *    変更された。名称は変わらないので、通常ルールで計算した日付を
 *    ここで定義した日付に差し替える。
 */

export interface OneOffHoliday {
  readonly year: number;
  readonly month: number;
  readonly day: number;
  readonly name: string;
}

export const ONE_OFF_HOLIDAYS: readonly OneOffHoliday[] = [
  { year: 1959, month: 4, day: 10, name: '結婚の儀' }, // 皇太子明仁親王の結婚の儀
  { year: 1989, month: 2, day: 24, name: '大喪の礼' }, // 昭和天皇の大喪の礼
  { year: 1990, month: 11, day: 12, name: '即位礼正殿の儀' },
  { year: 1993, month: 6, day: 9, name: '結婚の儀' }, // 皇太子徳仁親王の結婚の儀
  { year: 2019, month: 5, day: 1, name: '天皇の即位の日' },
  { year: 2019, month: 10, day: 22, name: '即位礼正殿の儀' },
];

export interface OlympicOverride {
  readonly month: number;
  readonly day: number;
}

/** 年 → 祝日名 → 上書き後の日付。 */
export const OLYMPIC_OVERRIDES: ReadonlyMap<number, ReadonlyMap<string, OlympicOverride>> = new Map([
  [
    2020,
    new Map([
      ['海の日', { month: 7, day: 23 }],
      ['スポーツの日', { month: 7, day: 24 }],
      ['山の日', { month: 8, day: 10 }],
    ]),
  ],
  [
    2021,
    new Map([
      ['海の日', { month: 7, day: 22 }],
      ['スポーツの日', { month: 7, day: 23 }],
      ['山の日', { month: 8, day: 8 }],
    ]),
  ],
]);
