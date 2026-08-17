# japan-calendar

[![npm](https://img.shields.io/npm/v/japan-calendar.svg)](https://www.npmjs.com/package/japan-calendar)
[![CI](https://github.com/tomatomerde/japan-calendar/actions/workflows/ci.yml/badge.svg)](https://github.com/tomatomerde/japan-calendar/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)
[![Bundled data: CC BY 4.0](https://img.shields.io/badge/bundled%20data-CC%20BY%204.0-blue.svg)](./NOTICE)
[![Node.js 20+](https://img.shields.io/badge/Node.js-20%2B-brightgreen.svg)](#インストール)
[![dependencies: none](https://img.shields.io/badge/dependencies-none-brightgreen.svg)](./package.json)
[![Live demo](https://img.shields.io/badge/demo-live-1c5d99.svg)](https://tomatomerde.github.io/japan-calendar/)

[English](./README.md) | **日本語**

日本の祝日・営業日・和暦を扱う、依存ゼロの TypeScript ライブラリ。
npm パッケージとして配布し、加えて Cloudflare Workers 上の HTTP API として
**自分でデプロイして**使うこともできる（こちらでホストしているエンドポイントは
無い。[Cloudflare Workers 版](#cloudflare-workers-版)を参照）。

多くの無料の祝日ライブラリは「祝日かどうか」しか判定しないが、このライブラリは
**営業日計算（`isBusinessDay` / `addBusinessDays` / `businessDaysBetween`）を
一次機能として持ち**、さらに**春分の日・秋分の日には `confirmed: true/false`
のフラグを付与する**（前年2月の官報「暦要項」で正式決定されるまでは暫定値である
ことを明示する）。

**[ブラウザで試す](https://tomatomerde.github.io/japan-calendar/)** —
デモは npm 公開版をブラウザ内で動かしているので、上の主張を読むだけでなく
その場で確かめられる。初期値は公式データの範囲**外**の日付にしてあり、何も
打たなくても `confirmed: false` のバッジが見える。ありがちな日付の書き方を
片っ端から実行して、どれが拒否されるか・なぜかも並べてある。タイムゾーンの節は
**訪問者自身のブラウザ・訪問者自身のタイムゾーン**で計算する——祝日ライブラリに
とって1日のずれは異常終了ではなく「違う答え」であり、それは自分の環境で
見るのがいちばん早い。

## インストール

```sh
npm install japan-calendar
```

```ts
import { isHoliday, addBusinessDays } from 'japan-calendar';

isHoliday('2026-05-05');
// → { date: { year: 2026, month: 5, day: 5 }, name: 'こどもの日',
//     category: 'statutory', confirmed: true }

isHoliday('2026-05-07');
// → null

addBusinessDays('2026-05-01', 3);
// → { year: 2026, month: 5, day: 11 }
//   金曜 5/1 の3営業日後は月曜 5/11。ゴールデンウィークで 5/3〜5/6 が潰れる
//   （5/3 が日曜のため振替休日が入る）
```

Node.js 20 以降。依存ゼロ、実行時のデータ取得なし。ESM バンドルはブラウザと
Cloudflare Workers でもそのまま動く。

> **維持方針。** バージョンは `0.x` なので、マイナーリリース間で API が
> 変わりうる。変更点は [CHANGELOG.md](./CHANGELOG.md) に記録している。
> 個人プロジェクトであり、対応はベストエフォートで行う。業務で依存する前に
> 次の節を読むこと。

## サポート範囲と免責

このライブラリが扱う範囲と、意図的に扱わない範囲:

- **対応年。** 祝日判定・営業日計算は 1949–2099年。範囲外は
  `OutOfRangeError`。和暦変換は明治6年1月1日（1873-01-01）以降。
- **`equinoxConfirmedThrough` を超える春分・秋分は予報であって事実ではない。**
  `confirmed: false` を付けて返す。確定した日付として扱わず、フラグを見ること。
- **未来の日付の和暦変換は、現行の元号が続くという仮定に基づく。**
  元号の終わりは事前に知りようがない（2019年の平成→令和がその前例）。
  未来日の和暦変換は、未確定の春分・秋分と同じ意味で予報であって、
  確定した事実ではない。対応範囲に上限は設けていないが、先に行くほど
  この仮定の上に乗ることになる。
- **1949–1954年は独立した検証ができない。** この6年は公式データの範囲外で、
  近似式の外挿に依拠している。1948年の祝日法の条文を根拠にテストで固定して
  あるが、これは得られる中で最善のチェックであって、公表値との突き合わせでは
  ない。
- **カレンダーは `'national'` と `'bank'` の2種のみ。** 企業・業界独自の
  休業日は対象外。
- **無保証。** ソフトウェアは MIT ライセンスの "AS IS" 提供。祝日・営業日の
  判定結果が法的・金融的・規制上の判断に適することは保証しない。正確性が
  重要な用途では内閣府の公表データで確認すること。

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

## API

```ts
import {
  isHoliday,
  holidaysForYear,
  isBusinessDay,
  addBusinessDays,
  businessDaysBetween,
  toWareki,
  formatWareki,
  fromWareki,
} from 'japan-calendar';

isHoliday('2026-09-22');
// => { date: {year:2026,month:9,day:22}, name: '国民の休日', category: 'bridge', confirmed: true }

holidaysForYear(2026).length;
// => 18（その年の祝日を日付順に全件。振替休日・国民の休日を含む。
//        statutoryHolidaysForYear はこの2種を除いた16件を返す）

holidaysForYear(2026)[0];
// => { date: {year:2026,month:1,day:1}, name: '元日', category: 'statutory', confirmed: true }

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

### 祝日リストは凍結されている

`holidaysForYear` と `statutoryHolidaysForYear` は結果をメモ化し、
**同じ凍結済み配列**をすべての呼び出し元へ返す（各 `Holiday` と
その `date` も凍結済み）。その場でソートしたり書き換えたりすると、
strict モード（ES モジュールは常に strict）では `TypeError` になる。

```ts
holidaysForYear(2026).sort(byWhatever);   // ✗ TypeError（凍結されている）
[...holidaysForYear(2026)].sort(byWhatever);  // ✓ コピーしてから
```

この凍結は飾りではない。無ければ呼び出し元の `.sort()` がキャッシュ本体を
並べ替えてしまい、以降のプロセス全体——Cloudflare Workers では同じ
isolate を共有する後続リクエスト全部——で、`isHoliday` が他人に
並べ替えられたデータから答えることになる。

### 受け付ける日付入力

日付を受け取る関数はいずれも次の3形式を受け付ける。

```ts
isHoliday('2026-09-22');                      // YYYY-MM-DD — 暦日としてそのまま解釈
isHoliday({ year: 2026, month: 9, day: 22 }); // オブジェクト — 同上。タイムゾーンは介在しない
isHoliday(new Date());                        // 瞬間 — JST における日付に落とす
isHoliday('2026-09-22T00:00:00Z');            // これも瞬間（オフセット必須。下記参照）
```

日時文字列は **UTCオフセットを明示する必要がある**（`Z` / `+09:00` / `+0900`）。
それ以外は `InvalidDateInputError` で拒否する。

```ts
isHoliday('2026-09-22T00:00:00');  // ✗ InvalidDateInputError — オフセットが無い
isHoliday('2026/09/22');           // ✗ InvalidDateInputError — YYYY-MM-DD ではない
isHoliday('2026-9-22');            // ✗ InvalidDateInputError — ゼロ埋めされていない
```

これは意図的な仕様。`Date.parse` はオフセットの無い日時を**実行環境の
ローカルタイムゾーン**で解釈するため、`'2026-09-22T00:00:00'` はコードが
動く場所によって別の日を意味してしまう。祝日ライブラリにとって日が違えば
答えも違う。曖昧な入力を推測で通さず拒否する方針とした。暦日を指したい
なら `YYYY-MM-DD` を、瞬間を指したいならオフセットを付けて渡す。

### 日付以外の引数も検証する

同じ方針をすべての引数に適用している。誤った引数は、それらしい答えを返さず
`InvalidArgumentError` を投げる:

```ts
isBusinessDay('2026-12-31', 'Bank');   // ✗ InvalidArgumentError — 'national' | 'bank' のみ
addBusinessDays('2026-08-03', NaN);    // ✗ InvalidArgumentError — days は安全整数
addBusinessDays('2026-08-03', 1.5);    // ✗ InvalidArgumentError
holidaysForYear(2026.5);               // ✗ InvalidArgumentError — 年は整数
formatWareki(w, 'JA');                 // ✗ InvalidArgumentError — 未知の形式
```

これが効くのは主に素の JavaScript から使う場合と、TypeScript でも値が JSON・
クエリパラメータ・フォーム入力から `string` として来る場合で、型注釈は実行時には
存在しない。特に危険なのは `'Bank'` のような大文字小文字の取り違えで、
これは bank カレンダーではない。national の答えを返せば、
**自信を持って間違った答えを返す**ことになる。

### エラー

すべての例外は `JapanCalendarError` を継承するので、1つの `catch` で捕まえられる。

| エラー | 発生条件 |
|---|---|
| `InvalidDateInputError` | 日付引数を解釈できない、または存在しない日を指している |
| `InvalidArgumentError` | 日付以外の引数の型が違う、または許容値でない |
| `OutOfRangeError` | 日付が 1949–2099年の外 |
| `UnsupportedWarekiRangeError` | 明治6年1月1日（1873-01-01）より前の和暦変換 |
| `MeijiReformError` | 明治5年12月3–31日。1873年の改暦で消えた29日間 |
| `InvalidWarekiDateError` | その元号の期間外の和暦日付（例: 昭和64年1月8日） |

`isHoliday` は、単にその日が祝日でない場合は例外ではなく `null` を返す。
例外を投げるのは入力そのものが使えないときだけ。

エラーメッセージは問題の値を引用するが、200文字で打ち切る。Worker は
メッセージを 400 の本文にそのまま入れるので、呼び出し側の入力を丸ごと
反射するとエコーサービスになってしまう。

### 春分の日・秋分の日の近似式について

`src/rules/equinox.ts` の近似式は、内閣府の公式データ（1955〜2027年、
春分・秋分あわせて146件）と突き合わせて **1件の誤差もなく一致** することを
確認済み。1949〜1954年（公式データの収録範囲外）は検証手段がなく、
この式による外挿でしかない。

## Cloudflare Workers 版

**こちらでホストしている API は無い。** `worker/index.ts` はライブラリ本体を
import するだけの薄いHTTP層で、自分の Cloudflare アカウントにデプロイして使う。
下の URL はデプロイ先からの相対パス。ランタイム依存はライブラリ同様ゼロ。

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
含む場合は短期キャッシュを返す。和暦のレスポンスが長期キャッシュになる
のは過去の日付だけ——未来日の変換は現行元号の継続を仮定した予報なので、
短期キャッシュになる。エラーはライブラリの例外をそのまま
`{ error: { type, message } }` の形で400番台に変換する。

デプロイはメンテナ／運用者の作業なので、コマンドは
[メンテナ向け](#メンテナ向け)にある。

## ロードマップ

### 検討中

機能一覧からではなく、実際の暦まわりの作業が要求するものから拾っている。
いずれも**既定でやらなかった理由**まで書いてあるので、**必要ならイシューで
そう言ってほしい**。実装するかどうかと既定値を決めるのは、実際の利用場面のほう。

- [和暦変換の上限年、または予報であることの印](https://github.com/tomatomerde/japan-calendar/issues/51)
  — `toWareki('9999-12-31')` は令和7981年を返し、令和8年と同じ顔をしている
- [`holidaysForYear` のコピーを返す口](https://github.com/tomatomerde/japan-calendar/issues/52)
  — 凍結は共有キャッシュを守っているが、`.sort()` は呼び出し側で落ちる
- [営業日計算が飛ばした非営業日を返す](https://github.com/tomatomerde/japan-calendar/issues/53)
  — 答えを検算するには自分で導き直すしかなく、その導き直しを間違えやすい
- [範囲外の日付を例外なしで扱う](https://github.com/tomatomerde/japan-calendar/issues/54)
  — 他のライブラリは範囲外に `false` を返す。例外を投げるのは正しいが、
  呼び出し側に `try` を強いてはいる

いずれも**オプトインで既定はオフ**にする。解釈できない入力は拒否する、
予報は予報として返す、というこのライブラリの性質はどれでも変わらない。

他にあれば
[イシューを立ててほしい](https://github.com/tomatomerde/japan-calendar/issues/new?template=feature_request.yml)。
**実際の呼び出しと期待する結果**を添えてもらえると、それが判断材料になる。

## メンテナ向け

ここから下はライブラリを「使う」話ではなく「触る」話。コントリビュートは
[CONTRIBUTING.md](./CONTRIBUTING.md)（英語）から。

**このリポジトリでの作業には Node.js 22 以降が必要**（公開パッケージ自体は
Node.js 20 以降で動く）。下の `scripts/` は `.ts` のまま Node の型ストリッピングで
実行し、`wrangler` も 22 を要求するため。20 以降で動くという約束は公開成果物に
ついてのもので、リリースのたびに packed tarball を実機の Node 20 に install して
検証している。

## 公式データの更新

内閣府のサイトは開発環境の egress ポリシーで遮断されているため、
CSV の取得は GitHub Actions 上で行う。

```sh
# ローカル（要ネットワーク到達性）
node scripts/fetch-syukujitsu.ts

# 焼き込み済みデータの集計だけ見る（ネットワーク不要）
node scripts/report.ts
```

GitHub Actions の **Update holiday data** ワークフローが毎月（1日 21:00 UTC ＝
JST では2日 06:00）実行され、差分があれば `chore/update-holiday-data` ブランチに
push する。`workflow_dispatch` で手動実行もできる。

## Worker の実行とデプロイ

```sh
npm run worker:dev      # ローカルで起動 (wrangler dev)
npm run worker:deploy   # 自分の Cloudflare アカウントにデプロイ
```

## テストの構成

```sh
npm test               # 全テスト
npm run test:tz        # 4つのタイムゾーンで全テストを実行し、結果が同一であることを確認
npm run typecheck      # ライブラリ本体・スクリプト・Worker の3プロジェクトを型検査
```

どのテストファイルが何を守っているか、どの領域を触ったらどれを再実行すべきかは
[CONTRIBUTING.md](./CONTRIBUTING.md#what-each-test-file-covers)（英語）にある。

## ビルド・パッケージ構成

```sh
npm run build           # dist/esm（ESM + 型定義）と dist/cjs（CommonJS）を生成
```

`package.json` の `exports` で ESM/CJS/型定義を出し分ける。CJS側には
`dist/cjs/package.json`（`{"type":"commonjs"}`）を生成時に配置し、
リポジトリ直下の `"type": "module"` と衝突しないようにしている。

## コントリビュート

[CONTRIBUTING.md](./CONTRIBUTING.md)（英語）を参照。

## ライセンス

ソフトウェアは MIT。同梱データの出典と条件は [NOTICE](./NOTICE) を参照。
