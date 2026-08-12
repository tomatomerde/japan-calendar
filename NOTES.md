# 作業メモ

セッションをまたぐための状態。中断・再開時にここを見る。

このファイルは**いま何が open か**だけを書く。解決済みの経緯は
`CHANGELOG.md` とコミットメッセージに残してあるので、ここには積まない
（積むと再開時に「で、何をすればいいのか」が埋もれる）。
恒久的な設計判断は `CONTRIBUTING.md`。

最終更新: 2026-08-11（公開後レビュー。`wrangler dev` 実機での Worker 検証を
消し込み、README の「未公開」表記の誤りを修正し、リリース／データ更新
ワークフローの穴を2件塞いだ）

**npm 公開済み**: `japan-calendar@0.1.0`（2026-08-10、provenance attestation 付き）。

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

## このリポジトリは 2026-08-07 に作り直されている（`#N` を信用しないこと）

公開前の履歴整理（`Claude-Session:` トレーラ・セッション URL・個人メールの除去）は
force push では消せない。GitHub は `refs/pull/*/head` 経由で旧コミットを保持し続けるため、
リポジトリを削除して作り直し、書き換え済みの `main` だけを push した。コードは1バイトも
変わっていない。

副作用として、**この文書と履歴に出てくる `#N` は旧リポジトリの PR 番号で、現在の
リポジトリの PR 番号とは対応しない**。GitHub はコミットメッセージ中の `#N` を自動リンク
するので、いま押せば 404 になり、**今後このリポジトリで PR を開くと、過去の `#1` が
無関係な PR を指すようになる**。404 は誤りだと読み手に分かるが、こちらは静かに嘘になる。
経緯を追うときは番号ではなく `git log` の件名で辿ること。

`NOTES.md` / `CHANGELOG.md` 内の `#N` は Markdown では自動リンクされないので、探しに
行った読み手が空振りするだけ。害があるのはコミットメッセージ側。

なお本文中の `b2996af` `399e3e5` `03e7e41` `758d2d8` は **dev-standards 側の SHA** で、
このリポジトリでは解決しない。これは正常。

## 共通部分は自動で配られる（手で同期しないこと）

`CLAUDE.md` の `<!-- BEGIN dev-standards common -->` と `<!-- END dev-standards common -->` に
挟まれた範囲は生成物で、原本（private リポジトリ `dev-standards` の
`common/CLAUDE.common.md`）が変わるたびにこのリポジトリへ同期 PR が自動で届く。人間の仕事は
その PR をマージすることだけ。`.github/workflows/check-common-integrity.yml` がその範囲を
ハッシュ照合し、手で編集されていれば**落ちる**（警告ではなく失敗）。シークレットもネット
ワークも使わないので fork からの PR でも動く。共通のルールを変えたいときは原本を直す。

**原本 SHA は依頼の値を鵜呑みにせず、自分で main の HEAD を解決すること。**
過去に2回外している（指示された SHA より原本が進んでいた）。

## いま open なこと

### 1. publish の戻り先が無くなった（`NPM_TOKEN` 削除済み・2026-08-12）

trusted publishing 経由のリリースが `v0.1.1`（run `31558130943`）で実際に通った。
`Signed provenance statement with source and build information from GitHub Actions` が
ログに出ている。戻り先として `NPM_TOKEN` を残す理由が消えたため削除した——
**人間が3案件の Actions secret を消し、npm 側のトークンも revoke したとの報告。**
セッションからはシークレット一覧を読めないので、こちらで実物を確認したわけではない。

`release.yml` は3案件とも `NPM_TOKEN` を参照していないので、リリースは壊れない。
ただし**これで publish は npmjs.com 側の trusted publisher 登録だけに依存する**。
登録（publisher: GitHub Actions / このリポジトリ / `release.yml` / environment 空）を
消すか、ワークフローのファイル名を変えると、戻り先が無いのでリリースが止まる。
open な項目として残しているのはこの一点。

2026-08-11 に足した `scripts/assert-npm-version.sh`（publish 直前の npm 版の再確認）は、
`v0.1.1` の実行では **12.0.2 のまま**通った。最後の `setup-node` が tool cache の同じ
Node 22 を選び直したためで、予想どおりの挙動。**つまり「同梱 npm（10.9.x）に戻る」現象
自体は、実機ではまだ一度も観測されていない。** ガードが仕事をしたのではなく、ガードが
要る状況がまだ起きていない、というのが正確。

### 2. `update-holidays.yml` の残り検証

本物の実行は 2026-08-11 に `workflow_dispatch`（target=branch）で1回通した。
CSV取得・sanity check・`test:data`・`chore/update-holiday-data` への push・
PR 作成の degrade（権限拒否 → warning で緑終了）まで、**差分ありの全経路が本番で成功**。

その実行が**バグを1つ露出させた**: 生成物に `fetchedAt`（実行時刻）を毎回焼き込むため、
CSV が1バイトも変わっていなくても必ず「差分あり」になり、タイムスタンプ1行だけの
ブランチ更新と月次ノイズ PR が永久に続く構造だった（dev-standards の provenance
スタンプ問題と同型）。`resolveFetchedAt` で「内容が変わったときだけ更新」に修正済み。
**`changed=false` 経路はこの修正が入って初めて通れるようになる**ので、次の月次実行
（2026-09-01 21:00 UTC ＝ JST 9/2 06:00）で「No change in official data.」で終わることを
確認するのが残りの検証。なお `chore/update-holiday-data` に残っているタイムスタンプ
1行だけのコミットはマージ不要（次回実行が force push で上書きする）。

- **手動実行するときは `target` を `branch` にする。** `main` を選ぶと
  `git push origin HEAD:main` を試みるが、ブランチ保護がこれを拒否する
  （`enforce_admins: true` なので bot も owner も例外なし）。定期実行は元から `branch`
- **データに差分が無い年月は `steps.diff.outputs.changed` が false になり、push も PR 作成も
  スキップされる。初回が緑でも、この経路を通った証拠にはならない**
- `gh pr create` は `github.token` では通らない（`can_approve_pull_request_reviews` が
  false）。**PR 作成に失敗してもデータはブランチに push 済み**なので、この拒否に限っては
  ワークフローを落とさず、PR を開くリンク付きの warning に degrade する
- 2026-08-11 に `gh pr list` の失敗経路にも同じ案内を足した。以前は rate limit 等で
  素の赤になり、「push 済みのブランチがある」ことがログのどこにも出なかった
  （同じ形の事故が dev-standards 側で3回起きている）。ワークフローから `run:` ブロックを
  抜き出し、スタブ `gh` で5経路（成功／既存PR／rate limit／権限拒否／その他失敗）を
  実行して確認済み

### 3. 人間の操作待ち

- **マージ済みブランチの掃除**（セッションの資格情報では `git push --delete` が 403）。
  再発防止に `gh repo edit tomatomerde/japan-calendar --delete-branch-on-merge` を先に
  実行しておくとよい（2026-08-10 時点で false）
- **`can_approve_pull_request_reviews` を有効にするかの判断。** オンにすれば
  `update-holidays.yml` の PR が自動で立つ。オフのままでも warning に degrade するので
  急ぎではない

## まだ検証していない領域

- ~~祝日ルールそのものの正しさ~~ → **2026-08-11 に独立データと突合済み**。独立系の
  `@holiday-jp/holiday_jp@2.5.1`（npm 経由で取得）と 1970–2050 年の81年間を比較し、
  祝日の**日付集合 1,329 件が完全一致（差分0）**。公式 CSV の範囲外である 2028–2050 の
  予報領域（春分・秋分の外挿を含む）も一致した。名称差 160 件はすべて表記スタイル
  （「振替休日」への元祝日名の前置、「国民の休日」vs 法律用語の「休日」等）。
  真に未カバーで残るのは 1949–1954（独立ソースが存在しない・既知）と 2051–2099
  （近似式の外挿のみ）
- **ブラウザ／バンドラでの取り込み**。`@arethetypeswrong/cli` による静的な解決チェックのみ
- **`update-holidays.yml` の実運用**（上記2）
- **OIDC publish の実通過**（上記1）
- ~~`wrangler dev` での実挙動~~ → **2026-08-11 に実施済み**。workerd 実機で起動し、
  正常系2件・敵対的入力6種（`2026.5` / `9999` / 壊れた URL エスケープ `%zz` と `%E0%A4` /
  欠落パラメータ / `2026-13-01` / 型違い）がすべて 4xx（500 は0件）、HEAD が GET と同じ
  200、POST が 405、未知ルートが 404、キャッシュヘッダが確定年 `max-age=2592000, immutable`
  ／予報年 `max-age=3600` であることを確認した
- ~~Node 20 での実インストール検証~~ → 2026-08-05 に実施済み

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
| `worker/index.ts` | 全ルートを共通契約＋個別ペイロードで検証。敵対的入力11種も固定。**2026-08-11 に workerd 実機でも確認** |
| パッケージング | `@arethetypeswrong/cli` 4項目green。Node 20 実機（20.19.0）でtarballを install し `require()`/`import` 両方通過 |
| CI / ワークフロー | pipefail 修正済み。Node 20 消費者ジョブあり。`actions/checkout@v7` の資格情報で後続ステップの `git push` が通ることを Actions 上で実証済み |

## 運用メモ

- **ブランチ保護の設定内容（張り直すときはここを再現する）**: 2026-08-10 に有効化。
  required checks は `typecheck` / `build` / `consume-on-node20` / `test (TZ=…)` の4種、
  `strict: false`、`enforce_admins: true`、承認0件。**`integrity` は required に入れない**——
  `check-common-integrity.yml` は `paths:` フィルタ付きで `CLAUDE.md` を触らない PR では
  起動せず、required にするとそういう PR が「Expected — waiting for status」で永久に
  マージできなくなるため
- レビューは実装とは別セッション・別モデルで行う
- **`mcp__github__actions_list` の `list_workflow_runs` は1回で300KB超を返す**。
  run_id が分かっているなら `list_workflow_jobs` や `actions_get` を使う
- 内閣府 `cao.go.jp` は開発環境の egress ポリシーで遮断されている。CSV取得は
  GitHub Actions 上でのみ可能
- **開発には Node 22+ が必要**（型ストリッピングと wrangler のため）。公開パッケージ自体は
  Node 20 で動く（CIで検証済み）。README にもこの区別を明記した
- `test/performance.test.ts` は壁時計依存。単独では安定（15/15）だが、`npm install` と
  並走させると落ちうる。データ更新ワークフローから除外してあるのはこのため
