/**
 * Two kinds of exceptions to the normal statutory holiday rules.
 *
 * 1. `ONE_OFF_HOLIDAYS` — Holidays declared by a one-off special law
 *    (imperial ceremonies, etc.).
 * 2. `OLYMPIC_OVERRIDES` — In 2020/2021, the Tokyo Olympic/Paralympic
 *    special measures law temporarily changed only the dates of Marine
 *    Day, Sports Day, and Mountain Day. The names don't change, so the
 *    date computed by the normal rule is replaced with the date defined here.
 */

export interface OneOffHoliday {
  readonly year: number;
  readonly month: number;
  readonly day: number;
  readonly name: string;
}

export const ONE_OFF_HOLIDAYS: readonly OneOffHoliday[] = [
  { year: 1959, month: 4, day: 10, name: '結婚の儀' }, // Wedding of Crown Prince Akihito
  { year: 1989, month: 2, day: 24, name: '大喪の礼' }, // State funeral of Emperor Shōwa
  { year: 1990, month: 11, day: 12, name: '即位礼正殿の儀' }, // Enthronement ceremony
  { year: 1993, month: 6, day: 9, name: '結婚の儀' }, // Wedding of Crown Prince Naruhito
  { year: 2019, month: 5, day: 1, name: '天皇の即位の日' }, // Emperor's Accession Day
  { year: 2019, month: 10, day: 22, name: '即位礼正殿の儀' }, // Enthronement ceremony
];

export interface OlympicOverride {
  readonly month: number;
  readonly day: number;
}

/** Year -> holiday name -> overridden date. */
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
