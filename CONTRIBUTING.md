# Contributing

Thanks for considering a contribution to japan-calendar.

## Getting started

```sh
npm install
npm run typecheck   # type-checks the library, scripts, and the Worker
npm test            # runs the full test suite
```

**Node 22+ is required for development**, for two reasons: the scripts in
`scripts/` run directly against `.ts` files using Node's built-in type
stripping, which doesn't exist before 22.6, and `wrangler` declares
`node >= 22`. No build step is needed for development either way.

Note that this is a stricter requirement than the *published package*'s
`engines.node: ">=20"`. That field is about consumers, and it holds: the
build targets ES2022 and the emitted code touches nothing newer than
`Object.freeze`, `Number.isInteger`, and `Math.trunc`, with no `node:`
imports at all. CI verifies it by installing the packed tarball on Node
20 and importing it through both `require()` and `import`.

For current work-in-progress state — what's been reviewed, what's still
open, and what's waiting on a manual step — see [NOTES.md](./NOTES.md).
This file documents the invariants that don't change; NOTES.md tracks the
things that do.

## Project layout

```
src/                   library source
  civil.ts              civil-date <-> day-number conversion (the foundation of all date math)
  input.ts              normalizes public API input (Date / string / CivilDate) — the only place timezone is handled
  wareki.ts              era (wareki) conversion
  holidays.ts             per-year holiday list, memoized
  businessDays.ts         isBusinessDay / addBusinessDays / businessDaysBetween
  rules/                  holiday law, exceptions, equinox formula, substitute/national-holiday derivation
  data/                   generated official data (do not edit official.ts by hand)
  errors.ts               the exception hierarchy (names are literals — see the invariants below)
scripts/                 data-fetching and reporting scripts
worker/                  Cloudflare Workers HTTP API
test/                    vitest test suite (see README's "Test suite" for what each file covers)
```

## Core invariants

These are load-bearing; changes that violate them will very likely
reintroduce a bug that was deliberately fixed.

- **Never use `Date`'s local-timezone APIs** (`getFullYear`, `getDay`,
  etc.) anywhere in `src/`. All date arithmetic goes through `civil.ts`'s
  integer day-number representation. `input.ts` is the only place a
  `Date` (an instant) gets reduced to a civil date, and it always does so
  via JST (UTC+9).
- **The official data is the ground truth, not a runtime fallback.** The
  rule engine (`rules/`, `holidays.ts`) computes holidays for any
  supported year, including years the official CSV doesn't cover.
  `test/officialMatch.test.ts` verifies the engine's output against every
  date the CSV does cover. If you change a holiday rule, this test is the
  first thing to check — a single mismatch across 70+ years is a real bug.
- **The `equinoxConfirmedThrough` boundary is computed, never hardcoded.**
  It's derived by `scripts/report.ts` as the latest year that includes
  both Vernal and Autumnal Equinox Day in the official data. Don't
  replace this with a manually maintained year.
- **`toCivilDate` must keep requiring an explicit offset on date-time
  strings.** `Date.parse` is a local-timezone API in disguise: given
  `'2026-09-22T00:00:00'` it resolves the value using the *host's*
  timezone. Relaxing `OFFSET_DATE_TIME` to "be more forgiving" would
  reintroduce a bug where `isHoliday` returned 国民の休日 under
  `TZ=Asia/Tokyo` but 敬老の日 under `TZ=Pacific/Kiritimati` for the same
  input. The four-timezone matrix does not catch this by itself — the
  offset sweep in `test/input.test.ts` is what does.
- **Memoized holiday lists must stay frozen.** `holidaysForYear` and
  `statutoryHolidaysForYear` hand the *same* array instance to every
  caller. Dropping the `Object.freeze` (it looks like pure overhead) lets
  a consumer's `.sort()` or `.length = 0` corrupt the cache for the whole
  process — and on Workers, for every later request sharing the isolate.
  `readonly Holiday[]` is compile-time only and does nothing for
  JavaScript consumers.
- **Error `name`s must be assigned as string literals.** Setting
  `this.name` from `new.target.name` reads the class identifier, which
  minifiers rename: bundling with `esbuild --minify` turned the names
  into `d`, `u`, and `y`. For the same reason `worker/index.ts` uses
  `error.name`, not `error.constructor.name`. `test/errors.test.ts` runs
  a real minifier, because nothing else can catch a regression here.
- **The data fetch must refuse to shrink.** `assertNoRegression` in
  `scripts/fetch-syukujitsu.ts` compares against the committed
  `OFFICIAL_META`. Without it, an upstream file republished without its
  most recent years passes every absolute threshold while silently
  walking `equinoxConfirmedThrough` backwards, flipping `confirmed` from
  `true` to `false` for dates that were already finalized.

## Updating the official holiday data

The Cabinet Office's site isn't reachable from most sandboxed dev
environments. Data updates normally happen via the **Update holiday
data** GitHub Actions workflow (scheduled monthly, or dispatched
manually), which fetches the CSV, regenerates `src/data/official.ts`,
and opens a diff for review. If you can reach the source directly, you
can also run:

```sh
node scripts/fetch-syukujitsu.ts
```

Never hand-edit `src/data/official.ts` — it's regenerated from scratch
each time and any manual edit will be silently overwritten.

## Language policy

- Code comments, JSDoc, type descriptions, and error messages: English.
- README, CHANGELOG, CONTRIBUTING: English, with a Japanese translation
  of the README maintained separately at `README.ja.md`.
- Test `describe`/`it` descriptions may be written in Japanese, since
  they document Japanese legal/calendar concepts and readability for
  reviewers checking specific holiday rules takes priority there.
- Holiday names, era names, and other domain data that are Japanese by
  nature (e.g. `'国民の休日'`, `'令和'`) are left as-is — they're data,
  not something to translate.

## Tests

- `npm test` runs once under the local timezone.
- `npm run test:tz` runs the full suite under four timezones (`Asia/Tokyo`,
  `UTC`, `Pacific/Kiritimati`, `Pacific/Midway`) and fails if any of them
  disagree — this is how timezone independence is enforced. If you touch
  `civil.ts` or `input.ts`, run this before opening a PR.
- New holiday-rule logic should be validated by extending
  `test/officialMatch.test.ts`'s coverage where possible (i.e. make sure
  the years affected are within the official data's range) rather than
  relying solely on hand-picked assertions.

## Pull requests

Please run `npm run typecheck` and `npm test` before opening a PR. CI
runs both, plus the timezone matrix, on every push and PR.
