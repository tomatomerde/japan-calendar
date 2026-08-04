/**
 * japan-calendar — A zero-dependency library for Japanese holidays,
 * business days, and wareki (Japanese era) date conversion.
 */

export {
  addDays,
  civilFromDays,
  compareCivil,
  daysFromCivil,
  daysInMonth,
  isLeapYear,
  isSameCivil,
  isValidCivil,
  isWeekend,
  nthWeekdayOfMonth,
  toDays,
  toIsoDate,
  weekdayOf,
  type CivilDate,
  type Weekday,
} from './civil.js';

export { civilFromInstant, toCivilDate, type DateInput } from './input.js';

export {
  InvalidDateInputError,
  InvalidWarekiDateError,
  JapanCalendarError,
  MeijiReformError,
  OutOfRangeError,
  UnsupportedWarekiRangeError,
} from './errors.js';

export {
  ERAS,
  WAREKI_SUPPORTED_FROM,
  formatWareki,
  fromWareki,
  toWareki,
  type EraAlias,
  type EraDefinition,
  type EraInput,
  type EraName,
  type Wareki,
  type WarekiFormat,
} from './wareki.js';

export { OFFICIAL_META } from './data/official.js';
export type { OfficialHolidayRow, OfficialMeta } from './data/official-types.js';

export {
  MAX_SUPPORTED_YEAR,
  MIN_SUPPORTED_YEAR,
  holidaysForYear,
  isHoliday,
  statutoryHolidaysForYear,
} from './holidays.js';
export type { Holiday, HolidayCategory } from './types.js';

export { addBusinessDays, businessDaysBetween, isBusinessDay, type CalendarKind } from './businessDays.js';
