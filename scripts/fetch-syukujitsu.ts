/**
 * Fetches the Cabinet Office's `syukujitsu.csv` ("National Holidays") and
 * writes out `src/data/official.ts` (a generated file).
 *
 *   node scripts/fetch-syukujitsu.ts
 *
 * The CSV is Shift-JIS, CRLF-terminated, and has 2 columns (date, name).
 * Licensed under CC BY 4.0 (Japan's Standard Terms of Use for Government
 * Websites).
 *
 * This script needs external network access. The dev environment's egress
 * policy blocks cao.go.jp, so this runs on a GitHub Actions runner instead.
 */

import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { OFFICIAL_HOLIDAYS, OFFICIAL_META } from '../src/data/official.ts';
import type { OfficialHolidayRow } from '../src/data/official-types.ts';
import { computeEquinoxConfirmedThrough, findAnomalies, renderReport } from './report.ts';

const SOURCE_URL = 'https://www8.cao.go.jp/chosei/shukujitsu/syukujitsu.csv';
const OUTPUT_PATH = fileURLToPath(new URL('../src/data/official.ts', import.meta.url));
const FETCH_TIMEOUT_MS = 30_000;

/** Lower/upper bounds used to sanity-check the fetch, so an error page never gets baked in as data. */
const SANITY = {
  minRows: 500,
  maxFirstYear: 1960,
  minLastYear: 2020,
} as const;

/**
 * Absolute floors alone can't catch a *regression*: if the upstream file
 * were ever republished missing its most recent years, the result would
 * still clear every threshold above while silently walking
 * `equinoxConfirmedThrough` backwards -- which flips `confirmed` from
 * `true` to `false` for dates that were previously finalized. Since the
 * data only ever grows in practice, refuse to shrink it, and require an
 * explicit override for the rare legitimate case (an upstream correction
 * that genuinely removes rows).
 */
const ALLOW_SHRINK = process.env['ALLOW_DATA_SHRINK'] === '1';

function assertNoRegression(rows: readonly OfficialHolidayRow[]): void {
  const previousRowCount = OFFICIAL_HOLIDAYS.length;
  const previousLastYear = OFFICIAL_META.lastYear;
  // Nothing to compare against on the very first run.
  if (previousRowCount === 0 || previousLastYear === null) return;

  const lastYear = Number((rows[rows.length - 1] as OfficialHolidayRow)[0].slice(0, 4));
  const problems: string[] = [];
  if (rows.length < previousRowCount) {
    problems.push(`row count went down: ${previousRowCount} -> ${rows.length}`);
  }
  if (lastYear < previousLastYear) {
    problems.push(`latest year went down: ${previousLastYear} -> ${lastYear}`);
  }
  if (problems.length === 0) return;

  if (ALLOW_SHRINK) {
    console.warn(`WARNING: data shrank, continuing because ALLOW_DATA_SHRINK=1:\n  ${problems.join('\n  ')}`);
    return;
  }
  throw new Error(
    `The fetched data is smaller than what is already committed:\n  ${problems.join('\n  ')}\n` +
      `This would silently downgrade 'confirmed' for dates that are currently finalized. ` +
      `If the upstream file really did shrink, re-run with ALLOW_DATA_SHRINK=1.`,
  );
}

/** Trims surrounding whitespace, including the U+3000 full-width space. */
function trimJa(value: string): string {
  return value.replace(/^[\s　]+|[\s　]+$/g, '');
}

/** Normalizes `YYYY/M/D` to `YYYY-MM-DD`. Returns `null` if the format doesn't match. */
function normalizeDate(raw: string): string | null {
  const m = /^(\d{4})\/(\d{1,2})\/(\d{1,2})$/.exec(trimJa(raw));
  if (m === null) return null;
  return `${m[1]}-${(m[2] as string).padStart(2, '0')}-${(m[3] as string).padStart(2, '0')}`;
}

export function parseCsv(text: string): OfficialHolidayRow[] {
  const rows: OfficialHolidayRow[] = [];
  const lines = text.replace(/^﻿/, '').split(/\r?\n/);

  for (const line of lines) {
    if (trimJa(line) === '') continue;

    const comma = line.indexOf(',');
    if (comma === -1) continue;

    const date = normalizeDate(line.slice(0, comma));
    // Any line whose date can't be parsed is treated as the header row
    // ("National Holidays / Observances, Date, ...") and discarded.
    if (date === null) continue;

    const name = trimJa(line.slice(comma + 1)).replace(/^"(.*)"$/, '$1');
    rows.push([date, name] as const);
  }

  rows.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  return rows;
}

export function assertSane(rows: readonly OfficialHolidayRow[]): void {
  if (rows.length < SANITY.minRows) {
    throw new Error(`Too few rows (${rows.length} < ${SANITY.minRows}). The fetched content looks suspect.`);
  }
  const firstYear = Number((rows[0] as OfficialHolidayRow)[0].slice(0, 4));
  const lastYear = Number((rows[rows.length - 1] as OfficialHolidayRow)[0].slice(0, 4));
  if (firstYear > SANITY.maxFirstYear) {
    throw new Error(`Earliest year is too recent (${firstYear} > ${SANITY.maxFirstYear}).`);
  }
  if (lastYear < SANITY.minLastYear) {
    throw new Error(`Latest year is too old (${lastYear} < ${SANITY.minLastYear}).`);
  }
  const anomalies = findAnomalies(rows);
  if (anomalies.length > 0) {
    const detail = anomalies.map((a) => `[${a.kind}] ${a.detail}`).join('\n  ');
    throw new Error(`Parsed result has anomalies:\n  ${detail}`);
  }
  if (computeEquinoxConfirmedThrough(rows) === null) {
    throw new Error('Could not find Vernal/Autumnal Equinox Day. The name format may have changed.');
  }
  assertNoRegression(rows);
}

function renderModule(rows: readonly OfficialHolidayRow[], sha256: string, fetchedAt: string): string {
  const years = new Set(rows.map(([date]) => Number(date.slice(0, 4))));
  const firstYear = Math.min(...years);
  const lastYear = Math.max(...years);
  const boundary = computeEquinoxConfirmedThrough(rows) as number;

  const entries = rows.map(([date, name]) => `  ['${date}', '${name}'],`).join('\n');

  return `// ---------------------------------------------------------------------------
// Generated file. Do not edit by hand.
// Regenerate with: node scripts/fetch-syukujitsu.ts
// Source: Cabinet Office, "National Holidays" (syukujitsu.csv)
// License: CC BY 4.0 (Standard Terms of Use for Government Websites, v2.0)
// ---------------------------------------------------------------------------

import type { OfficialHolidayRow, OfficialMeta } from './official-types.js';

export const OFFICIAL_HOLIDAYS: readonly OfficialHolidayRow[] = [
${entries}
];

export const OFFICIAL_META: OfficialMeta = {
  fetchedAt: '${fetchedAt}',
  sourceUrl: '${SOURCE_URL}',
  sha256: '${sha256}',
  firstYear: ${firstYear},
  lastYear: ${lastYear},
  equinoxConfirmedThrough: ${boundary},
};
`;
}

async function main(): Promise<void> {
  console.log(`Fetching: ${SOURCE_URL}`);
  const response = await fetch(SOURCE_URL, {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    headers: { 'user-agent': 'japan-calendar data updater (+https://github.com/tomatomerde/japan-calendar)' },
  });
  if (!response.ok) {
    throw new Error(`Fetch failed: HTTP ${response.status} ${response.statusText}`);
  }

  const bytes = new Uint8Array(await response.arrayBuffer());
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  console.log(`Received: ${bytes.length} bytes / sha256=${sha256}`);

  // Shift-JIS. Node ships with full-icu, so TextDecoder can decode it directly.
  const text = new TextDecoder('shift_jis', { fatal: true }).decode(bytes);

  const rows = parseCsv(text);
  assertSane(rows);

  const fetchedAt = new Date().toISOString();
  writeFileSync(OUTPUT_PATH, renderModule(rows, sha256, fetchedAt), 'utf8');
  console.log(`Wrote: ${OUTPUT_PATH}`);
  console.log();

  console.log(
    renderReport(rows, {
      fetchedAt,
      sourceUrl: SOURCE_URL,
      sha256,
      firstYear: Math.min(...rows.map(([date]) => Number(date.slice(0, 4)))),
      lastYear: Math.max(...rows.map(([date]) => Number(date.slice(0, 4)))),
      equinoxConfirmedThrough: computeEquinoxConfirmedThrough(rows),
    }),
  );
}

// Only fetches when run directly (so `parseCsv` can be imported from tests).
if (import.meta.filename === process.argv[1]) {
  await main();
}
