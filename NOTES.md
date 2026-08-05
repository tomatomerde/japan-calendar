# 作業メモ

セッションをまたぐための状態。中断・再開時にここを見る。

このファイルは**いま何が open か**だけを書く。解決済みの経緯は
`CHANGELOG.md` とコミットメッセージに残してあるので、ここには積まない
（積むと再開時に「で、何をすればいいのか」が埋もれる）。
恒久的な設計判断は `CONTRIBUTING.md`。

最終更新: 2026-08-05（PR #2 マージ後の引き継ぎ。dev-standards 同期と
`describeValue` の残件2件を反映）

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
月次データ更新ワークフローまで実装済み。テストは 325 件（14ファイル）。

PR #1（引数検証・CLAUDE.md 再構成・Actions v7 化）と PR #2（その独立レビューで
見つかった `describeValue` 経由漏れ・`formatWareki` の実在性チェック）はどちらも
main へマージ済み。**コード上の未処理の指摘は現在ない。**

**進行中: ブランチ `claude/japan-calendar-pr1-review-5cgr7m`**（main から分岐）。
以下を積んである:

1. dev-standards の原本と同期。原本 `2ddb229 → 8776609` の差分は
   `examples/check-claude-md-drift.yml` の1件のみ（`DEV_STANDARDS_TOKEN`
   未設定時に notice を出してスキップする。未設定のまま `actions/checkout`
   にトークンを渡すとジョブが hard-fail するため）。当リポジトリの
   `.github/workflows/check-claude-md-drift.yml` に取り込み済み。
   **`actions/checkout` は当リポジトリ側の v7 を維持**（原本の例はまだ v4）。
   `CLAUDE.md` の共通部分は原本 8776609 と完全一致（差分なし）で、
   1行目の原本参照 SHA を更新した
2. PR #2 のレビューで見送っていた `describeValue` の2件を処理:
   - **bigint 分岐が 200 文字上限を迂回していた**（`truncate` を通していない）。
     `isBusinessDay(10n ** 5000n)` で 5002 文字のメッセージを実測。
     「エラーメッセージが呼び出し側の入力を無制限に反射しない」という
     不変条件の唯一の穴だった。修正のうえテストを追加
     （分岐そのものを消してもテストが落ちなかった件も同時に解消）
   - **`truncate` がサロゲートペアを分断しうる**件。`'a'.repeat(198)` +
     `🗾` で上位サロゲート単独が残ることを実測。境界に掛かるときだけ
     1コードユニット手前で切るよう修正（一律に1文字削ると、収まっている
     ペアまで削れるので、そちらもテストで固定）

検証: `npm run typecheck` / `npm test`（325件）/ `npm run test:tz`
（Asia/Tokyo・UTC・Pacific/Kiritimati・Pacific/Midway の4TZ）すべて通過。
新テストは**変異4種（bigint分岐削除・bigintのtruncate外し・サロゲート
バックオフ削除・常時バックオフ）すべてで落ちることを確認済み**。
ドリフトワークフローは YAML から `run:` ブロックを `yq` で機械的に抽出し、
トークンあり／なしの両方を実行して確認した（GitHub Actions 上での実行は未確認）。

### 次のセッションが最初にやること

1. `npm ci && npm run typecheck && npm test` が通ることを確認（環境の健全性確認）
2. 上記ブランチの PR の CI を確認する。とくに
   **`check-claude-md-drift` は今回書き換えたので、実際に緑になるか要確認**
   （`CLAUDE.md` を変更した PR でしか発火しない）
3. 下記「人間が決めること」がまだ決まっていないなら、まずそれを聞く。
   公開判断が決まらないと、バージョン設定も公開作業も進められない
4. コードを触るなら `CONTRIBUTING.md` の「Core invariants」を先に読む。
   11項目あり、いずれも一度壊して直した実績があるもの
5. 作業するなら main から新しいブランチを切る。マージ済みブランチは再利用しない

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

- **dev-standards 側へ `actions/checkout` v7 を戻す**
  原本の `examples/check-claude-md-drift.yml` はまだ `actions/checkout@v4`。
  当リポジトリは PR #1 で v7 に上げてあり、今回の同期でもそちらを維持した。
  原本を直さないと、次に別案件へコピーしたときに v4 に戻る。
  dev-standards は別リポジトリなので、このセッションからは PR を出していない。

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
| `src/errors.ts` | ミニファイ耐性をミニファイヤ実行で検証。`describeValue` の bigint・サロゲート境界も変異4種で検証 |
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
