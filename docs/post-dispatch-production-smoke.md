# Post-Dispatch Production Smoke

Use this check after a successful `Release Android` dispatch to prove the
published artifact and deployed production shell are still usable. It is a
bounded production smoke, not a full release sign-off cycle.

## Minimum Checklist

The `Release Android` workflow runs this check after the release commit and
GitHub Pages deploy have succeeded and `release-provenance` has finished. The
smoke record must include:

- Release run URL, tag, package version, and Android version code.
- `release-provenance` JSON and Markdown from the same workflow run.
- Production public-entry synthetic JSON plus screenshots for the guide route
  and redacted saved-team share-link landing.
- A combined `post-dispatch-production-smoke` JSON and Markdown verdict.

Command status: manual/illustrative.
<!-- docs-command: manual/illustrative -->
```bash
npm run release:post-dispatch-smoke -- \
  --release-provenance /path/to/release-provenance.json \
  --public-entry-report /path/to/public-entry-synthetics-report.json \
  --release-run-url https://github.com/JohnChourp/optc-team-builder/actions/runs/<run-id> \
  --release-tag vX.Y.Z \
  --release-version X.Y.Z \
  --version-code <code> \
  --output /tmp/post-dispatch-production-smoke.json \
  --summary /tmp/post-dispatch-production-smoke.md
```

## Pass And Failure Thresholds

The smoke job fails when any of these are true:

- Release provenance status is `failed`.
- Workflow release tag, package version, or version code does not match the
  release provenance artifact.
- An auto-dispatched release is missing detector linkage.
- The production guide route or redacted saved-team share-link landing fails to
  render.
- First-party production route, asset, page, or Angular shell loading errors
  appear in the public-entry synthetic report.

Release provenance warnings stay visible in the smoke record and do not fail the
job unless they violate an auto-dispatch requirement. Manual releases without
detector metadata are allowed, but the missing detector link remains a visible
warning.

## Evidence

The workflow uploads a `post-dispatch-production-smoke` artifact. Keep the
artifact with the release run when closing release-backed tasks. For
ClickUp-backed OPTC work, summarize durable findings in the brain audit and
store any local reproductions under
`../optc-team-builder-brain/live-artifacts/<task-id>/`.

Do not commit raw screenshots, downloaded APKs, or workflow artifacts to the app
repo.

## Rollback Or Escalation

If release provenance fails, halt release closeout and inspect the
`release-provenance` artifact before any further dispatch. Treat APK asset,
version, source-version, or released-ID mismatches as release integrity failures.

If production public-entry smoke fails after Pages deploy succeeded, first
verify whether the failure is a deployment propagation delay by rerunning the
`Public Entry Synthetics` workflow once against `https://optcteambuilder.com`.
If the rerun still fails, open or update the release incident record, link the
failed smoke artifact, and decide whether to publish a follow-up release or
revert the release commit.

If only optional analytics or third-party diagnostics appear, keep the warning
in the release notes or task closeout and do not roll back solely for that
noise.
