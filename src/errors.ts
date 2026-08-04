/**
 * Exceptions thrown by this library. All extend `JapanCalendarError`, so
 * callers can catch them all at once with `instanceof JapanCalendarError`.
 */

export class JapanCalendarError extends Error {
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

/** The argument's type or format is not accepted. */
export class InvalidDateInputError extends JapanCalendarError {}

/** Outside the supported range: 1949-2099 for the holiday API, or before Meiji 6-1-1 for wareki. */
export class OutOfRangeError extends JapanCalendarError {}

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
  }
}

/**
 * Outside the supported range for wareki (Japanese era) conversion.
 *
 * Dates before Meiji 6-1-1 (1873-01-01) used a lunisolar calendar (the
 * Tenpō calendar), which cannot be converted with a simple mapping to the
 * Gregorian calendar, so this range is unsupported.
 */
export class UnsupportedWarekiRangeError extends JapanCalendarError {}

/** A wareki date that does not exist within its era's span (e.g. Shōwa 64-1-8). */
export class InvalidWarekiDateError extends JapanCalendarError {}
