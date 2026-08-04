import type { CivilDate } from './civil.js';

/**
 * 祝日の区分。
 *
 * - `statutory` — 祝日法・特例法で日付が直接定められている祝日
 *   （ハッピーマンデーや春分/秋分、一回限りの特例日を含む）
 * - `substitute` — 振替休日（祝日が日曜日と重なったことによる休日）
 * - `bridge` — 国民の休日（前後を祝日に挟まれた平日）
 */
export type HolidayCategory = 'statutory' | 'substitute' | 'bridge';

export interface Holiday {
  readonly date: CivilDate;
  readonly name: string;
  readonly category: HolidayCategory;
  /**
   * 官報で正式決定済みかどうか。春分の日・秋分の日は前年2月の暦要項で
   * 正式決定されるため、それ以降の年は近似式による暫定値になる。
   * 振替休日・国民の休日は、依存する祝日の confirmed をそのまま継承する。
   */
  readonly confirmed: boolean;
}
