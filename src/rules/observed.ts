/**
 * 振替休日・国民の休日の導出。
 *
 * どちらも「法定祝日の集合」だけから機械的に決まるので、ここでは
 * 具体的な祝日の意味を知らず、`{ date, confirmed }` の集合だけを受け取る。
 */

import { SUNDAY, addDays, compareCivil, isSameCivil, weekdayOf, type CivilDate } from '../civil.js';
import type { Holiday, HolidayCategory } from '../types.js';

export interface StatutoryHoliday {
  readonly date: CivilDate;
  readonly confirmed: boolean;
}

/** 振替休日制度の開始日（1973-04-12施行）。これより前の祝日は振替休日を生まない。 */
const SUBSTITUTE_RULE_FROM: CivilDate = { year: 1973, month: 4, day: 12 };

/**
 * 「翌日が既に祝日ならさらに翌日へ」と連鎖させる改正の施行日（2007-01-01）。
 * これより前は、祝日でなくとも単純に「その翌日」を振替休日とする。
 */
const SUBSTITUTE_CHAIN_RULE_FROM: CivilDate = { year: 2007, month: 1, day: 1 };

/**
 * 国民の休日の制度が施行された日（1985-12-27）。実際に条件を満たす日が
 * 現れたのは1988-05-04が最初。日曜日に挟まれた場合は対象外
 * （国民の祝日に関する法律 第3条3項）。
 */
const BRIDGE_RULE_FROM: CivilDate = { year: 1986, month: 1, day: 1 };

function isBefore(a: CivilDate, b: CivilDate): boolean {
  return compareCivil(a, b) < 0;
}

function makeIndex(holidays: readonly StatutoryHoliday[]): {
  has: (date: CivilDate) => boolean;
  confirmedOf: (date: CivilDate) => boolean | undefined;
} {
  return {
    has: (date) => holidays.some((h) => isSameCivil(h.date, date)),
    confirmedOf: (date) => holidays.find((h) => isSameCivil(h.date, date))?.confirmed,
  };
}

function toHoliday(date: CivilDate, name: string, category: HolidayCategory, confirmed: boolean): Holiday {
  return { date, name, category, confirmed };
}

/**
 * 振替休日。`statutory` は判定対象期間の前後を含む十分広い範囲の
 * 法定祝日集合であること（年境界をまたぐ連鎖はこのライブラリの祝日配置
 * 上は発生しないが、念のため呼び出し側で前後1年を渡す設計にしている）。
 */
export function computeSubstituteHolidays(statutory: readonly StatutoryHoliday[]): Holiday[] {
  const index = makeIndex(statutory);
  const result: Holiday[] = [];

  for (const holiday of statutory) {
    if (weekdayOf(holiday.date) !== SUNDAY) continue;
    if (isBefore(holiday.date, SUBSTITUTE_RULE_FROM)) continue;

    let candidate = addDays(holiday.date, 1);
    if (!isBefore(holiday.date, SUBSTITUTE_CHAIN_RULE_FROM)) {
      while (index.has(candidate)) candidate = addDays(candidate, 1);
    }

    result.push(toHoliday(candidate, '振替休日', 'substitute', holiday.confirmed));
  }

  return result;
}

/**
 * 国民の休日。前日・翌日がともに法定祝日で、当日自身は祝日でなく、
 * かつ日曜日でない日が対象（国民の祝日に関する法律 第3条3項。
 * 土曜日は除外されない）。
 */
export function computeBridgeHolidays(statutory: readonly StatutoryHoliday[]): Holiday[] {
  const index = makeIndex(statutory);
  const result: Holiday[] = [];

  for (const holiday of statutory) {
    if (isBefore(holiday.date, BRIDGE_RULE_FROM)) continue;
    // 前日の祝日が日曜日なら、その翌日はすでに振替休日として祝日になっている。
    // 「祝日に挟まれた非祝日」という国民の休日の要件を満たさないので対象外。
    if (weekdayOf(holiday.date) === SUNDAY) continue;

    const candidate = addDays(holiday.date, 1);
    if (index.has(candidate)) continue; // 翌日も祝日ならそれ自体が祝日で、挟まれた平日ではない

    const dayAfterCandidate = addDays(candidate, 1);
    if (!index.has(dayAfterCandidate)) continue; // 挟まれていない
    if (weekdayOf(candidate) === SUNDAY) continue;

    const confirmed = holiday.confirmed && (index.confirmedOf(dayAfterCandidate) ?? false);
    result.push(toHoliday(candidate, '国民の休日', 'bridge', confirmed));
  }

  return result;
}
