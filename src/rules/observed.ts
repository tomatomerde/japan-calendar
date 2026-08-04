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
 * National holidays. Applies to a day that is neither a statutory holiday
 * nor already a substitute holiday, is not a Sunday, but is preceded and
 * followed by statutory holidays (Public Holiday Law, Article 3, Paragraph
 * 3 — Saturday is not excluded).
 *
 * `substitutes` must be `computeSubstituteHolidays(statutory)` (or a
 * superset covering the same period). It's needed because a substitute
 * holiday is a *derived* holiday, not itself part of `statutory` — without
 * checking it explicitly, a day that's already a substitute holiday could
 * also get counted as a sandwiched national holiday. This is exercised by
 * 1987/1992/1998, where Constitution Memorial Day (5/3) falls on a Sunday:
 * without this check, 5/4 would be produced twice, once as a substitute
 * holiday (for the Sunday) and once as a national holiday (sandwiched
 * between 5/3 and 5/5).
 */
export function computeBridgeHolidays(
  statutory: readonly StatutoryHoliday[],
  substitutes: readonly Holiday[],
): Holiday[] {
  const index = makeIndex(statutory);
  const isSubstitute = (date: CivilDate): boolean => substitutes.some((h) => isSameCivil(h.date, date));
  const result: Holiday[] = [];

  for (const holiday of statutory) {
    if (isBefore(holiday.date, BRIDGE_RULE_FROM)) continue;

    const candidate = addDays(holiday.date, 1);
    // If the next day is already a holiday (statutory or substitute), it's
    // a holiday in its own right, not a non-holiday sandwiched between two others.
    if (index.has(candidate) || isSubstitute(candidate)) continue;

    const dayAfterCandidate = addDays(candidate, 1);
    if (!index.has(dayAfterCandidate)) continue; // Not sandwiched.
    if (weekdayOf(candidate) === SUNDAY) continue;

    const confirmed = holiday.confirmed && (index.confirmedOf(dayAfterCandidate) ?? false);
    result.push(toHoliday(candidate, '国民の休日', 'bridge', confirmed));
  }

  return result;
}
