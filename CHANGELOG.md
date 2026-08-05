# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/) once
it reaches its first published release.

## [Unreleased]

Not yet published to npm.

### Added

- Holiday judgment (`isHoliday`) implementing the Public Holiday Law and
  its amendments, Happy Monday holidays, the Vernal/Autumnal Equinox Day
  approximation formula, substitute holidays, national holidays, one-off
  special holidays, and the 2020/2021 Olympic special-law date overrides.
  `isHoliday`, `holidaysForYear`, and `statutoryHolidaysForYear` all
  validate their year argument and throw `OutOfRangeError` outside
  1949-2099.
- A `confirmed` flag on Vernal Equinox Day and Autumnal Equinox Day (and
  on any substitute/national holiday derived from them). `true` only for
  years actually covered by the official Cabinet Office data
  (`OFFICIAL_META.firstYear` through `equinoxConfirmedThrough`); years
  before or after that range rely on the approximation formula alone and
  are `false`, even where the formula happens to agree with history.
- Business-day arithmetic: `isBusinessDay`, `addBusinessDays`,
  `businessDaysBetween`, with `'national'` and `'bank'` calendars.
  `computeBridgeHolidays` (the national-holiday rule) checks candidate
  dates directly against the computed substitute holidays, so a day that's
  already a substitute holiday is never also counted as a national
  holiday; `test/invariants.test.ts` checks this holds across the entire
  1949-2099 range (no duplicate dates, no substitute/national holiday on
  a Sunday, every holiday is a non-business day).
  `businessDaysBetween` counts whole years in a closed form (O(1) per
  year) instead of visiting every day, so a query spanning the entire
  supported range (`businessDaysBetween('1949-01-01', '2099-12-31')`) --
  the kind of input a public HTTP API has to expect -- takes a fraction
  of a millisecond instead of ~25ms, comfortably inside a Cloudflare
  Workers request's CPU budget. The closed-form path is covered for both
  calendars by a full sweep of every supported year in
  `test/businessDays.test.ts` against a naive day-by-day reference.
  (Mutation-testing the initial implementation found that the existing
  test cases -- all spanning 0-1 years -- never actually exercised this
  code path; a full year-range sweep was added to close that gap. No
  incorrect result ever shipped, but nothing would have caught one.)
- Wareki (Japanese era) conversion: `toWareki`, `fromWareki`,
  `formatWareki`, covering Meiji 6-1-1 (1873-01-01) onward.
- A script (`scripts/fetch-syukujitsu.ts`) that fetches the Cabinet
  Office's `syukujitsu.csv` and bakes it into `src/data/official.ts`. A
  GitHub Actions workflow runs it monthly, runs the test suite (every
  file except `test/performance.test.ts`, whose wall-clock assertions
  depend on the runner's hardware/load rather than the data) against the
  freshly fetched data, and -- only if that passes -- pushes the diff and
  opens a pull request.
- A test suite that checks the rule engine's output against every date
  in the official data (1955 through the latest year covered);
  `test/officialMatch.test.ts` fails loudly (rather than skipping) if
  `src/data/official.ts` is ever missing its data.
- A Cloudflare Workers HTTP API (`worker/index.ts`) exposing the library
  over `GET /v1/*` routes.
- A dual ESM/CommonJS build (`npm run build`) and package layout ready
  for npm publishing. CI runs `build` alongside `typecheck` and `test`.
  `exports` declares separate `types` for the `import` and `require`
  conditions, each pointing at its own `.d.ts` (`dist/esm` vs `dist/cjs`);
  verified with `@arethetypeswrong/cli` (`node10`, `node16` from both CJS
  and ESM, and `bundler` all pass). Without this, a `require()` consumer
  under `moduleResolution: node16`/`nodenext` would resolve to the ESM
  type declarations for a CommonJS file (a "false ESM" mismatch) --
  `tsconfig.cjs.json` previously set `declaration: false` and emitted no
  types for `dist/cjs` at all, so the single shared `types` entry silently
  pointed everyone at the ESM ones.

- `InvalidArgumentError` for non-date arguments whose type or value isn't
  accepted, alongside the existing date-specific errors. Like the others it
  extends `JapanCalendarError`, so a single `catch` still covers everything.

### Fixed

- Arguments other than dates were not validated, so several ordinary
  mistakes produced a confident wrong answer instead of an error. Every one
  of these now throws `InvalidArgumentError`:
  - A mistyped `CalendarKind` fell through to the national calendar.
    `isBusinessDay('2026-12-31', 'Bank')` returned `true`, while the
    correct `'bank'` returns `false` — a capitalization slip silently
    changed the answer. It also let an HTTP caller grow
    `businessDaysBetween`'s per-calendar year cache without bound, since
    the cache key embeds the calendar name.
  - `addBusinessDays`'s day count accepted anything. `NaN` and `undefined`
    behaved like `0` and returned the input date unchanged, `1.5` moved two
    business days, and the string `'3'` worked by coercion.
  - `assertYearInRange` compared against the bounds before checking the
    type, and every comparison with `NaN` is false — so `holidaysForYear(NaN)`
    passed the range check, computed a holiday list, and memoized it under
    the key `NaN`. `2026.5` and the string `'2026'` got through the same way.
  - `formatWareki`'s `switch` had no default branch, so an unrecognized
    format returned `undefined` despite the declared `string` return type,
    putting the literal text `undefined` into whatever the caller rendered.
    A hand-built object missing `eraYear` produced `'令和undefined年5月1日'`
    for the same reason.
- Error messages echoed the caller's input back at full length. A 50 KB
  query parameter produced a 50 KB message, which the Worker put straight
  into its 400 body -- turning the public API into an echo service and
  inflating every log line by the same amount. Every rendered value is now
  capped at 200 characters with the original length appended. This covered
  seven Worker paths, including the 404's route name and the 405's method
  name, neither of which is a 400 but both of which reflected input.
- `formatWareki(w, 'ja')` did not check `isGannen`, so a hand-built object
  carrying every other field still rendered `'令和1年5月1日'` where the
  canonical object gives `'令和元年5月1日'` -- the same quiet disagreement
  the surrounding guard exists to prevent. `isGannen` is defined as
  `eraYear === 1`, so an object where the two disagree is rejected rather
  than resolved in either direction; `'ja-numeric'` is how to ask for the
  numeric form.
- Error messages for an unusable value rendered every object as
  `[object Object]`, which told someone who passed `{ y, m, d }` instead of
  `{ year, month, day }` nothing about what was wrong. They now show the
  value itself.

- `worker/index.ts`, found by driving `wrangler dev` with adversarial input
  rather than by reading the code:
  - A malformed URL escape in the single-date holiday route (e.g.
    `GET /v1/holidays/%`) threw an uncaught `URIError` from
    `decodeURIComponent`, which fell through to the generic 500 handler --
    a client mistake reported as a server failure. Now caught and turned
    into a 400.
  - The single-date route's cache tier used `holiday === null || holiday.confirmed`,
    which gave every "not a holiday" answer a 30-day immutable cache
    regardless of whether that year's equinox-derived holidays are still
    tentative. It now uses the same `allConfirmed`-for-the-year check the
    year-listing route already used, so a `null` answer in a year with an
    unconfirmed equinox gets the same short cache as a `confirmed: false`
    answer in that year.
  - `HEAD` requests got a 405, breaking `curl -I`, health checks, and CDN
    probes. `HEAD` is now handled like `GET` with the body stripped from
    the response.
  - `parseInteger` accepted anything `Number()` accepts, including hex
    (`0x10`), exponential notation (`1e3`), and whitespace-padded values.
    It now requires `/^-?\d+$/` before conversion.
  - A 405 response didn't include an `Allow` header (required by RFC 9110
    §15.5.6). Now sends `Allow: GET, HEAD`.
  - CORS preflight advertised `GET, OPTIONS` even after `HEAD` support was
    added, so a browser sending a `HEAD` request through CORS would still
    be blocked at the preflight. Now advertises `GET, HEAD, OPTIONS`.
  - Added `test/worker.test.ts` (24 cases), the Worker's first automated
    test suite -- everything above had only ever been checked by hand with
    `wrangler dev` and curl. It calls the exported `fetch` handler directly
    (no `wrangler dev` needed) and was confirmed to actually catch
    regressions by mutation-testing three of the fixes above (dropping the
    `Allow` header, reverting the single-date cache-tier logic, and
    removing the URL-escape try/catch each fail a specific test).
- `src/input.ts`: `toCivilDate` accepted an ISO 8601 date-time string with
  no UTC/timezone offset (e.g. `2019-05-01T00:00:00`) and resolved it with
  `Date.parse`, which interprets an offset-less date-time in the *host's*
  local timezone. This directly violated the module's own contract ("all
  timezone handling is centralized here... always via JST") and, unlike
  everything else in this project, wasn't caught by the four-timezone test
  matrix, because every existing test case happened to use an explicit
  offset (`Z` or `+09:00`/`-05:00`). Reproduced concretely:
  `isHoliday('2026-09-22T00:00:00')` returned 国民の休日 (National Holiday)
  under `TZ=Asia/Tokyo` but 敬老の日 (Respect for the Aged Day) under
  `TZ=Pacific/Kiritimati` -- the same input, two different holiday names,
  depending only on where the process happened to run. Fixed by requiring
  an explicit offset (`Z` or `±HH:MM`) before falling back to `Date.parse`;
  an offset-less date-time (or any other string `Date.parse` would
  otherwise guess at, e.g. `2026/09/22` or a bare `2026`) is now rejected
  with `InvalidDateInputError` instead of silently depending on the host.
- `test/worker.test.ts`: mutation-testing the suite itself (11 mutations)
  found 4 that passed through undetected, all gaps in what was asserted
  rather than missing routes:
  - `business-days/between`'s test only checked `status: 200`, never the
    returned business-day count.
  - No test passed different `calendar` values to `between` and checked
    the result actually differed, so the parameter could be silently
    dropped without a failure.
  - No test checked the CORS `access-control-allow-origin` header.
  - No test covered the `GET /` index route.
  All four now have assertions and were confirmed to catch the
  corresponding mutation.
- `test/worker.test.ts`: a second mutation-testing pass (10 more
  mutations) found 8 that still passed through, all sharing one root
  cause -- the suite checked status codes carefully but only spot-checked
  response bodies and headers. Fixed by adding `expectJsonSuccess`/
  `expectJsonError` helpers applied to every route, so every test now
  uniformly asserts `content-type`, CORS, and the expected cache tier on
  success, and the `{error:{type,message}}` envelope plus `no-store` on
  failure, instead of relying on each test to remember to check them.
  This closed all 8 gaps: an error response silently becoming cacheable,
  the error envelope's shape changing, `content-type` becoming
  non-JSON, `/v1/wareki` and `/v1/meta`'s cache tiers regressing to
  `none`, and `serializeHoliday`'s `date`/`category` fields going stale.
  Confirmed by re-running all 8 mutations; each now fails a test.
- `test/input.test.ts`: the TZ-contamination fix above was previously
  guarded only by assertions on specific input strings, so the same class
  of bug in a different string format could slip back in unnoticed. Added
  a sweep test that checks every combination of 6 dates x 8 offset styles
  (`Z`, `+09:00`, `-0500`, etc.) against an independently computed
  expected value (via `Date.UTC`/`getUTC*` plus the test's own offset
  parsing, not the implementation's `civil.ts` day-number arithmetic), plus
  a sweep confirming offset-less and non-ISO formats are rejected across
  the same date set. Confirmed the sweep fails (3 cases) under every
  tested `TZ` when the offset-requirement check is disabled.
- `test/worker.test.ts`: a third mutation-testing pass found 5 more gaps,
  all specific-payload checks the previous round's structural fixes
  couldn't reach:
  - `GET /v1/wareki` asserted only `formatted.ja`, so the other 12 fields
    in the response (`era`, `eraRomaji`, `eraAbbr`, `eraYear`, `isGannen`,
    `month`, `day`, `gregorianYear`, and 3 of the 4 `formatted` variants)
    could go stale or disappear entirely without failing a test. Now
    every field is asserted for the 1989-01-08 era-change case.
  - `GET /v1/business-days/between`'s `from`/`to`/`calendar` echo fields
    were never checked, only `businessDays`. Now asserted.
  - The error envelope's `type` field was only checked for being a
    string, not for being the *correct* classification -- collapsing
    every error type to a single constant string passed silently. Added
    `expectJsonError`'s optional `expectedType` parameter and passed the
    actual error class name (`OutOfRangeError`, `InvalidDateInputError`,
    `UnsupportedWarekiRangeError`, `InvalidWarekiDateError`,
    `BadRequestError`, `NotFound`, `MethodNotAllowed`) at every call site.
  Confirmed each of the 5 mutations from the review is now caught, and
  confirmed zero regressions by re-running all mutations from the first
  three review rounds (10 cases) against the rewritten suite.
- **Range enforcement at the edges of 1949-2099 is now tested.** Removing
  any of the five `assertYearInRange` calls in `businessDays.ts` left the
  whole suite green. Three of them turn out to be load-bearing -- without
  them `addBusinessDays('2100-01-01', 0)` returns that out-of-range date
  unchanged, and `businessDaysBetween` counts into 2100 and answers `23`
  (or `-23` with the arguments reversed) instead of throwing. The other
  two are genuinely redundant, guarded indirectly by `holidaysForYear`.
  Added boundary tests that exercise each load-bearing check
  individually; the `from` one needs the range-violating date as the
  *start* argument, since the forward direction is caught elsewhere.

- **The equinox extrapolation (2028 onward) is now guarded.** The
  official CSV stops at 2027, so `officialMatch.test.ts` structurally
  cannot reach the years users will most often ask about. Demonstrated
  the gap by shifting the formula's output *only for years >= 2028*:
  `officialMatch` reported zero failures. Since there is no ground truth
  to compare against out there, the new tests in `holidays.test.ts`
  constrain the shape instead -- every Vernal Equinox Day must land on
  March 19-21 and every Autumnal Equinox Day on September 22-24 across
  all 151 supported years, consecutive years may never differ by more
  than a day (the equinox drifts ~0.24 days a year and resets on leap
  years), and there must be no discontinuity across the boundary between
  the official data's last year and the first extrapolated one. The
  extrapolation-only mutation now fails 3 tests.

- `test/worker.test.ts`: added the adversarial-input cases that had only
  ever been thrown at a running `wrangler dev` by hand -- an 8 KB path, a
  null byte, path traversal, integers past `Number.MAX_SAFE_INTEGER` in
  both directions, an empty and an unknown era, zero and negative era
  years, and full-width digits. All must be 4xx: a public HTTP API must
  not answer a client mistake with a server error. Also pinned that
  duplicate query parameters take the first value, and that a
  full-supported-range query stays fast enough for a Workers request.

- **`scripts/report.ts` had no tests at all**, including
  `computeEquinoxConfirmedThrough` -- the function that decides the
  `confirmed` boundary, and the one CONTRIBUTING singles out as
  "computed, never hardcoded". Returning the *minimum* year instead of
  the maximum, or dropping the requirement that a year contain *both*
  equinoxes, changed nothing visible: the boundary only gets recomputed
  during a data update, so a break would have surfaced a month later as a
  silent `confirmed` regression across 70 years. `findAnomalies` -- the
  last guard against a corrupt CSV being baked in -- was equally
  unguarded; its duplicate, ordering, and empty-name checks could each be
  deleted with every test still green. Both are now covered in
  `test/fetchScript.test.ts`, including the "only one equinox present"
  case the both-required rule exists for, and leap-year handling across
  the 100- and 400-year rules. Confirmed by mutation: all six changes now
  fail.

- **The public API surface is now pinned by a test.** `src/index.ts` is
  the barrel every npm consumer imports through, but nothing referenced
  it except incidentally, so deleting an export from it -- `daysInMonth`,
  `compareCivil`, `formatWareki`, `statutoryHolidaysForYear` were all
  tried -- changed the published API without failing a single test or
  type-check. For a package heading to npm that is a silent breaking
  change. `test/publicApi.test.ts` asserts the exact set of 35 exports,
  that every function-shaped one is callable, that the error classes all
  extend `JapanCalendarError`, and that the exported constants hold their
  expected values. It fails on an accidental *addition* too, since a
  wider-than-intended API is expensive to walk back after release.

- **1949-1954 is now pinned by tests.** The official CSV starts at 1955,
  so `officialMatch.test.ts` structurally cannot cover the first six
  supported years, and no hand-written test covered them either. The gap
  was real, not theoretical: deleting 元日 (New Year's Day) from
  1949-1954 entirely, or moving 天皇誕生日 out of the range, left all
  203 tests passing. Since there's no data to check against, the
  expectations are derived from the statute instead -- the Public Holiday
  Law (1948, in force from 1949) established exactly nine holidays, and
  none of the amendments land in this window (建国記念の日 1967,
  敬老の日/体育の日 1966, 海の日 1996, 山の日 2016). `holidays.test.ts`
  now asserts that each of those six years has exactly those nine
  holidays on their statutory dates, produces no substitute or national
  holidays (those rules start in 1973 and 1985), and marks the equinoxes
  `confirmed: false`. Confirmed by mutation that all four previously
  invisible changes now fail.

- **Error `name` no longer breaks under minification.** Every error class
  set `this.name` from `new.target.name`, which reads the *class
  identifier* -- something a minifier is free to rename. Bundling the
  built package with `esbuild --minify` (what any consumer targeting a
  browser or a serverless runtime does) produced:

  ```
  isHoliday('notadate')     -> name=d   (InvalidDateInputError)
  isHoliday('2200-01-01')   -> name=u   (OutOfRangeError)
  toWareki('1800-01-01')    -> name=y   (UnsupportedWarekiRangeError)
  ```

  `instanceof` kept working, but `name` is part of an Error's public
  contract -- it's what shows up in logs and what code that can't import
  the classes branches on. Every class now assigns a string literal.
  `worker/index.ts` has the same fix: it derived the response's
  `error.type` from `error.constructor.name` and now uses `error.name`,
  and its own `BadRequestError` sets a literal too. Verified against a
  real `esbuild --minify` bundle and against `wrangler deploy --minify`'s
  output, where all seven type strings survive.
  `test/errors.test.ts` guards this by running the minifier itself --
  the plain assertions can't, since a derived name looks correct until
  it's minified. Reverting to `new.target.name` makes it fail with
  `['s','w','h','C','D']`.

- **Memoized results are now frozen.** `holidaysForYear` and
  `statutoryHolidaysForYear` memoize per year and hand the *same* array
  instance to every caller, but nothing stopped a consumer from mutating
  it, which corrupted the cache for the entire process. This was a real
  defect, not a theoretical one -- demonstrated against the built
  package:

  ```js
  holidaysForYear(2026).length = 0;
  isHoliday('2026-09-22');      // => null   (国民の休日)
  isBusinessDay('2026-01-01');  // => true   (New Year's Day!)

  isHoliday('2027-01-01').name = 'x';
  isHoliday('2027-01-01').name; // => 'x', permanently
  ```

  An ordinary `holidaysForYear(y).sort(...)` did the same thing. The
  `readonly Holiday[]` return type only stops this at compile time, so
  JavaScript consumers had no protection at all, and on Cloudflare
  Workers the damage would leak across every request sharing the isolate.
  Both cached arrays, every `Holiday` in them, and each holiday's nested
  `date` are now frozen, as are the generated `OFFICIAL_HOLIDAYS` and
  `OFFICIAL_META`. All eight mutation attempts now throw `TypeError` and
  the data stays intact; `test/invariants.test.ts` covers this, and
  removing any layer of the freezing makes it fail.

- Published source maps pointed at `src/*.ts` files that weren't in the
  tarball (and had no `sourcesContent`), so all 28 of them were dangling:
  a consumer stepping into the library in a debugger got "source not
  found". Added `src` to `package.json`'s `files`. Verified by unpacking
  the tarball and resolving every `sources` entry in every `.map` — 28/28
  now resolve, against 0/28 before. Package size 56.4 kB → 71.5 kB;
  `@arethetypeswrong/cli` stays 4/4 green.
- `scripts/fetch-syukujitsu.ts` had no regression guard: its sanity
  checks used absolute floors (`minRows: 500`, `minLastYear: 2020`), so
  an upstream file that was ever republished missing its most recent
  years would clear every threshold. Demonstrated by truncating the
  committed data to drop just its final year: all 183 tests passed, and
  `equinoxConfirmedThrough` silently walked back from 2027 to 2026,
  flipping `isHoliday('2027-03-21').confirmed` from `true` to `false`.
  Added `assertNoRegression`, which compares against the already-committed
  `OFFICIAL_META` and refuses a drop in either row count or latest year
  (overridable with `ALLOW_DATA_SHRINK=1` for a genuine upstream
  correction). Added `test/fetchScript.test.ts` covering `parseCsv` and
  the guard; confirmed by mutation that removing the guard, either of its
  two checks, or forcing the override makes the tests fail.
- `README.md` / `README.ja.md` documented no accepted input formats at
  all, even though the offset-requirement change above made some
  previously-working strings throw. Added an "Accepted date input"
  section to both, showing the three accepted forms and the three
  rejected ones with the reason. Every example in both READMEs was
  executed against the built package to confirm it behaves as documented.
