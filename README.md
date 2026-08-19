# japan-calendar

[![npm](https://img.shields.io/npm/v/japan-calendar.svg)](https://www.npmjs.com/package/japan-calendar)
[![CI](https://github.com/tomatomerde/japan-calendar/actions/workflows/ci.yml/badge.svg)](https://github.com/tomatomerde/japan-calendar/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)
[![Bundled data: CC BY 4.0](https://img.shields.io/badge/bundled%20data-CC%20BY%204.0-blue.svg)](./NOTICE)
[![Node.js 20+](https://img.shields.io/badge/Node.js-20%2B-brightgreen.svg)](#install)
[![dependencies: none](https://img.shields.io/badge/dependencies-none-brightgreen.svg)](./package.json)
[![Live demo](https://img.shields.io/badge/demo-live-1c5d99.svg)](https://tomatomerde.github.io/japan-calendar/)

**English** | [日本語](./README.ja.md)

A zero-dependency TypeScript library for Japanese holidays, business-day
arithmetic, and wareki (Japanese era) date conversion — shipped as an npm
package, and usable as an HTTP API you deploy yourself on Cloudflare Workers
(there is no hosted endpoint; see [Cloudflare Workers](#cloudflare-workers)).

The four holiday packages npm surfaces ahead of this one answer "is this a
holiday?" and stop there. This one also treats **business-day arithmetic as a
first-class feature** (`isBusinessDay` / `addBusinessDays` /
`businessDaysBetween`), and it **flags Vernal/Autumnal Equinox Day as
`confirmed: true` or `false`** — those two holidays aren't legally fixed until
the Official Gazette publishes the following year's "Calendrical Data" each
February, so any date beyond that is inherently a forecast, not a fact. None of
the four draws that distinction; the next section names them and shows what
each returns.

**[Try it in your browser](https://tomatomerde.github.io/japan-calendar/)** —
the demo runs the published package client-side, so the claims above are
checkable rather than asserted. It defaults to a date *outside* the official
data's range so the `confirmed: false` badge is visible without typing, and it
runs every common date format in front of you to show which ones are refused
and why. The timezone section computes its answers in your own browser, in
your own timezone: for a holiday library, being off by one day is not a crash
but a different answer, and that is the failure worth seeing for yourself.

## What else is on npm, and where each one stops

Search npm for Japanese holidays and four packages come back before this one does.
They are all fine at the question they answer. Whether they are enough depends on two things
this library treats as the point rather than as extras: **arithmetic over business days**, and
**saying when a holiday's date is not settled yet**.

| Package | Where it stops |
| --- | --- |
| [`japanese-holidays`](https://www.npmjs.com/package/japanese-holidays) 1.0.10 | Holiday lookup only. `isHoliday` returns the holiday's *name*, so there is nowhere to hang a "this date is a forecast" flag even in principle. |
| [`@holiday-jp/holiday_jp`](https://www.npmjs.com/package/@holiday-jp/holiday_jp) 2.5.1 | Holiday lookup only. Entries carry `date`, `week`, `name`, `name_en` — nothing about confidence. Its data ends after 2050, and it says so by returning `[]`. |
| [`date-holidays`](https://www.npmjs.com/package/date-holidays) 3.35.0 | ~200 countries, which is its reason to exist and something this package will never be. For Japan: no business-day arithmetic (`getDayOff()` returns the weekly day-off name, not date math), and no confidence field. |
| [`@gahojin-inc/holiday-japanese`](https://www.npmjs.com/package/@gahojin-inc/holiday-japanese) 2026.7.3 | Holiday lookup only. `isHoliday` returns a boolean. Its data ends after 2050 too, so `isHoliday(new Date(2051, 0, 1))` is `false` — New Year's Day. |
| [`@smarthr/wareki`](https://www.npmjs.com/package/@smarthr/wareki) 1.3.1 | Wareki only — no holidays. See [below](#wareki-and-the-1873-calendar-reform) for what it does at the calendar reform. |

### The equinox is a forecast, and only one of these says so

Vernal and Autumnal Equinox Day are not legally fixed until the Official Gazette publishes the
following year's *Calendrical Data* each February. The bundled official data currently runs
through **2027**; every equinox after that is computed, not published. Asked about 20 March 2050:

| | Answer | Says it is unconfirmed |
| --- | --- | --- |
| `japanese-holidays` | `'春分の日'` | no |
| `@holiday-jp/holiday_jp` | `{ name: '春分の日', … }` | no |
| `date-holidays` | `{ name: '春分の日', … }` | no |
| `@gahojin-inc/holiday-japanese` | `true` | no |
| `japan-calendar` | `{ name: '春分の日', confirmed: false, … }` | **yes** |

Nobody is computing a *different* date here. Over all 144 equinoxes from 2028 to 2099, the two
packages that carry data that far — `japanese-holidays` and `date-holidays` — land on exactly the
same days this package does. The difference is only that a caller scheduling a payment run in 2050
cannot tell from those two that the answer is a projection, and can from this one.

### Where the data runs out

The other two stop after 2050, and they stop quietly:

```ts
holidayJp.between(new Date(2051, 0, 1), new Date(2051, 0, 1)); // → []
gahojin.isHoliday(new Date(2051, 0, 1));                       // → false

isHoliday('2051-01-01'); // → { name: '元日', … }
isHoliday('2100-01-01'); // → throws OutOfRangeError
```

New Year's Day 2051 is not in question — it is fixed by statute, like every holiday that is not an
equinox. A caller cannot distinguish "we checked, it isn't a holiday" from "we have no data for
that year" from a `false`. This package answers through 2099 and refuses past it, because for a
holiday library the dangerous answer is not an error, it is a confident `false`.

That is also the honest answer to "can't I just write the business-day loop myself?" You can — it
is about a dozen lines on top of any of these, and as long as the library underneath has data for
the span you are counting through, it gives the same answers this package does. It stops agreeing
where that data stops. `2050-12-30` plus three business days is
`2051-01-05`, because 12/31 is a Saturday, 1/1 is New Year's Day, and 1/2 is its substitute
holiday; a loop built on a library whose data ends in 2050 counts those last two as working days
and lands on `2051-01-04`.

### Wareki, and the 1873 calendar reform

`@smarthr/wareki` converts a Gregorian date to a wareki string, which is the other half of what
this package does. At the boundary it invents dates:

```ts
dateToWareki(new Date(1872, 11, 31));
// → { isValid: true, result: '明治5年12月31日', … }

toWareki('1872-12-31');
// → throws UnsupportedWarekiRangeError
```

明治5年12月31日 never existed. Japan switched calendars by declaring 明治5年12月3日 to be
明治6年1月1日, so 明治5年12月 ended after two days. Dates before the reform are lunisolar and do
not line up with Gregorian ones at all, which is why this package refuses them instead of
formatting them.

What each package exports, what each answers for those dates, and the wareki result above are
re-measured in CI against those exact pinned versions —
[`test/alternatives.test.ts`](./test/alternatives.test.ts) — rather than quoted from a survey.

## Install

```sh
npm install japan-calendar
```

```ts
import { isHoliday, addBusinessDays } from 'japan-calendar';

isHoliday('2026-05-05');
// → { date: { year: 2026, month: 5, day: 5 }, name: 'こどもの日',
//     category: 'statutory', confirmed: true }

isHoliday('2026-05-07');
// → null

addBusinessDays('2026-05-01', 3);
// → { year: 2026, month: 5, day: 11 }
//   Three business days after Friday 5/1 lands on Monday 5/11: Golden Week
//   eats 5/3–5/6 (including the substitute holiday for 5/3 falling on a Sunday).
```

Node.js 20+. No dependencies, no runtime data fetching, and the ESM bundle runs
unchanged in browsers and on Cloudflare Workers.

> **Maintenance posture.** The version is `0.x`, so the API may still change
> between minor releases; anything that changes is recorded in
> [CHANGELOG.md](./CHANGELOG.md). This is a personal project maintained on a
> best-effort basis. Read the next section before relying on it for anything
> that matters.

## Support scope and disclaimer

What this library covers, and what it deliberately does not:

- **Supported years.** Holiday and business-day functions cover
  1949-2099; anything outside raises `OutOfRangeError`. Wareki conversion
  covers Meiji 6-1-1 (1873-01-01) onward.
- **Equinox dates beyond `equinoxConfirmedThrough` are forecasts, not
  facts.** They are returned with `confirmed: false`. Don't treat them as
  settled dates — check the flag.
- **Wareki conversions of future dates assume the current era continues.**
  An era's end is not knowable in advance — the 2019 Heisei → Reiwa change
  is the standing precedent — so converting a future date to or from wareki
  is a forecast in the same sense as an unconfirmed equinox, not a settled
  fact. There is no upper bound on the supported range; the assumption just
  grows with the distance.
- **1949-1954 cannot be independently verified.** Those six years fall
  outside the official data, so they rely on the approximation formula's
  extrapolation. They are pinned by tests derived from the text of the
  1948 Public Holiday Law, which is the best available check, not a
  confirmation against published dates.
- **Only two calendars are provided**, `'national'` and `'bank'`.
  Company- or industry-specific closure days are out of scope.
- **No warranty.** The software is provided "AS IS" under the MIT
  License. Holiday and business-day results are not guaranteed to be
  fit for legal, financial, or regulatory decisions; verify against the
  Cabinet Office's own publication where correctness is load-bearing.

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

## API

```ts
import {
  isHoliday,
  holidaysForYear,
  isBusinessDay,
  addBusinessDays,
  businessDaysBetween,
  toWareki,
  formatWareki,
  fromWareki,
} from 'japan-calendar';

isHoliday('2026-09-22');
// => { date: {year:2026,month:9,day:22}, name: '国民の休日', category: 'bridge', confirmed: true }

holidaysForYear(2026).length;
// => 18 (every holiday in the year, in date order, substitute and bridge
//        holidays included; statutoryHolidaysForYear omits those two kinds)

holidaysForYear(2026)[0];
// => { date: {year:2026,month:1,day:1}, name: '元日', category: 'statutory', confirmed: true }

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

### Holiday lists are frozen

`holidaysForYear` and `statutoryHolidaysForYear` memoize their result and
hand **the same frozen array** to every caller, holidays and their `date`
objects included. Sorting or otherwise mutating it in place throws a
`TypeError` in strict mode (which ES modules always are):

```ts
holidaysForYear(2026).sort(byWhatever);   // ✗ TypeError — frozen
[...holidaysForYear(2026)].sort(byWhatever);  // ✓ copy first
```

The freeze is not decoration. Without it a caller's in-place `.sort()`
rewrites the cached list for the rest of the process — and on Cloudflare
Workers, for every later request sharing the isolate — so a later
`isHoliday` would answer from data someone else reordered.

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

### Other arguments are checked too

The same rule applies to every argument, not just dates. A wrong argument
raises `InvalidArgumentError` rather than producing a plausible answer:

```ts
isBusinessDay('2026-12-31', 'Bank');   // ✗ InvalidArgumentError — only 'national' | 'bank'
addBusinessDays('2026-08-03', NaN);    // ✗ InvalidArgumentError — days must be a safe integer
addBusinessDays('2026-08-03', 1.5);    // ✗ InvalidArgumentError
holidaysForYear(2026.5);               // ✗ InvalidArgumentError — year must be an integer
formatWareki(w, 'JA');                 // ✗ InvalidArgumentError — unknown format
```

This matters most from plain JavaScript, and from TypeScript whenever the
value arrives as a `string` from JSON, a query parameter, or a form field —
the type annotation isn't there at runtime. A capitalization slip like
`'Bank'` is the dangerous case: it isn't the bank calendar, and answering
as if it were the national one would be a wrong answer delivered with
confidence.

### Errors

Every exception extends `JapanCalendarError`, so one `catch` covers them all.

| Error | Raised when |
|---|---|
| `InvalidDateInputError` | A date argument can't be interpreted, or names a day that doesn't exist |
| `InvalidArgumentError` | A non-date argument has the wrong type or isn't an accepted value |
| `OutOfRangeError` | A date is outside 1949–2099 |
| `UnsupportedWarekiRangeError` | A wareki conversion before Meiji 6-1-1 (1873-01-01) |
| `MeijiReformError` | Meiji 5, month 12, days 3–31 — the 29 days the 1873 reform removed |
| `InvalidWarekiDateError` | A wareki date outside its own era's span, e.g. Shōwa 64-1-8 |

`isHoliday` returns `null` rather than throwing when the date is simply not
a holiday; it throws only when the input itself is unusable.

Error messages quote the offending value, capped at 200 characters — the
Worker copies them into its 400 bodies, and a message that reflects a
caller's entire input turns the API into an echo service.

### About the equinox approximation formula

The approximation formula in `src/rules/equinox.ts` has been verified
against the Cabinet Office's official data (1955-2027, 146
vernal/autumnal dates in total) with **zero discrepancies**. Years
1949-1954 (outside the official data's coverage) have no way to be
verified and rely purely on this formula's extrapolation.

## Cloudflare Workers

**There is no hosted instance of this API.** `worker/index.ts` is a thin
HTTP layer over the library that you deploy to your own Cloudflare
account; the URLs below are relative to wherever you deploy it. Zero
runtime dependencies, same as the library itself.

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
Wareki responses get the long lifetime only for dates that have already
passed — a future date's conversion assumes the current era continues,
so it gets the short one.
Errors are the library's own exceptions, passed straight through as
`{ error: { type, message } }` with a 4xx status.

Deploying it is a maintainer/operator task — see
[For maintainers](#for-maintainers) for the commands.

## Roadmap

### Under consideration

Driven by what real calendar work actually needs, not by a feature list. Each
of these is written up with the reasoning for why it was *not* done by
default — **if one of them is what you need, say so on the issue.** Real use
cases are what decide whether they ship and what their defaults are.

- [An upper bound, or a forecast flag, on wareki conversion](https://github.com/tomatomerde/japan-calendar/issues/51)
  — `toWareki('9999-12-31')` returns 令和7981年, and it looks as settled as 令和8年
- [A copy-returning variant of `holidaysForYear`](https://github.com/tomatomerde/japan-calendar/issues/52)
  — the freeze protects a shared cache, but `.sort()` fails in the caller's code
- [Exposing which non-business days a calculation skipped](https://github.com/tomatomerde/japan-calendar/issues/53)
  — the answer is checkable only if you re-derive it, and that re-derivation is
  easy to get wrong
- [Handling out-of-range dates without throwing](https://github.com/tomatomerde/japan-calendar/issues/54)
  — other libraries answer `false` past their range; this one refuses, and that
  difference costs the caller a `try`

All of them would be **opt-in and off by default**. This library reports what it
cannot determine instead of guessing at it, and none of these change that.

New request? [Open one](https://github.com/tomatomerde/japan-calendar/issues/new?template=feature_request.yml)
— bring the actual calls and the results you expect, that is the part that
decides things.

## For maintainers

The rest of this file is about working on the library rather than using it.
Contributors should start from [CONTRIBUTING.md](./CONTRIBUTING.md).

**Working on this repository needs Node.js 22+**, even though the published
package supports Node.js 20+. The `scripts/` entry points below are run as
`.ts` files through Node's type stripping, and `wrangler` also requires 22.
The 20+ promise covers the published artifact, and every release verifies it
by installing the packed tarball on a real Node 20 runtime.

## Updating the official data

The Cabinet Office's site is blocked by the dev environment's egress
policy, so the CSV is fetched via GitHub Actions instead.

```sh
# Local (requires network access)
node scripts/fetch-syukujitsu.ts

# View a summary of the already-baked-in data (no network needed)
node scripts/report.ts
```

The **Update holiday data** GitHub Actions workflow runs monthly (the 1st
at 21:00 UTC, which is the 2nd at 06:00 JST) and pushes any diff to the
`chore/update-holiday-data` branch. It can also be run manually via
`workflow_dispatch`.

## Running and deploying the Worker

```sh
npm run worker:dev      # run locally (wrangler dev)
npm run worker:deploy   # deploy to your own Cloudflare account
```

## Test suite

```sh
npm test               # run all tests
npm run test:tz        # run all tests under 4 timezones and confirm identical results
npm run typecheck      # type-check all 3 projects: the library, scripts, and the Worker
```

What each test file covers, and which of them you need to re-run after
touching a given area, is in
[CONTRIBUTING.md](./CONTRIBUTING.md#what-each-test-file-covers).

## Build & package layout

```sh
npm run build           # emits dist/esm (ESM + type declarations) and dist/cjs (CommonJS)
```

`package.json`'s `exports` field serves ESM, CJS, and type declarations
separately. `dist/cjs/package.json` (`{"type":"commonjs"}`) is written
during the build so the CJS output doesn't clash with the repo root's
`"type": "module"`.

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md).

## License

The software is MIT licensed. See [NOTICE](./NOTICE) for the bundled
data's source and terms.
