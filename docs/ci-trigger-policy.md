# CI Trigger Policy

OPTC Team Builder does not spend GitHub Actions minutes proving a change.
Validation runs locally, where the same suites finish in minutes on a warm
`node_modules` instead of re-installing dependencies and re-downloading browsers
on every push.

## The rule

**No workflow may run automatically because of a pull request or a push to
`main`.** Every workflow must be `workflow_dispatch` (manual) or `schedule`
(cron), unless it is listed in the allowlist below with a concrete reason.

This is enforced mechanically, not by convention:

```bash
npm run actions:ci-triggers
```

Command status: CI-executable.

The check reads every file in `.github/workflows/`, collects its trigger events,
and fails on any event that is not `workflow_dispatch`, `schedule`,
`workflow_call`, or `repository_dispatch` — unless that exact workflow and event
pair is allowlisted in `APP_CI_TRIGGER_ALLOWLIST`
(`scripts/check-github-ci-triggers.mjs`). It also fails when an allowlist entry
points at a workflow that no longer exists, so exceptions cannot go stale.

## Allowlist

| Workflow | Automatic event | Why it is allowed |
| --- | --- | --- |
| `.github/workflows/deploy-pages.yml` | `push` (`main`) | Publishing the production web app on `main` is the deploy itself, not a test lane. Removing it would stop the site from updating after a dataset release. |

**No pull-request event is allowlisted.** A pull request in this repo runs zero
GitHub Actions jobs and shows zero checks; that is the intended state, not a
misconfiguration.

Adding a row is a policy change: state the reason in the table, add the entry to
`APP_CI_TRIGGER_ALLOWLIST`, and keep both in sync with the rule recorded in
`../optc-team-builder-brain/CLAUDE.md` and `../optc-team-builder-brain/AGENTS.md`.

## What still runs on GitHub Actions

Automatic runs are limited to the release chain and to cron jobs that watch
things a local machine cannot watch.

| Workflow | Trigger | Purpose |
| --- | --- | --- |
| `check-optc-db-release.yml` | daily cron, manual | Detects new upstream OPTC data and dispatches the Android release. |
| `release-android.yml` | manual, dispatched by the detector | Version bump, dataset regeneration, build, tag, release, Pages deploy. |
| `deploy-pages.yml` | push to `main`, manual | Publishes the production web app. |
| `codeql.yml` | weekly cron, manual | Security scanning. |
| `performance-budgets.yml` | weekday cron, manual | Browser-backed performance reporting. |
| `public-entry-synthetics.yml` | daily cron, manual | Production entry-point monitoring. |
| `guide-discoverability.yml` | weekly cron, manual | Production Pages build plus discoverability verification. |
| `test.yml`, `docs-integrity.yml`, `dataset-change-digest.yml` | manual only | On-demand copies of the local suites, for when a clean-room run is wanted. |
| `pr-traceability.yml` | manual only, takes a `pr_number` input | On-demand copy of the PR traceability gate. |

## Local verification

`npm run verify:local` is the replacement for the old PR `Test` workflow. It runs
the Angular unit tests, every script suite defined in
`scripts/ci-check-routing.mjs`, and the dataset performance guard, then prints a
single pass/fail summary.

```bash
npm run verify:local
```

Command status: manual/illustrative.

Add browser e2e across chromium, firefox, and webkit with the full variant:

```bash
npm run verify:local:full
```

Command status: manual/illustrative.

Useful flags, passed through after `--`:

- `--list` prints the selected lanes without running them.
- `--only=angular,docs-drift` runs specific lanes.
- `--skip=pwa-shell` drops lanes that need extra local setup.
- `--bail` stops at the first failing lane.

The `pwa-shell` lane and every `--with-e2e` lane drive a real browser, so run
`npm run test:e2e:install` once per machine before the first full pass. Use
`--skip=pwa-shell` for a browser-free run.

## Running a workflow on demand

Nothing was deleted, so any suite can still be run on GitHub when a clean-room
result is wanted:

```bash
gh workflow run test.yml --repo JohnChourp/optc-team-builder
```

Command status: manual/illustrative.

`test.yml` accepts an optional `base_ref` input. With no input it runs the full
check plan; with a base ref it routes the same targeted plan the old PR runs
used.

## PR traceability

The PR template fields (`ClickUp task:`, `Evidence:`, `Verification:`) are still
required, but nothing checks them automatically any more. Run the same gate
against an open PR before review or merge:

```bash
npm run pr:traceability -- --pr 123
```

Command status: manual/illustrative.

It reads the PR through `gh api`, so it needs an authenticated `gh`. Pass
`--repo owner/name` when running outside the repository checkout. Bot-authored
PRs are skipped exactly as before. The `PR Traceability` workflow is the same
check as a manual dispatch with a `pr_number` input.
