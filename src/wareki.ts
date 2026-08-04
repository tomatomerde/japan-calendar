/**
 * Conversion between wareki (Japanese era) dates and the Gregorian calendar.
 *
 * The supported range is **Meiji 6-1-1 (1873-01-01) onward**. Before that,
 * Japan used a lunisolar calendar (the Tenpō calendar), which cannot be
 * converted with a simple mapping to the Gregorian calendar.
 *
 * An era change belongs to the new era. 1989-01-07 is Shōwa 64-1-7, and the
 * next day, 1989-01-08, is Heisei 1-1-8. **Only the era name and year
 * change at an era transition — the month and day carry over unchanged**
 * (it never becomes something like "Heisei 1-1-1").
 */

import {
  compareCivil,
  daysFromCivil,
  isValidCivil,
  toDays,
  type CivilDate,
} from './civil.js';
import {
  InvalidDateInputError,
  InvalidWarekiDateError,
  MeijiReformError,
  UnsupportedWarekiRangeError,
} from './errors.js';
import { toCivilDate, type DateInput } from './input.js';

/**
 * Era name in Japanese, as it's actually written (e.g. on official
 * documents). This is domain data, like a holiday's name, not something to
 * localize; `eraRomaji` and `eraAbbr` provide ASCII equivalents.
 */
export type EraName = '明治' | '大正' | '昭和' | '平成' | '令和';

type EraRomaji = 'Meiji' | 'Taisho' | 'Showa' | 'Heisei' | 'Reiwa';
type EraAbbr = 'M' | 'T' | 'S' | 'H' | 'R';

/** Era alias. Romaji and abbreviations are accepted case-insensitively. */
export type EraAlias = EraRomaji | Lowercase<EraRomaji> | EraAbbr | Lowercase<EraAbbr>;

export type EraInput = EraName | EraAlias;

export interface EraDefinition {
  readonly name: EraName;
  readonly romaji: string;
  readonly abbr: string;
  /** The Gregorian year corresponding to era year 1. `gregorianYear = startYear + eraYear - 1`. */
  readonly startYear: number;
  /** First day treated as belonging to this era. For Meiji, this is the supported start date, not the actual accession date. */
  readonly from: CivilDate;
  /** Last day treated as belonging to this era. `null` for the current era. */
  readonly to: CivilDate | null;
}

/**
 * Era definitions.
 *
 * Meiji's `from` is not the actual era-change date but the start of this
 * library's support window (the day after the calendar reform). Meiji
 * years 1-5 used the old lunisolar calendar and are out of scope.
 */
export const ERAS: readonly EraDefinition[] = [
  {
    name: '明治',
    romaji: 'Meiji',
    abbr: 'M',
    startYear: 1868,
    from: { year: 1873, month: 1, day: 1 },
    to: { year: 1912, month: 7, day: 29 },
  },
  {
    name: '大正',
    romaji: 'Taisho',
    abbr: 'T',
    startYear: 1912,
    from: { year: 1912, month: 7, day: 30 },
    to: { year: 1926, month: 12, day: 24 },
  },
  {
    name: '昭和',
    romaji: 'Showa',
    abbr: 'S',
    startYear: 1926,
    from: { year: 1926, month: 12, day: 25 },
    to: { year: 1989, month: 1, day: 7 },
  },
  {
    name: '平成',
    romaji: 'Heisei',
    abbr: 'H',
    startYear: 1989,
    from: { year: 1989, month: 1, day: 8 },
    to: { year: 2019, month: 4, day: 30 },
  },
  {
    name: '令和',
    romaji: 'Reiwa',
    abbr: 'R',
    startYear: 2019,
    from: { year: 2019, month: 5, day: 1 },
    to: null,
  },
];

/** The start of the supported wareki range (Meiji 6-1-1). */
export const WAREKI_SUPPORTED_FROM: CivilDate = { year: 1873, month: 1, day: 1 };

const SUPPORTED_FROM_DAYS = daysFromCivil(1873, 1, 1);

export interface Wareki {
  readonly era: EraName;
  readonly eraRomaji: string;
  readonly eraAbbr: string;
  /** Year within the era. 1 is the first year. */
  readonly eraYear: number;
  /** `eraYear === 1`. Whether this should be written as "Gannen" (元年). */
  readonly isGannen: boolean;
  readonly month: number;
  readonly day: number;
  /** The corresponding Gregorian year. */
  readonly gregorianYear: number;
}

export type WarekiFormat = 'ja' | 'ja-numeric' | 'abbr' | 'abbr-padded';

function findEraByDate(date: CivilDate): EraDefinition {
  for (let i = ERAS.length - 1; i >= 0; i -= 1) {
    const era = ERAS[i] as EraDefinition;
    if (compareCivil(date, era.from) >= 0) return era;
  }
  // Unreachable: the SUPPORTED_FROM_DAYS check above already rules this out.
  throw new UnsupportedWarekiRangeError(
    `No era found for ${date.year}-${date.month}-${date.day}.`,
  );
}

export function toWareki(input: DateInput): Wareki {
  const date = toCivilDate(input);

  if (toDays(date) < SUPPORTED_FROM_DAYS) {
    throw new UnsupportedWarekiRangeError(
      `Outside the supported wareki range: ${date.year}-${String(date.month).padStart(2, '0')}-` +
        `${String(date.day).padStart(2, '0')}. Only Meiji 6-1-1 (1873-01-01) onward is supported; ` +
        `earlier dates used a lunisolar calendar (the Tenpō calendar) and cannot be converted directly.`,
    );
  }

  const era = findEraByDate(date);
  const eraYear = date.year - era.startYear + 1;

  return {
    era: era.name,
    eraRomaji: era.romaji,
    eraAbbr: era.abbr,
    eraYear,
    isGannen: eraYear === 1,
    month: date.month,
    day: date.day,
    gregorianYear: date.year,
  };
}

export function formatWareki(wareki: Wareki, format: WarekiFormat = 'ja'): string {
  switch (format) {
    case 'ja':
      return `${wareki.era}${wareki.isGannen ? '元' : String(wareki.eraYear)}年${wareki.month}月${wareki.day}日`;
    case 'ja-numeric':
      return `${wareki.era}${wareki.eraYear}年${wareki.month}月${wareki.day}日`;
    case 'abbr':
      return `${wareki.eraAbbr}${wareki.eraYear}.${wareki.month}.${wareki.day}`;
    case 'abbr-padded':
      return (
        `${wareki.eraAbbr}${String(wareki.eraYear).padStart(2, '0')}.` +
        `${String(wareki.month).padStart(2, '0')}.${String(wareki.day).padStart(2, '0')}`
      );
  }
}

function resolveEra(input: EraInput): EraDefinition {
  const raw = String(input).trim();
  const lowered = raw.toLowerCase();
  for (const era of ERAS) {
    if (raw === era.name || lowered === era.romaji.toLowerCase() || lowered === era.abbr.toLowerCase()) {
      return era;
    }
  }
  throw new InvalidDateInputError(
    `Unknown era: ${JSON.stringify(raw)}. ` +
      `Pass one of ${ERAS.map((era) => `${era.name}(${era.romaji}/${era.abbr})`).join(', ')}.`,
  );
}

/**
 * Renders the wareki date that actually corresponds to a civil date, as an
 * ASCII "Romaji eraYear-month-day" hint for error messages
 * (e.g. "Reiwa 1-5-1"). `null` if outside the supported range.
 */
function describeCorrectWareki(date: CivilDate): string | null {
  if (toDays(date) < SUPPORTED_FROM_DAYS) return null;
  const wareki = toWareki(date);
  return `${wareki.eraRomaji} ${wareki.eraYear}-${wareki.month}-${wareki.day}`;
}

/**
 * Converts a wareki date to a Gregorian civil date.
 *
 * `eraYear` accepts either `1` or the string `'元'` (gannen) for the first year.
 */
export function fromWareki(
  era: EraInput,
  eraYear: number | '元',
  month: number,
  day: number,
): CivilDate {
  const definition = resolveEra(era);
  const year = eraYear === '元' ? 1 : eraYear;

  if (!Number.isInteger(year) || year < 1) {
    throw new InvalidDateInputError(`Era year must be an integer >= 1: ${String(eraYear)}`);
  }
  if (!Number.isInteger(month) || !Number.isInteger(day)) {
    throw new InvalidDateInputError(`Month and day must be integers: ${String(month)}-${String(day)}`);
  }

  // The 29 days lost to the calendar reform. Meiji years 1-5 are out of
  // range too, but this span gets its own error since these dates never
  // existed at all, as opposed to merely being unsupported.
  if (definition.name === '明治' && year === 5 && month === 12 && day >= 3 && day <= 31) {
    throw new MeijiReformError(month, day);
  }

  const gregorianYear = definition.startYear + year - 1;

  if (!isValidCivil(gregorianYear, month, day)) {
    throw new InvalidWarekiDateError(
      `Date does not exist: ${definition.romaji} ${year}-${month}-${day} ` +
        `(would correspond to Gregorian ${gregorianYear}-${month}-${day}).`,
    );
  }

  const date: CivilDate = { year: gregorianYear, month, day };

  if (toDays(date) < SUPPORTED_FROM_DAYS) {
    throw new UnsupportedWarekiRangeError(
      `Outside the supported wareki range: ${definition.romaji} ${year}-${month}-${day}. ` +
        `Only Meiji 6-1-1 (1873-01-01) onward is supported; earlier dates used a lunisolar ` +
        `calendar (the Tenpō calendar), so the year/month/day cannot be mapped directly to the Gregorian calendar.`,
    );
  }

  const beforeEra = compareCivil(date, definition.from) < 0;
  const afterEra = definition.to !== null && compareCivil(date, definition.to) > 0;

  if (beforeEra || afterEra) {
    const correct = describeCorrectWareki(date);
    const hint = correct === null ? '' : ` This date falls within ${correct}.`;
    throw new InvalidWarekiDateError(
      `${definition.romaji} ${year}-${month}-${day} does not exist within the ${definition.romaji} era.${hint}`,
    );
  }

  return date;
}
