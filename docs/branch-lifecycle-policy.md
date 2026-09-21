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

Routine OPTC feature branches use the `ai/<task-id>-<slug>` prefix. **This said
`codex/` until 2026-09-21**, when all 218 local branches across the two
checkouts were measured and every one of them was `ai/`.

Such a branch is not automatically disposable after a squash merge, because the
branch head is often not an ancestor of `main`. The report therefore uses merged
PR metadata first and Git ancestry only as supporting evidence.

## The local side, and why ancestry is not the only wrong answer

The rules above are about **remote** branches. Local ones accumulate silently:
measured 2026-09-21 there were **218** across the two permanent checkouts — 141
in the app and 77 in the brain — against an earlier count of 21.

Three candidate tests were run against all 140 pre-existing app branches, and
**two of the three do not work**:

| Test | Result |
| --- | --- |
| `git merge-base --is-ancestor` | reports 0 of 140 merged — the documented squash trap |
| tree identical to `main`'s | **0 of 140**, because `main` has moved on since every one of those merges. It can only ever pass on a branch merged seconds ago |
| `git merge-tree --write-tree main <branch>` | 15 contribute nothing, **125 conflict** textually with later work |

So a content comparison is as wrong as the ancestry check it was meant to
replace. **What works is merged-PR metadata**, which is what
`npm run branch:cleanup-report` already uses:

Command status: manual/illustrative.
<!-- docs-command: manual/illustrative -->
```bash
gh pr list --repo JohnChourp/optc-team-builder --state merged --limit 500 \
  --json headRefName --jq '.[].headRefName' > /tmp/merged.txt
git for-each-ref --format='%(refname:short)' refs/heads | grep -v '^main$' \
  | while read -r b; do grep -qx "$b" /tmp/merged.txt || echo "NO MERGED PR: $b"; done
```

A branch that prints is the one worth looking at. All 218 matched.

### The lifecycle, end to end

1. **Created** in the permanent checkout, never a per-task clone — isolation
   comes from the branch, not the folder.
2. **Named** `ai/<task-id>-<slug>`.
3. **Merged** by squash, which deletes the remote head and leaves the local one
   behind looking unmerged forever.
4. **Proven disposable** by the merged-PR match above, never by ancestry and
   never by a tree diff.
5. **Deleted** with `git branch -D`. `-d` refuses every squash-merged branch,
   which is all of them, so `-D` here is correct rather than careless.

**Recovery is not the reflog.** Every deleted branch has a merged pull request
and GitHub keeps that PR's head SHA permanently, so the path back is
`gh pr view <n> --json headRefOid`.

### Before you run `git branch -d`

You will get `error: the branch 'ai/...' is not fully merged`. That message is
**almost always wrong here** — it is the squash trap, not a warning. Check the
merged-PR list before believing it, and check it before reaching for `-D` too.

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
