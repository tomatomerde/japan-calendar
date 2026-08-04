/**
 * 公開APIが受け取る日付入力を、内部表現の `CivilDate` に正規化する。
 *
 * **タイムゾーンの扱いはここに集約されている。** `Date`（＝ある瞬間）を
 * 受け取ったときだけ「その瞬間を JST で見た日付」に落とす。それ以外の
 * 入力（暦日文字列・オブジェクト）はもともとタイムゾーンを持たないので
 * そのまま暦日として扱う。
 */

import { civilFromDays, isValidCivil, type CivilDate } from './civil.js';
import { InvalidDateInputError } from './errors.js';

/** JST は UTC+9 固定。日本には夏時間がないので、この定数で足りる。 */
const JST_OFFSET_MS = 9 * 60 * 60 * 1000;
const MS_PER_DAY = 86_400_000;

/**
 * 受け付ける日付入力。
 *
 * - `CivilDate` — `{ year, month, day }`。タイムゾーンの概念なし。
 * - `string` — `YYYY-MM-DD` は暦日としてそのまま解釈する。
 *   時刻やオフセットを含む ISO 8601 文字列（`2019-05-01T00:00:00Z` など）は
 *   「瞬間」として解釈し、JST に変換してから日付を取る。
 * - `Date` — 瞬間。JST に変換してから日付を取る。
 */
export type DateInput = CivilDate | string | Date;

const CALENDAR_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** 瞬間（epoch ミリ秒）を JST の暦日に落とす。 */
export function civilFromInstant(epochMs: number): CivilDate {
  if (!Number.isFinite(epochMs)) {
    throw new InvalidDateInputError(`日付として解釈できない値: ${String(epochMs)}`);
  }
  // UTC の瞬間を +9h ずらしてから日単位で切り捨てる。floor なので
  // 1970年より前（負の通日）でも正しく前日側に丸まる。
  return civilFromDays(Math.floor((epochMs + JST_OFFSET_MS) / MS_PER_DAY));
}

function isCivilDateLike(value: unknown): value is CivilDate {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate['year'] === 'number' &&
    typeof candidate['month'] === 'number' &&
    typeof candidate['day'] === 'number'
  );
}

export function toCivilDate(input: DateInput): CivilDate {
  if (input instanceof Date) {
    const epochMs = input.getTime();
    if (Number.isNaN(epochMs)) {
      throw new InvalidDateInputError('Invalid Date が渡された。');
    }
    return civilFromInstant(epochMs);
  }

  if (typeof input === 'string') {
    const matched = CALENDAR_DATE.exec(input);
    if (matched !== null) {
      const year = Number(matched[1]);
      const month = Number(matched[2]);
      const day = Number(matched[3]);
      if (!isValidCivil(year, month, day)) {
        throw new InvalidDateInputError(`存在しない日付: ${input}`);
      }
      return { year, month, day };
    }

    // 時刻を含む ISO 8601 は「瞬間」として解釈する。
    const parsed = Date.parse(input);
    if (Number.isNaN(parsed)) {
      throw new InvalidDateInputError(
        `日付として解釈できない文字列: ${JSON.stringify(input)}。` +
          `YYYY-MM-DD 形式か ISO 8601 の日時を渡すこと。`,
      );
    }
    return civilFromInstant(parsed);
  }

  if (isCivilDateLike(input)) {
    const { year, month, day } = input;
    if (!isValidCivil(year, month, day)) {
      throw new InvalidDateInputError(`存在しない日付: ${year}-${month}-${day}`);
    }
    return { year, month, day };
  }

  throw new InvalidDateInputError(
    `日付として解釈できない値: ${String(input)}。` +
      `Date / YYYY-MM-DD 文字列 / { year, month, day } のいずれかを渡すこと。`,
  );
}
