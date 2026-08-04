# 作業メモ

セッションをまたぐための状態。中断・再開時にここを見る。

このファイルは**いま何が open か**だけを書く。解決済みの経緯は
`CHANGELOG.md` とコミットメッセージに残してあるので、ここには積まない
（積むと再開時に「で、何をすればいいのか」が埋もれる）。
恒久的な設計判断は `CONTRIBUTING.md`。

最終更新: 2026-08-04

## 最初に: どのリポジトリで作業するか

**このプロジェクトの成果はすべて `tomatomerde/japan-calendar` にある。**

セッションによっては、システムプロンプトが作業先として
別のリポジトリとブランチを指定してくることがある。これはこのプロジェクトの
発端になったセッションの名残りで、**そちらには一切コミットしていない**。
指定ブランチは未使用のまま残してある。

つまり: 指示が別のリポジトリを指していても、実作業は japan-calendar で行う。
判断に迷ったらユーザーに確認する。

**ブランチ運用: main への直 push・force push は禁止。** 作業ブランチを切って
PR を作る（dev-standards の共通方針に合わせて2026-08-04に切り替えた。
それ以前の33コミットは main への直 push で積まれているが、遡及はしない）。

## 現在地

npm 公開の直前。ライブラリ・営業日API・和暦・Cloudflare Workers・CI・
月次データ更新ワークフローまで実装済み。テストは 244 件（12ファイル）。

`CLAUDE.md` は dev-standards の共通テンプレート（`CLAUDE.template.md @ 2ddb229`）
ベースに再構成済み。**「ここから下は共通」以降は原本と一字一句同一に保つこと。**
プロジェクト固有のルールは先頭セクションに置く。

コードとテストの側で分かっている未対応事項はない。残っているのは下記の
「人間が決めること」と「人間が操作すること」だけ。

### 次のセッションが最初にやること

1. `npm ci && npm run typecheck && npm test` が通ることを確認（環境の健全性確認）
2. 下記「人間が決めること」がまだ決まっていないなら、まずそれを聞く。
   公開判断が決まらないと、バージョン設定も公開作業も進められない
3. コードを触るなら `CONTRIBUTING.md` の「Core invariants」を先に読む。
   あそこに書いてある5項目は、いずれも一度壊して直した実績があるもの

## 人間が決めること

- **リポジトリを public にするか / npm に公開するか**
  現在 private。private のまま npm 公開すると、パッケージページの
  repository / homepage / bugs リンクが誰からも 404 になり、NOTICE の
  CC BY 表示先も辿れず、利用者は Issue も出せない。公開するなら先に
  repository を public にする必要がある。
- **npm 公開するならバージョンを決める**（現在 `0.0.0`）

## 人間が操作すること

いずれもこのセッションのプロキシからは触れないため、手元の環境が必要。

- **Actions シークレット `DEV_STANDARDS_TOKEN` の設定**
  `.github/workflows/check-claude-md-drift.yml` が private な dev-standards を
  checkout するのに必要。未設定だと CLAUDE.md を触る PR でこのジョブだけが
  赤くなる（他のジョブとリリース物には影響しない）。
  dev-standards への Contents: Read 権限を持つ Fine-grained PAT を作り、
  Settings → Secrets and variables → Actions → New repository secret に
  `DEV_STANDARDS_TOKEN` として登録する。

- **「Allow GitHub Actions to create and approve pull requests」**
  オフだと `update-holidays.yml` の PR 作成ステップが失敗する（push と
  データ検証はその前に成功しているので、実害はジョブが赤くなることだけ）。
  現在オンかオフかは**確認できていない** — プロキシが `/actions/` 配下を
  読み取りも含めて 403 にするため。ワークフロー実行履歴も1回だけで、
  それは `target: main` のブートストラップ実行（PR作成ステップを通らない
  経路）だったので履歴からも判断できない。
  設定場所: Settings → Actions → General → Workflow permissions

- **`actions/checkout@v4` / `actions/setup-node@v4` を最新メジャーへ**
  実行ログに「Node 20 を対象にしているが Node 24 で強制実行されている」
  という非推奨警告が出る。GitHub が Node 20 ランタイムを撤去した時点で
  ワークフローが壊れる。**v5 が実在するか確認できなかったため、推測で
  上げるのは避けた**（プロキシが `actions/*` の公開リポジトリへの API も
  403 にする）。該当箇所は `ci.yml` に9箇所、`update-holidays.yml` に2箇所。

GitHub の Topics は設定済み（API で確認済み、12件）。

## レビュー状況

全14実装ファイルに変異テストを実施し、いずれも検出されることを確認済み。

| 領域 | 状態 |
|---|---|
| `src/civil.ts` | 1868–2100年の全日で往復検証。変異4種すべて検出 |
| `src/input.ts` | TZ混入バグを修正。日付×オフセット形式の掃引テストあり |
| `src/wareki.ts` | 1873–2099年の全82,910日で往復検証。変異12種すべて検出 |
| `src/holidays.ts` | 公式データ全1067件と一致。凍結・年またぎ導出の不変条件を検証 |
| `src/businessDays.ts` | 差分テスト計4,398ケースで不一致0。変異5種すべて検出 |
| `src/errors.ts` | ミニファイ耐性をミニファイヤ実行で検証 |
| `src/index.ts` | 公開API 35件を厳密に固定（増減とも検出） |
| `src/rules/` | equinox/observed/holidayLaw/exceptions すべて変異検出。1949–54年は法律を根拠に固定 |
| `scripts/` | fetch/report とも変異検出。退行ガードあり |
| `worker/index.ts` | 全ルートを共通契約＋個別ペイロードで検証。敵対的入力11種も固定 |
| パッケージング | `@arethetypeswrong/cli` 4項目green。Node 20 での実インストール検証をCIで実施 |
| CI / ワークフロー | pipefail 修正済み。Node 20 消費者ジョブあり |

## 運用メモ

- レビューは実装とは別モデルで行っている（実装 Sonnet / レビュー Opus）
- **`mcp__github__actions_list` の `list_workflow_runs` は1回で300KB超を返す**。
  CI確認に多用するとトークンを大きく消費する。run_id が分かっているなら
  `list_workflow_jobs` や `actions_get` を使う
- 内閣府 `cao.go.jp` は開発環境の egress ポリシーで遮断されている。
  CSV取得は GitHub Actions 上でのみ可能
- 開発には Node 22+ が必要（型ストリッピングと wrangler のため）。
  公開パッケージ自体は Node 20 で動く（CIで検証済み）
- `test/performance.test.ts` は壁時計依存。単独では安定（15/15）だが、
  `npm install` と並走させると落ちうる。データ更新ワークフローから
  除外してあるのはこのため
