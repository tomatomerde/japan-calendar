/**
 * Derivation of substitute holidays and national holidays.
 *
 * Both are determined mechanically from just "the set of statutory
 * holidays", so this module doesn't know what any particular holiday
 * means — it only receives a set of `{ date, confirmed }` pairs.
 */

import { SUNDAY, addDays, compareCivil, isSameCivil, weekdayOf, type CivilDate } from '../civil.js';
import type { Holiday, HolidayCategory } from '../types.js';

export interface StatutoryHoliday {
  readonly date: CivilDate;
  readonly confirmed: boolean;
}

/** Start of the substitute-holiday system (took effect 1973-04-12). Holidays before this never produce a substitute holiday. */
const SUBSTITUTE_RULE_FROM: CivilDate = { year: 1973, month: 4, day: 12 };

/**
 * Effective date (2007-01-01) of the amendment that chains forward "if the
 * next day is already a holiday too, move to the day after that". Before
 * this, the substitute holiday is simply "the following day", regardless
 * of whether that day is itself a holiday.
 */
const SUBSTITUTE_CHAIN_RULE_FROM: CivilDate = { year: 2007, month: 1, day: 1 };

/**
 * Effective date (1985-12-27) of the national-holiday system. The first
 * date that actually satisfied the condition was 1988-05-04. A day
 * sandwiched by Sunday holidays is excluded (Public Holiday Law, Article
 * 3, Paragraph 3).
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
 * Substitute holidays. `statutory` should be a wide enough set of
 * statutory holidays to cover the period around the one being checked
 * (holiday placement in this library never produces a chain that crosses
 * a year boundary, but callers are still designed to pass in the
 * surrounding year on each side, just in case).
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
 * National holidays. Applies to a day that is a statutory holiday on
 * neither the day itself nor a Sunday, but is preceded and followed by
 * statutory holidays (Public Holiday Law, Article 3, Paragraph 3 —
 * Saturday is not excluded).
 */
export function computeBridgeHolidays(statutory: readonly StatutoryHoliday[]): Holiday[] {
  const index = makeIndex(statutory);
  const result: Holiday[] = [];

  for (const holiday of statutory) {
    if (isBefore(holiday.date, BRIDGE_RULE_FROM)) continue;
    // If the preceding holiday falls on a Sunday, the following day is
    // already a holiday via the substitute-holiday rule. That fails the
    // national-holiday requirement of "a non-holiday sandwiched between
    // holidays", so skip it.
    if (weekdayOf(holiday.date) === SUNDAY) continue;

    const candidate = addDays(holiday.date, 1);
    if (index.has(candidate)) continue; // If the next day is also a holiday, it's a holiday in its own right, not a sandwiched weekday.

    const dayAfterCandidate = addDays(candidate, 1);
    if (!index.has(dayAfterCandidate)) continue; // Not sandwiched.
    if (weekdayOf(candidate) === SUNDAY) continue;

    const confirmed = holiday.confirmed && (index.confirmedOf(dayAfterCandidate) ?? false);
    result.push(toHoliday(candidate, '国民の休日', 'bridge', confirmed));
  }

  return result;
}
