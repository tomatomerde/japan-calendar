# 作業メモ

セッションをまたぐための状態。中断・再開時にここを見る。
（恒久的な設計判断は `CONTRIBUTING.md`、変更履歴は `CHANGELOG.md` に書く）

最終更新: 2026-08-04

## 現在地

npm 公開の直前。ライブラリ・営業日API・和暦・Cloudflare Workers・CI・
月次データ更新ワークフローまで実装済み。CI は全ジョブ green。

Worker専用レビューで検出された9件（4件+5件、下記「解決済み」参照）はすべて
修正・検証済み。`worker/index.ts` に初の自動テスト（`test/worker.test.ts`,
24件）を追加済み。現時点で既知の未対応事項はない。

## 解決済み（Workerレビューで検出、1巡目・4件）

`worker/index.ts` を実際に起動して敵対的入力を投げて見つかった4件。

1. 不正なURLエスケープ（`GET /v1/holidays/%`）→ 500 だったのを 400 に修正
2. 暫定年の「祝日ではない」応答が30日 immutable キャッシュされていたのを、
   年ルートと同じ `allConfirmed` 判定に揃えて修正
3. HEAD が 405 だったのを GET と同じ扱いに修正
4. `days=0x10` / `1e3` / 空白混じりを受け付けていたのを `/^-?\d+$/` で拒否するよう修正

## 解決済み（Workerレビューで検出、2巡目・5件）

1巡目の修正を `wrangler dev` で再検証した際に新たに見つかった件。詳細は
CHANGELOG.md の Fixed 節。

1. **[高] `src/input.ts` の `toCivilDate` にホストのローカルタイムゾーンが
   混入していた。** `Date.parse` へのフォールバックが、オフセットの無い
   ISO 8601 風文字列（例: `2019-05-01T00:00:00`）をホストのローカルTZで
   解釈していた。実測: `isHoliday('2026-09-22T00:00:00')` が
   `TZ=Asia/Tokyo` では「国民の休日」、`TZ=Pacific/Kiritimati` では
   「敬老の日」を返す。4TZマトリクスは常にオフセット付き文字列しか使って
   おらず素通りしていた。修正: オフセット必須のISO 8601日時のみ受理し、
   それ以外（オフセット無し、`2026/09/22`、裸の `2026` 等）は
   `InvalidDateInputError` を投げるように変更。`test/input.test.ts` に
   回帰テストを追加し、チェックを無効化して実際に落ちることを確認済み。
2. 405 応答に `Allow` ヘッダーが無かった（RFC 9110 §15.5.6 が要求）
   → `Allow: GET, HEAD` を追加
3. CORS の `access-control-allow-methods` が HEAD対応後も `GET, OPTIONS`
   のままだった → `GET, HEAD, OPTIONS` に修正
4. HEAD のボディ除去が実装上は runtime（workerd）側で既に行われており
   手動コードは冗長だった（生ソケットで検証、実害なし）→ 対応不要と判断し
   コードはそのまま維持（RFC準拠を明示するコメント兼保険として残す）
5. **Workerに自動テストが1つも無かった。** `test/worker.test.ts`（24件）を
   新規追加。`wrangler dev` を起動せず `worker.fetch(new Request(...))` を
   直接呼べることを確認して実装。上記1巡目・2巡目の修正のうち3件を実際に
   ミューテーションして、対応するテストが落ちることを確認済み
   （Allow ヘッダー削除／キャッシュ判定を旧ロジックに戻す／URLエスケープの
   try-catch を外す、の3パターン）。

## 解決済み（Worker専用レビュー第2回、opusで検出した自テストの盲点4件）

`test/worker.test.ts` 自体を11種のミューテーションにかけたところ、4件が
未検出のまま素通りした。原因と対応:

1. `businessDaysBetween` の正常系テストが `status: 200` しか見ておらず、
   戻り値の営業日数を一度も検証していなかった → 既知の期待値と突き合わせる
   アサーションを追加
2. `calendar` パラメータがライブラリへ実際に渡っているかのテストが無く、
   `'national'` に固定してもテストが気づかなかった → 年末年始を挟む期間で
   national/bank の結果が食い違うことを検証するケースを追加
3. CORS の `access-control-allow-origin` を検証するテストが1件も無かった
   → `*` を返すことを検証するテストを追加
4. `GET /`（インデックスルート）を検証するテストが1件も無かった
   → ルート一覧を返すことを検証するテストを追加

4件とも実際にミューテーションして検出できることを確認済み（`test/worker.test.ts`
は 24件 → 27件）。

## 解決済み（Worker専用レビュー第3回、opusで検出した構造的な盲点8件 + 持ち越しのTZ掃引テスト）

前回の4件修正後、新たな10種のミューテーションのうち8件が素通りした。全部が
同根の問題（ステータスコードは丁寧に見るがボディ・ヘッダーは指摘箇所しか
見ていない）だったため、個別対応ではなく全ルート共通の契約チェッカーを導入:

- `expectJsonSuccess(res, cache)`: 成功応答すべてに対し content-type / CORS
  / 期待するキャッシュ階層を一律検証
- `expectJsonError(res, status)`: エラー応答すべてに対し `{error:{type,
  message}}` エンベロープ形状 / content-type / CORS / `no-store` を一律検証

既存の全テストをこのヘルパー経由に置き換え、`/v1/holidays/:date` の
`date`/`category` フィールドの検証も追加。8件のミューテーション
（エラー応答のキャッシュ化・エンベロープ形状変更・content-type破壊・
wareki/metaのキャッシュ階層退行・date/categoryフィールド破壊）すべて
再実行して検出を確認済み。

あわせて、前々回から持ち越しだった「TZ非依存性そのものの掃引テスト」を
`test/input.test.ts` に追加。日付6種×オフセット8種の直積を、実装
(civil.ts の整数演算)とは別経路（`Date.UTC`/`getUTC*` + 自前のオフセット
パース）で計算した期待値と突き合わせる。オフセット必須チェックを無効化
すると全TZで検出することを確認済み。

## 解決済み（Worker専用レビュー第4回、opusで検出した個別ペイロードの盲点5件）

契約チェッカー導入後もレビューを継続。ステータスコード・封筒形状・ヘッダーは
固まったが、ルート固有のペイロード内容と、エラーの「分類」自体は相変わらず
未検証だった5件。

1. `GET /v1/wareki` が `formatted.ja` の1フィールドしか検証しておらず、
   `era`/`eraRomaji`/`eraAbbr`/`eraYear`/`isGannen`/`month`/`day`/
   `gregorianYear` と残り3種の `formatted` が丸ごと消えても検出できなかった
   → 1989-01-08（改元当日）の全13フィールドを検証するよう拡張
2. `/v1/business-days/between` の `from`/`to`/`calendar` エコーが未検証
   → 追加
3. `expectJsonError` の `type` が「文字列であること」しか見ておらず、
   5種類のエラー分類（`OutOfRangeError`/`InvalidDateInputError`/
   `UnsupportedWarekiRangeError`/`InvalidWarekiDateError`/`BadRequestError`/
   `NotFound`/`MethodNotAllowed`）を全部 `'Error'` に潰しても検出できな
   かった → `expectJsonError` に `expectedType` 引数を追加し、全呼び出し
   箇所で実際のエラークラス名を指定（`wrangler dev` で実測して確認。
   `wareki/reverse` の month範囲外は当初 `InvalidDateInputError` と予想
   したが実際は `InvalidWarekiDateError` だったため、テスト実行で発覚し
   訂正した）

5件とも実際にミューテーションして検出できることを確認済み。あわせて
1〜3巡目の変異10件を全部再実行し、退行がないことも確認済み
（`test/worker.test.ts` は 27件のまま、アサーションを強化）。

現時点で opus のレビューにより指摘された Worker まわりの既知の問題はない。

## 保留中の判断（人間が決める）

- **リポジトリを public にするか / npm に公開するか**
  現在 private。private のまま npm 公開すると、パッケージページの repository
  リンクが誰からも 404 になり、NOTICE の CC BY 表示先も辿れず、利用者は
  Issue も出せない。公開するなら先に repository を public にする必要がある。
- npm 公開するならバージョンを決める（現在 `0.0.0`）
- **「Allow GitHub Actions to create and approve pull requests」設定**
  一時保留中。オフだと `update-holidays.yml` の PR 作成ステップが失敗する
  （push とデータ検証自体はその前に成功済みなので実害はジョブが赤くなる
  ことだけ）。このセッションのプロキシは `/actions/` 配下を読み取りも
  含めて403にするため、現在オンかオフかは確認できていない。ワークフロー
  実行履歴は1回のみで、それは `target: main` のブートストラップ実行
  （PR作成ステップを通らない経路）だったため、履歴からも判断不可。
  オンにする操作自体は Settings → Actions → General → Workflow
  permissions → 「Allow GitHub Actions to create and approve pull
  requests」から人間の手動操作が必要。

## 人間の操作待ち

- 上記「Allow GitHub Actions to create and approve pull requests」
  （プロキシから読み書き不可のため、確認・設定ともに人間の操作が必要）

GitHub の Topics は設定済み（API で確認済み: japan, japanese,
japanese-holidays, japanese-calendar, holiday, holidays, business-days,
wareki, calendar, jpx, cloudflare-workers, typescript の12件）。

## レビュー状況

| 領域 | 状態 |
|---|---|
| `src/civil.ts`（日付基盤） | レビュー済み。1868–2100年の全日で往復検証 |
| `src/wareki.ts` | レビュー済み。1873–2100年の全日で往復検証 |
| `src/holidays.ts` / `src/rules/` | レビュー済み。公式データ全1067件と一致、1949–2099年の不変条件を検証 |
| `src/businessDays.ts` | レビュー済み。変異テスト5種すべて検出を確認 |
| CI / ワークフロー | レビュー済み |
| パッケージング（型解決） | レビュー済み。`@arethetypeswrong/cli` 4項目green |
| `worker/index.ts` | レビュー済み。検出9+8+5件は修正・再検証済み。契約チェッカー+ペイロード詳細まで検証済み |
| `src/input.ts`（文字列フォールバック） | レビュー済み。TZ混入を修正、掃引テストで網羅的に回帰防止済み |

## 運用メモ

- レビューは実装とは別モデルで行っている（実装 Sonnet / レビュー Opus）
- `mcp__github__actions_list` の `list_workflow_runs` は1回で100KB近く返す。
  CI確認に多用するとトークンを大きく消費するので、run_id が分かっているなら
  `list_workflow_jobs` を使う
- 内閣府 `cao.go.jp` は開発環境の egress ポリシーで遮断されている。
  CSV取得は GitHub Actions 上でのみ可能
