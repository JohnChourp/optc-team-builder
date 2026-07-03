# Post-Merge Smoke Pack

Use this pack after risky merges when maintainers need a quick confidence pass
without running the full release sign-off cycle. The core path is designed for a
10-15 minute web and release-adjacent check. Android device launch is a tiered
escalation, not a default requirement for every run.

## Core Pack

Run the scripted pack from the app repo after syncing the target branch:

Command status: manual/illustrative.
<!-- docs-command: manual/illustrative -->
```bash
npm run test:post-merge-smoke
```

The script combines the three checks below:

Command status: CI-executable.
<!-- docs-command: ci-executable -->
```bash
npm run doctor:maintainer -- --profile=ci --brain-root ../optc-team-builder-brain
npm run data:check-release -- --fixture=no-change --json
```

Command status: manual/illustrative.
<!-- docs-command: manual/illustrative -->
```bash
npm run test:e2e:chromium -- --grep "@post-merge-smoke"
```

## Scenarios

| Scenario | Pass expectation | Evidence |
| --- | --- | --- |
| Public guide/help route | The team-building guide and guided/compare/share guide render with their expected headings. | Playwright output, failure screenshot/video, or a task-scoped screenshot under `../optc-team-builder-brain/live-artifacts/<task-id>/`. |
| Guided/compare/share path | Guided auto build exposes the next-slot state; compare mode accepts saved and imported teams; Saved Teams export/share/import remains intact. | Playwright output and artifacts from the `@post-merge-smoke` subset. |
| Release-check handoff | Maintainer prerequisites pass and the no-change release fixture reports no release-needed branch. | Command output or CI logs from the doctor and release fixture commands. |

## When This Replaces Full QA

Use this pack instead of full release QA when the merge is docs, tooling,
post-merge recovery, or a small runtime change whose deeper validation already
passed in the PR. Record the command, branch or SHA, and artifact location in
the PR, audit, or ClickUp closeout.

Do not treat this pack as full QA for release candidates, Android/native
changes, generated data imports, release workflow edits, auth/Drive Sync
changes, service-worker or PWA shell changes, broad UI rewrites, or any merge
where the smoke pack fails. Follow the matching row in
`docs/maintainer-validation-guide.md` and keep full release sign-off evidence
when the risk is broader than these scenarios.

## Android Escalation

Run an Android live launch only when the merge touched native, Capacitor,
release, PWA shell, or device-specific behavior, or when the smoke result shows
a regression that may differ between browser and device.

Command status: manual/illustrative.
<!-- docs-command: manual/illustrative -->
```bash
$CODEX_HOME/bin/ionic-android-live-serve-inspect --project ../optc-team-builder
```

For ClickUp-backed OPTC work, save screenshots, device notes, and reports only
under `../optc-team-builder-brain/live-artifacts/<task-id>/`; do not commit raw
device captures to the app repo.
