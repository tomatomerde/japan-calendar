/**
 * Normalizes the date input accepted by the public API into the internal
 * `CivilDate` representation.
 *
 * **All timezone handling is centralized here.** Only when a `Date` (i.e.
 * an instant) is given is it converted to "the date as seen in JST". Every
 * other input (a calendar-date string or object) has no timezone to begin
 * with, so it's treated as a civil date as-is.
 */

import { civilFromDays, isValidCivil, type CivilDate } from './civil.js';
import { InvalidDateInputError } from './errors.js';

/** JST is a fixed UTC+9; Japan has no daylight saving time, so this constant suffices. */
const JST_OFFSET_MS = 9 * 60 * 60 * 1000;
const MS_PER_DAY = 86_400_000;

/**
 * Date input accepted by the public API.
 *
 * - `CivilDate` — `{ year, month, day }`. Has no notion of timezone.
 * - `string` — `YYYY-MM-DD` is interpreted as a civil date as-is.
 *   An ISO 8601 string with a time or offset (e.g. `2019-05-01T00:00:00Z`)
 *   is interpreted as an instant, converted to JST, and then reduced to a date.
 * - `Date` — an instant. Converted to JST and then reduced to a date.
 */
export type DateInput = CivilDate | string | Date;

const CALENDAR_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Reduces an instant (epoch milliseconds) to a civil date in JST. */
export function civilFromInstant(epochMs: number): CivilDate {
  if (!Number.isFinite(epochMs)) {
    throw new InvalidDateInputError(`Value cannot be interpreted as a date: ${String(epochMs)}`);
  }
  // Shift the UTC instant by +9h, then truncate to whole days. Using floor
  // means instants before 1970 (negative day numbers) round to the
  // correct preceding day.
  return civilFromDays(Math.floor((epochMs + JST_OFFSET_MS) / MS_PER_DAY));
}

function isCivilDateLike(value: unknown): value is CivilDate {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate['year'] === 'number' &&
    typeof candidate['month'] === 'number' &&
    typeof candidate['day'] === 'number'
  );
}

export function toCivilDate(input: DateInput): CivilDate {
  if (input instanceof Date) {
    const epochMs = input.getTime();
    if (Number.isNaN(epochMs)) {
      throw new InvalidDateInputError('An invalid Date was given.');
    }
    return civilFromInstant(epochMs);
  }

  if (typeof input === 'string') {
    const matched = CALENDAR_DATE.exec(input);
    if (matched !== null) {
      const year = Number(matched[1]);
      const month = Number(matched[2]);
      const day = Number(matched[3]);
      if (!isValidCivil(year, month, day)) {
        throw new InvalidDateInputError(`Date does not exist: ${input}`);
      }
      return { year, month, day };
    }

    // An ISO 8601 string with a time component is interpreted as an instant.
    const parsed = Date.parse(input);
    if (Number.isNaN(parsed)) {
      throw new InvalidDateInputError(
        `String cannot be interpreted as a date: ${JSON.stringify(input)}. ` +
          `Pass a YYYY-MM-DD string or an ISO 8601 date-time.`,
      );
    }
    return civilFromInstant(parsed);
  }

  if (isCivilDateLike(input)) {
    const { year, month, day } = input;
    if (!isValidCivil(year, month, day)) {
      throw new InvalidDateInputError(`Date does not exist: ${year}-${month}-${day}`);
    }
    return { year, month, day };
  }

  throw new InvalidDateInputError(
    `Value cannot be interpreted as a date: ${String(input)}. ` +
      `Pass a Date, a YYYY-MM-DD string, or a { year, month, day } object.`,
  );
}
