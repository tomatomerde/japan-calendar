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

## 解決済み（第5回レビュー: 未レビュー領域の棚卸し）

Workerの変異狩りが収穫逓減に入ったため、これまで「見ていない」と明示して
きた領域と公開前チェックリストに切り替えて調査した結果。

1. **[低] 公開されるソースマップが全部壊れていた**（28個中28個が
   dangling）。`files` に `src` が無く `sourcesContent` も無いため、
   利用者がデバッガでステップインしても「ソースが見つかりません」に
   なる状態だった → `files` に `"src"` を追加。tarball を展開して
   28/28 が解決することを確認済み（修正前は 0/28）
2. **[中] `scripts/fetch-syukujitsu.ts` に退行ガードが無かった**。
   `assertSane` のしきい値が絶対値のみで、コミット済みデータと比較して
   いなかった。実証: 直近1年（2027年）だけ失われたデータを作ると
   **183件のテストが全部パス**し、`equinoxConfirmedThrough` が
   2027→2026 に静かに後退、`isHoliday('2027-03-21').confirmed` が
   true→false に変わった → `assertNoRegression` を追加（行数・最終年の
   減少を拒否。正当な上流訂正のために `ALLOW_DATA_SHRINK=1` で上書き可）
   + `test/fetchScript.test.ts` を新規追加
3. **[低] README に入力形式の説明が皆無だった**。オフセット必須化の
   結果、以前動いていた文字列が投げるようになったのに両READMEとも
   1行も触れていなかった → 「受け付ける日付入力」の節を英日両方に追加

### この回で「問題なし」を確認した領域

- `test/performance.test.ts`: 15回連続実行でフレーク0。実測比40〜57倍に
  対し閾値5倍で余裕十分。閉形式を日単位ループに戻す変異を検出できる
  ことも確認。ただし**この退行を守っているのはこのファイルだけ**
  （`businessDays.test.ts` は結果が同じなので素通りする）
- `src/wareki.ts`: `formatWareki` 4形式と `toWareki` の中身に6種の
  変異をかけて全件検出
- 公開前チェックリスト（CLAUDE.md）を実走:
  `@arethetypeswrong/cli` 4/4 green、`npm pack` の同梱物目視、
  **tarball を実際に `npm install` して CJS `require()` と ESM `import`
  の両方から動作確認**（このチェックはそれまで一度も実行されていなかった）

## 解決済み（第6回レビュー: **実バグ発見** — 共有キャッシュの汚染）

テスト網羅性ではなく実装そのものの欠陥。`holidaysForYear` /
`statutoryHolidaysForYear` はメモ化して**同じ配列インスタンス**を全呼び出し元
に返すが、凍結していなかったため利用者がキャッシュを破壊できた。ビルド済み
パッケージに対して実証:

```
holidaysForYear(2026).length = 0
  -> isHoliday('2026-09-22')    = null    （本来は国民の休日）
  -> isBusinessDay('2026-01-01') = true   （本来は元日なので false）
isHoliday('2027-01-01').name = 'ニセ祝日'
  -> 以降ずっと 'ニセ祝日' を返す
```

`holidaysForYear(y).sort(...)` のようなごく普通の操作でも起きる。
`readonly Holiday[]` はコンパイル時にしか効かないのでJS利用者は無防備、
Workers では isolate を共有する後続リクエスト全部に波及する。

→ キャッシュ投入前に配列・各 `Holiday`・その `date` を凍結。生成データの
`OFFICIAL_HOLIDAYS` / `OFFICIAL_META` も凍結（生成スクリプトのテンプレートも
同時に更新済み）。8種の破壊操作がすべて `TypeError` になり、データが健全な
ままであることを確認。`test/invariants.test.ts` に回帰テストを追加し、凍結の
どの層を外しても落ちることを変異テストで確認済み。

### この回で「問題なし」を確認した領域

- `src/civil.ts`: うるう年の100年/400年ルール、nth週計算、曜日オフセットの
  4変異すべて検出
- `src/rules/equinox.ts`: 係数の微小変更、`floorDiv`→`trunc` の3変異すべて検出
- `src/rules/observed.ts`: 振替休日の曜日判定、国民の休日の日曜除外・
  振替休日との重複チェックの3変異すべて検出
- キャッシュのメモリ挙動: 全151年で 0.13MB、範囲外の年は `OutOfRangeError`
  で拒否されるため無制限に増えない

## 解決済み（第7回レビュー: **実バグ発見2件目** — ミニファイでエラー名が壊れる）

`src/errors.ts` が `this.name = new.target.name` でクラス識別子から名前を
導出していた。ミニファイヤは識別子を自由にリネームするので、npm利用者が
バンドルすると壊れる。ビルド済みパッケージを `esbuild --minify` に通して実証:

```
isHoliday('notadate')   -> name=d   （InvalidDateInputError のはず）
isHoliday('2200-01-01') -> name=u   （OutOfRangeError のはず）
toWareki('1800-01-01')  -> name=y   （UnsupportedWarekiRangeError のはず）
```

`instanceof` は生き残るが、`name` はログに出る値であり、クラスを import
できないコードが分岐に使う値でもある。Worker も `error.constructor.name`
から `error.type` を作っていたので同じ問題。

→ 全クラスで文字列リテラルを代入。Worker は `error.name` を使うよう変更し、
Worker自身の `BadRequestError` にもリテラルを設定。実際の
`esbuild --minify` バンドルと `wrangler deploy --minify` の出力の両方で
7種すべての名前が残ることを確認済み。

`test/errors.test.ts` を新規追加。**ミニファイヤを実際に走らせる**テストで、
これがないと退行を検出できない（導出方式はミニファイするまで正しく見える）。
`new.target.name` 方式に戻すと `['s','w','h','C','D']` になって落ちることを
確認済み。esbuild は推移的依存に頼らず devDependency に明示追加した。

### この回で「問題なし」を確認した領域

- `src/businessDays.ts`: 銀行カレンダーの12/31・1/3・1/4境界、週末判定、
  祝日判定の5変異すべて検出
- Worker実ランタイムでのキャッシュ汚染: `wrangler dev` に汚染用ルートを
  一時追加して確認。3種の破壊操作すべて `TypeError`、後続リクエストの
  データも健全

### 注意（既知の許容事項）

`test/performance.test.ts` は `npm install` と並走させた際に1度だけ落ちた
（CPU競合）。単独では15/15で安定し、実測比は40〜57倍に対し閾値5倍。
データ更新ワークフローから除外済みなのはこの性質のため。

## 解決済み（第8回レビュー: 1949-1954年が完全に未テストだった）

公式CSVは1955年開始のため、`officialMatch.test.ts` は構造上この6年を
カバーできない。かつ手書きテストも無かった。実証: **元日を1949-54年から
丸ごと削除しても203件全部パス**した。天皇誕生日(旧4/29)を範囲外にしても同様。

照合先が存在しない以上、期待値は法律から起こした。祝日法（昭和23年法律
第178号、1949年施行）が定めた祝日は9つで、この6年間に該当する改正は無い
（建国記念の日=1967、敬老の日/体育の日=1966、海の日=1996、山の日=2016）。

→ `test/holidays.test.ts` に、1949-1954年の各年について
(1) 法定祝日がちょうどその9つであること
(2) 固定日の祝日が法律どおりの月日にあること
(3) 振替休日も国民の休日も発生しないこと（制度開始は1973年/1985年）
(4) 春分/秋分が `confirmed: false` であること
を検証するテストを追加。以前素通りした変異4種すべてが検出されることを確認済み。

### この回で「問題なし」を確認した領域

- `src/wareki.ts` の元号境界: 昭和→平成、平成開始、令和開始、大正の
  startYear、明治のサポート開始、eraYear計算の6変異すべて検出
- `src/rules/holidayLaw.ts` の公式データ範囲内の改正: ハッピーマンデー
  開始年、建国記念の日開始年、2019年の天皇誕生日空白の3変異すべて検出

## 解決済み（第9回レビュー: 公開APIの表面が未固定だった）

`src/index.ts`（npm利用者が必ず通るバレル）を参照するテストが実質存在せず、
**エクスポートを削除しても全テスト・typecheck が通る**状態だった。
`daysInMonth` / `compareCivil` / `formatWareki` / `statutoryHolidaysForYear`
の4つで実証済み（いずれも素通り）。公開直前のライブラリにとっては
「気づかれない破壊的変更」そのもの。

→ `test/publicApi.test.ts` を新規追加。35個のエクスポート集合を厳密に固定し、
関数が呼び出せること・エラークラスが `JapanCalendarError` を継承していること・
定数が期待値であることを検証。削除4種と、意図しない追加1種の両方向で
検出できることを確認済み。

### この回で「問題なし」を確認した領域

- `src/rules/exceptions.ts`: 一回限りの特例祝日4種（1959結婚の儀・1989大喪の礼・
  1990即位礼・1993結婚の儀）と五輪特措法の移動3種、計7変異すべて検出
- 差分テスト: `addBusinessDays` 2808ケース（負方向・両カレンダー含む）不一致0、
  `businessDaysBetween` 1590ケース不一致0・対称性違反0
- 和暦: 1873-2099年の全82,910日で往復変換の不一致0、元号境界4箇所すべて正確
- Tree-shaking: 和暦のみ利用時4.2KB（祝日データ40KB非同梱）。
  module scope の `Object.freeze` を追加しても壊れていないことを確認
- Worker実負荷: 並行200リクエスト全て200応答、最重量クエリ0.2ms、
  混在アクセス後もデータ健全

## 解決済み（第10回レビュー: `scripts/report.ts` が完全に未テストだった）

確定境界を算出する `computeEquinoxConfirmedThrough` と、壊れたCSVの取り込みを
止める `findAnomalies` の両方にテストが1件も無く、変異5種すべてが素通りした。

特に前者は CONTRIBUTING が「手書き定数にしてはいけない」と不変条件に挙げて
いる箇所。最大値を最小値に変えても、「春分・秋分が両方そろっている年」の
条件を外しても検出できなかった。この関数はデータ更新時にしか呼ばれないため、
壊れても1か月後に「70年ぶんの confirmed が静かに退行する」形で初めて表面化する。

→ `test/fetchScript.test.ts` に両者のテストを追加（20件に増加）。
「片方の分点しか無い年」（両方必須ルールが存在する理由そのもの）と、
うるう年の100年・400年ルールも含む。変異6種すべて検出を確認済み。

## 解決済み（第11回レビュー: `engines.node` の主張が未検証、CONTRIBUTINGの記載が誤り）

1. **CONTRIBUTING が「Node 20+ で開発できる」と書いていたが誤り。**
   `scripts/*.ts` の直接実行はNodeのネイティブ型ストリッピング（22.6以降）に
   依存し、wrangler も `node >= 22` を要求する。Node 20 では
   `npm run report` / `npm run fetch:holidays` が動かない。
   → 「開発は Node 22+」「公開パッケージの `engines` は >=20（利用者向け）」
   と両者を分けて記載するよう修正

2. **`engines.node: ">=20"` がCIで一度も検証されていなかった**（全ジョブが
   Node 22）。成果物が使っている組み込みAPIを調べたところ
   `Date.parse` / `Math.abs,floor,trunc` / `Number.isFinite,isInteger,isNaN` /
   `JSON.stringify` / `Object.freeze` のみ、`node:` importもゼロ、target=ES2022
   なので主張自体は正しい。ただし未検証のままなのは公開前として不適切。
   → CI に `consume-on-node20` ジョブを追加。Node 22 でビルド＆pack →
   Node 20 に切り替えて tarball を `npm install` し、CJS `require()` と
   ESM `import` の両方から実際に呼ぶ。`npm ci` はあえて実行しない
   （開発ツールチェーンは22必須だが、公開パッケージは依存ゼロで20で動くべき、
   という区別をジョブ構成自体で表現している）。
   **同じ手順をローカルで完全再現して CJS/ESM とも通ることを確認済み**
   （Node 20 そのものだけは環境に無いため未実行）

3. CI に `concurrency` を追加。PR では古い実行を打ち切り、main では
   打ち切らない（mainでのキャンセルは履歴上「失敗」に見えるため）

## 解決済み（第12回レビュー: ワークフローが失敗を握り潰していた）

`update-holidays.yml` の `node scripts/fetch-syukujitsu.ts | tee /tmp/report.txt`
がパイプになっており、GitHub Actions の暗黙シェル `bash -e {0}`（pipefail 無し）
では**パイプ末尾の `tee` の終了コードしか見ない**。つまり fetch スクリプトが
throw しても、ステップは成功として扱われていた。

影響: `assertSane` の行数・年範囲チェック、`findAnomalies`、そして今日追加した
`assertNoRegression` まで、**すべての健全性チェックが無効化される**経路だった。
ワークフローは green のまま何もせず、データ更新が静かに止まり続ける。

実測（今日追加した退行ガードを実際に踏ませて確認）:
```
bash -e            + パイプ  -> 終了コード 0  （失敗が消える）
bash -eo pipefail  + パイプ  -> 終了コード 1  （正しく伝わる）
```

→ 両ワークフローに `defaults: run: shell: bash` を追加。
`shell: bash` を明示すると GitHub は `bash --noprofile --norc -eo pipefail {0}`
を使うため pipefail が有効になる。

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
