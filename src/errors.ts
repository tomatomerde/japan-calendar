/**
 * Exceptions thrown by this library. All extend `JapanCalendarError`, so
 * callers can catch them all at once with `instanceof JapanCalendarError`.
 *
 * **Every subclass assigns `this.name` as a string literal.** The obvious
 * shorthand -- setting it once in the base constructor via
 * `new.target.name` -- reads the *class identifier*, which a minifier is
 * free to rename. Bundling this package with `esbuild --minify` (what any
 * consumer targeting a browser or a serverless runtime does) turned
 * `error.name` into `d`, `u`, and `y`. `instanceof` keeps working either
 * way, but `name` is part of an Error's public contract: it's what shows
 * up in logs and what code that can't import the classes branches on.
 * Literals survive minification; derived names don't.
 */

/**
 * Renders an arbitrary value for an error message.
 *
 * `String(value)` turns every object into `[object Object]`, which tells a
 * caller who passed a near-miss shape (`{ y, m, d }` instead of
 * `{ year, month, day }`) nothing about what was wrong. Not exported from
 * the package index -- this is internal.
 */
export function describeValue(value: unknown): string {
  if (typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'bigint') return `${value}n`;
  if (typeof value === 'object' && value !== null) {
    try {
      const json = JSON.stringify(value);
      if (json !== undefined) return json;
    } catch {
      // Circular or otherwise unserializable; fall through to String().
    }
  }
  return String(value);
}

export class JapanCalendarError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'JapanCalendarError';
  }
}

/** The argument's type or format is not accepted. */
export class InvalidDateInputError extends JapanCalendarError {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidDateInputError';
  }
}

/**
 * An argument other than a date is of the wrong type or is not one of the
 * accepted values -- an unknown `CalendarKind`, a non-integer day count, an
 * unknown wareki format.
 *
 * These are separate from `InvalidDateInputError` because they are not about
 * interpreting a date. Without them the library would answer anyway: a
 * mistyped `'Bank'` silently fell back to the national calendar, and a `NaN`
 * day count silently behaved like `0`. Both produced a plausible wrong
 * answer rather than a failure, which is exactly what this library exists
 * not to do.
 */
export class InvalidArgumentError extends JapanCalendarError {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidArgumentError';
  }
}

/** Outside the supported range: 1949-2099 for the holiday API, or before Meiji 6-1-1 for wareki. */
export class OutOfRangeError extends JapanCalendarError {
  constructor(message: string) {
    super(message);
    this.name = 'OutOfRangeError';
  }
}

/**
 * Meiji 5, month 12, days 3-31.
 *
 * The 1873 calendar reform (Daijō-kan Proclamation No. 337) made the day
 * after Meiji 5-12-2 into Meiji 6-1-1 (1873-01-01). These 29 days never
 * existed in either calendar.
 */
export class MeijiReformError extends JapanCalendarError {
  constructor(month: number, day: number) {
    super(
      `Meiji 5-${month}-${day} does not exist. The 1873 calendar reform made the day ` +
        `after Meiji 5-12-2 (1872-12-31) into Meiji 6-1-1 (1873-01-01), so Meiji 5-12-3 ` +
        `through 5-12-31 are missing from the calendar.`,
    );
    this.name = 'MeijiReformError';
  }
}

/**
 * Outside the supported range for wareki (Japanese era) conversion.
 *
 * Dates before Meiji 6-1-1 (1873-01-01) used a lunisolar calendar (the
 * Tenpō calendar), which cannot be converted with a simple mapping to the
 * Gregorian calendar, so this range is unsupported.
 */
export class UnsupportedWarekiRangeError extends JapanCalendarError {
  constructor(message: string) {
    super(message);
    this.name = 'UnsupportedWarekiRangeError';
  }
}

/** A wareki date that does not exist within its era's span (e.g. Shōwa 64-1-8). */
export class InvalidWarekiDateError extends JapanCalendarError {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidWarekiDateError';
  }
}
