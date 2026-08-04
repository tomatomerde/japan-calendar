/**
 * `official.ts`（生成物）が満たす型。手書きファイル。
 */

/** `[ISO 8601 の日付, 内閣府CSV上の名称]`。日付昇順・重複なし。 */
export type OfficialHolidayRow = readonly [date: string, name: string];

export interface OfficialMeta {
  /** データを取得した時刻（ISO 8601 / UTC）。未取得なら null。 */
  readonly fetchedAt: string | null;
  /** 取得元URL。 */
  readonly sourceUrl: string;
  /** 取得した生CSV（Shift-JIS のまま）の SHA-256。差分検知用。 */
  readonly sha256: string | null;
  /** 収録されている最古の年。未取得なら null。 */
  readonly firstYear: number | null;
  /** 収録されている最新の年。未取得なら null。 */
  readonly lastYear: number | null;
  /**
   * 春分の日・秋分の日が官報「暦要項」で正式決定済みといえる最終年。
   *
   * 「春分の日」と「秋分の日」を **両方** 含む最大の年として実データから算出する。
   * 片方しか無い年（＝年途中で部分的に追記された状態）を誤って確定扱いしないための条件。
   * この年以前の春分/秋分は `confirmed: true`、これより後は `confirmed: false`。
   */
  readonly equinoxConfirmedThrough: number | null;
}
