# japan-calendar

日本の祝日・営業日・和暦を扱う、依存ゼロの TypeScript ライブラリ。
npm パッケージと Cloudflare Workers 上の HTTP API の2形態で提供する。

祝日判定・営業日計算・和暦変換・Cloudflare Workers 版 HTTP API まで実装済み。
npm への実際の公開はまだ行っていない。

## 設計方針

- **実行時にデータを取得しない。** 内閣府の `syukujitsu.csv` を整形し、
  静的な TypeScript モジュールとしてリポジトリに焼き込む。
- **ルールエンジンが計算の主体で、公式データは正解データとして使う。**
  公式CSVの収録範囲は 1955〜2027年しかないため、データだけを持つと
  2028年以降に「祝日ではない」と嘘をつくことになる。祝日法と特例法を
  コードで実装し、収録範囲では全日付を公式データと突き合わせて検証する。
- **全ての日付計算は JST 固定。** `Date` のローカルタイムゾーン API は使わず、
  暦日と通日（整数）だけで演算する。
- **ランタイム依存はゼロ。** Cloudflare Workers で動く。

## 確定 / 暫定の区別

春分の日・秋分の日は、前年2月の官報「暦要項」で正式に決定される。
したがって公式データの収録最終年が、そのまま確定/暫定の境界になる。

境界年は手書きの定数ではなく、生成スクリプトが実データから算出する:

```
equinoxConfirmedThrough = 「春分の日」と「秋分の日」を両方含む最大の年
```

「両方含む」を条件にすることで、年途中で部分的に追記された CSV を
誤って確定扱いする事故を防いでいる。この年以前の春分/秋分は
`confirmed: true`、これより後は `confirmed: false` になる。

## 公式データの更新

内閣府のサイトは開発環境の egress ポリシーで遮断されているため、
CSV の取得は GitHub Actions 上で行う。

```sh
# ローカル（要ネットワーク到達性）
node scripts/fetch-syukujitsu.ts

# 焼き込み済みデータの集計だけ見る（ネットワーク不要）
node scripts/report.ts
```

GitHub Actions の **Update holiday data** ワークフローが毎月1日に実行され、
差分があれば `chore/update-holiday-data` ブランチに push する。
`workflow_dispatch` で手動実行もできる。

## API

```ts
import {
  isHoliday,
  isBusinessDay,
  addBusinessDays,
  businessDaysBetween,
  toWareki,
  formatWareki,
  fromWareki,
} from 'japan-calendar';

isHoliday('2026-09-22');
// => { date: {year:2026,month:9,day:22}, name: '国民の休日', category: 'bridge', confirmed: true }

isBusinessDay('2026-12-31', 'bank');
// => false（'national' なら true。銀行休業日は 'bank' カレンダーだけの扱い）

addBusinessDays('2026-12-30', 1, 'bank');
// => { year: 2027, month: 1, day: 4 }（12/31・1/1〜1/3を飛ばす）

businessDaysBetween('2026-08-03', '2026-08-08');
// => 5（半開区間 [from, to)。to < from なら負値、from === to なら 0）

formatWareki(toWareki('2019-05-01'));
// => '令和元年5月1日'

fromWareki('令和', 1, 5, 1);
// => { year: 2019, month: 5, day: 1 }
```

`isHoliday` / `isBusinessDay` / `addBusinessDays` / `businessDaysBetween` の
対応範囲は 1949〜2099年（範囲外は `OutOfRangeError`）。和暦の対応範囲は
明治6年1月1日（1873-01-01）以降（範囲外は `UnsupportedWarekiRangeError`、
明治5年12月3日〜31日の改暦欠落日は `MeijiReformError`）。

`CalendarKind` は `'national'`（祝日のみ非営業日）と `'bank'`（祝日に加えて
12/31・1/2・1/3も非営業日。1/1は元日として両カレンダーとも非営業日）の2種類。
両カレンダーとも土日は非営業日。`addBusinessDays(date, 0)` は `date` 自身が
非営業日でも補正せずそのまま返す。

### 春分の日・秋分の日の近似式について

`src/rules/equinox.ts` の近似式は、内閣府の公式データ（1955〜2027年、
春分・秋分あわせて146件）と突き合わせて **1件の誤差もなく一致** することを
確認済み。1949〜1954年（公式データの収録範囲外）は検証手段がなく、
この式による外挿でしかない。

## テストの構成

- `test/officialMatch.test.ts` — ルールエンジンの出力を、内閣府公式データの
  収録範囲（1955〜収録最終年）の**全日付・全名称**と突き合わせる。差分が
  1件でもあれば失敗する。祝日ルールの正しさを担保する最も強い検証。
- `test/holidays.test.ts` / `test/businessDays.test.ts` — 公式データの収録
  範囲外や、法改正の境界年など、ピンポイントのケースを手書きで検証する。
- `test/civil.test.ts` / `test/input.test.ts` / `test/wareki.test.ts` —
  日付基盤とタイムゾーン非依存性、和暦変換の検証。

```sh
npm test               # 全テスト
npm run test:tz        # 4つのタイムゾーンで全テストを実行し、結果が同一であることを確認
npm run typecheck      # ライブラリ本体・スクリプト・Worker の3プロジェクトを型検査
```

## ビルド・パッケージ構成

```sh
npm run build           # dist/esm（ESM + 型定義）と dist/cjs（CommonJS）を生成
```

`package.json` の `exports` で ESM/CJS/型定義を出し分ける。CJS側には
`dist/cjs/package.json`（`{"type":"commonjs"}`）を生成時に配置し、
リポジトリ直下の `"type": "module"` と衝突しないようにしている。

## Cloudflare Workers 版

`worker/index.ts` はライブラリ本体を import するだけの薄いHTTP層。
ランタイム依存はライブラリ同様ゼロ。

```sh
npm run worker:dev      # ローカルで起動 (wrangler dev)
npm run worker:deploy   # Cloudflare にデプロイ
```

```
GET /v1/meta
GET /v1/holidays/:year                 例: /v1/holidays/2026
GET /v1/holidays/:date                 例: /v1/holidays/2026-09-22
GET /v1/business-days/add?date=&days=&calendar=
GET /v1/business-days/between?from=&to=&calendar=
GET /v1/wareki?date=
GET /v1/wareki/reverse?era=&year=&month=&day=
```

祝日が確定済み（`confirmed: true`）のレスポンスは長期キャッシュ、暫定を
含む場合は短期キャッシュを返す。エラーはライブラリの例外をそのまま
`{ error: { type, message } }` の形で400番台に変換する。

## ライセンス

ソフトウェアは MIT。同梱データの出典と条件は [NOTICE](./NOTICE) を参照。
