/**
 * Statutory holiday definitions from the Public Holiday Law and special laws.
 *
 * Each entry says "a holiday with this name uses this rule to compute its
 * date, during this span of years". Spans are split at the year an
 * amendment took effect. The same name gets a separate entry whenever its
 * rule changes (e.g. Coming-of-Age Day gets two entries because it became
 * a Happy Monday holiday in 2000).
 *
 * Marine Day, Sports Day, and Mountain Day in 2020/2021 (moved by the
 * Olympic special law) reuse this table's normal rules as-is; only the
 * date is overridden by `OLYMPIC_OVERRIDES` (exceptions.ts). The name
 * itself never changes.
 */

import type { Weekday } from '../civil.js';

export type HolidayRule =
  | { readonly kind: 'fixed'; readonly month: number; readonly day: number }
  | { readonly kind: 'nth-weekday'; readonly month: number; readonly weekday: Weekday; readonly nth: number }
  | { readonly kind: 'equinox'; readonly which: 'vernal' | 'autumnal' };

export interface HolidayDefinition {
  readonly name: string;
  readonly rule: HolidayRule;
  /** The first year this definition applies to (holidays from this year onward reflect it). */
  readonly fromYear: number;
  /** The last year this definition applies to. Omitted if still in effect today. */
  readonly throughYear?: number;
}

const MONDAY: Weekday = 1;

/**
 * The Public Holiday Law took effect on 1948-07-20, but that year already
 * had dates like New Year's Day and Coming-of-Age Day pass before the law
 * existed, making it awkward to treat as a holiday's "first year". This
 * library's supported range therefore starts at 1949 (1949 is an
 * out-of-range error).
 */
export const HOLIDAY_LAW: readonly HolidayDefinition[] = [
  { name: '元日', rule: { kind: 'fixed', month: 1, day: 1 }, fromYear: 1949 },

  { name: '成人の日', rule: { kind: 'fixed', month: 1, day: 15 }, fromYear: 1949, throughYear: 1999 },
  { name: '成人の日', rule: { kind: 'nth-weekday', month: 1, weekday: MONDAY, nth: 2 }, fromYear: 2000 },

  // Added by the 1966 amendment. The law took effect in 1966, but it first
  // appeared on the calendar the following year, 1967 (confirmed against
  // the official Cabinet Office data).
  { name: '建国記念の日', rule: { kind: 'fixed', month: 2, day: 11 }, fromYear: 1967 },

  { name: '天皇誕生日', rule: { kind: 'fixed', month: 4, day: 29 }, fromYear: 1949, throughYear: 1988 },
  { name: '天皇誕生日', rule: { kind: 'fixed', month: 12, day: 23 }, fromYear: 1989, throughYear: 2018 },
  // 2019 has no Emperor's Birthday: the new Emperor's accession came after
  // the previous (Heisei) Emperor's birthday had already passed that year.
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

  // 2007 amendment: 4/29 became Shōwa Day, and Greenery Day moved to 5/4.
  { name: '昭和の日', rule: { kind: 'fixed', month: 4, day: 29 }, fromYear: 2007 },
];
