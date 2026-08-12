# japan-calendar について（技術メモ）

このファイルはプロジェクトの技術的事実（目的・壊してはいけない価値・データ出典・非対応範囲）を
まとめたもの。コード上の不変条件は `CONTRIBUTING.md` の「Core invariants」にもある。

## 目的

日本の祝日判定・営業日計算・和暦変換を行う依存ゼロの TypeScript ライブラリ。
npm パッケージと Cloudflare Workers 上の HTTP API の2形態で配布する。
公開パッケージは Node 20 以降で動作する（開発には型ストリッピングと wrangler のため Node 22+ が必要）。

## 差別化点（＝壊してはいけない価値）

- **営業日計算を第一級の機能として扱う**（`isBusinessDay` / `addBusinessDays` /
  `businessDaysBetween`）。多くの無料祝日ライブラリは「祝日か否か」しか答えない
- **春分の日・秋分の日を `confirmed: true` / `false` で区別する。** この2つは
  国立天文台の暦要項が翌年分を毎年2月に官報公表するまで法的に確定しない。
  その先の日付は予報であって事実ではないので、確定値と同じ顔をさせない
- **ルールエンジンが計算し、公式データは検証に使う。** 公式CSVは1955–2027年しか
  覆わないため、データ同梱だけではその範囲外で「祝日でない」と誤答する。
  祝日法とその改正をコードで実装し、覆う範囲は全日を公式データと突き合わせる
- **日付演算はすべて JST 固定。** `Date` のローカルタイムゾーンAPIは使わない
- **実行時に外部データを取得しない。依存ゼロ。** Cloudflare Workers 上で動く
- コード上の不変条件は `CONTRIBUTING.md` の「Core invariants」に列挙してある。
  11項目いずれも一度壊して直した実績があるので、触る前に読む

## データ出典

- 内閣府「国民の祝日について」`syukujitsu.csv`
  <https://www8.cao.go.jp/chosei/shukujitsu/syukujitsu.csv>
  ライセンスは CC BY 4.0。帰属表示は `NOTICE` に置く
- 日付と名称の列だけを抽出し ISO 8601 に正規化して `src/data/official.ts` に
  静的に焼き込む。**実行時には取得しない**
- `src/data/official.ts` は生成物。手編集禁止（再生成のたびに無言で上書きされる）
- `cao.go.jp` は開発環境の egress ポリシーで遮断されている。取得は
  GitHub Actions の **Update holiday data** ワークフロー経由でのみ行える
- CC BY の表示先を利用者が辿れる必要があるため、npm 公開するならリポジトリを
  public にしてからにする

## 非対応範囲

- 祝日判定・営業日計算の対応年は **1949–2099年**。範囲外は `OutOfRangeError`
- 和暦変換は **明治6年1月1日（1873-01-01）以降**。範囲外は
  `UnsupportedWarekiRangeError`、1873年の改暦で消えた明治5年12月3–31日の
  29日間は `MeijiReformError`
- 春分・秋分は `equinoxConfirmedThrough` を超える年は `confirmed: false` の
  予報値。確定値として扱わない
- 1949–1954年は公式データの範囲外で、近似式の外挿に依拠する。独立した検証手段が
  なく、1948年祝日法の条文を根拠にテストで固定してあるだけ
- カレンダー種別は `'national'` と `'bank'` の2種のみ。企業・業界独自の休業日は
  提供しない
- ソフトウェアは MIT ライセンスの "AS IS" 提供。祝日判定の結果を法的・金融的な
  確定情報として保証しない
