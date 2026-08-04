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

### Fixed

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
