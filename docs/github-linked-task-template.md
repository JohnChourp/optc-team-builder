# GitHub-Linked Task Template

Use this template when a ClickUp task is expected to produce GitHub evidence:
pull requests, commits, workflow runs, release artifacts, or durable brain audit
notes. Keep the task brief compact, but make the reason, links, validation, and
remaining risk clear enough for a future maintainer to audit without reopening
the whole implementation thread.

## Copyable Task Body

```markdown
Rationale
- Why this work exists:
- What ambiguity, regression risk, or maintenance cost it reduces:

Related links
- ClickUp parent/subtasks:
- GitHub issue, PR, workflow, release, or source link:
- Brain audit or durable evidence path:

Implementation / changed surface
- Repo(s):
- Files, routes, workflows, scripts, or behavior expected to change:
- Explicitly out of scope:

Verification
- Local commands:
- CI checks or workflow runs:
- Live UI or device evidence, if applicable:

Residual risk / follow-up
- Known limitation or residual risk:
- Narrow follow-up scope, if any:

Completion notes / duplicate-prevention
- Completed on:
- Implemented scope:
- Main repos, files, PRs, or behavior changed:
- Verification that passed:
- Residual risk:
- ClickUp `generate tasks` should not create another task for this completed
  scope. Future generated tasks should target only:
```

## Checklist

- Rationale explains why the task exists, not only what file should change.
- Related links include the ClickUp task and any GitHub issue, PR, workflow run,
  release, or evidence source the implementer must preserve.
- Implementation scope names the affected repo and surface in plain terms.
- Verification lists concrete commands, CI checks, or review gates.
- Residual risk names what remains unknown or says `none found` after
  validation.
- Completion notes preserve the original task brief and add a
  duplicate-prevention sentence before the task is moved to a closed status.

## Usage Notes

Use short bullets unless the task is unusually risky. Do not paste secrets,
tokens, raw user data, private account details, or bulky local logs into the
task body. Put durable evidence in the sibling brain repo and raw captures under
`../optc-team-builder-brain/live-artifacts/<task-id>/` when live evidence is
needed.
