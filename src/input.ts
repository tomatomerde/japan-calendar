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
import { InvalidDateInputError, describeValue } from './errors.js';

/** JST is a fixed UTC+9; Japan has no daylight saving time, so this constant suffices. */
const JST_OFFSET_MS = 9 * 60 * 60 * 1000;
const MS_PER_DAY = 86_400_000;

/**
 * Date input accepted by the public API.
 *
 * - `CivilDate` — `{ year, month, day }`. Has no notion of timezone.
 * - `string` — `YYYY-MM-DD` is interpreted as a civil date as-is.
 *   An ISO 8601 date-time **with an explicit offset** (e.g.
 *   `2019-05-01T00:00:00Z` or `2019-05-01T00:00:00+09:00`) is interpreted as
 *   an instant, converted to JST, and then reduced to a date. A date-time
 *   with no offset (e.g. `2019-05-01T00:00:00`) is rejected rather than
 *   resolved via the host's local timezone -- see `civil.ts`'s no-local-time
 *   invariant in CONTRIBUTING.md.
 * - `Date` — an instant. Converted to JST and then reduced to a date.
 */
export type DateInput = CivilDate | string | Date;

const CALENDAR_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * An ISO 8601 date-time with an explicit UTC/offset marker (`Z` or
 * `±HH:MM`/`±HHMM`). Deliberately narrower than what `Date.parse` accepts:
 * without a required offset, a string like `2019-05-01T00:00:00` would be
 * resolved using the host's local timezone, which would make `toCivilDate`'s
 * result depend on where the code happens to run -- exactly what this module
 * exists to prevent.
 */
const OFFSET_DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})$/;

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

    // An ISO 8601 date-time with an explicit offset is interpreted as an
    // instant. Anything else (including a date-time with no offset, which
    // Date.parse would silently resolve using the host's local timezone) is
    // rejected -- see OFFSET_DATE_TIME.
    if (!OFFSET_DATE_TIME.test(input)) {
      throw new InvalidDateInputError(
        `String cannot be interpreted as a date: ${JSON.stringify(input)}. ` +
          `Pass a YYYY-MM-DD string, or an ISO 8601 date-time with an explicit offset (e.g. a trailing Z or +09:00).`,
      );
    }
    const parsed = Date.parse(input);
    if (Number.isNaN(parsed)) {
      throw new InvalidDateInputError(
        `String cannot be interpreted as a date: ${JSON.stringify(input)}. ` +
          `Pass a YYYY-MM-DD string, or an ISO 8601 date-time with an explicit offset (e.g. a trailing Z or +09:00).`,
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

  // describeValue, not String(): every object stringifies to "[object Object]",
  // which tells someone who passed a near-miss shape -- `{ y, m, d }` instead of
  // `{ year, month, day }` -- nothing at all about what was wrong.
  throw new InvalidDateInputError(
    `Value cannot be interpreted as a date: ${describeValue(input)}. ` +
      `Pass a Date, a YYYY-MM-DD string, or a { year, month, day } object.`,
  );
}
