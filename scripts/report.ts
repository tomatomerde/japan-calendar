/**
 * 焼き込み済みの公式データ（src/data/official.ts）を集計して標準出力に出す。
 *
 * ネットワークを使わないので、どの環境でも実行できる。
 *   node scripts/report.ts
 */

import { OFFICIAL_HOLIDAYS, OFFICIAL_META } from '../src/data/official.ts';
import type { OfficialHolidayRow, OfficialMeta } from '../src/data/official-types.ts';

const VERNAL = '春分の日';
const AUTUMNAL = '秋分の日';

export interface Anomaly {
  readonly kind: 'duplicate' | 'invalid-date' | 'out-of-order' | 'empty-name';
  readonly detail: string;
}

/** 日付文字列が実在するグレゴリオ暦日か（`YYYY-MM-DD` 前提）。 */
function isRealDate(iso: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (m === null) return false;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (month < 1 || month > 12 || day < 1) return false;
  const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  const lengths = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day <= (lengths[month - 1] as number);
}

/**
 * 「春分の日」と「秋分の日」を両方含む最大の年。
 * 片方しか無い年を確定扱いしないため、両方揃っていることを条件にする。
 */
export function computeEquinoxConfirmedThrough(rows: readonly OfficialHolidayRow[]): number | null {
  const vernal = new Set<number>();
  const autumnal = new Set<number>();
  for (const [date, name] of rows) {
    const year = Number(date.slice(0, 4));
    if (name === VERNAL) vernal.add(year);
    else if (name === AUTUMNAL) autumnal.add(year);
  }
  let best: number | null = null;
  for (const year of vernal) {
    if (autumnal.has(year) && (best === null || year > best)) best = year;
  }
  return best;
}

/** 並び順・重複・日付妥当性の検査。 */
export function findAnomalies(rows: readonly OfficialHolidayRow[]): Anomaly[] {
  const anomalies: Anomaly[] = [];
  const seen = new Set<string>();
  let previous = '';
  for (const [date, name] of rows) {
    if (!isRealDate(date)) {
      anomalies.push({ kind: 'invalid-date', detail: `${date} (${name})` });
    }
    if (seen.has(date)) {
      anomalies.push({ kind: 'duplicate', detail: `${date} (${name})` });
    }
    seen.add(date);
    if (previous !== '' && date <= previous) {
      anomalies.push({ kind: 'out-of-order', detail: `${previous} の次に ${date}` });
    }
    previous = date;
    if (name.length === 0) {
      anomalies.push({ kind: 'empty-name', detail: date });
    }
  }
  return anomalies;
}

export function renderReport(rows: readonly OfficialHolidayRow[], meta: OfficialMeta): string {
  const out: string[] = [];
  const push = (line = ''): void => void out.push(line);

  push('=== 内閣府 syukujitsu.csv パース結果 ===');
  push();
  push(`取得元      : ${meta.sourceUrl}`);
  push(`取得日時    : ${meta.fetchedAt ?? '(未取得)'}`);
  push(`CSV SHA-256 : ${meta.sha256 ?? '(未取得)'}`);
  push(`総件数      : ${rows.length}`);

  if (rows.length === 0) {
    push();
    push('データが未取得です。GitHub Actions の "Update holiday data" ワークフローを');
    push('workflow_dispatch で実行してください（開発環境からは cao.go.jp に到達できません）。');
    return out.join('\n');
  }

  const byYear = new Map<number, number>();
  for (const [date] of rows) {
    const year = Number(date.slice(0, 4));
    byYear.set(year, (byYear.get(year) ?? 0) + 1);
  }
  const years = [...byYear.keys()].sort((a, b) => a - b);
  const firstYear = years[0] as number;
  const lastYear = years[years.length - 1] as number;

  push(`最古年      : ${firstYear}`);
  push(`最新年      : ${lastYear}`);
  push(`収録年数    : ${years.length}`);

  const missing = [];
  for (let y = firstYear; y <= lastYear; y += 1) {
    if (!byYear.has(y)) missing.push(y);
  }
  push(`欠落年      : ${missing.length === 0 ? 'なし' : missing.join(', ')}`);

  push();
  push('--- 確定/暫定の境界年 ---');
  const boundary = computeEquinoxConfirmedThrough(rows);
  push(`EQUINOX_CONFIRMED_THROUGH = ${boundary ?? '(判定不能)'}`);
  push('（「春分の日」と「秋分の日」を両方含む最大の年）');
  if (boundary !== null && boundary < lastYear) {
    push(`注意: 収録最新年 ${lastYear} は春分/秋分が揃っていないため境界に採用していない。`);
  }

  push();
  push('--- 年ごとの件数 ---');
  for (const year of years) {
    const count = byYear.get(year) as number;
    push(`${year}: ${String(count).padStart(2, ' ')}  ${'#'.repeat(count)}`);
  }

  push();
  push('--- 出現する名称 ---');
  interface NameStat {
    count: number;
    first: number;
    last: number;
  }
  const byName = new Map<string, NameStat>();
  for (const [date, name] of rows) {
    const year = Number(date.slice(0, 4));
    const stat = byName.get(name);
    if (stat === undefined) {
      byName.set(name, { count: 1, first: year, last: year });
    } else {
      stat.count += 1;
      if (year < stat.first) stat.first = year;
      if (year > stat.last) stat.last = year;
    }
  }
  const names = [...byName.entries()].sort((a, b) => b[1].count - a[1].count);
  const width = Math.max(...names.map(([name]) => [...name].length));
  push(`名称の種類  : ${names.length}`);
  push();
  for (const [name, stat] of names) {
    const padding = ' '.repeat(width - [...name].length);
    push(`${name}${padding}  ${String(stat.count).padStart(4, ' ')}件  ${stat.first}〜${stat.last}`);
  }

  push();
  push('--- 整合性チェック ---');
  const anomalies = findAnomalies(rows);
  if (anomalies.length === 0) {
    push('問題なし（重複なし・日付妥当・昇順）');
  } else {
    for (const anomaly of anomalies) {
      push(`[${anomaly.kind}] ${anomaly.detail}`);
    }
  }

  return out.join('\n');
}

if (import.meta.filename === process.argv[1]) {
  console.log(renderReport(OFFICIAL_HOLIDAYS, OFFICIAL_META));
}
