# OPTC Team Builder

Offline-first Ionic Angular app for browsing One Piece Treasure Cruise characters and building teams on Android and iOS.

## What is included

- Local OPTC dataset importer that reads from the `optc-db.github.io` source repository.
- Generated SQLite seed loaded inside the app through `sql.js`.
- Offline-friendly character browser, detail view, collection view, and team builder.
- Capacitor Android and iOS projects already scaffolded.
- Manual update workflow for metadata and optional image packs.

## Source of truth

The app does not scrape the live rendered website. It imports from the `optc-db` source repository:

- `common/data/units.js`
- `common/data/details.js`
- `common/data/ships.js`
- `common/data/rumble.json`
- GitHub tree listings under `api/images/...`

## Commands

Install dependencies:

```bash
npm install
```

Import metadata only:

```bash
npm run data:import
```

Import metadata plus global thumbnails:

```bash
npm run data:import:glo-thumbs
```

Import metadata plus every supported offline image pack:

```bash
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

## Generated assets

The importer writes these generated files:

- `public/assets/data/optc-manifest.json`
- `public/assets/data/optc-seed.sql`
- `public/assets/data/optc-preview.json`
- `public/assets/offline-packs/<pack-id>/...`

The currently installed pack in this workspace is:

- `thumbnails-glo` at roughly `56 MB`

## Current limitations

- `thumbnails-jap` and `full-transparent` are implemented in the importer but were not downloaded in this pass.
- The app uses `sql.js`, which increases the web bundle size compared with a plain JSON-only client.
- Redistribution of game art is a separate legal/product decision before any public store release.
