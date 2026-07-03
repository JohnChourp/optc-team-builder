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
| Dependabot config, package files, workflow files, or CI routing | `npm run test:ci-routing`, YAML parse or workflow inspection, and PR `Test` workflow result. |
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
