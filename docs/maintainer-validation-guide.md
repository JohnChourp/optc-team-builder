# Maintainer Validation Guide

This guide is the first stop when choosing validation for OPTC Team Builder
changes. It groups the app's contract tests, browser performance harnesses,
release-detector checks, release-readiness reporting, and broad UI validation so
maintainers can pick the smallest useful path without rereading prior audits.
Use `docs/feature-coverage-map.md` when you need to find the owner and current
coverage assets for a specific product or operational flow before choosing one
of the validation paths below. Use `docs/fixture-ownership-guide.md` before
adding or moving fixtures across browser, contract, performance, release-check,
or release-readiness suites. Use `docs/review-ownership-policy.md` when a
change touches critical release, CI, fixture, data, evidence, or app-runtime
paths and you need the reviewer routing and cross-repo escalation rule.

## Decision Table

| Change type | Lightweight validation | Deep validation | What it proves | Artifact location |
| --- | --- | --- | --- | --- |
| Captain ability parser or generated captain metadata | `npm run test:captain-contracts` plus `npm run test:ci -- --include src/app/core/services/auto-team-builder-ability-parser.spec.ts` | Lightweight parser/generated gates plus `npm run test:ci -- --include scripts/import-optc-data.spec.ts --include scripts/lib/captain-ability-coverage.spec.ts`; add full `npm run test:ci` when shared runtime code changed | The builder-ability parser, script-side import boosts, and generated coverage tiers stay aligned on the shared golden captain cases | Test output only |
| Runtime captain matching or ability requirement matching | `npm run test:ci -- --include src/app/core/services/captain-coverage.utils.spec.ts --include src/app/core/services/auto-team-builder-ability-match.utils.spec.ts` | Lightweight runtime specs plus `npm run test:captain-contracts`; add full `npm run test:ci` when shared utilities or page behavior changed | Angular runtime captain coverage and ability matching stay aligned with generated captain metadata | Test output only |
| Manual-character overlays or dataset integrity checks | `npx vitest run scripts/lib/dataset-integrity.spec.ts scripts/lib/manual-character-overlay.spec.ts scripts/lib/manual-character-apply.spec.ts scripts/upsert-manual-character.spec.ts` | Lightweight manual-character specs plus `npx vitest run scripts --reporter=dot`; add `npm run test:captain-contracts` when generated ability metadata is touched | Manual overlays, linked canonical ids, generated dataset integrity, and broad script sweeps stay trustworthy | Test output only |
| Saved Teams, Saved Enemies, Manual Team Builder, or ability-filter performance | `PERF_ASSERT=0 npm run perf:ability-filters` | Run `npm run perf:ability-filters`, collect the companion explanation/import-share result, then run `npm run perf:budget-report -- --current-dir /path/to/current`; add focused unit specs for the touched page or utility | Deterministic desktop/mobile ability-filter timings are captured, and hard budgets are enforced by the budget report | `PERF_ARTIFACT_DIR` when set; otherwise `test-results/ability-filter-performance` |
| Auto Team Builder explanation detail, compare rendering, or import/share hydration performance | `PERF_ASSERT=0 npm run perf:explanation-compare` | `npm run perf:explanation-compare` plus focused Auto Team Builder, Saved Teams, or Manual Team Builder specs | Compare-panel rendering, imported compare apply, explanation expansion, heavy saved-team import, and share-link hydration stay inside pragmatic browser budgets | `PERF_ARTIFACT_DIR` when set; otherwise local OPTC checkouts default to `../optc-team-builder-brain/live-artifacts/869dvr7x5`, with other machines using `perf-artifacts/explanation-compare` |
| Release-candidate performance confidence | Manual `Performance Budgets` workflow dispatch | Scheduled/manual `Performance Budgets` workflow with an explicit `baseline_run_id`, then inspect the uploaded report | The ability-filter and explanation/compare harnesses both ran on GitHub Actions, hard-budget results were recorded, and baseline warnings were surfaced | GitHub Actions artifact `performance-budget-report` |
| OPTC DB release-detector logic, fixtures, workflow dispatch rules, or upstream replay support | `npm run test:release-check` | Run each successful bundled fixture plus the live check, and verify `node scripts/check-optc-release-needed.mjs --fixture=error --json` exits nonzero | Missing upstream character IDs are the only release trigger, fixture branches remain replayable, malformed fixture handling still fails, manual workflow dispatch defaults to report-only verification, and the live upstream read still works | Command output; workflow artifact `release-trigger-outcome` after Actions runs |
| Release-readiness summary schema, report formatting, sign-off policy, or release evidence wiring | `npm run test:release-readiness` | `npm run test:release-readiness` plus `npm run release:readiness -- --source /path/to/source.json --output /path/to/summary.md --json-output /path/to/summary.json` using current evidence | Candidate status, tests, performance report, release-trigger report, blockers, and waivers produce the intended ready/blocked decision | Paths passed to `--output` and `--json-output` |
| Broad app UI behavior, routing, saved-team/share flows, or regression-prone user journeys | Focused `npm run test:ci -- --include ...` for touched components/services | `npm run test:ci`, scoped `npm run test:e2e:*` browser runs, `npm run i18n:validate`, and `npm run build`; use all browser projects when browser-specific behavior changed | Angular units, deterministic cross-browser journeys, translation keys, and production build health remain intact; browser flakes follow the `e2e/README.md` quarantine workflow before any coverage is excluded from blocking CI | Playwright reports, `test-results/`, and failure-summary artifacts in CI |
| Docs-only, runbook-only, or audit-only changes | `npm run docs:integrity -- --brain-root ../optc-team-builder-brain`, `npm run docs:commands -- --brain-root ../optc-team-builder-brain`, plus `git diff --check` | Add targeted command validation when command examples or workflow references changed | Markdown links, explicit repo file references, OPTC public URLs, ClickUp task URLs, documented maintainer commands, and whitespace stay valid across app and brain docs | None |

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

## PR Traceability

Human-authored pull requests must keep the PR template fields filled before
review or merge:

- `ClickUp task:` must include the ClickUp task URL for ClickUp-backed work.
  Use `none - <reason>` only for human PRs that are intentionally not tied to
  ClickUp.
- `Evidence:` must point at durable evidence, usually a brain audit under
  `../optc-team-builder-brain/audits/`, a `live-artifacts/<task-id>/` path when
  live evidence exists, or a GitHub Actions artifact/run.
- `Verification:` must list concrete commands, CI checks, or review gates.

The `PR Traceability` workflow enforces those fields for human-authored PRs,
rejects placeholder evidence or verification, and only accepts workspace-scoped
ClickUp URLs for the OPTC workspace when a workspace segment is present. Short
ClickUp task URLs may use regular task IDs or ClickUp custom task IDs.
Bot-authored dependency or automation PRs are skipped so routine update PRs do
not fail only because no ClickUp task exists.

## Review Ownership

Critical app paths are routed through `.github/CODEOWNERS` and documented in
`docs/review-ownership-policy.md`. The current owner route is `@JohnChourp`
because the implementation audit found no other repository collaborators.

`CODEOWNERS` requests the right review, but required-review enforcement still
depends on GitHub branch protection or repository rulesets. Until that setting
is enabled, maintainers should treat the owner request and the PR traceability
fields as the review gate for release automation, CI, shared fixtures, evidence
docs, generated data, and major user-facing flows.

## Command Details

Fenced shell examples below include a command status. `CI-executable` commands
are part of the docs command verification allowlist; `manual/illustrative`
commands remain documented for maintainers but are not executed by that gate.

### Captain Contracts

Run the focused contract gates before changing captain parser or generated
captain metadata logic:

Command status: manual/illustrative.
<!-- docs-command: manual/illustrative -->
```bash
npm run test:captain-contracts
```

Command status: manual/illustrative.
<!-- docs-command: manual/illustrative -->
```bash
npm run test:ci -- --include src/app/core/services/auto-team-builder-ability-parser.spec.ts
```

These commands cover the script-side import/captain coverage specs and the
Angular builder-ability parser spec. Use the runtime row in the decision table
when the change crosses into captain matching services or page behavior.

### Manual Character Dataset Integrity

Run the focused manual-character script gate before changing the manual overlay,
upsert, apply, or dataset-integrity contract:

Command status: CI-executable.
<!-- docs-command: ci-executable -->
```bash
npx vitest run scripts/lib/dataset-integrity.spec.ts scripts/lib/manual-character-overlay.spec.ts scripts/lib/manual-character-apply.spec.ts scripts/upsert-manual-character.spec.ts
```

Use the broad script sweep when the change affects shared script validation or
when a focused script failure was previously quarantined:

Command status: manual/illustrative.
<!-- docs-command: manual/illustrative -->
```bash
npx vitest run scripts --reporter=dot
```

Reserved manual ids (`>= 900000`) may keep a distinct existing canonical
`detail.characterId` for linked variants. Non-manual rows still require
`detail.characterId` to match the row id.

### Browser Performance

Ability-filter harness:

Command status: manual/illustrative.
<!-- docs-command: manual/illustrative -->
```bash
PERF_ARTIFACT_DIR=/path/to/artifacts PERF_RUN_LABEL=local-ability npm run perf:ability-filters
```

Explanation/compare/import-share harness:

Command status: manual/illustrative.
<!-- docs-command: manual/illustrative -->
```bash
PERF_ARTIFACT_DIR=/path/to/artifacts PERF_RUN_LABEL=local-explanation npm run perf:explanation-compare
```

`perf:ability-filters` records timings and screenshots but does not enforce hard
budgets by itself. To enforce ability-filter budgets locally, place the ability
result under a shared current directory, include an explanation/compare result,
then run the budget report:

Command status: manual/illustrative.
<!-- docs-command: manual/illustrative -->
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

Command status: manual/illustrative.
<!-- docs-command: manual/illustrative -->
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

Command status: manual/illustrative.
<!-- docs-command: manual/illustrative -->
```bash
npm run perf:budget-report -- --current-dir perf-artifacts/current --output perf-artifacts/performance-budget-report.json --summary perf-artifacts/performance-budget-summary.md --report-only
npm run perf:budget-history -- --current-report perf-artifacts/performance-budget-report.json --history-dir perf-artifacts/history --output perf-artifacts/performance-budget-history.json --summary perf-artifacts/performance-budget-history.md
```

### Release Detector

Use the focused test first:

Command status: manual/illustrative.
<!-- docs-command: manual/illustrative -->
```bash
npm run test:release-check
```

Replay bundled branches before changing release-detector logic or workflow
dispatch policy:

Command status: CI-executable.
<!-- docs-command: ci-executable -->
```bash
npm run data:check-release -- --fixture=no-change --json
npm run data:check-release -- --fixture=new-character --json
npm run data:check-release -- --fixture=active-release-running --json
npm run data:check-release -- --fixture=upstream-shape-drift --json
```

The `error` fixture is intentionally malformed and should exit nonzero. Keep it
as an expected-failure check:

Command status: CI-executable; this command is expected to exit nonzero.
<!-- docs-command: ci-executable -->
```bash
node scripts/check-optc-release-needed.mjs --fixture=error --json
```

Use the live check when validating current upstream state:

Command status: manual/illustrative.
<!-- docs-command: manual/illustrative -->
```bash
npm run data:check-release -- --json
```

Manual `Check OPTC DB Release` workflow dispatches default to
`release_dispatch_mode=verify-only`, which writes the same report artifact but
blocks `Release Android` dispatch even when new upstream IDs exist. Use
`dispatch-if-needed` only when the manual run is intended to trigger a production
Android release if the detector finds new IDs.

For captured upstream incident replay, pass both remote files together:

Command status: manual/illustrative.
<!-- docs-command: manual/illustrative -->
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

Command status: manual/illustrative.
<!-- docs-command: manual/illustrative -->
```bash
npm run test:release-readiness
```

Render a real candidate summary from collected evidence:

Command status: manual/illustrative.
<!-- docs-command: manual/illustrative -->
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

### Docs Integrity

Use the shared docs checker before merging README, guide, runbook, or audit
changes:

Command status: CI-executable.
<!-- docs-command: ci-executable -->
```bash
npm run docs:integrity -- --brain-root ../optc-team-builder-brain
```

For untrusted pull requests that cannot receive the private brain checkout, CI
also exercises the app-only docs path:

Command status: CI-executable.
<!-- docs-command: ci-executable -->
```bash
npm run docs:integrity -- --app-only
```

The checker scans committed Markdown docs in both repos for broken Markdown
links and anchors, explicit repo file references, stale OPTC public URLs, and
ClickUp task URL shape. It syntax-checks `live-artifacts/<task-id>/...`
references without requiring ignored local screenshots to exist. For intentional
historical or generated references, place
`<!-- docs-integrity-ignore-next-line: <reason> -->` immediately before the
line.

Use `npm run docs:commands -- --brain-root ../optc-team-builder-brain` when a
PR adds, removes, or changes maintainer command examples. The docs-command gate
requires each fenced shell example in active maintainer docs to be labeled as
`CI-executable` or `manual/illustrative`; it executes only the allowlisted
CI-executable commands and leaves release, secret-dependent, live-network,
server, signing, and artifact-collection examples as manual guidance.

## Ownership Rule

When a PR adds, removes, renames, or materially changes a validation harness,
workflow, release report, artifact path, or maintainer command, update this
guide in the same PR. The owner of the changed harness or workflow owns keeping
the decision table, command examples, artifact locations, and lightweight/deep
guidance current.

When a PR adds, removes, renames, or materially changes checked-in fixtures or
shared fixture builders, update `docs/fixture-ownership-guide.md` in the same
PR with the owner, consumers, and regeneration rule.
