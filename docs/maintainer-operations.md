# Maintainer Operations

This is the public-safe landing page for maintaining OPTC Team Builder. Use it
when you need to decide where an operational topic belongs, which public guide
to start from, and where private evidence should be recorded.

## Public And Private Boundary

The public app repository should contain durable, reusable operating guidance:
validation routes, release commands, fixture ownership, PR expectations, and
safe troubleshooting entry points.

Private or bulky evidence belongs outside the public docs:

- ClickUp task descriptions and comments hold task-specific completion notes.
- The sibling brain repo holds durable audits, evidence indexes, runbooks, and
  Codex workflow notes.
- Raw screenshots, browser captures, logs, and local command output stay ignored
  under `../optc-team-builder-brain/live-artifacts/<task-id>/`.
- Secrets, tokens, signing credentials, raw user data, and private account
  details must not be pasted into app docs, PRs, ClickUp comments, or audits.

When a public guide needs to reference private context, link or name the stable
brain audit/runbook location and keep the public instructions runnable without
that private detail.

## Operations Map

| Need | Public entry point | Private or durable evidence |
| --- | --- | --- |
| Choose validation for a change | [Maintainer validation guide](maintainer-validation-guide.md) | Brain audit for the ClickUp task when the work needs durable closeout evidence |
| Understand app and brain ownership across data import, runtime matching, release detection, and audits | [Cross-repo architecture map](cross-repo-architecture-map.md) | Task audit and `../optc-team-builder-brain/audits/evidence-index.md` when the map changes |
| Find the owner and coverage for a product or operational flow | [Feature coverage map](feature-coverage-map.md) | Related task audit and `../optc-team-builder-brain/audits/evidence-index.md` |
| Draft or close a GitHub-linked ClickUp task | [GitHub-linked task template](github-linked-task-template.md) | Task audit, PR links, workflow evidence, and completion notes in ClickUp |
| Add, move, or repair fixtures | [Fixture ownership guide](fixture-ownership-guide.md) | Task audit when fixture policy or release evidence changes |
| Review dependency, workflow, browser-test, performance, release-check, or native-tooling updates | [Dependency maintenance policy](dependency-maintenance-policy.md) | Brain audit for the maintenance task and post-merge workflow checks |
| Run quick confidence after a risky merge | [Post-merge smoke pack](post-merge-smoke-pack.md) | Task audit and `live-artifacts/<task-id>/` when ClickUp-backed evidence is needed |
| Verify production after Android release dispatch | [Post-dispatch production smoke](post-dispatch-production-smoke.md) | `post-dispatch-production-smoke` workflow artifact plus the release/task audit |
| Audit public guide and help discoverability | `npm run discoverability:verify` after `npm run build:pages` | Guide-discoverability workflow artifact and task audit when route/link ownership changes |
| Keep docs from drifting after feature changes | [Docs drift map](docs-drift-map.json) and the docs-only row in the [validation guide](maintainer-validation-guide.md) | Brain docs-integrity audit or task-specific closeout |
| Open or review human PRs | [Review ownership policy](review-ownership-policy.md) and PR traceability fields | Brain audit, live-artifact directory, and CI run links referenced from the PR |
| Audit merged branch cleanup blockers | [Branch lifecycle policy](branch-lifecycle-policy.md) | Task audit and ignored `live-artifacts/<task-id>/` command evidence when ClickUp-backed |
| Triage OPTC DB release detection and release provenance | [Release detector replay](../README.md#release-detector-replay), the latest `release-detector-status` and `release-decision-history` artifacts, and the post-release `release-provenance` artifact | `../optc-team-builder-brain/OPTC_DB_AUTO_RELEASE_RUNBOOK.md` and release-trigger/provenance audits |
| Summarize release readiness | Release-readiness row in the [validation guide](maintainer-validation-guide.md) | `../optc-team-builder-brain/audits/869dwc0wc-release-readiness-summary.md` or the current release-candidate audit |
| Publish user-facing release notes | [Release notes README](release-notes/README.md) | Source JSON and generation evidence in the brain repo |
| Run Android release operations | [Android release workflow](../README.md#android-release-workflow) | Release skill output, GitHub Actions run, and task/release audit |
| Check GitHub Pages deploy behavior | [GitHub Pages deploy](../README.md#github-pages-deploy) | Deploy workflow run and task audit when deployment behavior changes |
| Rehearse or document an incident path | Release detector replay and validation guide release rows | Brain incident drill, release-trigger report, or task-specific incident record |

## Standard Handoff Flow

1. Classify the task before editing: runtime feature, docs/tooling, release
   automation, release evidence, performance, data import, or ClickUp cleanup.
2. For ClickUp-backed work that will produce GitHub evidence, start from the
   GitHub-linked task template so rationale, links, verification, and residual
   risk are captured before closeout.
3. Pick the smallest validation path from the maintainer validation guide.
4. If live UI evidence is explicitly requested, keep captures under
   `../optc-team-builder-brain/live-artifacts/<task-id>/` and summarize only
   the useful result in a tracked audit.
5. Fill PR traceability with the ClickUp task, durable evidence, and concrete
   verification commands before requesting review.
6. After merge, monitor the default branch checks for the repos that changed,
   then run the post-merge smoke pack when the merge carried release-critical
   web or release-adjacent risk. For Android release dispatches, keep the
   post-dispatch production smoke artifact with the release run.
7. Close ClickUp only after the merged state, validation, and evidence links are
   recorded.

## Release Version Rule

Release versions keep **two-digit segments**. `scripts/bump-version.sh` enforces
this, so a `patch` bump does not run past 99:

| Current | Bump | Next |
| --- | --- | --- |
| `0.0.98` | patch | `0.0.99` |
| `0.0.99` | patch | `0.1.0` |
| `0.99.99` | patch | `1.0.0` |
| `0.99.5` | minor | `1.0.0` |

A `patch` at 99 rolls into the minor; a `minor` at 99 rolls into the major; a
`patch` at 99 with the minor also at 99 rolls straight to the next major. An
explicit `--version` is never rewritten, cap or no cap.

This was added after a release from `0.0.99` shipped `v0.0.100`. If a version
ever runs past the cap again, the next `patch` bump pulls it back into shape
(`0.0.100` → `0.1.0`) rather than continuing to `0.0.101`.

Covered by `scripts/bump-version.spec.ts`, which runs in the `release-check`
script suite. That suite enumerates its spec files explicitly — a new script
spec must be added to the matching `test:*` npm script or it never runs in CI.

## Maintenance Rule

When a change adds, removes, renames, or materially changes a maintainer-facing
workflow, update this operations page in the same PR as the detailed guide it
routes to. Prefer linking to the canonical detailed doc instead of copying long
command lists into this page.
