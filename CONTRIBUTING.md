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
  JavaScript consumers. The same applies to every module-level object the
  package exports by reference: `ERAS` and `WAREKI_SUPPORTED_FROM` are
  deep-frozen too, because before they were, a single
  `ERAS[0].startYear = 1800` turned `toWareki('1900-01-01')` from Meiji 33
  into Meiji 101 for the rest of the process. A new exported constant that
  holds an object must be frozen the same way.
- **Error `name`s must be assigned as string literals.** Setting
  `this.name` from `new.target.name` reads the class identifier, which
  minifiers rename: bundling with `esbuild --minify` turned the names
  into `d`, `u`, and `y`. For the same reason `worker/index.ts` uses
  `error.name`, not `error.constructor.name`. `test/errors.test.ts` runs
  a real minifier, because nothing else can catch a regression here.
- **Every public entry point validates its non-date arguments too.**
  `assertCalendarKind`, `assertDayCount`, the `Number.isInteger` check at
  the top of `assertYearInRange`, and `formatWareki`'s format/shape guards
  all exist because the unguarded versions returned a *plausible wrong
  answer* instead of failing: `'Bank'` silently meant the national
  calendar, `NaN` days silently meant zero days, `holidaysForYear(NaN)`
  computed and memoized a holiday list for a year that doesn't exist, and
  an unknown format rendered the literal text `undefined`. TypeScript does
  not cover any of this — most consumers of a published package call it
  from JavaScript, and even in TypeScript these values routinely arrive as
  a plain `string` from JSON or a form. The type signatures are a
  convenience, not the check. `test/argumentValidation.test.ts` pins each
  guard, and each one has been verified to fail the suite when removed.
- **A shape guard checking types is not the same as checking the value is
  real.** `formatWareki`'s guard originally confirmed a hand-built
  `Wareki`'s fields had the right types, but not that they described a
  date that actually exists — `{ era: '令和', eraYear: 8, month: 4, day: 31 }`
  rendered `'令和8年4月31日'`, April having only 30 days. `assertWareki`
  now reuses `fromWareki` (rather than a second hand-written copy of "is
  this a real wareki date", which would just be a second place for the
  same class of bug) to confirm the `era`/`eraAbbr` field a given format
  actually reads is both the era's own canonical form — not an alias like
  the romaji `'Reiwa'`, which `resolveEra` accepts but `EraName` does not
  — and describes a date that exists within that era. Found by an
  independent review of the original argument-validation PR, which is why
  it's called out here specifically: a shape check reads as complete
  coverage until someone tries a value the shape allows but the domain
  doesn't.
- **No error message may carry an unbounded amount of caller input.**
  Everything interpolated into a message goes through `describeValue`,
  which caps the rendering at 200 characters. The Worker copies
  `error.message` into its 400 body verbatim, so an uncapped message let a
  50 KB query parameter be reflected back to the client and written to the
  logs at full length. This applies to the Worker's own `BadRequestError`
  messages too, including the 404 route name and the 405 method name.
  `test/echoBounds.test.ts` drives real requests at every such path. Three
  more spots were found later by independent review, all in `src/`, not
  `worker/`: `fromWareki`'s `eraYear`/`month`/`day` and
  `civilFromInstant`'s `epochMs` used plain `String()` instead of
  `describeValue`. None of them were reachable through the Worker (its own
  parameter parsing validates first), which is exactly why they were
  missed — grep for `String(` and `${` interpolations next to a `throw` in
  `src/` rather than trusting that Worker coverage implies library
  coverage. The last hole was inside `describeValue` itself: its `bigint`
  branch returned `` `${value}n` `` without calling `truncate`, so a
  5000-digit `bigint` produced a 5002-character message while every other
  branch stayed capped. A new branch added to `describeValue` must go
  through `truncate` unless its output length is bounded by construction.
- **`describeValue` must not cut a surrogate pair in half.** `truncate`
  slices at a UTF-16 code-unit index, so a boundary landing inside one
  astral character (emoji, kanji outside the BMP) leaves a lone high
  surrogate — a string that no longer decodes to text. The Worker hides
  this: `JSON.stringify` escapes the stray surrogate on its way into the
  response body, so the bug is only observable from a direct library
  caller, and only a `src/`-level test can hold it. Stepping back one code
  unit unconditionally is not the fix either — that truncates one
  character early for every value whose pair already fits, which
  `test/errors.test.ts` pins alongside the split case.
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

### What each test file covers

- `test/officialMatch.test.ts` — Checks the rule engine's output against
  **every date and name** in the Cabinet Office's official data (1955
  through the latest year covered). A single mismatch fails the test.
  This is the strongest guarantee that the holiday rules are correct.
- `test/holidays.test.ts` / `test/businessDays.test.ts` — Hand-written
  checks for cases outside the official data's coverage, law-amendment
  boundary years, and similar edge cases. Includes 1949-1954, the six
  years the official data can't reach, pinned against the text of the
  1948 Public Holiday Law.
- `test/civil.test.ts` / `test/input.test.ts` / `test/wareki.test.ts` —
  The date foundation, timezone independence, and wareki conversion.
  `input.test.ts` sweeps every combination of date and UTC-offset style
  against an independently computed expectation.
- `test/invariants.test.ts` — Properties that must hold across all of
  1949-2099 (no duplicate dates, no substitute/national holiday on a
  Sunday, every holiday is a non-business day), plus the immutability of
  everything the library hands back.
- `test/errors.test.ts` — Error `name`s, including a check that runs a
  real minifier over the library, since minification is what breaks them.
- `test/worker.test.ts` — The HTTP API, calling the exported `fetch`
  handler directly. Every route's response is checked against a shared
  contract (content-type, CORS, cache tier; error envelope and
  `no-store`) as well as its own payload.
- `test/fetchScript.test.ts` — CSV parsing and the sanity/regression
  guards in the data-update script, which are otherwise only exercised
  on a GitHub Actions runner.
- `test/argumentValidation.test.ts` — Every non-date argument
  (`CalendarKind`, day counts, years, wareki formats and shapes). Each
  case here used to return a plausible wrong answer instead of failing.
- `test/echoBounds.test.ts` — Drives real requests at every Worker path
  that puts caller input into an error message, checking none of them
  reflects the input at full length.
- `test/performance.test.ts` — Asserts `businessDaysBetween` stays
  closed-form rather than degrading to a day-by-day scan. This is the
  only test that catches that regression, since the naive path returns
  the same answers, just slowly.

## Pull requests

Please run `npm run typecheck` and `npm test` before opening a PR. CI
runs both, plus the timezone matrix, on every push and PR.
