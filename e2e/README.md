# Browser Regression Coverage

The Playwright suite has two layers:

- `smoke.spec.ts` checks route render, navigation, and cross-browser console stability.
- `regression-flows.spec.ts` covers high-value user journeys that have crossed feature boundaries: guided Auto Team Builder, compare sources, saved-team transfer, share links/codes, and invalid payload handling.

Regression tests seed only browser-local Capacitor Preferences keys:

- `CapacitorStorage.appLanguage`
- `CapacitorStorage.analyticsConsent`
- `CapacitorStorage.savedTeams`

Keep new scenarios deterministic. Prefer stable seeded teams and `data-testid` hooks over incidental Ionic popover structure, visual pixels, network timing, or generated class names. Failure traces, screenshots, videos, the HTML report, and `test-results/` are uploaded by CI for debugging.

CI already runs each browser project with one worker through `playwright.config.ts`.
The default E2E wrapper isolates the Chromium guided-build worker scenario in a
second Playwright run with separate report/output directories. When developers
pass flags or file filters through npm, the wrapper delegates directly to
Playwright so filtered and debug workflows behave like direct Playwright usage.

## Opt-in Performance Guardrails

`Performance Budgets` is the recurring GitHub Actions workflow for these
browser-timing guardrails. It runs on weekday schedules from `main` and supports
manual dispatch as the release-candidate preflight path. The workflow runs both
browser harnesses with `PERF_ASSERT=0`, then `npm run perf:budget-report`
decides the final pass/fail result after the JSON and screenshots have been
written. Normal pull requests are not blocked by these noisy browser timings.

The workflow uploads one `performance-budget-report` artifact. It contains:

- `performance-budget-report.json` with schema version, workflow metadata,
  metric rows, hard-budget failures, and baseline-delta warnings.
- `current/ability/` with the ability-filter timing JSON and screenshots.
- `current/explanation/` with the explanation/compare timing JSON and
  screenshots.

On scheduled runs, the report compares against the latest successful
`Performance Budgets` artifact on `main`. On manual runs, pass
`baseline_run_id` to compare against a specific successful run. If no baseline
exists, the run still enforces hard budgets and establishes the first artifact
baseline.

Baseline deltas are warnings, not failures, when a metric rises by at least 35%
and 100ms. Hard budgets fail the workflow.

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
