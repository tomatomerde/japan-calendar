/**
 * Summarizes the baked-in official data (src/data/official.ts) to stdout.
 *
 * Uses no network access, so it can run in any environment.
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

/** Whether a date string is a real Gregorian calendar date (assumes `YYYY-MM-DD`). */
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
 * The latest year that includes both "Vernal Equinox Day" and "Autumnal
 * Equinox Day". Requiring both present avoids treating a year with only
 * one of them as finalized.
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

/** Checks ordering, duplicates, and date validity. */
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
      anomalies.push({ kind: 'out-of-order', detail: `${date} comes after ${previous}` });
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

  push('=== Cabinet Office syukujitsu.csv parse results ===');
  push();
  push(`Source        : ${meta.sourceUrl}`);
  push(`Fetched at    : ${meta.fetchedAt ?? '(not fetched)'}`);
  push(`CSV SHA-256   : ${meta.sha256 ?? '(not fetched)'}`);
  push(`Total rows    : ${rows.length}`);

  if (rows.length === 0) {
    push();
    push('No data has been fetched yet. Run the "Update holiday data" GitHub Actions');
    push('workflow via workflow_dispatch (cao.go.jp is unreachable from the dev environment).');
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

  push(`First year    : ${firstYear}`);
  push(`Last year     : ${lastYear}`);
  push(`Years covered : ${years.length}`);

  const missing = [];
  for (let y = firstYear; y <= lastYear; y += 1) {
    if (!byYear.has(y)) missing.push(y);
  }
  push(`Missing years : ${missing.length === 0 ? 'none' : missing.join(', ')}`);

  push();
  push('--- Confirmed/tentative boundary year ---');
  const boundary = computeEquinoxConfirmedThrough(rows);
  push(`EQUINOX_CONFIRMED_THROUGH = ${boundary ?? '(could not determine)'}`);
  push('(the latest year that includes both Vernal Equinox Day and Autumnal Equinox Day)');
  if (boundary !== null && boundary < lastYear) {
    push(`Note: the latest year covered (${lastYear}) doesn't have both equinox dates, so it wasn't used as the boundary.`);
  }

  push();
  push('--- Rows per year ---');
  for (const year of years) {
    const count = byYear.get(year) as number;
    push(`${year}: ${String(count).padStart(2, ' ')}  ${'#'.repeat(count)}`);
  }

  push();
  push('--- Names observed ---');
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
  push(`Distinct names: ${names.length}`);
  push();
  for (const [name, stat] of names) {
    const padding = ' '.repeat(width - [...name].length);
    push(`${name}${padding}  ${String(stat.count).padStart(4, ' ')}x  ${stat.first}-${stat.last}`);
  }

  push();
  push('--- Consistency checks ---');
  const anomalies = findAnomalies(rows);
  if (anomalies.length === 0) {
    push('No issues (no duplicates, valid dates, ascending order)');
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
