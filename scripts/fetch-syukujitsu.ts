/**
 * 内閣府「国民の祝日について」の syukujitsu.csv を取得し、
 * src/data/official.ts（生成物）を書き出す。
 *
 *   node scripts/fetch-syukujitsu.ts
 *
 * CSV は Shift-JIS・CRLF・2列（日付, 名称）。
 * ライセンスは CC BY 4.0（政府標準利用規約）。
 *
 * このスクリプトは外部ネットワークを使う。開発環境では egress ポリシーにより
 * cao.go.jp が遮断されているため、実行は GitHub Actions ランナー上で行う。
 */

import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { OfficialHolidayRow } from '../src/data/official-types.ts';
import { computeEquinoxConfirmedThrough, findAnomalies, renderReport } from './report.ts';

const SOURCE_URL = 'https://www8.cao.go.jp/chosei/shukujitsu/syukujitsu.csv';
const OUTPUT_PATH = fileURLToPath(new URL('../src/data/official.ts', import.meta.url));
const FETCH_TIMEOUT_MS = 30_000;

/** 取得結果が壊れていないかの下限。エラーページを焼き込む事故を防ぐ。 */
const SANITY = {
  minRows: 500,
  maxFirstYear: 1960,
  minLastYear: 2020,
} as const;

/** 前後の空白（U+3000 の全角スペース含む）を落とす。 */
function trimJa(value: string): string {
  return value.replace(/^[\s　]+|[\s　]+$/g, '');
}

/** `YYYY/M/D` を `YYYY-MM-DD` に正規化する。形式が違えば null。 */
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
    // 日付として読めない行はヘッダ（「国民の祝日・休日月日,…」）とみなして捨てる。
    if (date === null) continue;

    const name = trimJa(line.slice(comma + 1)).replace(/^"(.*)"$/, '$1');
    rows.push([date, name] as const);
  }

  rows.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  return rows;
}

function assertSane(rows: readonly OfficialHolidayRow[]): void {
  if (rows.length < SANITY.minRows) {
    throw new Error(`件数が少なすぎる (${rows.length} < ${SANITY.minRows})。取得内容を疑うこと。`);
  }
  const firstYear = Number((rows[0] as OfficialHolidayRow)[0].slice(0, 4));
  const lastYear = Number((rows[rows.length - 1] as OfficialHolidayRow)[0].slice(0, 4));
  if (firstYear > SANITY.maxFirstYear) {
    throw new Error(`最古年が新しすぎる (${firstYear} > ${SANITY.maxFirstYear})。`);
  }
  if (lastYear < SANITY.minLastYear) {
    throw new Error(`最新年が古すぎる (${lastYear} < ${SANITY.minLastYear})。`);
  }
  const anomalies = findAnomalies(rows);
  if (anomalies.length > 0) {
    const detail = anomalies.map((a) => `[${a.kind}] ${a.detail}`).join('\n  ');
    throw new Error(`パース結果に異常がある:\n  ${detail}`);
  }
  if (computeEquinoxConfirmedThrough(rows) === null) {
    throw new Error('春分の日・秋分の日が見つからない。名称の表記が変わった可能性がある。');
  }
}

function renderModule(rows: readonly OfficialHolidayRow[], sha256: string, fetchedAt: string): string {
  const years = new Set(rows.map(([date]) => Number(date.slice(0, 4))));
  const firstYear = Math.min(...years);
  const lastYear = Math.max(...years);
  const boundary = computeEquinoxConfirmedThrough(rows) as number;

  const entries = rows.map(([date, name]) => `  ['${date}', '${name}'],`).join('\n');

  return `// ---------------------------------------------------------------------------
// 生成ファイル。手で編集しない。
// 再生成: node scripts/fetch-syukujitsu.ts
// 出典: 内閣府「国民の祝日について」syukujitsu.csv
// ライセンス: CC BY 4.0（政府標準利用規約 第2.0版）
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
  console.log(`取得中: ${SOURCE_URL}`);
  const response = await fetch(SOURCE_URL, {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    headers: { 'user-agent': 'japan-calendar data updater (+https://github.com/tomatomerde/japan-calendar)' },
  });
  if (!response.ok) {
    throw new Error(`取得に失敗: HTTP ${response.status} ${response.statusText}`);
  }

  const bytes = new Uint8Array(await response.arrayBuffer());
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  console.log(`受信: ${bytes.length} バイト / sha256=${sha256}`);

  // Shift-JIS。Node は full-icu 同梱なので TextDecoder で直接デコードできる。
  const text = new TextDecoder('shift_jis', { fatal: true }).decode(bytes);

  const rows = parseCsv(text);
  assertSane(rows);

  const fetchedAt = new Date().toISOString();
  writeFileSync(OUTPUT_PATH, renderModule(rows, sha256, fetchedAt), 'utf8');
  console.log(`書き出し: ${OUTPUT_PATH}`);
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

// 直接実行されたときだけ取得しに行く（parseCsv をテストから import できるようにするため）。
if (import.meta.filename === process.argv[1]) {
  await main();
}
