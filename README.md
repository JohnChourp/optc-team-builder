# OPTC Team Builder

Offline-first Ionic Angular app for browsing One Piece Treasure Cruise characters and building teams on web, Android, and iOS.

## Live site

- App: https://optcteambuilder.com/
- OPTC team builder tool page: https://optcteambuilder.com/tools/optc-team-builder/
- OPTC character database: https://optcteambuilder.com/tools/optc-character-database/
- Team-building guide: https://optcteambuilder.com/guides/how-to-build-an-optc-team/
- Guided build, compare mode, and team sharing guide: https://optcteambuilder.com/guides/guided-build-compare-team-sharing/

## What is included

- Local OPTC dataset importer that reads from the raw `optc-db.github.io` source repository, defaulting to the `2Shankz` fork.
- Generated SQLite seed loaded inside the app through `sql.js`.
- Offline-friendly character browser, detail view, collection view, and team builder.
- Capacitor Android and iOS projects already scaffolded.
- Manual update workflow for metadata and optional image packs.

## Source of truth

The app does not scrape the live rendered website. It imports from the raw source repository files for the selected source (`2shankz` by default, or `optc-db` explicitly):

- `common/data/units.js`
- `common/data/details.js`
- `common/data/ships.js`
- `common/data/rumble.json`
- GitHub tree listings under `api/images/...`

## Commands

Required runtime:

- Node.js `24.15.0` is pinned for local development in `.nvmrc` and `.node-version`.
- Angular 22 also supports Node `^22.22.3` and `>=26.0.0`, as reflected in `package.json` engines.
- If `ionic serve` or `npm run build` reports that Node `24.13.1` is unsupported, switch to a supported version first, for example `nvm install && nvm use`.

Maintainer validation guide:

- `docs/maintainer-validation-guide.md` explains which contract, performance,
  release-detector, release-readiness, broad UI, and docs-only validation path
  to run for each class of change.
- `docs/feature-coverage-map.md` maps major product and operational flows to
  their tests, docs, performance checks, evidence, and owning area.

Install dependencies:

Command status: manual/illustrative.
<!-- docs-command: manual/illustrative -->
```bash
npm install
```

Configure local app secrets:

Command status: manual/illustrative.
<!-- docs-command: manual/illustrative -->
```bash
cp .env.example .env.local
```

For Google Drive sync to be available in the browser, fill `APP_GOOGLE_WEB_CLIENT_ID` in `.env.local`.
For iOS builds, also fill `APP_GOOGLE_IOS_CLIENT_ID`.

Import everything in one run:

Command status: manual/illustrative.
<!-- docs-command: manual/illustrative -->
```bash
npm run data:import:all
```

Import everything from the upstream `optc-db` source instead of the default `2shankz` source:

Command status: manual/illustrative.
<!-- docs-command: manual/illustrative -->
```bash
npm run data:import:all -- --source=optc-db
```

The one-shot command above already includes every supported image pack. The lower-level single-pack modes still exist only if you want them:

Import metadata plus global thumbnails:

Command status: manual/illustrative.
<!-- docs-command: manual/illustrative -->
```bash
npm run data:import:all -- --download-images=thumbnails-glo
```

Import metadata plus all thumbnail packs, including ship thumbnails:

Command status: manual/illustrative.
<!-- docs-command: manual/illustrative -->
```bash
npm run data:import:all -- --download-images=thumbnails
```

Import metadata plus every supported offline image pack:

Command status: manual/illustrative.
<!-- docs-command: manual/illustrative -->
```bash
npm run data:import:all
```

Supported `--download-images` modes:

- `thumbnails-glo`: only global character thumbnails
- `thumbnails-jap`: only japan character thumbnails
- `ship-thumbnails`: only ship thumbnails
- `thumbnails`: all thumbnail packs (`thumbnails-glo`, `thumbnails-jap`, `ship-thumbnails`)
- `all`: metadata import plus every supported offline image pack

You can combine the source selector with any image download mode, for example:

Command status: manual/illustrative.
<!-- docs-command: manual/illustrative -->
```bash
npm run data:import:all -- --source=optc-db --download-images=thumbnails
```

If GitHub responds with `403` while listing image packs, export `GITHUB_TOKEN` or `GH_TOKEN` before running any `--download-images=...` import mode:

Command status: manual/illustrative.
<!-- docs-command: manual/illustrative -->
```bash
export GITHUB_TOKEN=your_github_token
npm run data:import:all
```

Run the app in the browser:

Command status: manual/illustrative.
<!-- docs-command: manual/illustrative -->
```bash
npm start
```

Create a production build:

Command status: manual/illustrative.
<!-- docs-command: manual/illustrative -->
```bash
npm run build
```

Build and sync the native projects:

Command status: manual/illustrative.
<!-- docs-command: manual/illustrative -->
```bash
npm run build:mobile
```

Build the GitHub Pages artifact locally:

Command status: manual/illustrative.
<!-- docs-command: manual/illustrative -->
```bash
npm run build:pages
```

Build locally with GA4 injected from environment:

Command status: manual/illustrative.
<!-- docs-command: manual/illustrative -->
```bash
APP_GA4_MEASUREMENT_ID=G-XXXXXXXXXX npm run build:pages
```

`npm start`, `npm run build`, and `npm run watch` auto-load `.env` and `.env.local` before generating `public/app-config.js`.
If the Google OAuth IDs are missing, the config step prints a warning because the Settings page will show Google Drive sync as unavailable.
`npm run build:pages` is stricter and fails fast when `APP_GOOGLE_WEB_CLIENT_ID` is missing so a broken Pages deploy does not get published.

Google OAuth setup for the web client must include at least these authorized JavaScript origins:

- `http://localhost:8400`
- `https://optcteambuilder.com`

It must also include these authorized redirect URIs because the web OAuth popup returns to a stable origin URL:

- `http://localhost:8400`
- `https://optcteambuilder.com`

## GitHub Pages deploy

This repo publishes Pages through the `Deploy GitHub Pages` GitHub Actions workflow only.

- The repository Pages setting must stay in GitHub Actions workflow mode, not legacy branch mode.
- Pushes to `main`, including Android release commits like `release: vX.Y.Z`, trigger the Pages workflow automatically.
- If you see both `Deploy GitHub Pages` and `pages-build-deployment` for the same SHA, the repo Pages settings regressed back to legacy mode and need to be switched to workflow mode.
- `PAGES_ENABLEMENT_TOKEN` is no longer part of the normal setup for this repo.

## Release detector replay

The scheduled `Check OPTC DB Release` workflow uses `npm run data:check-release` to
compare committed character IDs with upstream OPTC DB IDs. The detector can also
replay compact local fixtures without fetching upstream data:

Command status: CI-executable; the `error` fixture is expected to exit nonzero.
<!-- docs-command: ci-executable -->
```bash
npm run data:check-release -- --fixture=no-change --json
npm run data:check-release -- --fixture=new-character --json
npm run data:check-release -- --fixture=active-release-running --json
npm run data:check-release -- --fixture=upstream-shape-drift --json
node scripts/check-optc-release-needed.mjs --fixture=error --json
```

`no-change` must return `releaseNeeded=false`; `new-character` must return
`releaseNeeded=true`; `active-release-running` must return `releaseNeeded=true`
so the workflow report can replay the blocked active-release branch;
`upstream-shape-drift` must return `releaseNeeded=false` even with a newer
source version and object/variant shape drift; `error` is intentionally
malformed and must exit nonzero.

Bundled fixture directories live under `scripts/fixtures/release-check/`. Each
directory must contain `local-manifest.json`, `local-seed.sql`,
`remote-version.js`, and `remote-units.js`. Keep fixtures compact, name them for
the release decision branch they cover, and add matching expectations to
`scripts/check-optc-release-needed.spec.ts` before wiring them into the workflow
fixture-validation step.

Manual `Check OPTC DB Release` workflow dispatches default to
`release_dispatch_mode=verify-only`, which produces the normal
`release-trigger-outcome` report but blocks `Release Android` dispatch even when
new upstream IDs are found. Choose `dispatch-if-needed` only when the manual
workflow run is meant to start a production Android release if the detector
finds releasable data.

To replay captured upstream files during an incident, keep the local manifest and
seed defaults or point at custom local files, then pass both remote paths:

Command status: manual/illustrative.
<!-- docs-command: manual/illustrative -->
```bash
npm run data:check-release -- --json \
  --remote-version-path=/path/to/common/data/version.js \
  --remote-units-path=/path/to/common/data/units.js
```

For a fully custom replay directory, use `--fixture-dir=/path/to/replay`. The
directory must contain `local-manifest.json`, `local-seed.sql`,
`remote-version.js`, and `remote-units.js`.

Android releases should now run from the manual `Release Android` GitHub Actions workflow.

Required repository or environment secrets:

- `ANDROID_KEYSTORE_B64`
- `ANDROID_SIGNING_STORE_PASSWORD`
- `ANDROID_SIGNING_KEY_ALIAS`
- `ANDROID_SIGNING_KEY_PASSWORD`

Optional secret when branch protection blocks `GITHUB_TOKEN` pushes:

- `RELEASE_PUSH_TOKEN`

Optional Pages secret for GA4 injection at build time:

- `APP_GA4_MEASUREMENT_ID`

Required Pages secret for Google Drive sync on the website:

- `APP_GOOGLE_WEB_CLIENT_ID`

Optional Pages secret when you also want the same generated config file to carry the iOS client ID:

- `APP_GOOGLE_IOS_CLIENT_ID`

The workflow:

- runs only through `workflow_dispatch`
- bumps `package.json`, `package-lock.json`, Android `versionName`/`versionCode`, and iOS `MARKETING_VERSION`/`CURRENT_PROJECT_VERSION`
- builds the signed Android APK
- commits `release: vX.Y.Z`, tags `vX.Y.Z`, pushes both to `main`, and publishes a GitHub Release
- relies on that pushed release commit to trigger the normal `Deploy GitHub Pages` workflow

Local fallback signing setup:

Command status: manual/illustrative.
<!-- docs-command: manual/illustrative -->
```bash
./scripts/setup-release-signing.sh
source ~/.android/optc-team-builder/release-signing.env
```

Local fallback release command:

Command status: manual/illustrative.
<!-- docs-command: manual/illustrative -->
```bash
../optc-team-builder-brain/.codex/skills/optc-team-builder-android-release/scripts/run_release.sh --project "$(pwd)" --bump patch
```

The local skill auto-loads `~/.android/optc-team-builder/release-signing.env` and, if needed, runs `./scripts/setup-release-signing.sh` before continuing with the existing release flow.

The release workflow does not perform a second deploy step for Pages. It only pushes the release commit to `main`, which then triggers the normal Pages workflow.

The local signing env contract remains:

- `ANDROID_SIGNING_STORE_FILE`
- `ANDROID_SIGNING_STORE_PASSWORD`
- `ANDROID_SIGNING_KEY_ALIAS`
- `ANDROID_SIGNING_KEY_PASSWORD`

## Generated assets

The importer writes these generated files:

- `public/assets/data/optc-manifest.json`
- `public/assets/data/optc-seed.sql`
- `public/assets/data/optc-preview.json`
- `public/assets/offline-packs/<pack-id>/...`

Available offline image packs also include:

- `thumbnails-glo`
- `thumbnails-jap`
- `ship-thumbnails` for ship picker and saved team previews

Local ship thumbnail overrides for upstream-missing ships live in `scripts/data/ship-thumbnail-overrides.json`.

## Current limitations

- Offline packs are opt-in and only become available in the app after running the matching `npm run data:import:all -- --download-images=...` mode.
- The app uses `sql.js`, which increases the web bundle size compared with a plain JSON-only client.
- Redistribution of game art is a separate legal/product decision before any public store release.
