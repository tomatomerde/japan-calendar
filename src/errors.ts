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
