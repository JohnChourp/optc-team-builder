# Branch Lifecycle Policy

This policy defines how OPTC maintainers handle app and brain branches after PR
merge, especially when GitHub squash merges leave the original branch behind.
It is report-only guidance. It does not authorize changing repository rulesets
or deleting branches without a separate explicit maintainer decision.

## Current Repository State

The app repository keeps `delete_branch_on_merge` disabled. A repository ruleset
named `Project Base Branch` currently applies active `deletion` and
`non_fast_forward` rules to the default branch and all branches. That is why a
routine post-merge branch deletion can fail with GH013 even after the PR itself
merged cleanly.

The private brain repository also keeps `delete_branch_on_merge` disabled. Its
branch protection and ruleset configuration may not be inspectable through the
available GitHub plan or API path, so brain cleanup decisions need to be based
on visible PR state plus any settings a maintainer can confirm in GitHub.

## Cleanup Rule

Run the report before deciding whether a branch is disposable:

Command status: manual/illustrative.
<!-- docs-command: manual/illustrative -->
```bash
git fetch --all --prune
npm run branch:cleanup-report -- --repo JohnChourp/optc-team-builder --format markdown
```

Use the report status this way:

- `blocked`: merged routine branch, but an active deletion rule applies. Do not
  retry deletion. Record the blocker and leave the branch until a maintainer
  explicitly changes the ruleset or performs an approved cleanup.
- `manual-delete-candidate`: merged routine branch and no deletion rule applies.
  A maintainer may delete it after confirming there is no open PR, release,
  hotfix, incident, or active work depending on it.
- `keep-open`: default branch, open PR branch, or intentional long-lived branch
  such as `release/*`, `hotfix/*`, or `dependabot/*`. Do not delete it as
  routine cleanup.
- `investigate`: the report did not find enough open or merged PR evidence.
  Check GitHub PR history, local notes, and any linked ClickUp task before
  deciding.

## Routine Branches

Routine OPTC feature branches normally use the `codex/` prefix. A `codex/`
branch is not automatically disposable after a squash merge because the branch
head is often not an ancestor of `main`. The report therefore uses merged PR
metadata first and Git ancestry only as supporting evidence.

## What Not To Do

- Do not treat branch deletion as a guaranteed side effect of PR merge.
- Do not repeatedly retry a GitHub deletion that already returned GH013.
- Do not delete branches from this policy when the report says `blocked`,
  `keep-open`, or `investigate`.
- Do not change GitHub rulesets, enable auto-delete, or delete old branches as
  part of ordinary docs/tooling PRs.

When a policy or ruleset changes, update this document, the maintainer
validation guide, the feature coverage map, and the docs drift map in the same
PR.
