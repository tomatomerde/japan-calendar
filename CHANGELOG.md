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
  Workers request's CPU budget.
- Wareki (Japanese era) conversion: `toWareki`, `fromWareki`,
  `formatWareki`, covering Meiji 6-1-1 (1873-01-01) onward.
- A script (`scripts/fetch-syukujitsu.ts`) that fetches the Cabinet
  Office's `syukujitsu.csv` and bakes it into `src/data/official.ts`. A
  GitHub Actions workflow runs it monthly, runs the full test suite
  against the freshly fetched data, and -- only if that passes -- pushes
  the diff and opens a pull request.
- A test suite that checks the rule engine's output against every date
  in the official data (1955 through the latest year covered);
  `test/officialMatch.test.ts` fails loudly (rather than skipping) if
  `src/data/official.ts` is ever missing its data.
- A Cloudflare Workers HTTP API (`worker/index.ts`) exposing the library
  over `GET /v1/*` routes.
- A dual ESM/CommonJS build (`npm run build`) and package layout ready
  for npm publishing. CI runs `build` alongside `typecheck` and `test`.
