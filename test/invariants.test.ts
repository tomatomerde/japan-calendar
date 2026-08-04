/**
 * Exhaustive invariant checks across the full supported year range
 * (1949-2099). These are cheap to run and catch the class of bug found
 * during review: a holiday-rule interaction producing a duplicate date
 * that only manifests in specific years (e.g. when a fixed-date holiday
 * happens to fall on a Sunday), which point-in-time test cases can easily
 * miss.
 */

import { describe, expect, it } from 'vitest';
import { toIsoDate, weekdayOf, SUNDAY } from '../src/civil.ts';
import { isBusinessDay } from '../src/businessDays.ts';
import { holidaysForYear, MAX_SUPPORTED_YEAR, MIN_SUPPORTED_YEAR } from '../src/holidays.ts';

describe('invariants across the full supported range', () => {
  it('never produces two holidays on the same date within a year', () => {
    const duplicates: string[] = [];
    for (let year = MIN_SUPPORTED_YEAR; year <= MAX_SUPPORTED_YEAR; year += 1) {
      const seen = new Map<string, string>();
      for (const holiday of holidaysForYear(year)) {
        const iso = toIsoDate(holiday.date);
        const label = `${holiday.name}(${holiday.category})`;
        const existing = seen.get(iso);
        if (existing !== undefined) {
          duplicates.push(`${iso}: ${existing} + ${label}`);
        }
        seen.set(iso, label);
      }
    }
    expect(duplicates).toEqual([]);
  });

  it('never places a substitute holiday or a national holiday on a Sunday', () => {
    const violations: string[] = [];
    for (let year = MIN_SUPPORTED_YEAR; year <= MAX_SUPPORTED_YEAR; year += 1) {
      for (const holiday of holidaysForYear(year)) {
        if (
          (holiday.category === 'substitute' || holiday.category === 'bridge') &&
          weekdayOf(holiday.date) === SUNDAY
        ) {
          violations.push(`${toIsoDate(holiday.date)} ${holiday.name} (${holiday.category})`);
        }
      }
    }
    expect(violations).toEqual([]);
  });

  it('every holiday is a non-business day, on both calendars', () => {
    const violations: string[] = [];
    for (let year = MIN_SUPPORTED_YEAR; year <= MAX_SUPPORTED_YEAR; year += 1) {
      for (const holiday of holidaysForYear(year)) {
        if (isBusinessDay(holiday.date, 'national') || isBusinessDay(holiday.date, 'bank')) {
          violations.push(`${toIsoDate(holiday.date)} ${holiday.name}`);
        }
      }
    }
    expect(violations).toEqual([]);
  });
});
