# OPTC Team Builder

Offline-first Ionic Angular app for browsing One Piece Treasure Cruise characters and building teams on web, Android, and iOS.

## Live site

- App: https://optcteambuilder.com/
- OPTC team builder tool page: https://optcteambuilder.com/tools/optc-team-builder/
- OPTC character database: https://optcteambuilder.com/tools/optc-character-database/
- Team-building guide: https://optcteambuilder.com/guides/how-to-build-an-optc-team/

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

Install dependencies:

```bash
npm install
```

Configure local app secrets:

```bash
cp .env.example .env.local
```

For Google Drive sync to be available in the browser, fill `APP_GOOGLE_WEB_CLIENT_ID` in `.env.local`.
For iOS builds, also fill `APP_GOOGLE_IOS_CLIENT_ID`.

Import everything in one run:

```bash
npm run data:import:all
```

Import everything from the upstream `optc-db` source instead of the default `2shankz` source:

```bash
npm run data:import:all -- --source=optc-db
```

The one-shot command above already includes every supported image pack. The lower-level single-pack modes still exist only if you want them:

Import metadata plus global thumbnails:

```bash
npm run data:import:all -- --download-images=thumbnails-glo
```

Import metadata plus all thumbnail packs, including ship thumbnails:

```bash
npm run data:import:all -- --download-images=thumbnails
```

Import metadata plus every supported offline image pack:

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

```bash
npm run data:import:all -- --source=optc-db --download-images=thumbnails
```

If GitHub responds with `403` while listing image packs, export `GITHUB_TOKEN` or `GH_TOKEN` before running any `--download-images=...` import mode:

```bash
export GITHUB_TOKEN=your_github_token
npm run data:import:all
```

Run the app in the browser:

```bash
npm start
```

Create a production build:

```bash
npm run build
```

Build and sync the native projects:

```bash
npm run build:mobile
```

Build the GitHub Pages artifact locally:

```bash
npm run build:pages
```

Build locally with GA4 injected from environment:

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

```bash
./scripts/setup-release-signing.sh
source ~/.android/optc-team-builder/release-signing.env
```

Local fallback release command:

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
