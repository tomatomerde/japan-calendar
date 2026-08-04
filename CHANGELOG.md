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
- A `confirmed` flag on Vernal Equinox Day and Autumnal Equinox Day
  (and on any substitute/national holiday derived from them),
  computed from the latest year covered by the official Cabinet Office data.
- Business-day arithmetic: `isBusinessDay`, `addBusinessDays`,
  `businessDaysBetween`, with `'national'` and `'bank'` calendars.
- Wareki (Japanese era) conversion: `toWareki`, `fromWareki`,
  `formatWareki`, covering Meiji 6-1-1 (1873-01-01) onward.
- A script (`scripts/fetch-syukujitsu.ts`) that fetches the Cabinet
  Office's `syukujitsu.csv` and bakes it into `src/data/official.ts`,
  run monthly by a GitHub Actions workflow.
- A test suite that checks the rule engine's output against every date
  in the official data (1955 through the latest year covered).
- A Cloudflare Workers HTTP API (`worker/index.ts`) exposing the library
  over `GET /v1/*` routes.
- A dual ESM/CommonJS build (`npm run build`) and package layout ready
  for npm publishing.

### Fixed

- `holidaysForYear` and `statutoryHolidaysForYear` (both part of the
  public API) didn't validate their `year` argument, unlike `isHoliday`.
  A year past 2099 would silently compute holidays using an equinox
  formula with no validity guarantee instead of throwing `OutOfRangeError`,
  and a year before 1949 would return an empty array indistinguishable
  from "no holidays this year". Both now validate their input the same
  way `isHoliday` does.
- `equinoxConfirmedThrough` alone let 1949-1954 (years before the
  official data's actual coverage starts) report `confirmed: true` for
  Vernal/Autumnal Equinox Day, even though those years have never been
  checked against real data. `confirmed` now also requires the year to
  be at or after `OFFICIAL_META.firstYear`.
- `update-holidays.yml` pushed to `chore/update-holiday-data` with
  `--force-with-lease`, which rejects every run after the first because
  `actions/checkout`'s shallow, single-branch clone has no
  remote-tracking ref for that branch to form a lease against. Switched
  to a plain `--force` (safe here: the branch only ever holds
  bot-regenerated data). The workflow now also opens (or reuses) a pull
  request instead of leaving the branch for someone to notice manually,
  so the update actually gets tested and reviewed.
- `computeBridgeHolidays` decided whether a national holiday's flanking
  day should be excluded by checking if the *preceding* holiday fell on
  a Sunday -- a proxy for "is this candidate day already a substitute
  holiday". It now checks the candidate day against the actual computed
  substitute holidays directly. (The old proxy happened to produce
  correct results for every year in the supported range, verified by the
  exhaustive invariant checks added in `test/invariants.test.ts`, but was
  not structurally guaranteed to.)
- `test/officialMatch.test.ts`, the strongest test in the suite, would
  silently skip instead of failing if `src/data/official.ts` ever ended
  up without data (e.g. from a bad merge). It now fails with a clear
  message instead.
- CI ran `typecheck` and `test` but never `npm run build`, so a broken
  dual-package build (this actually happened once during development)
  could land on `main` unnoticed. Added a `build` job.
