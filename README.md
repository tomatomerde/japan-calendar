**English** | [日本語](./README.ja.md)

# japan-calendar

A zero-dependency TypeScript library for Japanese holidays, business-day
arithmetic, and wareki (Japanese era) date conversion — shipped both as an
npm package and as an HTTP API on Cloudflare Workers.

Most free holiday libraries only answer "is this a holiday?". This one
also treats **business-day arithmetic as a first-class feature**
(`isBusinessDay` / `addBusinessDays` / `businessDaysBetween`), and it's
the only one that **flags Vernal/Autumnal Equinox Day as `confirmed: true`
or `false`** — those two holidays aren't legally fixed until the Official
Gazette publishes the following year's "Calendrical Data" each February,
so any date beyond that is inherently a forecast, not a fact.

Holiday judgment, business-day arithmetic, wareki conversion, and the
Cloudflare Workers HTTP API are all implemented. Not yet published to npm.

## Design principles

- **No data fetching at runtime.** The Cabinet Office's `syukujitsu.csv`
  is normalized once and baked into the repo as a static TypeScript module.
- **A rule engine does the computing; the official data is the ground
  truth used to verify it.** The official CSV only covers 1955-2027, so
  shipping data alone would make the library falsely claim "not a
  holiday" for 2028 onward. The Public Holiday Law and its amendments are
  implemented in code, and every date within the covered range is checked
  against the official data.
- **All date arithmetic is pinned to JST.** `Date`'s local-timezone APIs
  are never used; everything is computed from civil dates and an integer
  day count instead.
- **Zero runtime dependencies.** Runs on Cloudflare Workers.

## Confirmed vs. tentative

Vernal Equinox Day and Autumnal Equinox Day are only officially finalized
when the National Astronomical Observatory of Japan's "Calendrical Data"
is published in the Official Gazette each February, for the following
year. So the latest year covered by the official data is exactly the
confirmed/tentative boundary.

That boundary isn't a hand-maintained constant — a generator script
computes it from the real data:

```
equinoxConfirmedThrough = the latest year that includes both "Vernal Equinox Day" and "Autumnal Equinox Day"
```

Requiring both to be present avoids mistakenly treating a year that was
only partially appended mid-year as finalized. Equinox dates up to and
including this year are `confirmed: true`; beyond it, `confirmed: false`.

## Updating the official data

The Cabinet Office's site is blocked by the dev environment's egress
policy, so the CSV is fetched via GitHub Actions instead.

```sh
# Local (requires network access)
node scripts/fetch-syukujitsu.ts

# View a summary of the already-baked-in data (no network needed)
node scripts/report.ts
```

The **Update holiday data** GitHub Actions workflow runs on the 1st of
every month and pushes any diff to the `chore/update-holiday-data`
branch. It can also be run manually via `workflow_dispatch`.

## API

```ts
import {
  isHoliday,
  isBusinessDay,
  addBusinessDays,
  businessDaysBetween,
  toWareki,
  formatWareki,
  fromWareki,
} from 'japan-calendar';

isHoliday('2026-09-22');
// => { date: {year:2026,month:9,day:22}, name: '国民の休日', category: 'bridge', confirmed: true }

isBusinessDay('2026-12-31', 'bank');
// => false (true for 'national'; the year-end/New Year bank holiday window only applies to 'bank')

addBusinessDays('2026-12-30', 1, 'bank');
// => { year: 2027, month: 1, day: 4 } (skips 12/31 and 1/1-1/3)

businessDaysBetween('2026-08-03', '2026-08-08');
// => 5 (half-open interval [from, to); negative if to < from, 0 if from === to)

formatWareki(toWareki('2019-05-01'));
// => '令和元年5月1日'

fromWareki('令和', 1, 5, 1);
// => { year: 2019, month: 5, day: 1 }
```

`isHoliday` / `isBusinessDay` / `addBusinessDays` / `businessDaysBetween`
support years 1949-2099 (`OutOfRangeError` outside that). Wareki
conversion supports Meiji 6-1-1 (1873-01-01) onward (`UnsupportedWarekiRangeError`
outside that range; `MeijiReformError` for the 29 days lost to the 1873
calendar reform, Meiji 5, month 12, days 3-31).

`CalendarKind` is either `'national'` (only holidays are non-business
days) or `'bank'` (holidays plus 12/31, 1/2, and 1/3; 1/1 is already
non-business on both calendars as New Year's Day). Weekends are
non-business days on both calendars. `addBusinessDays(date, 0)` returns
`date` unchanged even if it isn't itself a business day.

### Accepted date input

Every function that takes a date accepts three forms:

```ts
isHoliday('2026-09-22');                      // YYYY-MM-DD — a calendar date, used as-is
isHoliday({ year: 2026, month: 9, day: 22 }); // a plain object — same, no timezone involved
isHoliday(new Date());                        // an instant — reduced to the date it is *in JST*
isHoliday('2026-09-22T00:00:00Z');            // an instant too (offset required — see below)
```

A date-time string **must carry an explicit UTC offset** (`Z`, `+09:00`,
or `+0900`). Anything else is rejected with `InvalidDateInputError`:

```ts
isHoliday('2026-09-22T00:00:00');  // ✗ InvalidDateInputError — no offset
isHoliday('2026/09/22');           // ✗ InvalidDateInputError — not YYYY-MM-DD
isHoliday('2026-9-22');            // ✗ InvalidDateInputError — not zero-padded
```

This is deliberate. `Date.parse` resolves an offset-less date-time using
the *host machine's* timezone, so `'2026-09-22T00:00:00'` would mean a
different day depending on where the code runs — and for a holiday
library a different day can mean a different answer. Rather than guess,
the library refuses the ambiguous input: pass a plain `YYYY-MM-DD` string
if you mean a calendar date, or add an offset if you mean an instant.

### About the equinox approximation formula

The approximation formula in `src/rules/equinox.ts` has been verified
against the Cabinet Office's official data (1955-2027, 146
vernal/autumnal dates in total) with **zero discrepancies**. Years
1949-1954 (outside the official data's coverage) have no way to be
verified and rely purely on this formula's extrapolation.

## Test suite

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
- `test/performance.test.ts` — Asserts `businessDaysBetween` stays
  closed-form rather than degrading to a day-by-day scan. This is the
  only test that catches that regression, since the naive path returns
  the same answers, just slowly.

```sh
npm test               # run all tests
npm run test:tz        # run all tests under 4 timezones and confirm identical results
npm run typecheck      # type-check all 3 projects: the library, scripts, and the Worker
```

## Build & package layout

```sh
npm run build           # emits dist/esm (ESM + type declarations) and dist/cjs (CommonJS)
```

`package.json`'s `exports` field serves ESM, CJS, and type declarations
separately. `dist/cjs/package.json` (`{"type":"commonjs"}`) is written
during the build so the CJS output doesn't clash with the repo root's
`"type": "module"`.

## Cloudflare Workers

`worker/index.ts` is a thin HTTP layer that just imports the library.
Zero runtime dependencies, same as the library itself.

```sh
npm run worker:dev      # run locally (wrangler dev)
npm run worker:deploy   # deploy to Cloudflare
```

```
GET /v1/meta
GET /v1/holidays/:year                 e.g. /v1/holidays/2026
GET /v1/holidays/:date                 e.g. /v1/holidays/2026-09-22
GET /v1/business-days/add?date=&days=&calendar=
GET /v1/business-days/between?from=&to=&calendar=
GET /v1/wareki?date=
GET /v1/wareki/reverse?era=&year=&month=&day=
```

Responses where every holiday is finalized (`confirmed: true`) get a
long cache lifetime; responses with a tentative holiday get a short one.
Errors are the library's own exceptions, passed straight through as
`{ error: { type, message } }` with a 4xx status.

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md).

## License

The software is MIT licensed. See [NOTICE](./NOTICE) for the bundled
data's source and terms.
