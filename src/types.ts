import type { CivilDate } from './civil.js';

/**
 * A holiday's category.
 *
 * - `statutory` — A holiday whose date is directly set by the Public
 *   Holiday Law or a special law (including Happy Monday holidays, the
 *   equinox holidays, and one-off special holidays).
 * - `substitute` — A substitute holiday (振替休日), granted because a
 *   holiday fell on a Sunday.
 * - `bridge` — A national holiday (国民の休日), a weekday sandwiched
 *   between two holidays.
 */
export type HolidayCategory = 'statutory' | 'substitute' | 'bridge';

export interface Holiday {
  readonly date: CivilDate;
  readonly name: string;
  readonly category: HolidayCategory;
  /**
   * Whether this date has been officially finalized in the Official
   * Gazette. The equinox holidays (Vernal/Autumnal Equinox Day) are
   * finalized in the "Calendrical Data" (暦要項) published in February of
   * the preceding year, so years beyond that are tentative values from an
   * approximation formula. Substitute holidays and national holidays
   * inherit `confirmed` from the holiday(s) they depend on.
   */
  readonly confirmed: boolean;
}
