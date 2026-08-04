/**
 * Types satisfied by `official.ts` (a generated file). This file is hand-written.
 */

/** `[ISO 8601 date, name as recorded in the Cabinet Office CSV]`. Ascending by date, no duplicates. */
export type OfficialHolidayRow = readonly [date: string, name: string];

export interface OfficialMeta {
  /** When the data was fetched (ISO 8601 / UTC). `null` if never fetched. */
  readonly fetchedAt: string | null;
  /** Source URL. */
  readonly sourceUrl: string;
  /** SHA-256 of the raw fetched CSV (still Shift-JIS). Used to detect changes. */
  readonly sha256: string | null;
  /** Earliest year covered. `null` if never fetched. */
  readonly firstYear: number | null;
  /** Latest year covered. `null` if never fetched. */
  readonly lastYear: number | null;
  /**
   * The last year for which Vernal Equinox Day and Autumnal Equinox Day
   * can be considered officially finalized in the Official Gazette's
   * "Calendrical Data" (暦要項).
   *
   * Computed from the real data as the latest year that includes **both**
   * "Vernal Equinox Day" and "Autumnal Equinox Day", so a year with only
   * one of them (i.e. one that was partially appended mid-year) is never
   * mistakenly treated as finalized. Equinox dates up to and including
   * this year are `confirmed: true`; beyond it, `confirmed: false`.
   */
  readonly equinoxConfirmedThrough: number | null;
}
