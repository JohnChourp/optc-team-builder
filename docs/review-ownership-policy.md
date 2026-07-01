# Review Ownership Policy

This policy turns the current OPTC maintenance surface into checked-in review
routing. The app repository uses `.github/CODEOWNERS` to request the current
human maintainer on changes that affect release automation, CI, shared
fixtures, generated data, maintainer docs, and major user-facing flows.

The only current repository collaborator found during the implementation audit
is `@JohnChourp`, so every critical route currently resolves to that reviewer.
Backup ownership requires adding another GitHub collaborator or team before it
can be represented in `CODEOWNERS`.

`CODEOWNERS` requests review; it does not make review mandatory by itself.
Strict required-review enforcement still needs GitHub branch protection or
repository rulesets. At the time this policy was added, app `main` had no branch
protection and the private brain repository could not expose branch protection
through the available GitHub plan/API path.

## Critical Path Inventory

| Area | Paths | Current reviewer | Unreviewed-change risk |
| --- | --- | --- | --- |
| GitHub workflow and PR policy | `.github/` | `@JohnChourp` | A workflow, PR template, or traceability regression can weaken merge checks or hide missing ClickUp/evidence links. |
| Native and release automation | `android/`, `ios/`, `scripts/release-and-tag.sh`, `scripts/setup-release-signing.sh`, `scripts/bump-version.sh`, release workflows | `@JohnChourp` | Release commits, signing setup, versioning, or Android/iOS metadata can break production release handling. |
| OPTC DB release detector | `scripts/check-optc-release-needed.mjs`, `scripts/lib/release-trigger-*.mjs`, `scripts/fixtures/release-check/` | `@JohnChourp` | The scheduled detector can dispatch releases incorrectly, skip needed updates, or lose failure evidence. |
| Release readiness | `scripts/release-readiness-report.mjs`, `scripts/fixtures/release-readiness/` | `@JohnChourp` | Release sign-off summaries can misclassify blockers, waivers, or required evidence. |
| Performance guardrails | `scripts/perf-*.mjs`, performance workflows | `@JohnChourp` | Browser budget regressions can stop being measured or can fail without actionable evidence. |
| Docs and command verification | `docs/`, `README.md`, `scripts/check-docs-*.mjs` | `@JohnChourp` | Maintainer instructions, command allowlists, or cross-repo links can drift from runnable reality. |
| Browser regression coverage | `e2e/`, Playwright runner/quarantine scripts | `@JohnChourp` | Flaky or missing browser coverage can hide regressions in guided build, transfer, and saved-team flows. |
| Shared fixtures and data import | `scripts/fixtures/`, `scripts/data/`, import/manual-character scripts, generated public data | `@JohnChourp` | Test fixtures, generated dataset rules, or manual overlays can diverge from app behavior. |
| Major app runtime | `src/app/`, `src/types/`, `public/i18n/` | `@JohnChourp` | User-facing routing, state, copy, and core builder behavior can change without the maintainer who owns validation context. |
| Server and app config | `server/`, `scripts/write-app-config.mjs`, `public/app-config.example.js` | `@JohnChourp` | Drive sync, config generation, or web build setup can break across environments. |

## Cross-Repo Escalation

Request app review when a brain change documents, validates, or closes out app
behavior that is not already merged and verified in the app repository.

Request brain review when an app change creates or changes durable audit
evidence, live-artifact references, release runbook behavior, Codex skills, or
ClickUp closeout policy in `../optc-team-builder-brain`.

When one ClickUp task spans both repositories, use matching branch names where
possible so cross-repo docs integrity can resolve sibling branches in CI. The
brain audit should be the durable evidence target for both PRs.

## Exceptions

Dependabot and other bot-authored dependency PRs may merge without filling human
traceability fields when the existing PR traceability workflow skips them.

Docs-only typo fixes outside `CODEOWNERS` critical paths can use normal review
judgment. If the doc changes a maintainer command, workflow reference,
evidence path, or release policy, treat it as critical and follow the owner
routing.

Emergency direct commits to `main` are allowed only for the requested
post-merge recovery path or a production incident. Record the commands, affected
paths, and reason in the relevant ClickUp task or brain audit.

## Maintenance Rule

When a PR adds, removes, renames, or materially changes a critical path listed
here, update `.github/CODEOWNERS` and this policy in the same PR.

When another human maintainer or GitHub team is added, replace the single-owner
routes with the narrowest practical owner set and document the backup reviewer
or escalation rule here.
