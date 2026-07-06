# Maintainer Validation Guide

This guide is the first stop when choosing validation for OPTC Team Builder
changes. It groups the app's contract tests, browser performance harnesses,
release-detector checks, release-readiness reporting, and broad UI validation so
maintainers can pick the smallest useful path without rereading prior audits.
Use `docs/maintainer-operations.md` first when you need the broader
public-versus-private operations map before selecting a validation command.
Use `docs/github-linked-task-template.md` when drafting or closing a
ClickUp-backed task that should preserve rationale, GitHub links, verification,
and residual-risk notes.
Use `docs/cross-repo-architecture-map.md` when the change crosses data import,
generated assets, runtime matching, release detection, and brain audit evidence.
Use `docs/dependency-maintenance-policy.md` before reviewing dependency,
workflow, browser-test, performance, release-check, release-readiness, or native
tooling updates.
Use `docs/feature-coverage-map.md` when you need to find the owner and current
coverage assets for a specific product or operational flow before choosing one
of the validation paths below. Use `docs/fixture-ownership-guide.md` before
adding or moving fixtures across browser, contract, performance, release-check,
or release-readiness suites. Use `docs/review-ownership-policy.md` when a
change touches critical release, CI, fixture, data, evidence, or app-runtime
paths and you need the reviewer routing and cross-repo escalation rule.
Use `docs/post-merge-smoke-pack.md` after risky merges that need a short web
and release-adjacent confidence pass instead of a full release sign-off cycle.
Use `docs/copy-review-checklist.md` before changing user-facing copy, public
guide text, or release-maintenance wording so English and hybrid Greek terms
stay aligned.
Use `docs/docs-drift-map.json` when a feature/workflow path moves and you need
the required docs entry points that should move with it.
Use `docs/branch-lifecycle-policy.md` before retrying or documenting post-merge
branch cleanup, especially when GitHub returns GH013 for a merged branch.
Use `npm run doctor:maintainer -- --profile=ci --brain-root
../optc-team-builder-brain` first when a local setup, sibling checkout, package
script, or workflow prerequisite looks suspect.

## Decision Table

| Change type | Lightweight validation | Deep validation | What it proves | Artifact location |
| --- | --- | --- | --- | --- |
| Captain ability parser or generated captain metadata | `npm run test:captain-contracts` plus `npm run test:ci -- --include src/app/core/services/auto-team-builder-ability-parser.spec.ts` | Lightweight parser/generated gates plus `npm run test:ci -- --include scripts/import-optc-data.spec.ts --include scripts/lib/captain-ability-coverage.spec.ts`; add full `npm run test:ci` when shared runtime code changed | The builder-ability parser, script-side import boosts, and generated coverage tiers stay aligned on the shared golden captain cases | Test output only |
| Runtime captain matching or ability requirement matching | `npm run test:ci -- --include src/app/core/services/captain-coverage.utils.spec.ts --include src/app/core/services/auto-team-builder-ability-match.utils.spec.ts` | Lightweight runtime specs plus `npm run test:captain-contracts`; add full `npm run test:ci` when shared utilities or page behavior changed | Angular runtime captain coverage and ability matching stay aligned with generated captain metadata | Test output only |
| Auto Team Builder recommendation quality or explanation trust benchmark | `npm run test:ci -- --include src/app/core/services/auto-team-builder.recommendation-benchmark.spec.ts` | Focused benchmark plus engine/service specs when scoring, filtering, fallback, or explanation reason logic changes | Representative team-building cases still pick sensible utility and leader-scope teams, explain fallback, and fail with structural coverage context instead of incidental UI ordering | Test output only |
| Manual-character overlays or dataset integrity checks | `npx vitest run scripts/lib/dataset-integrity.spec.ts scripts/lib/manual-character-overlay.spec.ts scripts/lib/manual-character-apply.spec.ts scripts/upsert-manual-character.spec.ts` | Lightweight manual-character specs plus `npx vitest run scripts --reporter=dot`; add `npm run test:captain-contracts` when generated ability metadata is touched | Manual overlays, linked canonical ids, generated dataset integrity, and broad script sweeps stay trustworthy | Test output only |
| Dataset-change digest schema, generated-data review summary, or PR digest workflow | `npm run test:dataset-digest` | Focused digest tests plus one real `npm run dataset:digest -- --base-ref origin/main --head-ref HEAD --output /tmp/dataset-change-digest.md --json-output /tmp/dataset-change-digest.json`; add captain/source-data gates for parser changes | Parser/import PRs get a scan-friendly summary of manifest counts, generated records, captain tiers, builder abilities, ability catalog deltas, and suspicious churn | GitHub Actions artifact `dataset-change-digest`; local paths passed to `--output` and `--json-output` |
| Saved Teams, Saved Enemies, Manual Team Builder, or ability-filter performance | `PERF_ASSERT=0 npm run perf:ability-filters`; use `npm run perf:mobile-pickers` for narrow picker/list responsiveness evidence | Run `npm run perf:ability-filters`, collect the companion explanation/import-share result, then run `npm run perf:budget-report -- --current-dir /path/to/current`; add `npm run perf:mobile-pickers` plus focused unit specs when the change targets mobile pickers, long saved collections, or modal filter lists | Deterministic desktop/mobile ability-filter timings are captured, mobile picker/list screenshots and soft warnings are recorded, and hard budgets are enforced by the budget report for the budgeted harnesses | `PERF_ARTIFACT_DIR` when set; otherwise `test-results/ability-filter-performance` or `test-results/mobile-picker-performance` |
| Auto Team Builder explanation detail, compare rendering, import/share hydration, or memory pressure | `PERF_ASSERT=0 npm run perf:explanation-compare`; use `npm run perf:memory-pressure` for low-end compare/import memory evidence | `npm run perf:explanation-compare` plus focused Auto Team Builder, Saved Teams, or Manual Team Builder specs; add `npm run perf:memory-pressure` when compare-session persistence, large imports, or low-end recovery behavior changes | Compare-panel rendering, imported compare apply, explanation expansion, heavy saved-team import, share-link hydration, and low-end compare/import memory recovery stay measurable; the memory harness records Chromium heap/DOM counters and session-storage sizes before import, restore, cleanup, and forced GC | `PERF_ARTIFACT_DIR` when set; otherwise local OPTC checkouts default to `../optc-team-builder-brain/live-artifacts/869dvr7x5` for explanation/compare and `../optc-team-builder-brain/live-artifacts/869dwcee1` for memory pressure |
| Saved-team transfer codec format, parser, or large-payload codec performance | `npm run test:saved-team-codecs` plus `PERF_ASSERT=0 npm run perf:saved-team-codecs` | Focused codec specs plus the Node codec benchmark, then include `saved-team-codecs` in the current artifact root before `npm run perf:budget-report -- --current-dir /path/to/current` when publishing budget evidence | Saved Teams export/import/share compatibility stays intact while repeated encode, decode, sanitize, and invalid-input validation costs remain measured against generated heavy fixtures | `PERF_ARTIFACT_DIR` when set; otherwise local OPTC checkouts default to `../optc-team-builder-brain/live-artifacts/869dwchtw` |
| Public guide, share-link landing, compare entry, or route bundle size performance | `PERF_ASSERT=0 npm run perf:route-load` | Collect all current budget harnesses (`perf:ability-filters`, `perf:explanation-compare`, `perf:saved-team-codecs`, and `perf:route-load`) into the same current artifact root before `npm run perf:budget-report -- --current-dir /path/to/current`; add public-entry synthetics when the deployed guide/share route is the risk | Production guide route load, deterministic Manual Team Builder share-link landing load, Auto Team Builder compare entry load, initial JS, and selected route chunk sizes stay inside pragmatic budgets without starving the consolidated report of companion harness inputs | `PERF_ARTIFACT_DIR` when set; otherwise `test-results/route-load-performance` |
| Public guide and share-link visual baselines | `npm run test:public-entry-visual` | Focused visual gate plus the existing guide discoverability, public-entry synthetics, route-load, and browser smoke rows when route templates or shared shell styling change | Chromium desktop/mobile screenshots catch obvious public guide and share-link landing layout drift, missing hero content, and missing shared-team visual content without expanding noisy cross-browser pixel baselines | Playwright snapshot baselines under `e2e/public-entry-visual.spec.ts-snapshots/`; diff artifacts under `test-results/` on failure |
| Guided build, compare mode, saved-team sharing, import accessibility, or related copy | Focused page specs plus `npm run test:e2e:chromium -- --grep "@accessibility"`; for copy-only changes use `npm run i18n:validate` and the [copy review checklist](copy-review-checklist.md) | Focused accessibility slice plus full `npm run test:e2e:chromium`, `npm run i18n:validate`, guide discoverability, and `npm run build` when route or guide copy changes | Guided toggles/submits, compare saved/imported/error/swap controls, saved-team share/import feedback, modal focus recovery, dialog names, live-region semantics, manual share hydration, and shared bilingual terms remain reachable, accurate, and consistent | Playwright reports and task-scoped live evidence under `../optc-team-builder-brain/live-artifacts/<task-id>/` |
| PWA installability, offline app-shell entry, service-worker cache config, stale-shell upgrade behavior, or guide/share cache freshness | `PWA_SHELL_TASK_ID=<task-id> PWA_SHELL_ARTIFACT_DIR=../optc-team-builder-brain/live-artifacts/<task-id>/pwa-shell npm run test:pwa-shell` | PWA shell check plus `npm run build`, browser e2e for touched routes, and docs integrity when recovery guidance changes | Manifest and icon prerequisites, Angular service-worker registration/control, offline entry for high-value routes, stale-shell upgrade recovery, and release A/B guide/share content freshness stay repeatable from production build output | `PWA_SHELL_ARTIFACT_DIR` when set; otherwise local OPTC checkouts use `../optc-team-builder-brain/live-artifacts/<task-id>/pwa-shell` when `PWA_SHELL_TASK_ID` is set or `../optc-team-builder-brain/live-artifacts/869dwc7wk/pwa-shell`, with CI/standalone checkouts using `test-results/pwa-shell` |
| Release-candidate performance confidence | Manual `Performance Budgets` workflow dispatch | Scheduled/manual `Performance Budgets` workflow with an explicit `baseline_run_id`, then inspect the uploaded compact report and conditional visual-evidence artifact when warnings/failures exist | The ability-filter, explanation/compare, saved-team codec, and route-load harnesses all ran on GitHub Actions, hard-budget results were recorded, and baseline warnings were surfaced | GitHub Actions artifact `performance-budget-report`; `performance-budget-visual-evidence` only for warnings/failures |
| OPTC DB release-detector logic, upstream fetch timeout/retry/failure classification, source-contract checks, fixtures, workflow dispatch rules, duplicate-dispatch idempotency, historical backtests, upstream replay support, status artifact formatting, or post-release provenance verification | `npm run test:release-check` | Run `npm run data:backtest-release -- --json`, each successful bundled fixture, the live check, verify `node scripts/check-optc-release-needed.mjs --fixture=error --json` and `node scripts/check-optc-release-needed.mjs --fixture=source-contract-broken --json` exit nonzero, and generate local release-detector status/provenance JSON and Markdown from current or fixture reports | Missing upstream character IDs are the only release trigger, historical snapshots keep expected release/no-release decisions stable, fixture branches remain replayable, malformed fixture handling reports `upstream-malformed-data`, timeout/unavailable/partial upstream reads stay distinct from source-contract breakage, manual workflow dispatch defaults to report-only verification, overlapping/retried dispatch attempts are keyed and visibly blocked when a matching queued/in-progress/succeeded release already exists, the live upstream read still works, maintainers can scan the latest status and `upstreamFetch` diagnostics without raw workflow logs, and release outputs can be traced back to detector/source/version/APK evidence | Command output; workflow artifacts `release-trigger-outcome`, `upstream-monitor-report`, `release-detector-status`, and `release-provenance` after Actions runs |
| Release-readiness summary schema, report formatting, sign-off policy, or release evidence wiring | `npm run test:release-readiness` | `npm run test:release-readiness` plus `npm run release:readiness -- --source /path/to/source.json --output /path/to/summary.md --json-output /path/to/summary.json` using current evidence | Candidate status, tests, performance report, release-trigger report, blockers, and waivers produce the intended ready/blocked decision | Paths passed to `--output` and `--json-output` |
| Post-merge smoke pack for release-critical web and release-adjacent flows | `npm run test:post-merge-smoke` | Core smoke pack plus the deeper row for the changed surface; add Android live launch only for native, Capacitor, release, PWA shell, or device-specific risk | Public guide/help routes, guided/compare/share journeys, maintainer prerequisites, and release-check handoff stay healthy after merge without replacing full QA for broad release candidates | Playwright output and task-scoped evidence under `../optc-team-builder-brain/live-artifacts/<task-id>/` when needed |
| Public guide and share-link landing synthetics | `PUBLIC_ENTRY_BASE_URL=https://optcteambuilder.com npm run synthetic:public-entry` plus `npm run test:public-entry-synthetics` when the monitor changes | Scheduled/manual `Public Entry Synthetics` workflow, plus the dispatch sent by a successful `Deploy GitHub Pages` run on `main`; use the JSON report categories to route failures | The deployed guide route renders after Pages publish, required assets load, the deterministic redacted `teamShare` payload decodes, and Manual Team Builder renders the shared draft | GitHub Actions artifact `public-entry-synthetics-report`; local `PUBLIC_ENTRY_SYNTHETIC_ARTIFACT_DIR` when set |
| Release-note source, generated release-note Markdown, or release-note workflow routing | `node ../optc-team-builder-brain/scripts/generate-release-notes.mjs --source ../optc-team-builder-brain/audits/release-notes/<period>-source.json --evidence-index ../optc-team-builder-brain/audits/evidence-index.json --output docs/release-notes/<period>.md --check` with `<period>` replaced by the touched release period, plus docs integrity | Generator tests plus full app/brain docs integrity when changing source schema, generated Markdown, or release-note links | Release notes stay generated from workspace-scoped ClickUp evidence and brain audits instead of drifting into hand-edited summaries | Generated `docs/release-notes/<period>.md` and brain source JSON |
| Dependency maintenance policy, Dependabot cadence, or toolchain update review | `npm run doctor:maintainer -- --profile=ci --brain-root ../optc-team-builder-brain` plus the focused row for the changed surface | Follow `docs/dependency-maintenance-policy.md`: batch safe minor/patch updates, split focused-review updates, and add the package/workflow/browser/performance/release/native checks that match the update | Maintainers can tell which dependency and tooling updates are safe to batch, which require focused review, and how to roll out or roll back changes after merge | Brain task audit and default-branch workflow runs |
| Maintainer environment, sibling checkout, or validation prerequisite drift | `npm run doctor:maintainer -- --profile=ci --brain-root ../optc-team-builder-brain` | Doctor command plus `npm run test:maintainer-doctor`; add docs command and integrity checks when command examples or workflow references changed | Node/npm engines, app/brain layout, required workflow files, contract/performance/release-check scripts, release fixtures, brain evidence paths, and instruction parity are ready before deeper validation | Doctor output only |
| Branch lifecycle, post-merge branch cleanup, or GH013 deletion blockers | `npm run test:branch-cleanup` plus `npm run branch:cleanup-report -- --repo JohnChourp/optc-team-builder --format markdown` for current state | Focused cleanup tests plus docs integrity, docs commands, docs drift, and the brain task audit when policy or evidence changes | Merged routine branches are classified without deleting anything, active deletion rules are visible, and maintainers know when to keep, investigate, or request separate cleanup approval | Report output and task-scoped evidence under `../optc-team-builder-brain/live-artifacts/<task-id>/` when ClickUp-backed |
| CI routing, dependency, workflow, workflow-budget, or package changes | `npm run test:ci-routing`, `npm run test:workflow-budgets`, `npm run actions:workflow-budgets`, plus a YAML parse of the touched workflow | Full local validation for the changed routing surface, `npm run actions:workflow-budgets -- --brain-root ../optc-team-builder-brain` when paired brain workflow budgets are in scope, then rely on the PR `Test` workflow to prove the selected GitHub jobs | The executable routing rules stay fail-closed, workflow timeout/concurrency policy remains explicit, and the workflow still emits check-selection evidence before running targeted jobs | `ci-check-routing-summary` workflow artifact and workflow step summaries |
| Broad app UI behavior, routing, saved-team/share flows, or regression-prone user journeys | Focused `npm run test:ci -- --include ...` for touched components/services | `npm run test:ci`, scoped `npm run test:e2e:*` browser runs, `npm run i18n:validate`, and `npm run build`; use all browser projects when browser-specific behavior changed | Angular units, deterministic cross-browser journeys, translation keys, and production build health remain intact; browser flakes follow the `e2e/README.md` quarantine workflow before any coverage is excluded from blocking CI | Compact Playwright summary artifacts for every browser leg; full Playwright debug reports only for failed browser legs |
| Docs drift map, docs guardrails, release runbook contract, runbook-only, or audit-only changes | `npm run docs:integrity -- --brain-root ../optc-team-builder-brain`, `npm run docs:commands -- --brain-root ../optc-team-builder-brain`, `npm run docs:release-runbook-drift -- --brain-root ../optc-team-builder-brain`, `npm run docs:drift -- --base-ref origin/main --head-ref HEAD --brain-root ../optc-team-builder-brain`, plus `git diff --check` | Add `npm run test:docs-drift` when the map or detector changes; add `npm run test:release-runbook-drift` when release runbook workflow/package/policy alignment changes; add targeted command validation when command examples or workflow references changed | Markdown links, explicit repo file references, OPTC public URLs, ClickUp task URLs, documented maintainer commands, release runbook workflow/package/policy alignment, mapped feature-to-doc ownership, and whitespace stay valid across app and brain docs | None |

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

When intentional recommendation scoring changes land, update
`src/app/core/services/auto-team-builder.recommendation-benchmark.spec.ts` in
the same PR as the scoring change. Keep each benchmark expectation tied to a
named scenario, prefer slot IDs and structural coverage/explanation reason
codes over UI text, and record why the new recommendation is more trustworthy
in the PR or linked audit. Do not loosen the benchmark only to preserve a new
ordering unless the new ordering is intentional and still satisfies the
scenario's coverage properties.

Ambiguous recommendation cases should stay explicit in that benchmark. Ties
must show the current tie-break reason instead of inventing requirement value;
near-ties must identify the material edge that separated otherwise comparable
candidates; fallback cases must preserve requested-vs-used input and explain
which strict filters were relaxed.

Docs-only edits do not need live serve or browser screenshots unless they change
a runnable command that must be proven through the UI. UI evidence, when needed
for an OPTC task, belongs in the brain repo under
`../optc-team-builder-brain/live-artifacts/<task-id>/`.

## Executable CI Routing

The `Test` workflow uses `scripts/ci-check-routing.mjs` as the source of truth
for selecting pull-request and `main` push checks. The workflow first records a
`ci-check-routing-summary` artifact, then runs only the selected job groups.

Routing defaults are:

- docs-only changes run the docs script tests and skip Angular and browser jobs
- docs-drift map or detector changes run the docs drift script tests with the
  other docs script suites
- workflow-budget checker changes run the focused workflow-budget tests
- maintainer doctor changes run the focused doctor script tests
- branch cleanup report changes run the focused branch cleanup suite
- dataset-change digest changes run the focused digest script tests
- release-detector changes run the release-check suite
- release-readiness changes run the release-readiness suite
- performance tooling changes run the performance-budget script tests
- PWA shell changes run the PWA shell safety script tests
- app runtime changes run Angular unit tests and the blocking browser matrix
- e2e, Playwright, or quarantine changes run the blocking and quarantine browser
  matrices plus the e2e triage script tests
- server changes run the drive-sync backend tests
- source-data changes under `scripts/data/` run source-data validation tests
- package, dependency, workflow, routing-script, missing-diff, or unclassified
  changes fail closed to the full plan

This reduces common docs/script PR lead time by avoiding six browser jobs that
do not cover those surfaces. Runtime changes still get blocking cross-browser
coverage, and workflow/dependency changes keep the full historical confidence
path. When investigating a surprising route, run `npm run test:ci-routing` and
inspect the workflow's `ci-check-routing-summary` artifact before changing the
YAML.

Workflow budget changes also need `npm run test:workflow-budgets` and
`npm run actions:workflow-budgets`; include `-- --brain-root
../optc-team-builder-brain` when checking paired app/brain branches. Pull
request validation workflows favor freshness by canceling stale runs for the
same PR, while release, performance, monitor, and release-evidence workflows
preserve every in-progress run.

PWA-sensitive changes are selected for `ngsw-config.json`, app bootstrap,
`src/index.html`, the web manifest, PWA icons, and the PWA shell harness. The
PWA shell suite uses production build output rather than `ng serve` because
Angular only emits and activates the service worker for production builds.

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

### Maintainer Environment Doctor

Run the doctor before deeper validation when local setup, sibling checkout
layout, package scripts, or workflow prerequisites might have drifted:

Command status: CI-executable.
<!-- docs-command: ci-executable -->
```bash
npm run doctor:maintainer -- --profile=ci --brain-root ../optc-team-builder-brain
```

Use the default local profile when checking a workstation before browser,
performance, or PWA work; it also reports missing `node_modules`, Playwright
package installation, and browser cache setup with concrete fix guidance.

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

### Dataset Change Digests

Run the digest tests before changing the digest schema, renderer, or workflow:

Command status: CI-executable.
<!-- docs-command: ci-executable -->
```bash
npm run test:dataset-digest
```

Generate a local review digest from two git refs when checking a parser/import
branch before PR:

Command status: manual/illustrative.
<!-- docs-command: manual/illustrative -->
```bash
npm run dataset:digest -- --base-ref origin/main --head-ref HEAD --output /tmp/dataset-change-digest.md --json-output /tmp/dataset-change-digest.json
```

The PR workflow publishes the same Markdown and JSON as the
`dataset-change-digest` artifact and writes the Markdown to the GitHub step
summary. Trusted same-repo PRs also get one sticky bot comment; fork and
Dependabot PRs use the artifact/summary path only.

Routine parser/import changes should have small, explainable deltas tied to the
changed parser rule, source-data correction, or generated dataset update. Large
character movement, broad captain-tier churn, broad builder-ability churn,
ability catalog spikes, or generated character changes without a manifest
`sourceVersion` change should trigger a closer review against the focused parser
tests and raw generated SQL/JSON diff.

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

Low-end memory-pressure harness:

Command status: manual/illustrative.
<!-- docs-command: manual/illustrative -->
```bash
PERF_ARTIFACT_DIR=/path/to/artifacts PERF_RUN_LABEL=local-memory npm run perf:memory-pressure
```

Route-load and bundle-size harness:

Command status: manual/illustrative.
<!-- docs-command: manual/illustrative -->
```bash
PERF_ARTIFACT_DIR=/path/to/artifacts PERF_RUN_LABEL=local-route-load PERF_ASSERT=0 npm run perf:route-load
```

Narrow mobile picker/list harness:

Command status: manual/illustrative.
<!-- docs-command: manual/illustrative -->
```bash
PERF_ARTIFACT_DIR=/path/to/artifacts PERF_RUN_LABEL=local-mobile npm run perf:mobile-pickers
```

`perf:mobile-pickers` records Pixel-width screenshots and soft-threshold
warnings for Saved Teams and Saved Enemies long lists, Manual Team Builder
candidate and ability picker paths, and the Saved Enemies character image
picker. It is report-only by design; use the warnings and screenshots to decide
whether a behavior-preserving UI performance fix is needed.

`perf:memory-pressure` records a constrained mobile Chromium profile for large
Auto Team Builder compare imports and Saved Teams imports. It captures
session-storage bytes, Chromium heap/DOM counters, screenshots, console/page
errors, reload restore behavior, source-cleanup behavior, and forced-GC state.
Memory thresholds are report-only warnings; crashes, page errors, missing
restore, or missing import feedback fail the harness.

`perf:ability-filters` records timings and screenshots but does not enforce hard
budgets by itself. To enforce ability-filter budgets locally, place the ability
result under a shared current directory, include explanation/compare,
saved-team codec, and route-load results, then run the budget report:

Command status: manual/illustrative.
<!-- docs-command: manual/illustrative -->
```bash
PERF_ARTIFACT_DIR=perf-artifacts/current/ability npm run perf:ability-filters
PERF_ARTIFACT_DIR=perf-artifacts/current/explanation PERF_ASSERT=0 npm run perf:explanation-compare
PERF_ARTIFACT_DIR=perf-artifacts/current/saved-team-codecs PERF_ASSERT=0 npm run perf:saved-team-codecs
PERF_ARTIFACT_DIR=perf-artifacts/current/route-load PERF_ASSERT=0 npm run perf:route-load
npm run perf:budget-report -- --current-dir perf-artifacts/current
```

`perf:explanation-compare` and `perf:saved-team-codecs` enforce their own
budgets unless `PERF_ASSERT=0` is set. Use `PERF_ASSERT=0` when collecting
timing evidence without failing the command on budget regressions. Leave
assertions enabled when the focused harness itself is the merge gate or
release-candidate confidence check.

`perf:route-load` builds the production app with `--stats-json`, serves the
generated browser output locally, and records route-ready timings plus initial
and route chunk sizes. Set `PERF_ROUTE_LOAD_BUILD=0` only when an existing
production build and `dist/optc-team-builder/stats.json` already match the code
under test.

### PWA Shell Safety

Use the PWA shell check before changing the Angular service-worker config,
manifest, install icons, app bootstrap providers, public guide/share cache
freshness, or stale-cache recovery guidance:

Command status: manual/illustrative.
<!-- docs-command: manual/illustrative -->
```bash
PWA_SHELL_TASK_ID=<task-id> PWA_SHELL_ARTIFACT_DIR=../optc-team-builder-brain/live-artifacts/<task-id>/pwa-shell npm run test:pwa-shell
```

The check builds the production app, serves a local release, verifies manifest
and icon installability prerequisites, waits for Angular service-worker control,
and proves offline direct entry for the home page, Characters, Auto Team
Builder, Saved Teams, Settings, and the guided build/compare/share guide. It
also serves a second local release with a regenerated `ngsw.json` and verifies
that a stale shell can update to the new version. The cache-freshness phase
loads the guided/compare/share guide and a deterministic redacted
`/tabs/manual-team-builder?teamShare=...` route under release A service-worker
control, switches the local server to release B, confirms the old route-visible
guide/share content can remain before explicit update activation, then runs
`CHECK_FOR_UPDATES` and `ACTIVATE_UPDATE` and verifies the release B guide
bundle and Manual Team Builder i18n content are visible.
When `PWA_SHELL_ARTIFACT_DIR` is not set, local OPTC sibling checkouts write to
`../optc-team-builder-brain/live-artifacts/<PWA_SHELL_TASK_ID>/pwa-shell` when
`PWA_SHELL_TASK_ID` is set, otherwise
`../optc-team-builder-brain/live-artifacts/869dwc7wk/pwa-shell`; CI and
standalone app checkouts write to `test-results/pwa-shell`.

For reported PWA failures, first separate the failure class:

- App logic: the same route fails online with the service worker bypassed or
  after site storage is cleared.
- Stale assets: `/ngsw/state` shows an older version, reloads keep serving an
  older `index.html`, or the PWA shell check fails in the upgrade or
  cache-freshness phase. `route-bundle-content` points to the guide route
  bundle or `ngsw.json`; `i18n-assets` points to cached translation assets used
  by the Manual Team Builder share-link landing; `service-worker-update` points
  to update detection or activation.
- Install/update state: manifest or icon checks fail, no service worker
  controls the page after the ready timeout, or offline direct entry misses a
  required asset.

Recovery steps for user-facing incidents are: close all app tabs, reopen the
installed shortcut, refresh once online, then clear site storage/unregister the
service worker only if the app remains pinned to stale assets. Maintainers can
use browser DevTools Application > Service Workers to inspect/unregister the
worker and Application > Storage to clear site data during local diagnosis.

### Performance Budgets

Use the `Performance Budgets` GitHub Actions workflow for recurring or release
candidate performance evidence. The workflow runs the ability-filter,
explanation/compare, saved-team codec, and route-load harnesses, combines them
with:

Command status: manual/illustrative.
<!-- docs-command: manual/illustrative -->
```bash
npm run perf:budget-report
```

and uploads `performance-budget-report`. The artifact includes the current JSON
report, current markdown summary, trend-history JSON, trend-history markdown,
and current harness JSON outputs. Raw current harness screenshots are uploaded
separately as `performance-budget-visual-evidence` only when the report has
hard-budget failures or baseline-delta warnings. Scheduled runs and default
manual dispatches are report-only: hard-budget failures mark the report as
failed but do not fail the workflow. Use the manual `fail_on_regression=true`
input when a release-candidate preflight should fail on hard-budget misses.
Baseline deltas remain warnings.

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

Backtest historical local/upstream snapshots before changing release-detector
logic:

Command status: CI-executable.
<!-- docs-command: ci-executable -->
```bash
npm run data:backtest-release -- --json
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

The `error` fixture is intentionally malformed and the
`source-contract-broken` fixture simulates upstream source-shape drift. Both
should exit nonzero. Keep them as expected-failure checks:

Command status: CI-executable; this command is expected to exit nonzero.
<!-- docs-command: ci-executable -->
```bash
node scripts/check-optc-release-needed.mjs --fixture=error --json
node scripts/check-optc-release-needed.mjs --fixture=source-contract-broken --json
```

`source-contract-broken` must produce `reason=source-contract-broken` instead
of a normal no-release result. Triage it as an upstream `dbVersion`,
`window.units`, or normalized canonical ID contract problem before considering
any release dispatch.

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

After an auto-triggered Android release, inspect the `release-provenance`
artifact from the `Release Android` run. The report fails when the release tag,
version code, notes metadata, APK asset name/link/digest, detector verdict,
source version, released new IDs, or trigger-to-release ancestry do not align.
Manual Android releases without detector metadata keep the report useful by
recording the missing detector link as a warning.

After the release, provenance, and Pages deploy jobs succeed, inspect the
`post-dispatch-production-smoke` artifact from the same `Release Android` run.
It combines the release provenance verdict with production public-entry
synthetics for the guide route and redacted saved-team share-link landing. A
failed smoke artifact blocks release closeout until the provenance or production
rendering failure is triaged.

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

The historical corpus is `scripts/fixtures/release-check/history/corpus.json`.
It stores exact local and upstream character ID sets as compressed ranges plus
commit metadata. Use `--case=<id>` to reproduce one historical decision, and
mark `expected.mismatchClassification` as `policy-drift` only when a future
release-policy change intentionally invalidates the old expected outcome.

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

### Saved-Team Import Diagnostics

Saved-team payload versioning, migration, and embedded backup rules are defined
in `docs/saved-team-schema-lifecycle.md`. Consult that contract before changing
Saved Teams import/export, share links/codes, Settings all-data embedding, Drive
backup behavior, or Auto Team Builder preset embedding.

When a user reports a saved-team import, share-link, Manual Team Builder route
share, or Auto Team Builder compare import failure, ask for the visible
diagnostic code or a screenshot of the failure banner. Do not ask for raw JSON,
share codes, full URLs, team names, notes, or decoded payload text unless a
separate privacy-reviewed support path is explicitly approved.

Classify the report by the code shown in the UI:

- `SAVED_TEAMS_EMPTY_INPUT`: have the user select a file or paste the full
  share link/code.
- `SAVED_TEAMS_INVALID_JSON`: have the user re-export the JSON and retry with
  the unedited file.
- `SAVED_TEAMS_INVALID_SHARE_CODE`: have the user copy the full share link/code
  again.
- `SAVED_TEAMS_INVALID_SHARE_JSON`: have the user generate a fresh share link
  from the source team.
- `SAVED_TEAMS_UNSUPPORTED_SCHEMA`: confirm the export came from the current
  app version or a supported v1 saved-team/share payload.
- `SAVED_TEAMS_INVALID_PAYLOAD`: have the user re-export from Saved Teams or
  Settings.
- `SAVED_TEAMS_INVALID_SHARE_PAYLOAD`: have the user generate a fresh share
  link instead of editing the encoded payload.
- `SAVED_TEAMS_NO_IMPORTABLE_TEAM`: have the user re-share or re-export a saved
  team that still has a stable id.

If the screenshot shows only a generic error without one of these codes, treat
that as a diagnostics regression in the import surface that produced it.

For share/copy reports where there is no saved-team diagnostic code, classify
the browser capability state instead:

- Native share unavailable or cancelled: the app should fall back to clipboard
  copy without changing the share payload.
- Clipboard API unavailable, insecure context, `NotAllowedError`, or
  `SecurityError`: share links and raw share codes should show the readonly
  manual-copy field; JSON copy actions should direct the user to Export.
- Unknown clipboard write failures: collect a screenshot of the feedback banner
  and browser/profile details, but do not ask for raw share links, share codes,
  JSON, team names, or notes.

### Docs Integrity

Use the shared docs checker before merging README, guide, runbook, or audit
changes:

Command status: CI-executable.
<!-- docs-command: ci-executable -->
```bash
npm run docs:integrity -- --brain-root ../optc-team-builder-brain
```

For the OPTC DB auto-release runbook, also verify that the marked runbook
contract matches the live workflow, package scripts, release policy, artifacts,
outputs, and source-file references:

Command status: CI-executable.
<!-- docs-command: ci-executable -->
```bash
npm run docs:release-runbook-drift -- --brain-root ../optc-team-builder-brain
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

### Guide Discoverability

Use the guide discoverability verifier when public guide routes, SEO page
generation, sitemap handling, README live-site links, or in-app help entry
points change. Build the Pages artifact first so the verifier can inspect the
generated sitemap, canonical metadata, fallback HTML, and structured data.

Command status: manual/illustrative.
<!-- docs-command: manual/illustrative -->
```bash
npm run build:pages
npm run discoverability:verify
```

For script-only changes to the verifier, run the focused spec:

Command status: CI-executable.
<!-- docs-command: ci-executable -->
```bash
npm run test:discoverability
```

### Public Entry Synthetics

Use the public entry synthetic monitor when the deployed guide or share-link
landing path needs live availability evidence. The monitor uses a deterministic
synthetic share payload and redacts the `teamShare` value from JSON reports, so
do not paste real user share links or codes into workflow inputs or issue
comments.

Command status: manual/illustrative.
<!-- docs-command: manual/illustrative -->
```bash
PUBLIC_ENTRY_BASE_URL=https://optcteambuilder.com npm run synthetic:public-entry
```

Run the focused unit tests after changing the monitor script or report
classification:

Command status: CI-executable.
<!-- docs-command: ci-executable -->
```bash
npm run test:public-entry-synthetics
```

Failures use four categories:

- `routing`: inspect Pages deploy status, route redirects, and Angular route
  registration.
- `asset-loading`: inspect missing hashed bundles, generated data assets, and
  deploy artifact contents.
- `decoding`: inspect saved-team share schema/codec changes and
  `teamShare` query handling.
- `rendering`: inspect Manual Team Builder or SEO guide rendering after the
  route and assets loaded.

The `Deploy GitHub Pages` workflow dispatches the synthetic workflow after
successful `main` deployments, which avoids checking the previous public site
before the new Pages artifact is live. The dispatch step passes the repository
explicitly to `gh workflow run` because the deploy job does not need a checkout
and therefore has no local `.git` context. Scheduled/manual runs use the same
workflow, which uploads `public-entry-synthetics-report` with the JSON report
and screenshots for the latest run.

The Pages deploy step allows an extended `actions/deploy-pages` polling budget
so normal `syncing_files` periods do not fail the `Deploy GitHub Pages` workflow
before GitHub Pages reports a terminal deployment state. If the deploy job still
fails after that budget, inspect the Pages deployment status before rerunning or
changing the artifact build.

### Public Entry Visual Baselines

Use the focused visual baseline gate when a PR can affect the first-viewport
layout of public guide pages or the Manual Team Builder share-link landing:

Command status: manual/illustrative.
<!-- docs-command: manual/illustrative -->
```bash
npm run test:public-entry-visual
```

The suite keeps Chromium-only baselines for desktop `1366x900` and mobile
`390x844` on the public team-building guide, the guided/compare/share guide,
and a deterministic shared-team landing URL. It intentionally does not add
Firefox, WebKit, macOS, or Windows pixel baselines; use the normal browser
smoke/regression rows for cross-browser behavior. The screenshot masks the app
footer before comparison so routine version-label changes do not force baseline
refreshes.

Refresh snapshots only after reviewing the diff and confirming the visual
change is intentional. When local rendering differs from CI, use the Linux
Chromium GitHub Actions actual image as the canonical committed baseline:

Command status: manual/illustrative.
<!-- docs-command: manual/illustrative -->
```bash
npm run test:public-entry-visual -- --update-snapshots
```

Investigate failures as real regressions when they show missing headings,
missing shared-team slot content, blank/overlapping hero content, collapsed
cards, route-shell spacing regressions, or asset-driven layout holes. Baseline
refreshes are appropriate only for intentional copy, spacing, typography,
component, or route-template changes that still pass the related functional
guide, share-link, and route-load checks. Keep the `maxDiffPixelRatio` stable;
do not loosen thresholds instead of committing reviewed CI baselines.

### Docs Drift

Use the docs drift guard before merging mapped feature/workflow changes:

Command status: CI-executable.
<!-- docs-command: ci-executable -->
```bash
npm run docs:drift -- --base-ref origin/main --head-ref HEAD --brain-root ../optc-team-builder-brain
```

For untrusted pull requests that cannot receive the private brain checkout, CI
also exercises the app-only drift path:

Command status: CI-executable.
<!-- docs-command: ci-executable -->
```bash
npm run docs:drift -- --base-ref origin/main --head-ref HEAD --app-only
```

Run the focused drift tests after changing the map or detector:

Command status: CI-executable.
<!-- docs-command: ci-executable -->
```bash
npm run test:docs-drift
```

The guard reads `docs/docs-drift-map.json`, compares mapped `featurePaths` to
changed files, and fails when a feature/workflow moves without a matching
`docsPaths` touch. If a refactor intentionally needs no docs change, fill the
PR body's `Docs drift acknowledgement:` field with a concrete reason; blank,
placeholder, or `none - ...` text does not count as an acknowledgement.
When the mapped docs update lives only in a paired brain PR, use the same field
to name the brain PR or audit. On `main` pushes, CI recovers the merged PR body
from GitHub for that same acknowledgement; the squash/merge commit message is a
fallback when the associated PR body cannot be read.

## Ownership Rule

When a PR adds, removes, renames, or materially changes a validation harness,
workflow, release report, artifact path, or maintainer command, update this
guide in the same PR. The owner of the changed harness or workflow owns keeping
the decision table, command examples, artifact locations, and lightweight/deep
guidance current.

When a PR adds, removes, renames, or materially changes a mapped product or
maintainer workflow, update `docs/docs-drift-map.json` and the mapped docs entry
points in the same PR, or record a concrete `Docs drift acknowledgement:` in
the PR body when the change is an internal refactor with no docs impact or the
mapped docs update is intentionally landing through the paired brain PR.

When a PR adds, removes, renames, or materially changes checked-in fixtures or
shared fixture builders, update `docs/fixture-ownership-guide.md` in the same
PR with the owner, consumers, and regeneration rule.
