# 作業メモ

セッションをまたぐための状態。中断・再開時にここを見る。

このファイルは**いま何が open か**だけを書く。解決済みの経緯は
`CHANGELOG.md` とコミットメッセージに残してあるので、ここには積まない
（積むと再開時に「で、何をすればいいのか」が埋もれる）。
恒久的な設計判断は `CONTRIBUTING.md`。

最終更新: 2026-08-06（dev-standards 原本 `b2996af` への同期。昇格した2項目を
固有セクションから削除し、済んだ追随項目を NOTES から落とした）

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

PR #1〜#3 はすべて main へマージ済み。**コード上の未処理の指摘は現在ない。**
直近の PR #3 で `describeValue` の残件2件（bigint 分岐が 200 文字上限を
迂回していた件・`truncate` がサロゲートペアを分断しうる件）を潰し、
dev-standards の原本とも同期した。経緯は `CHANGELOG.md` とコミットに残してある。

**進行中: dev-standards 原本 `b2996af` への同期**（ブランチ
`claude/sync-dev-standards-pr4-66gd0u`）。共通部分の丸ごと置き換え、固有
セクションの後始末（原本へ昇格した2項目の削除・不具合例数の更新）、drift
ワークフローの再同期。**CI と drift チェックの結果は未確認。**

**原本 SHA は依頼の値を鵜呑みにせず、自分で main の HEAD を解決すること。**
実際に2回外している: 「原本は `399e3e5`」と指示された時点で main は既に
`03e7e41` まで進んでおり（内容は同一の空マージ）、次に同期を頼まれた時点でも
`758d2d8` まで進んでいた。原本参照コメントを古い SHA に「更新」しかけている。

### 次のセッションが最初にやること

**このセッションは公開前レビュー**（実装とは別セッションで行う運用）。
下の「公開前レビューの依頼内容」を読むこと。

その前に:

1. `npm ci && npm run typecheck && npm test` が通ることを確認（環境の健全性確認）
2. 下記「人間が決めること」がまだ決まっていないなら、まずそれを聞く。
   公開判断が決まらないと、バージョン設定も公開作業も進められない
3. コードを触るなら `CONTRIBUTING.md` の「Core invariants」を先に読む。
   11項目あり、いずれも一度壊して直した実績があるもの
4. 作業するなら main から新しいブランチを切る。マージ済みブランチは再利用しない

### 公開前レビューの依頼内容

**「問題なし」で終わらせない。見ていない領域があるなら「ここは見ていない」と言う。**
指摘は重要度順に、実際に動かした結果を根拠として添える。

優先して見てほしい順:

1. **`src/` 全体を、公開パッケージとして初めて外から触られる前提で見る。**
   これまでの指摘（`[object Object]`、無制限反射、型だけ見るシェイプガード、
   bigint の上限迂回）は**すべて「不正な入力に対する振る舞い」で見つかっている**。
   同じ系統がまだ残っていないか
2. **`worker/index.ts`。** 敵対的入力11種は固定済みだが、
   **`wrangler dev` の実ランタイム上では一度も動かしていない**。
   テストは `fetch` ハンドラの直呼び
3. **README / README.ja / NOTICE。** 出典・CC BY 表示・サポート範囲・免責が
   公開時の実態と合っているか。とくに「repository を public にしていない状態で
   npm に出すと壊れるリンク」は `NOTES.md`「人間が決めること」に書いてある前提
4. **`package.json` の公開設定。** `files` / `exports` / `engines` /
   `publishConfig`。`npm pack --dry-run` の一覧は 2026-08-05 に目視済みだが、
   バージョンは `0.0.0` のまま（公開判断待ち）

すでに検証済みなので**再確認しなくてよい**もの（コストを使わないこと）:

- 全14実装ファイルの変異テスト（下の「レビュー状況」表）
- `@arethetypeswrong/cli` 4項目 green
- Node 20 実機（20.19.0）での tarball install → `require()` / `import`
- 4TZ でのテスト通過
- `actions/checkout@v7` の資格情報で後続ステップの `git push` が通ること

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
