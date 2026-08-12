# リリース手順

`japan-calendar` が npm に届くまでの流れ。パイプラインは
[`.github/workflows/release.yml`](../.github/workflows/release.yml)。このページが扱うのは、
読み手がワークフローから逆算しないとわからない部分と、判断を誤りやすい箇所である。

## Trusted publishing（ワークフローの認証方式）

**ワークフローは npm トークンを持たない。** 公開は npm の *trusted publishing* 経由で行う:
GitHub Actions が短命の OIDC トークンを発行し、npm がそれをパッケージに登録された
trusted publisher と照合し、長命のシークレットなしで publish が認可される。この経路では
provenance attestation が自動生成される。`--provenance` フラグが存在しないのはそのためだ。

npmjs.com の *Settings → Trusted Publisher* に登録済み（2026-08-10）:

| 項目 | 値 |
| --- | --- |
| Publisher | GitHub Actions |
| Organization or user | `tomatomerde` |
| Repository | `japan-calendar` |
| Workflow filename | `release.yml` |
| Environment name | **空** — ジョブは GitHub Environment を宣言しておらず、ここが食い違うと publish は拒否される |
| Allowed actions | `npm publish` と `npm stage publish` |

ワークフローが維持しなければ認証が壊れるものが3つある:

- **`permissions` の `id-token: write`。** これがないと、交換に使う OIDC トークンがそもそも
  発行されない。
- **npm >= 11.5.1。** ランナー同梱の npm はこれを満たさないため、
  `Ensure npm supports trusted publishing` ステップが npm をアップグレードし、バージョンを
  検証する。パイプライン全体が走り切った後に認証エラーとして現れる代わりに、早い段階で
  読み取れる形で失敗させるためだ。
- **ワークフローのファイル名は `release.yml` のままにする。** trusted publisher はこの名前
  そのものに対して登録されているので、ファイルをリネームすると無言で無効になる。

### npm のバージョンは実行中に変動する

このガードステップは、dry run が到達できる OIDC 経路の唯一の部分である。2026-08-10 の
dry run（run `31403028182`、これを導入したマージコミット上）での実測:

| 実行中の時点 | npm |
| --- | --- |
| 最初の `setup-node` の後（Node 22 同梱の npm） | **10.9.8** — 要件未満 |
| ガードの `npm install -g npm@latest` の後 | 12.0.2 |
| Node 20 のコンシューマテスト中 | 10.8.2 |
| publish ステップ時点、`setup-node` が Node 22 に戻った後 | **12.0.2** |

この表から押さえておくべきことは2つ。まず、同梱の npm は本当に古すぎる — ガードがなければ
このパイプラインは `npm publish` まで到達し、バージョンについて何も語らない認証エラーで
失敗していた。そして**バージョンは一度下がってから戻る**: Node 20 のレグのために
`setup-node` を再実行するとツールチェーン全体が入れ替わり、アップグレードが生き残るのは、
最後の `setup-node` が、ガードがその場でアップグレードしたのと同じ Node 22 をツールキャッシュ
から選ぶからにすぎない。最後の `setup-node` を別のバージョンに向ければ、npm は無言で同梱版に
戻る。publish レグの Node バージョンを変えることがあれば、ガードがまだ効いていると仮定せず、
その時点のバージョンを読み直すこと。

### 検証済み: `0.1.1` は OIDC 経由で出た

`0.1.0` は 2026-08-10 にトークンで公開され、この切り替えはその後だったので、トークン交換の
最初の実地検証は次のバージョンアップを待つしかなかった — dry run は `npm publish` に決して
到達しないし、`v0.1.0` を再 push してもレジストリに既にあるとしてスキップされたはずだからだ。

そのバージョンアップが **2026-08-12 に公開された `v0.1.1`**（run `31558130943`）で、ジョブに
npm のクレデンシャルを一切持たないまま OIDC 経路を通った:

```text
npm notice publish Signed provenance statement with source and build information from GitHub Actions
npm notice publish Provenance statement published to transparency log: https://search.sigstore.dev/?logIndex=2430001968
```

同じ run が、上の表の提起する疑問にも決着をつけた。publish ステップ時点で npm は 12.0.2 の
ままだった — 予測どおり、最後の `setup-node` がツールキャッシュ内の同じ Node 22 を見つけ、
その場アップグレードが生き残った。したがって**同梱 npm への逆戻りは、実際の run ではいまだ
一度も観測されていない**。`assert-npm-version.sh` はまだ発火していないハザードを見張って
いる。それこそが存在意義だが、ハザードが現実であることの証拠にはならない。

**`NPM_TOKEN` はもうロールバック経路ではない** — それなしでリリースが現に1件出たからだ。
リポジトリの secrets と npmjs.com からの削除は `NOTES.md` で追跡している。

## npm トークン（置き換え済み — 記録している失敗モードのために残す）

以下はすべて、このワークフローがもう使っておらず、もう必要ともしないトークン経路の記述で
ある。残すのは、これらの失敗モードが苦労の末に得たものであり、アカウントとして手動で
publish する場合には今も当てはまるからだ。生きたロールバック手段では**ない**: トークンの
再導入は、trusted publishing が不要にした長命の publish クレデンシャルを再導入することを
意味する。

**`NPM_TOKEN`** は Actions の secret だった。`release.yml` にはもう参照が一切ないので、
削除してもリリースは壊れない。削除で塞がるのは、ワークフローを編集せずにトークン認証へ
フォールバックする道であり、それは意図したものだ。

```sh
# Historical — this is how it used to be set:
gh secret set NPM_TOKEN --repo tomatomerde/japan-calendar
```

トークンは <https://www.npmjs.com/settings/~/tokens> で作成する。npm は classic と granular の
トークン作成を単一のフォームに統合済みで、重要な項目は次のとおり:

| 項目 | 値 | 理由 |
| --- | --- | --- |
| **Bypass two-factor authentication (2FA)** | **チェックを入れる** | これがないと npm は publish 時にワンタイムパスワードを要求するが、CI はそれを渡せない |
| Packages and scopes → Permissions | **Read and write** | デフォルトは読み取り専用 |
| Select packages | **All packages** | 未公開の名前はパッケージ別の選択肢に現れないため、新しい名前の初回 publish にはアカウント全体のスコープが要る。公開後に絞り込む |
| IP ranges | **空のまま** | GitHub ホストのランナーには固定の egress IP がない |
| Organizations → Permissions | No access | 不要 |

**噛みついてくるのはこの 2FA チェックボックスで、しかも publish そのものまで姿を見せない。**
チェックなしで作られたトークンは、CI からは次のエラーで拒否される:

```text
npm error code EOTP
npm error This operation requires a one-time password from your authenticator.
```

これは姉妹プロジェクトの `v0.1.0-rc.1` で2回起きた（2026-08-10）— どちらの回も何も公開
されなかったが、毎回その前にパイプライン1周分のコストを払っている。**既存トークンを再生成
してもこの設定は変わらない**。チェックボックスを入れた新しいトークンを作り直すしかない。
`scripts/npm-publish.sh` は `EOTP` を認識し、このチェックボックスの名前を示す。

dry run ではトークンを検証できない。dry run は `npm publish` に決して到達しないからだ —
これが後述のリリース候補手順の最も強い論拠である。

他に設定すべきものはない。ワークフローの `permissions:` ブロックは、GitHub Release 用の
`contents: write` と provenance 用の `id-token: write` を付与する。

## Provenance

すべての publish は npm の provenance attestation を伴う。trusted publishing では npm が
自動で発行するため、publish コマンドに `--provenance` フラグはない — このフラグはトークン
経路のものであり、もう存在しない。

**`--access public` は残す。** もはや provenance のためにあるのではないが、外すと、この
リポジトリが一度代償を払った失敗が戻ってくる。レジストリがまだ知らない名前に対して、npm は
access が明示的に指定されない限り attestation の発行を拒む:

```text
npm error code EUSAGE
npm error Can't generate provenance for new or private package, you must set `access` to public.
```

スコープなしパッケージはデフォルトで public なのでフラグは冗長に見えるが、それでも npm は
拒否する: 「デフォルト」は「明示的に public」ではない。**これは 2026-08-10 の最初の実
`v0.1.0` tag push を失敗させた** — 姉妹プロジェクトが無事だったのは、その `package.json`
群がたまたま `publishConfig.access` を持っていたからにすぎない。今はここでも両方を設定して
ある: `scripts/npm-publish.sh` のフラグと、手動 publish でも同じ挙動になるようにする
`package.json` の `publishConfig.access` である。

attestation があることで、npm 上の tarball は、それを生成したコミットとワークフロー run
まで遡れる。前提が2つあり、どちらも気づかないうちに壊しやすい:

- **`package.json` の `repository.url` はこのリポジトリを指していなければならない。** npm は
  ワークフローが走っているリポジトリと照合し、食い違えば **publish を失敗させる** —
  attestation なしの公開へ静かにフォールバックしたりはしない。
- **リポジトリは public のままでなければならない。** npm provenance は public なソース
  リポジトリを要求する。

## タグの形式と dist-tag

タグの形は1つだけ: **`v<version>`**、例: `v0.1.0`。それ以外は推測に走らず、run を即座に
失敗させる。

**`-` を含むバージョンは `next` dist-tag に公開され、それ以外はすべて `latest` に行く。**
ワークフローはこれをバージョンだけから導出する。

`--tag` なしの `npm publish` は、**semver プレリリースであっても** `latest` を動かす —
npm はプレリリースを特別扱いしない。`0.1.0-rc.1` を `--tag next` なしで公開すれば、
`npm install japan-calendar` が全ユーザーにリリース候補を渡すことになり、修復手段は上に
本物のバージョンを公開することだけ。それまでの間、この過ちは公開されたままで、見た目は
成功したリリースと全く同じである。`Release plan` ステップサマリーが dist-tag を出力する
のはそのためだ。

**CHANGELOG の見出しは、Keep a Changelog の角括弧を外したうえで、バージョンをフィールド
全体として照合する。** そのため `## [0.1.0-rc.1] - …` と `## [0.1.0] - …` は別々の
セクションであり、各リリースは自分の分だけを得る。前方一致にすると `0.1.0` は
`0.1.0-rc.1` にもマッチし、両方の見出しがマッチするために「次の見出しで止まる」規則が
一度も発火しない — 抽出されたノートはファイル末尾まで続いてしまう。

## リリース候補と、それが守るもの・守らないもの

`npm publish` はこのパイプラインで dry run が唯一実行できないステップであり、取り消しも
効かない: npm は公開されたバージョンを永久に保持し、unpublish は依存パッケージゼロかつ
最初の72時間に限られる。provenance attestation と GitHub Release も tag push でしか
発生しない。これが候補版でリハーサルする理由である。

**ただし、まっさらな新しい名前に対して候補版が守れる範囲は、見かけより狭い。** 姉妹
プロジェクトは 2026-08-10 に `jp-address-romaji@0.1.0-rc.1` を `--tag next` で公開して、
次のことを確認した:

- **ある名前に最初に公開されたバージョンは、`--tag` に関係なく `latest` になる。**
  レジストリは `latest` をどこかに向けなければならず、新しいパッケージには他に向け先が
  ない。`latest` は削除できないので、修復手段は本物のバージョンを公開することだけ。
  したがって初回リリースでは、候補版は `npm install <pkg>` をきれいに保って**くれない** —
  買えるのは publish 経路のリハーサルだけである。
- **プレリリースはキャレット範囲を満たさない。** `^x.y.z` と書かれた依存や peer の範囲は
  `x.y.z-rc.N` を拒否するため、候補版がインストール不能になりうる。プレリリースを受け
  入れる必要のある範囲は `^x.y.z-0` と書かなければならない。このパッケージにはランタイム
  依存がないので今日のところ影響はない — が、Workers エントリポイントや将来の peer なら
  影響を受ける。

そのため `japan-calendar` は `0.1.0` に直行した: トークン経路は姉妹プロジェクトで実地に
証明済みだったし、候補版を出してもどのみち `latest` は動くうえ、バージョン番号を1つ消費
するだけだからだ。

候補版を切るのは、*変更した*リリース経路をリハーサルしたいとき — 初回リリースを守るため
ではない。それは守れないからだ。

## リリースを切る

1. `package.json` の `version` を上げる。
2. `CHANGELOG.md` の `## [Unreleased]` を `## [<version>] - <date>` に置き換える。
   ワークフローはセクションが `unreleased` のままだと publish を拒否するし、GitHub Release
   の本文はここから来る。両方の変更をコミットする。
3. `git tag v<version> && git push origin v<version>`。
4. run を見守る。ステップサマリーにはリリース計画（trigger、dry_run、version、dist-tag）と
   tarball の全ファイル一覧が載る。green でも読むこと。

そのバージョンが既にレジストリにある場合 — たとえば部分的な失敗の後にタグを再 push して
いる場合 — publish ステップは `npm view` でそれを検出し、エラーにせずスキップする。
したがって再実行は安全である。

## Dry run

Actions タブ → **Release** → **Run workflow** で、`dry_run` は `true` のまま。
`npm publish` を除くすべてが、ディスク上にあるバージョンに対して本番と同一に走る。タグが
ないため、バージョンと CHANGELOG のガードは適用されない — サマリーにバージョンと dist-tag
が出力されるのはそのためだ。

**本番リリースの前には毎回1回走らせ、結果を読むこと。** 過去に green だった run は、この
コミットについての証拠にならない: 姉妹プロジェクトのリリースワークフローは、作りからして
green にしかなりようのない状態で何か月も過ごし、実際に実行された最初の1回で失敗した。
このリポジトリ自身のリリースワークフローも、最初の dry run で失敗している。

## ワークフローが publish 前に検査するもの

順番に、すべて `npm publish` の前:

- `npm run typecheck`、`npm test`、`npm run build`
- `npm pack`、続けて tarball の全ファイル一覧をステップサマリーへ
- **tarball アサーション** — 両モジュール形式がそれぞれ自前の型宣言を持つこと、加えて
  `dist/cjs/package.json`。このマーカーファイルは見かけ以上に重要だ: これがないと、ルートの
  マニフェストが `"type": "module"` と言っているために Node は `dist/cjs/*.js` を ESM として
  読み、このパッケージへの `require()` はすべて throw する
- **祝日テーブルのアサーション** — 公式テーブルはこのパッケージの中で再導出できない唯一の
  部分なので、pack された
  `dist/esm/data/official.js` 内の日付付きエントリ数が 1000 以上であること。リテラルを
  数える方式は、モジュールの import からは意図的に独立させている: 空配列を出力したビルド
  でも import 自体は問題なく通ってしまうからだ。2026-08-10 時点で 1067 エントリ、実行時の
  `OFFICIAL_HOLIDAYS.length` と突き合わせ済み
- pack した tarball への `@arethetypeswrong/cli`、full strict プロファイル — このパッケージは
  ESM と CJS を別々の型宣言付きで出荷しているので、4つの解決モードすべてが守るべき約束になる
- **pack した tarball を Node 20 にインストールし、`require()` と `import` の両方から呼ぶ。**
  他のステップはすべて Node 22 で走るので、これがなければ `engines: ">=20"` の主張は
  未検証のまま出荷されることになる

## カバーされないもの

- `npm publish` 自体、provenance attestation、GitHub Release は実際の tag push でしか
  起きない — 上のリリース候補はそのためにある。
- *公開された後の*パッケージが動くことは、ここでは何も検査しない。rc 手順のステップ3が
  手作業でそれを行う。
- Cloudflare Workers のエントリポイントを検査するのは `ci.yml` であって、ここではない。
