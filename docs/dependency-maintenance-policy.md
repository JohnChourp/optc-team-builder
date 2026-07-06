# Dependency Maintenance Policy

This policy defines how maintainers review dependency, workflow, browser-test,
performance, and release-check updates for OPTC Team Builder. Use it for
Dependabot PRs, manual dependency bumps, and maintainer-tooling updates before
choosing validation from `docs/maintainer-validation-guide.md`.

Task-specific evidence belongs in the sibling brain repo. The policy closeout
for ClickUp `869dwcbb3` is recorded in
`../optc-team-builder-brain/audits/869dwcbb3-dependency-maintenance.md`.

## Current Automation Cadence

`.github/dependabot.yml` is the source of truth for automated update cadence:

| Ecosystem | Directory | Schedule | Current grouping |
| --- | --- | --- | --- |
| npm | `/` | Weekly on Monday at 09:00 Europe/Athens | Minor and patch updates are grouped together. |
| Gradle | `/android` | Weekly on Monday at 09:00 Europe/Athens | Minor and patch updates are grouped together. |
| GitHub Actions | `/` | Weekly on Monday at 09:00 Europe/Athens | Minor and patch updates are grouped together. |

Major-version updates are intentionally outside the grouped minor/patch path.
Handle them as focused review PRs unless a maintainer explicitly approves a
larger migration batch.

## GitHub Actions Pinning

GitHub's secure-use guidance treats a full-length commit SHA as the immutable
way to consume an action. OPTC keeps the strongest pinning controls on workflows
that can release, deploy, publish release evidence, or run browser-critical
confidence checks. The guard command requires strict workflow action refs to be
full SHAs, use `owner/repository` external action refs, keep a source-tag
comment, and prove that the source tag resolves to the pinned SHA inside the
referenced action repository:

```bash
npm run actions:pins
```

Strictly pinned workflows:

| Workflow | Stability reason |
| --- | --- |
| `.github/workflows/check-optc-db-release.yml` | Can dispatch Android releases and writes release-trigger evidence. |
| `.github/workflows/release-android.yml` | Builds, tags, pushes, publishes GitHub releases, deploys Pages, and uploads release provenance. |
| `.github/workflows/deploy-pages.yml` | Publishes the production web app and dispatches public-entry synthetics. |
| `.github/workflows/test.yml` | Runs PR and `main` test routing, browser e2e, quarantine, artifact, and performance confidence lanes. |
| `.github/workflows/public-entry-synthetics.yml` | Monitors production entry points with Playwright. |
| `.github/workflows/performance-budgets.yml` | Runs browser-backed performance reporting and baseline artifact reads. |
| `.github/workflows/guide-discoverability.yml` | Builds production Pages output and verifies public guide discoverability. |

Current strict action inventory:

| Action | Pinned source tag | Commit SHA |
| --- | --- | --- |
| `actions/checkout` | `v7` | `9c091bb21b7c1c1d1991bb908d89e4e9dddfe3e0` |
| `actions/setup-node` | `v6` | `48b55a011bda9f5d6aeb4c2d9c7362e8dae4041e` |
| `actions/cache` | `v6` | `55cc8345863c7cc4c66a329aec7e433d2d1c52a9` |
| `actions/upload-artifact` | `v7` | `043fb46d1a93c77aae656e7c1c64a875d1fc6a0a` |
| `actions/download-artifact` | `v7` | `37930b1c2abaa49bbe596cd826c3c89aef350131` |
| `actions/download-artifact` | `v8` | `3e5f45b2cfb9172054b4087a40e8e0b5a5461e7c` |
| `actions/configure-pages` | `v6` | `45bfe0192ca1faeb007ade9deae92b16b8254a0d` |
| `actions/upload-pages-artifact` | `v5` | `fc324d3547104276b827a68afc52ff2a11cc49c9` |
| `actions/deploy-pages` | `v5` | `cd2ce8fcbc39b97be8ca5fce6e763baed58fa128` |
| `actions/setup-java` | `v5` | `1bcf9fb12cf4aa7d266a90ae39939e61372fe520` |
| `android-actions/setup-android` | `v4` | `40fd30fb8d7440372e1316f5d1809ec01dcd3699` |

To refresh a strict action pin, resolve the intended tag from the upstream
action repository, update every strict workflow reference to the new SHA, and
keep the source tag as a trailing comment:

```bash
git ls-remote --tags https://github.com/actions/checkout.git v7
npm run actions:pins
npm run test:actions-pins
```

Action-pin PRs require focused review. Confirm the SHA belongs to the upstream
action repository, scan release notes for permission, cache, artifact, deploy,
or token behavior changes, run the pin guard locally, and let the app PR `Test`
workflow re-run the guard in CI. Non-strict workflows such as CodeQL, Docs
Integrity, PR Traceability, and Dataset Change Digest remain on explicit major
tags unless they become release-critical or browser/test-critical; they still
stay covered by Dependabot, CODEOWNERS, PR traceability, and default-branch
monitoring.

## GitHub Workflow Budgets

Heavy workflows must make their concurrency and timeout tradeoff explicit. The
guard command `npm run actions:workflow-budgets` checks the app workflow
contract, and `npm run actions:workflow-budgets -- --brain-root
../optc-team-builder-brain` checks the paired brain Docs Integrity workflow.
Run `npm run test:workflow-budgets` after changing the checker.

Policy:

| Workflow class | Concurrency rule | Timeout rule |
| --- | --- | --- |
| Pull-request validation (`Test`, Guide Discoverability, app/brain Docs Integrity) | Group by workflow plus PR number and cancel stale PR attempts only. Main pushes are preserved. | Each job has a realistic `timeout-minutes` budget and a summary step that states the budget. |
| GitHub Pages deploy | Keep the repository-level `github-pages` freshness lock with cancellation so the latest production artifact wins. | Build and deploy jobs have separate budgets so deployment stalls are visible. |
| Performance and production-entry evidence | Serialize runs and keep `cancel-in-progress: false` so scheduled/manual history is preserved. | Existing monitor/report budgets remain explicit and are logged in the step summary. |
| Release detector and Android release flows | Serialize runs and keep `cancel-in-progress: false`; manual release dispatches are not validation shortcuts unless a maintainer explicitly requested a release. | Release-check, notification, release, provenance, release Pages, and post-dispatch smoke jobs each have explicit budgets. |

Task-specific evidence for the workflow-budget policy closeout is recorded in
`../optc-team-builder-brain/audits/869dwchu0-workflow-concurrency-timeouts.md`.

## Critical Update Surfaces

| Surface | Examples | Why it is sensitive |
| --- | --- | --- |
| GitHub Actions | `.github/workflows/`, action versions, workflow permissions, upload/download-artifact behavior | Workflow drift can skip CI, lose evidence, break Pages deploys, or dispatch releases incorrectly. |
| npm, Node, and toolchain packages | `package.json`, `package-lock.json`, `.nvmrc`, `.node-version`, Angular CLI/build tooling, TypeScript, Vitest, jsdom, Node overrides | Runtime or test-runner changes can break local validation, CI selection, generated docs, or Angular browser tests. |
| Playwright and browser regression tooling | `@playwright/test`, `playwright.config.ts`, `e2e/`, `scripts/run-playwright-e2e.mjs`, quarantine/failure-summary helpers | Browser drift can hide guided build, saved-team transfer, compare, accessibility, or cross-browser regressions. |
| Performance harnesses | `scripts/perf-*.mjs`, `scripts/perf-budget-*.mjs`, `Performance Budgets` workflow | Harness or browser changes can invalidate timing comparisons or turn report-only signals into noisy failures. |
| Release-check and upstream monitoring | `scripts/check-optc-release-needed.mjs`, `scripts/check-optc-upstream-monitor.mjs`, release-trigger policy helpers, release-check fixtures, `check-optc-db-release.yml` | Detector drift can skip needed releases, over-dispatch Android releases, or lose release-trigger evidence. |
| Release-readiness tooling | `scripts/release-readiness-report.mjs`, release-readiness fixtures, generated release evidence | Summary drift can misclassify blockers, waivers, performance state, or release-trigger status. |
| Angular, Ionic, and Capacitor runtime stack | `@angular/*`, `@ionic/angular`, `@capacitor/*`, service-worker/PWA packages | Framework updates can affect routing, PWA install/update behavior, native sync, and UI tests. |
| Gradle and Android release tooling | `android/`, Gradle wrapper/plugins, signing/build metadata, release scripts | Native-tooling drift can break Android build, signing, versioning, or release workflow execution. |

For post-deploy workflow dispatches, prefer explicit repository context such as
`gh workflow run --repo "$GITHUB_REPOSITORY"` when the job does not need a
checkout. That keeps deploy jobs lightweight while avoiding accidental reliance
on a local `.git` directory.

## Batch Versus Focused Review

Safe-to-batch updates are small, related, and covered by the existing weekly
automation. They can usually stay in the grouped Dependabot PR when all of the
following are true:

- update type is patch or minor;
- ecosystem matches one configured Dependabot group;
- changelog or release notes do not call out breaking changes;
- no workflow permission, secret, release-dispatch, or deploy behavior changes;
- local validation and PR CI stay green.

Use focused review for any update that changes risk boundaries:

- major version bumps;
- Angular, Ionic, Capacitor, TypeScript, npm, Node, Playwright, Gradle, or
  Android plugin updates that may require migration steps;
- GitHub Actions updates that change permissions, event context, artifacts,
  cache behavior, deployment behavior, or token use;
- release-check, release-readiness, performance, docs-command, or CI-routing
  tooling changes;
- lockfile conflicts, peer dependency conflicts, engine changes, or any update
  that requires manual source edits.

When a batch contains one focused-review item, split or narrow the PR before
merge unless keeping the group together is required to resolve peer dependency
or framework-stack compatibility.

## Required Validation

Start every dependency or tooling review with the maintainer environment doctor:
`npm run doctor:maintainer -- --profile=ci --brain-root ../optc-team-builder-brain`.

Use the smallest additional path that covers the changed surface:

| Changed surface | Required local validation before PR review |
| --- | --- |
| Dependabot config, package files, workflow files, workflow budget checker, or CI routing | `npm run test:ci-routing`, `npm run test:workflow-budgets`, `npm run actions:workflow-budgets`, YAML parse or workflow inspection, and PR `Test` workflow result. |
| Docs, command examples, drift map, or policy docs | `npm run docs:integrity -- --brain-root ../optc-team-builder-brain`, `npm run docs:commands -- --brain-root ../optc-team-builder-brain`, `npm run docs:drift -- --base-ref origin/main --head-ref HEAD --brain-root ../optc-team-builder-brain`, and `npm run test:docs-drift` when the map changes. |
| Playwright or browser regression tooling | `npm run test:e2e-triage` and the affected `npm run test:e2e:*` browser command; rely on PR browser CI for the full matrix when package or workflow changes are included. |
| Performance harness or budget tooling | `npm run test:perf-budget`, plus the affected performance harness in report-only mode when the update can change browser timing. |
| Release-check or upstream monitor tooling | `npm run test:release-check`; add `npm run data:backtest-release -- --json` when fixtures, historical corpus, or detector behavior changed. |
| Release-readiness tooling | `npm run test:release-readiness`; generate a sample summary when renderer or schema output changed. |
| Angular/Ionic/Capacitor runtime stack | Focused app specs for touched areas, `npm run test:ci`, `npm run build`, and the relevant browser/PWA route from the validation guide. |
| Gradle or Android release tooling | Local build/sync validation when feasible, then the `Release Android` workflow or release skill only when the user explicitly requests a release path. |

Always run `git diff --check` before committing.

## Rollout And Rollback

Dependency rollouts should be boring and reversible:

- land dependency-policy or docs-only changes through PRs; do not dispatch
  production releases for documentation-only maintenance work;
- for package or workflow updates, keep PRs small enough that a revert restores
  the previous lockfile, workflow, or tool version cleanly;
- let CI fail closed for package, dependency, workflow, routing-script,
  missing-diff, and unclassified changes;
- after merge, monitor default-branch workflows for the changed repo before
  closing ClickUp or treating the update as adopted;
- if a merged dependency update breaks `main`, fix with a direct `main` recovery
  commit only when the task explicitly requested post-merge direct fixes or when
  the repository is in an incident path; otherwise revert or open a follow-up PR.

Rollback should prefer the smallest stable action:

1. Re-run transient workflow failures once when logs point to GitHub runner,
   Pages deploy, cache, or network instability.
2. Revert the dependency, lockfile, workflow, or config change when the new
   version is the likely cause and no quick compatibility fix is available.
3. Patch forward only when the failure is understood, validated locally, and
   lower risk than reverting.
4. Record the final disposition in the linked brain audit or ClickUp task.

## Completion Rules

Do not close a ClickUp dependency-maintenance task until:

- the public policy or automation change is merged;
- app and brain `main` checks for changed repos are green;
- the PR links include ClickUp task, durable evidence, and verification fields;
- the brain audit names the automation cadence, critical surfaces, batch/focused
  review policy, rollout and rollback rules, and validation evidence;
- the ClickUp completion note says `generate tasks` should not create another
  task for the completed dependency cadence, critical tooling inventory,
  safe-batch/focused-review policy, or rollout/rollback documentation.
