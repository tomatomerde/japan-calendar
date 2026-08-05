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

GitHub Actions 上でも実際に走らせて確認した（2026-08-05）:

- `check-claude-md-drift` を `workflow_dispatch` でブランチ上で実行 →
  success。ログ上で原本を `8776609` でチェックアウトし
  `Common section matches the canonical template.` を出力（＝ CLAUDE.md
  1行目に記録した SHA が実物と一致することの独立確認にもなっている）
- **トークン未設定時のスキップ経路も実機で確認**。使い捨てブランチに
  `on: push` の検証用ワークフローを置き、存在しないシークレットを
  ジョブ env に写して同じ probe を実行 → `DEV_STANDARDS_TOKEN:` が空で
  展開され（エラーにならず）、notice が出て `present=false`、
  `if: present == 'true'` のステップが `skipped` になることを確認

### 次のセッションが最初にやること

1. `npm ci && npm run typecheck && npm test` が通ることを確認（環境の健全性確認）
2. 下記「人間が決めること」がまだ決まっていないなら、まずそれを聞く。
   公開判断が決まらないと、バージョン設定も公開作業も進められない
3. コードを触るなら `CONTRIBUTING.md` の「Core invariants」を先に読む。
   11項目あり、いずれも一度壊して直した実績があるもの
4. 作業するなら main から新しいブランチを切る。マージ済みブランチは再利用しない

### まだ見ていない領域

- **祝日ルールそのものの正しさ**。公式データ全1067件との突合に依拠したままで、
  再検証していない
- **`wrangler dev` での実挙動**。Worker のテストは `fetch` ハンドラの直呼びで、
  実際のランタイム上では動かしていない
- **ブラウザ／バンドラでの取り込み**。`@arethetypeswrong/cli` による
  静的な解決チェックのみ
- ~~Node 20 での実インストール検証~~ → **2026-08-05 に実施済み**。
  nodejs.org から Node 20.19.0 を取得し、`ci.yml` の `consume-on-node20`
  ジョブの `run:` ブロックを `yq` で抽出してそのまま実行。
  `npm install <tarball>` → `require()` / `import` 双方が通った

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

- **使い捨て検証ブランチ2本を消す（このセッションの後始末）**
  `chore/tmp-verify-v7` と `chore/tmp-verify-target`。下記「checkout v7 での
  push」を実機確認するために作ったもので、中身に価値はない。
  **このセッションのプロキシは ref の削除を 403 で拒否するため消せなかった。**
  手元で:

  ```sh
  git push origin --delete chore/tmp-verify-v7 chore/tmp-verify-target
  ```

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
| パッケージング | `@arethetypeswrong/cli` 4項目green。Node 20 実機（20.19.0）でtarballを install し `require()`/`import` 両方通過 |
| CI / ワークフロー | pipefail 修正済み。Node 20 消費者ジョブあり。**`actions/checkout@v7` の資格情報で後続ステップの `git push` が通ることを Actions 上で実証済み**（新規ブランチ作成・既存ブランチへの `--force` 再pushとも success）。`update-holidays.yml` の Commit and push はこの経路に乗っている |

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
