# Browser Regression Coverage

For the full maintainer decision table across contract tests, performance
harnesses, release-detector replay, release-readiness summaries, broad UI
validation, and docs-only checks, start with
`../docs/maintainer-validation-guide.md`.

The Playwright suite has two layers:

- `smoke.spec.ts` checks route render, navigation, and cross-browser console stability.
- `regression-flows.spec.ts` covers high-value user journeys that have crossed feature boundaries: guided Auto Team Builder, compare sources, saved-team transfer, share links/codes, and invalid payload handling.

Regression tests seed only browser-local Capacitor Preferences keys:

- `CapacitorStorage.appLanguage`
- `CapacitorStorage.analyticsConsent`
- `CapacitorStorage.savedTeams`

Keep new scenarios deterministic. Prefer stable seeded teams and `data-testid` hooks over incidental Ionic popover structure, visual pixels, network timing, or generated class names. Failure traces, screenshots, videos, the HTML report, and `test-results/` are uploaded by CI for debugging.

CI already runs each browser project with one worker through `playwright.config.ts`.
For scoped browser runs, the E2E wrapper first runs the non-guided suite and then
runs `@guided-auto-build` as a serialized second leg with separate
report/output directories. Firefox and WebKit keep a guided controls subset in
the blocking matrix. The full guided worker state-transition case remains an
explicit browser-specific exception and is kept visible by the non-blocking
quarantine job until it meets the restoration criteria. When developers pass
flags or file filters through npm, the wrapper delegates directly to Playwright
so filtered and debug workflows behave like direct Playwright usage.

## Flake Triage And Quarantine

Treat a browser failure as a regression when it reproduces locally, fails the
same assertion across retries, points at changed product code, or leaves the UI
in a state a user could hit. Treat it as a flake candidate only after the failure
is isolated to timing, browser infrastructure, or an interaction helper and a
fresh rerun on the same commit passes without code changes.

Quarantine is a temporary, explicit exception for repeated unstable cases. To
quarantine a test, add an `@quarantined:<case-id>` tag to the test title and add
the same tag to `quarantine.json` with the affected browser list, reason,
tracking URL, first-seen evidence, owner, and restoration criteria. The metadata
validator fails when a spec tag and `quarantine.json` drift.

CI keeps quarantined coverage visible without blocking unrelated work:

- the normal browser matrix runs `scripts/run-playwright-e2e.mjs` with
  `--quarantine-mode=exclude`
- the non-blocking quarantine matrix runs with `--quarantine-mode=only`
- both paths upload `playwright-report/`, `test-results/`, JSON reporter output,
  and the generated failure summary

Restore a quarantined test by fixing or stabilizing the root cause, removing the
title tag and metadata entry in the same PR, and proving the restored case with
the affected browser command plus the regular CI matrix. Do not leave stale
metadata behind after a test is restored.

## Opt-in Performance Guardrails

`Performance Budgets` is the recurring GitHub Actions workflow for these
browser-timing guardrails. It runs on weekday schedules from `main` and supports
manual dispatch as the release-candidate preflight path. The workflow runs both
browser harnesses with `PERF_ASSERT=0`, then `npm run perf:budget-report`
writes the current report after the JSON and screenshots have been captured.
Scheduled and default manual runs are report-only, so noisy browser regressions
surface in the summary and artifacts without blocking unrelated work. Set the
manual `fail_on_regression` input to `true` when a release-candidate preflight
should fail on hard-budget misses.

The workflow uploads one `performance-budget-report` artifact. It contains:

- `performance-budget-report.json` with schema version, workflow metadata,
  metric rows, hard-budget failures, and baseline-delta warnings.
- `performance-budget-summary.md` with the current maintainer-readable summary.
- `performance-budget-history.json` with recent run metadata and per-metric
  trend rows.
- `performance-budget-history.md` with the trend summary for maintainers.
- `current/ability/` with the ability-filter timing JSON and screenshots.
- `current/explanation/` with the explanation/compare timing JSON and
  screenshots.

On scheduled runs, the report compares against the latest successful
`Performance Budgets` artifact on `main`. On manual runs, pass
`baseline_run_id` to compare against a specific successful run. If no baseline
exists, the run still enforces hard budgets and establishes the first artifact
baseline.

Baseline deltas are warnings, not failures, when a metric rises by at least 35%
and 100ms. Hard budgets mark the report as failed. They fail the workflow only
when `fail_on_regression=true`.

`npm run perf:explanation-compare` measures Auto Team Builder compare rendering
and explanation-detail expansion with deterministic large fixtures. It starts a
local dev server when `PERF_BASE_URL` is not already serving, writes screenshots
and JSON to `PERF_ARTIFACT_DIR`, and fails when the pragmatic budgets regress.
When `PERF_ARTIFACT_DIR` is not set, local OPTC workspace checkouts use the
sibling brain repo at `../optc-team-builder-brain/live-artifacts/869dvr7x5`;
other machines fall back to `perf-artifacts/explanation-compare` under this
repo.

- desktop compare open `<=800ms`, imported compare apply `<=1200ms`
- mobile compare open `<=1000ms`, imported compare apply `<=1500ms`
- desktop first/all explanation toggles `<=300ms` / `<=900ms`
- mobile first/all explanation toggles `<=450ms` / `<=1200ms`

`npm run perf:ability-filters` measures deterministic Saved Teams, Saved
Enemies, and Manual Team Builder ability-filter flows in desktop and mobile
Chromium viewports. The recurring workflow budgets are:

- saved teams first ability toggle `<=800ms` desktop and `<=1000ms` mobile
- saved enemies first ability toggle `<=500ms`
- manual picker open `<=800ms`
- manual special-filter apply `<=2500ms`

Page-ready timings are reported for before/after context but are not
hard-budgeted.

Set `PERF_ASSERT=0` to collect artifacts without failing on the budgets.

Build the current report and trend history locally from collected artifacts with:

Command status: manual/illustrative.
<!-- docs-command: manual/illustrative -->
```bash
npm run perf:budget-report -- --current-dir perf-artifacts/current --output perf-artifacts/performance-budget-report.json --summary perf-artifacts/performance-budget-summary.md --report-only
npm run perf:budget-history -- --current-report perf-artifacts/performance-budget-report.json --history-dir perf-artifacts/history --output perf-artifacts/performance-budget-history.json --summary perf-artifacts/performance-budget-history.md
```
