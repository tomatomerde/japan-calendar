# Contributing

Thanks for considering a contribution to japan-calendar.

## Getting started

```sh
npm install
npm run typecheck   # type-checks the library, scripts, and the Worker
npm test            # runs the full test suite
```

Node 20+ is required. Scripts and tests run directly against `.ts` files
using Node's built-in type stripping — no build step is needed for
development.

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
scripts/                 data-fetching and reporting scripts
worker/                  Cloudflare Workers HTTP API
test/                    vitest test suite
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
