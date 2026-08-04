// ---------------------------------------------------------------------------
// 生成ファイル。手で編集しない。
// 再生成: node scripts/fetch-syukujitsu.ts
// 出典: 内閣府「国民の祝日について」syukujitsu.csv (CC BY 4.0)
// ---------------------------------------------------------------------------
//
// 現在はプレースホルダ（データ未取得）。
// GitHub Actions の "Update holiday data" ワークフローが内閣府CSVを取得して
// このファイルを置き換える。開発環境からは cao.go.jp が egress ポリシーで
// 遮断されているため、取得は Actions ランナー上でのみ行う。

import type { OfficialHolidayRow, OfficialMeta } from './official-types.js';

export const OFFICIAL_HOLIDAYS: readonly OfficialHolidayRow[] = [];

export const OFFICIAL_META: OfficialMeta = {
  fetchedAt: null,
  sourceUrl: 'https://www8.cao.go.jp/chosei/shukujitsu/syukujitsu.csv',
  sha256: null,
  firstYear: null,
  lastYear: null,
  equinoxConfirmedThrough: null,
};
