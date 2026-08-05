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
/**
 * Longest rendered value an error message will carry.
 *
 * Error messages end up in logs, and the Worker echoes them in its 400
 * bodies. Without a cap, passing one large object produced a 200 KB message
 * -- the caller's own data, reflected back at whatever reads the log.
 */
const MAX_DESCRIBED_LENGTH = 200;

function truncate(rendered: string): string {
  if (rendered.length <= MAX_DESCRIBED_LENGTH) return rendered;
  // Never cut between the two halves of a surrogate pair. `slice` counts
  // UTF-16 code units, so a boundary that lands inside one astral character
  // (emoji, a rare kanji outside the BMP) leaves a lone high surrogate at the
  // end of the message -- a string that no longer decodes to text and shows
  // up as U+FFFD wherever the message is logged or displayed. `length` still
  // reports the untruncated value's own code-unit count.
  const cut =
    isHighSurrogate(rendered.charCodeAt(MAX_DESCRIBED_LENGTH - 1)) &&
    isLowSurrogate(rendered.charCodeAt(MAX_DESCRIBED_LENGTH))
      ? MAX_DESCRIBED_LENGTH - 1
      : MAX_DESCRIBED_LENGTH;
  return `${rendered.slice(0, cut)}… (${rendered.length} chars)`;
}

function isHighSurrogate(code: number): boolean {
  return code >= 0xd800 && code <= 0xdbff;
}

function isLowSurrogate(code: number): boolean {
  return code >= 0xdc00 && code <= 0xdfff;
}

export function describeValue(value: unknown): string {
  if (typeof value === 'string') return truncate(JSON.stringify(value));
  // The `n` suffix keeps a bigint distinguishable from the number with the
  // same digits: without it `10n` renders as `10`, and the message reads as
  // if a perfectly good number had been rejected.
  if (typeof value === 'bigint') return truncate(`${value}n`);
  if (typeof value === 'object' && value !== null) {
    try {
      const json = JSON.stringify(value);
      if (json !== undefined) return truncate(json);
    } catch {
      // Circular or otherwise unserializable; fall through to String().
    }
  }
  return truncate(String(value));
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
