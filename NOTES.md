# 作業メモ

セッションをまたぐための状態。中断・再開時にここを見る。

このファイルは**いま何が open か**だけを書く。解決済みの経緯は
`CHANGELOG.md` とコミットメッセージに残してあるので、ここには積まない
（積むと再開時に「で、何をすればいいのか」が埋もれる）。
恒久的な設計判断は `CONTRIBUTING.md`。

最終更新: 2026-08-05（独立レビューとその修正を反映）

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
月次データ更新ワークフローまで実装済み。テストは 321 件（14ファイル）。

PR #1（引数検証・CLAUDE.md 再構成・Actions v7 化）は main へマージ済み。
**その独立レビュー（別セッションで実施、2026-08-05）で見つかった2件を
ブランチ `claude/japan-calendar-pr1-review-j1kxi7` 上で修正済み**（まだ
push/PR 前）:

1. `fromWareki` の `eraYear`/`month`/`day`、`civilFromInstant` の `epochMs`
   が `describeValue` を経由せず生の `String()` で全反射していた
   （50KB 入力で実測）。`describeValue` 経由に修正
2. `formatWareki` の手組みオブジェクトガードが型しか見ておらず、
   存在しない和暦日（4月31日、`month: 0`、負の `eraYear`、ローマ字の
   `'Reiwa'` を `era` フィールドに等）をもっともらしく描画していた。
   `assertWareki` に `fromWareki` を再利用した実在性チェックを追加

いずれも `npm run typecheck && npm test && npm run test:tz` 通過、
CI の `build`/`consume-on-node20` 相当のコマンドをローカルで実行して確認済み
（Node 20 自体はこのサンドボックスに無いため Node 22 で代替実行、CI 本番の
Node 20 実行では未確認）。`@arethetypeswrong/cli` 4項目green。
新しいガードは全て**外すとテストが落ちることを確認済み**。
`CONTRIBUTING.md` の Core invariants と `CHANGELOG.md` に反映済み。

**今回のレビューで見つかったが対応を見送った2件**（ユーザー判断・優先度低）:

- `describeValue` の bigint 分岐（`` `${value}n` ``）を守るテストが無い。
  分岐を消しても312件全パス（変異生存）
- `truncate` がサロゲートペア境界で切れる可能性がある。実害なしと確認済み
  （Worker の `JSON.stringify` がエスケープするため）が、ライブラリ単体では
  未対応

### 次のセッションが最初にやること

1. `npm ci && npm run typecheck && npm test` が通ることを確認（環境の健全性確認）
2. **このブランチ（`claude/japan-calendar-pr1-review-j1kxi7`）を push し、PR を作る。**
   まだ push していない
3. 下記「人間が決めること」がまだ決まっていないなら、まずそれを聞く。
   公開判断が決まらないと、バージョン設定も公開作業も進められない
4. コードを触るなら `CONTRIBUTING.md` の「Core invariants」を先に読む。
   10項目あり、いずれも一度壊して直した実績があるもの

### まだ見ていない領域

- **祝日ルールそのものの正しさ**。公式データ全1067件との突合に依拠したままで、
  再検証していない
- **`wrangler dev` での実挙動**。Worker のテストは `fetch` ハンドラの直呼びで、
  実際のランタイム上では動かしていない
- **ブラウザ／バンドラでの取り込み**。`@arethetypeswrong/cli` による
  静的な解決チェックのみ
- **Node 20 での実インストール検証は今回未実施**。このサンドボックスに
  Node 20 が無く、Node 22 で代替確認したのみ。CI の `consume-on-node20`
  ジョブでの実結果を見ること

## 人間が決めること

- **リポジトリを public にするか / npm に公開するか**
  現在 private。**2026-08-05 時点では「まだ public にしない」と判断済み。**
  private のまま npm 公開すると、パッケージページの
  repository / homepage / bugs リンクが誰からも 404 になり、NOTICE の
  CC BY 表示先も辿れず、利用者は Issue も出せない。公開するなら先に
  repository を public にする必要がある。
- **npm 公開するならバージョンを決める**（現在 `0.0.0`）。
  上の判断が保留なので、これも保留

## 人間が操作すること

いずれもこのセッションのプロキシからは触れないため、手元の環境が必要。

- **`DEV_STANDARDS_TOKEN` は 2026-11-03 ごろ失効する（要更新）**
  2026-08-05 に有効期限90日で作成した Fine-grained PAT を登録済みで、
  `drift` ジョブが緑になることは確認済み。**期限が切れると、設定前と
  まったく同じ `Input required and not supplied: token` で落ちる。**
  「設定したのに直らない」に見える壊れ方なので、赤くなったらまず期限を疑う。
  更新手順: <https://github.com/settings/personal-access-tokens> で当該
  トークンを開き Regenerate token → 表示された値を Settings → Secrets and
  variables → Actions の `DEV_STANDARDS_TOKEN` に上書き。
  設定内容（owner=tomatomerde / repo=dev-standards / Contents: Read-only）は
  再生成しても引き継がれるので作り直す必要はない。

- **次回の「Update holiday data」実行で push が通ることを確認する**
  `actions/checkout` を v4 → v7 に上げた（v6 でトークンの保存先が
  `.git/config` の extraheader から別ファイルに変わっている）。このワークフローの
  「Commit and push」は checkout が保存した資格情報に依存しているが、
  **その経路は未検証** — 発火が `workflow_dispatch` / 月次スケジュール限定で、
  かつ公式CSVに差分が出たときしか走らないため、PR の CI では踏めない。
  `persist-credentials` の既定値が `true` のままであることは
  v7 の `action.yml` で確認済み。さらに PR #1 の drift ジョブの実ログで、
  v7 が `includeIf.gitdir` を `.git/config` に書き、そこから
  `$RUNNER_TEMP/git-credentials-*.config` を読ませる方式であることを確認した
  （＝同じジョブの後続ステップの `git push` は資格情報を拾えるはず）。
  ただし **実際に push を通してはいない**。
  次にこのワークフローが走ったとき（毎月1日 06:00 JST）にログを見る。
  失敗する場合の対処は、Commit and push ステップに
  `env: GH_TOKEN`/明示的な remote URL 設定を足すこと。

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
