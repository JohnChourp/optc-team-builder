# Maintainer Validation Guide

This guide is the first stop when choosing validation for OPTC Team Builder
changes. It groups the app's contract tests, browser performance harnesses,
release-detector checks, release-readiness reporting, and broad UI validation so
maintainers can pick the smallest useful path without rereading prior audits.

## Decision Table

| Change type | Lightweight validation | Deep validation | What it proves | Artifact location |
| --- | --- | --- | --- | --- |
| Captain ability parser or generated captain metadata | `npm run test:captain-contracts` plus `npm run test:ci -- --include src/app/core/services/auto-team-builder-ability-parser.spec.ts` | Lightweight parser/generated gates plus `npm run test:ci -- --include scripts/import-optc-data.spec.ts --include scripts/lib/captain-ability-coverage.spec.ts`; add full `npm run test:ci` when shared runtime code changed | The builder-ability parser, script-side import boosts, and generated coverage tiers stay aligned on the shared golden captain cases | Test output only |
| Runtime captain matching or ability requirement matching | `npm run test:ci -- --include src/app/core/services/captain-coverage.utils.spec.ts --include src/app/core/services/auto-team-builder-ability-match.utils.spec.ts` | Lightweight runtime specs plus `npm run test:captain-contracts`; add full `npm run test:ci` when shared utilities or page behavior changed | Angular runtime captain coverage and ability matching stay aligned with generated captain metadata | Test output only |
| Manual-character overlays or dataset integrity checks | `npx vitest run scripts/lib/dataset-integrity.spec.ts scripts/lib/manual-character-overlay.spec.ts scripts/lib/manual-character-apply.spec.ts scripts/upsert-manual-character.spec.ts` | Lightweight manual-character specs plus `npx vitest run scripts --reporter=dot`; add `npm run test:captain-contracts` when generated ability metadata is touched | Manual overlays, linked canonical ids, generated dataset integrity, and broad script sweeps stay trustworthy | Test output only |
| Saved Teams, Saved Enemies, Manual Team Builder, or ability-filter performance | `PERF_ASSERT=0 npm run perf:ability-filters` | Run `npm run perf:ability-filters`, collect the companion explanation result, then run `npm run perf:budget-report -- --current-dir /path/to/current`; add focused unit specs for the touched page or utility | Deterministic desktop/mobile ability-filter timings are captured, and hard budgets are enforced by the budget report | `PERF_ARTIFACT_DIR` when set; otherwise `test-results/ability-filter-performance` |
| Auto Team Builder explanation detail or compare rendering performance | `PERF_ASSERT=0 npm run perf:explanation-compare` | `npm run perf:explanation-compare` plus focused Auto Team Builder specs | Compare-panel rendering, imported compare apply, and explanation expansion stay inside pragmatic browser budgets | `PERF_ARTIFACT_DIR` when set; otherwise local OPTC checkouts default to `../optc-team-builder-brain/live-artifacts/869dvr7x5`, with other machines using `perf-artifacts/explanation-compare` |
| Release-candidate performance confidence | Manual `Performance Budgets` workflow dispatch | Scheduled/manual `Performance Budgets` workflow with an explicit `baseline_run_id`, then inspect the uploaded report | The ability-filter and explanation/compare harnesses both ran on GitHub Actions, hard-budget results were recorded, and baseline warnings were surfaced | GitHub Actions artifact `performance-budget-report` |
| OPTC DB release-detector logic, fixtures, workflow dispatch rules, or upstream replay support | `npm run test:release-check` | Run each successful bundled fixture plus the live check, and verify `node scripts/check-optc-release-needed.mjs --fixture=error --json` exits nonzero | Missing upstream character IDs are the only release trigger, fixture branches remain replayable, malformed fixture handling still fails, and the live upstream read still works | Command output; workflow artifact `release-trigger-outcome` after Actions runs |
| Release-readiness summary schema, report formatting, sign-off policy, or release evidence wiring | `npm run test:release-readiness` | `npm run test:release-readiness` plus `npm run release:readiness -- --source /path/to/source.json --output /path/to/summary.md --json-output /path/to/summary.json` using current evidence | Candidate status, tests, performance report, release-trigger report, blockers, and waivers produce the intended ready/blocked decision | Paths passed to `--output` and `--json-output` |
| Broad app UI behavior, routing, saved-team/share flows, or regression-prone user journeys | Focused `npm run test:ci -- --include ...` for touched components/services | `npm run test:ci`, `npm run test:e2e:chromium`, `npm run i18n:validate`, and `npm run build`; use all browser projects when browser-specific behavior changed | Angular units, deterministic Chromium journeys, translation keys, and production build health remain intact | Playwright reports and `test-results/` in CI |
| Docs-only, runbook-only, or audit-only changes | `git diff --check` | Add targeted command validation only when command examples or workflow references changed | Markdown has no whitespace errors and examples stay scoped to the changed documentation | None |

## Lightweight vs Deep Runs

Use a lightweight run when the change is localized, the touched surface has a
single focused guardrail, and the change does not alter shared runtime behavior,
workflow control flow, or persisted formats.

Use a deep run when any of these are true:

- the change touches shared parser, catalog, filter, release, or report logic
- the change updates GitHub Actions behavior or maintainer release policy
- the change changes command examples that operators will copy during incidents
- a prior lightweight run fails or produces surprising output
- the PR is a release-candidate or post-merge recovery path

Docs-only edits do not need live serve or browser screenshots unless they change
a runnable command that must be proven through the UI. UI evidence, when needed
for an OPTC task, belongs in the brain repo under
`../optc-team-builder-brain/live-artifacts/<task-id>/`.

## Command Details

### Captain Contracts

Run the focused contract gates before changing captain parser or generated
captain metadata logic:

```bash
npm run test:captain-contracts
npm run test:ci -- --include src/app/core/services/auto-team-builder-ability-parser.spec.ts
```

These commands cover the script-side import/captain coverage specs and the
Angular builder-ability parser spec. Use the runtime row in the decision table
when the change crosses into captain matching services or page behavior.

### Manual Character Dataset Integrity

Run the focused manual-character script gate before changing the manual overlay,
upsert, apply, or dataset-integrity contract:

```bash
npx vitest run scripts/lib/dataset-integrity.spec.ts scripts/lib/manual-character-overlay.spec.ts scripts/lib/manual-character-apply.spec.ts scripts/upsert-manual-character.spec.ts
```

Use the broad script sweep when the change affects shared script validation or
when a focused script failure was previously quarantined:

```bash
npx vitest run scripts --reporter=dot
```

Reserved manual ids (`>= 900000`) may keep a distinct existing canonical
`detail.characterId` for linked variants. Non-manual rows still require
`detail.characterId` to match the row id.

### Browser Performance

Ability-filter harness:

```bash
PERF_ARTIFACT_DIR=/path/to/artifacts PERF_RUN_LABEL=local-ability npm run perf:ability-filters
```

Explanation/compare harness:

```bash
PERF_ARTIFACT_DIR=/path/to/artifacts PERF_RUN_LABEL=local-explanation npm run perf:explanation-compare
```

`perf:ability-filters` records timings and screenshots but does not enforce hard
budgets by itself. To enforce ability-filter budgets locally, place the ability
result under a shared current directory, include an explanation/compare result,
then run the budget report:

```bash
PERF_ARTIFACT_DIR=perf-artifacts/current/ability npm run perf:ability-filters
PERF_ARTIFACT_DIR=perf-artifacts/current/explanation PERF_ASSERT=0 npm run perf:explanation-compare
npm run perf:budget-report -- --current-dir perf-artifacts/current
```

`perf:explanation-compare` enforces its own budgets unless `PERF_ASSERT=0` is
set. Use `PERF_ASSERT=0` when collecting timing evidence without failing the
command on budget regressions. Leave assertions enabled when the explanation
and compare harness itself is the merge gate or release-candidate confidence
check.

### Performance Budgets

Use the `Performance Budgets` GitHub Actions workflow for recurring or release
candidate performance evidence. The workflow runs both browser harnesses,
combines them with:

```bash
npm run perf:budget-report
```

and uploads `performance-budget-report`. The artifact includes the current JSON
report, current markdown summary, trend-history JSON, trend-history markdown,
and raw current harness screenshots/JSON. Scheduled runs and default manual
dispatches are report-only: hard-budget failures mark the report as failed but
do not fail the workflow. Use the manual `fail_on_regression=true` input when a
release-candidate preflight should fail on hard-budget misses. Baseline deltas
remain warnings.

To rebuild the scheduled report locally from collected harness output:

```bash
npm run perf:budget-report -- --current-dir perf-artifacts/current --output perf-artifacts/performance-budget-report.json --summary perf-artifacts/performance-budget-summary.md --report-only
npm run perf:budget-history -- --current-report perf-artifacts/performance-budget-report.json --history-dir perf-artifacts/history --output perf-artifacts/performance-budget-history.json --summary perf-artifacts/performance-budget-history.md
```

### Release Detector

Use the focused test first:

```bash
npm run test:release-check
```

Replay bundled branches before changing release-detector logic or workflow
dispatch policy:

```bash
npm run data:check-release -- --fixture=no-change --json
npm run data:check-release -- --fixture=new-character --json
npm run data:check-release -- --fixture=active-release-running --json
npm run data:check-release -- --fixture=upstream-shape-drift --json
```

The `error` fixture is intentionally malformed and should exit nonzero. Keep it
as an expected-failure check, matching the workflow guard:

```bash
if node scripts/check-optc-release-needed.mjs --fixture=error --json; then
  echo "Expected the release detector error fixture to fail." >&2
  exit 1
fi
```

Use the live check when validating current upstream state:

```bash
npm run data:check-release -- --json
```

For captured upstream incident replay, pass both remote files together:

```bash
npm run data:check-release -- --json \
  --remote-version-path=/path/to/common/data/version.js \
  --remote-units-path=/path/to/common/data/units.js
```

Use `--fixture-dir` as the alternative when replaying a full custom local
directory that contains `local-manifest.json`, `local-seed.sql`,
`remote-version.js`, and `remote-units.js`.

### Release Readiness

Use the report tests first:

```bash
npm run test:release-readiness
```

Render a real candidate summary from collected evidence:

```bash
npm run release:readiness -- \
  --source /path/to/release-readiness-source.json \
  --output /path/to/release-readiness-summary.md \
  --json-output /path/to/release-readiness-summary.json
```

`performanceBudgetReportPath` and `releaseTriggerReportPath` in the source JSON
must point at downloaded local JSON files, resolved relative to the source file.
Use links for auxiliary CI runs, QA notes, brain audits, and artifact pages
instead of copying all evidence inline.

## Ownership Rule

When a PR adds, removes, renames, or materially changes a validation harness,
workflow, release report, artifact path, or maintainer command, update this
guide in the same PR. The owner of the changed harness or workflow owns keeping
the decision table, command examples, artifact locations, and lightweight/deep
guidance current.
