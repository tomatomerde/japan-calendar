/**
 * 和暦（元号）とグレゴリオ暦の相互変換。
 *
 * 対応範囲は **明治6年1月1日（1873-01-01）以降**。それより前は太陰太陽暦
 * （天保暦）で運用されており、グレゴリオ暦との単純な写像では変換できない。
 *
 * 改元日は新元号側に属する。1989-01-07 は昭和64年1月7日、翌 1989-01-08 は
 * 平成元年1月8日になる。**改元で変わるのは元号と年だけで、月日はそのまま
 * 引き継がれる**（「平成元年1月1日」のような日付にはならない）。
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

export type EraName = '明治' | '大正' | '昭和' | '平成' | '令和';

type EraRomaji = 'Meiji' | 'Taisho' | 'Showa' | 'Heisei' | 'Reiwa';
type EraAbbr = 'M' | 'T' | 'S' | 'H' | 'R';

/** 元号の別名。ローマ字と略号は大文字小文字を区別せずに受け付ける。 */
export type EraAlias = EraRomaji | Lowercase<EraRomaji> | EraAbbr | Lowercase<EraAbbr>;

export type EraInput = EraName | EraAlias;

export interface EraDefinition {
  readonly name: EraName;
  readonly romaji: string;
  readonly abbr: string;
  /** 元年に対応する西暦年。`西暦 = startYear + 元号年 - 1`。 */
  readonly startYear: number;
  /** この元号として扱う最初の日。明治のみ、改暦後のサポート開始日を入れている。 */
  readonly from: CivilDate;
  /** この元号として扱う最後の日。現行元号は null。 */
  readonly to: CivilDate | null;
}

/**
 * 元号の定義。
 *
 * 明治の `from` は実際の改元日ではなくサポート開始日（改暦後の最初の日）。
 * 明治元年〜5年は旧暦なので、このライブラリでは扱わない。
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

/** 和暦の対応開始日（明治6年1月1日）。 */
export const WAREKI_SUPPORTED_FROM: CivilDate = { year: 1873, month: 1, day: 1 };

const SUPPORTED_FROM_DAYS = daysFromCivil(1873, 1, 1);

export interface Wareki {
  readonly era: EraName;
  readonly eraRomaji: string;
  readonly eraAbbr: string;
  /** 元号の年。1 は元年。 */
  readonly eraYear: number;
  /** `eraYear === 1`。「元年」と表記すべきか。 */
  readonly isGannen: boolean;
  readonly month: number;
  readonly day: number;
  /** 対応する西暦年。 */
  readonly gregorianYear: number;
}

export type WarekiFormat = 'ja' | 'ja-numeric' | 'abbr' | 'abbr-padded';

function findEraByDate(date: CivilDate): EraDefinition {
  for (let i = ERAS.length - 1; i >= 0; i -= 1) {
    const era = ERAS[i] as EraDefinition;
    if (compareCivil(date, era.from) >= 0) return era;
  }
  // SUPPORTED_FROM_DAYS の検査を先に通しているのでここには来ない。
  throw new UnsupportedWarekiRangeError(
    `${date.year}-${date.month}-${date.day} に対応する元号が見つからない。`,
  );
}

export function toWareki(input: DateInput): Wareki {
  const date = toCivilDate(input);

  if (toDays(date) < SUPPORTED_FROM_DAYS) {
    throw new UnsupportedWarekiRangeError(
      `和暦の対応範囲外: ${date.year}-${String(date.month).padStart(2, '0')}-` +
        `${String(date.day).padStart(2, '0')}。明治6年1月1日（1873-01-01）以降のみ対応する。` +
        `それ以前は太陰太陽暦（天保暦）で運用されており、単純な変換ができない。`,
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
    `未知の元号: ${JSON.stringify(raw)}。` +
      `${ERAS.map((era) => `${era.name}(${era.romaji}/${era.abbr})`).join(', ')} のいずれかを渡すこと。`,
  );
}

/**
 * その日付を正しく表す和暦を文字列で返す。エラーメッセージ用のヒント。
 * 対応範囲外なら null。
 */
function describeCorrectWareki(date: CivilDate): string | null {
  if (toDays(date) < SUPPORTED_FROM_DAYS) return null;
  return formatWareki(toWareki(date));
}

/**
 * 和暦から西暦の暦日に変換する。
 *
 * `eraYear` には元年を表す `1` または文字列 `'元'` を渡せる。
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
    throw new InvalidDateInputError(`元号年は1以上の整数でなければならない: ${String(eraYear)}`);
  }
  if (!Number.isInteger(month) || !Number.isInteger(day)) {
    throw new InvalidDateInputError(`月日は整数でなければならない: ${String(month)}月${String(day)}日`);
  }

  // 改暦で失われた29日間。明治1〜5年は範囲外だが、この期間は
  // 「そもそも存在しない日付」なので専用のエラーで区別する。
  if (definition.name === '明治' && year === 5 && month === 12 && day >= 3 && day <= 31) {
    throw new MeijiReformError(month, day);
  }

  const gregorianYear = definition.startYear + year - 1;

  if (!isValidCivil(gregorianYear, month, day)) {
    throw new InvalidWarekiDateError(
      `存在しない日付: ${definition.name}${year}年${month}月${day}日` +
        `（西暦${gregorianYear}年${month}月${day}日に相当）。`,
    );
  }

  const date: CivilDate = { year: gregorianYear, month, day };

  if (toDays(date) < SUPPORTED_FROM_DAYS) {
    throw new UnsupportedWarekiRangeError(
      `和暦の対応範囲外: ${definition.name}${year}年${month}月${day}日。` +
        `明治6年1月1日（1873-01-01）以降のみ対応する。` +
        `それ以前は太陰太陽暦（天保暦）で運用されており、年月日をそのまま` +
        `グレゴリオ暦に読み替えることができない。`,
    );
  }

  const beforeEra = compareCivil(date, definition.from) < 0;
  const afterEra = definition.to !== null && compareCivil(date, definition.to) > 0;

  if (beforeEra || afterEra) {
    const correct = describeCorrectWareki(date);
    const hint = correct === null ? '' : ` この日は ${correct} にあたる。`;
    throw new InvalidWarekiDateError(
      `${definition.name}${year}年${month}月${day}日は${definition.name}の期間内に存在しない。${hint}`,
    );
  }

  return date;
}
