# Dataset delivery

How the game data gets from this repository to a player's device, and what guards it.
Owner: ClickUp [869f138q7](https://app.clickup.com/t/90121749478/869f138q7) (wave 5, Fixes #5).

## What ships

| File in the build | Role | Prefetched by the service worker |
| --- | --- | --- |
| `assets/data/optc-seed.sqlite.gz` | The database the app opens | yes |
| `assets/data/optc-seed.sql` | The same rows as SQL text; the fallback | **no** |
| `assets/vendor/sql.js/sql-wasm.wasm` | SQLite compiled to WebAssembly | yes |
| `assets/data/optc-auto-builder-abilities.json` | Ability catalogue for the pickers | yes |
| `assets/data/optc-manifest.json` | Counts, versions, pack summaries | yes |

Nothing else in `assets/data` ships (869f138qe). `optc-preview.json`, `optc-unresolved-images.json`
and `optc-unresolved-clauses.json` stay in `public/assets/data/`, where the scripts that read them
look, and `angular.json` leaves them out of the build; the first two used to be prefetched on every
visit although no app code reads them. `optc-preview.json` is not the light character list its name
suggests - it is the first 24 full character records and 12 ships, a sample for scripts - so there
was nothing for the app to use it for (869f138py).

The empty `optc.db` that sat beside the seed until then was never a database attempt: it was added,
at zero bytes, by f2c91ba2 on 2026-04-12, a commit about party-conflict keys whose code never
mentions it, and nothing in the repository ever read it. It is gone.

`public/assets/data/optc-seed.sql` is the source of truth. The importer writes it, git diffs it,
and about twenty scripts read it as text. `optc-seed.sqlite.gz` is derived from it and is not
committed: `scripts/build-dataset-binary.mjs` builds it before every `ng build` and `ng serve`
(the `build`, `build:pages` and `start` npm scripts run `npm run dataset:binary` first).

## Why a database file, gzipped

Measured on 2026-09-16, before this change:

| | Bytes | Note |
| --- | ---: | --- |
| `optc-seed.sql` over the wire | 27,722,752 | no `content-encoding`: the host does not compress `application/sql` |
| the same file, gzip -9 | 2,329,140 | what compression alone would give |
| the built database, gzip -9 | **2,289,988** | what ships now |
| everything prefetched, before | 35,163,757 | the seed was 79% of it |
| everything prefetched, after | 9,735,554 | |

Size was only half of it. The app also executed the seed's 13,863 statements on **every** start.
In Chromium with the files already cached, at 4x CPU throttling, that took 1,584 ms; opening the
database file takes 120 ms (median of three runs; x1: 634 ms against 29 ms; x6: 2,353 ms against
178 ms). A transaction around the statements would have saved a third of that; not executing them
saves nine tenths.

Compression is done by the build rather than left to the host, so nothing depends on which content
types an edge decides to compress, and the service worker's cache on the device holds 2.3 MB
instead of 27.7 MB.

## Two properties the build must keep

- **Deterministic.** The service worker hashes every prefetched file, so a byte that changes for
  no reason makes every installed client download the database again. The database file is
  identical on every machine for the same seed. Its gzip is identical for the same Node release:
  zlib's output differs between Node releases (2,289,988 B on Node 26 against 2,296,133 B on
  Node 24.15 for the same database), and production builds run on the `.nvmrc` pin, so a change
  of that pin re-downloads the database once. The gzip header's operating-system byte is pinned
  to Unix, because zlib otherwise writes 19 on macOS.
- **Equivalent.** The database holds exactly what executing the seed holds, because the fallback
  executes the seed.

## How the app loads it

`src/app/core/services/dataset-database-loader.utils.ts`:

1. Fetch `optc-seed.sqlite.gz`, decompress it with `DecompressionStream`, check the SQLite
   header, open it, and read one table to prove the pages are there.
2. If any step fails - no `DecompressionStream` (older than every browser Angular 22 supports),
   a missing or damaged file, or a dev server answering a missing file with `index.html` - log a
   warning with a stable code (`optc:dataset-database-fallback` or
   `optc:dataset-database-unsupported`) and build the database from `optc-seed.sql` instead.

The header decides, not the file name: a host that sent the file with `content-encoding: gzip`
would hand over an already-decoded database, and that is accepted as it is.

## The guard

The `dataset-delivery` lane (`npm run test:dataset-delivery`) builds the app and runs
`scripts/check-dataset-delivery.mjs` against the output. It fails when:

- a prefetched file over 256,000 bytes is neither a type the host compresses nor compressed
  already - the exact shape the seed had;
- the raw seed is prefetched again;
- `optc-seed.sqlite.gz` is missing or not prefetched;
- the shipped database is not the database the shipped seed builds;
- the built `assets/data` holds a file no app code names, or lacks one that app code names. The
  list is read from the app source - every quoted `assets/data/<file>` outside a spec - so it
  cannot drift from the code;
- the whole prefetch group, as cached, goes over **10,076,000 B** (869f138qh; 9,596,108 B measured,
  x1.05). The same number is a row in the performance report, and a spec keeps the two equal.
  Adding a 757,776 B JSON file to the i18n group of a real build failed it.

Each rule was broken on purpose against a real build before the lane was registered: prefetching
the raw seed again, shipping a seed changed after the database was built, and building with
`ng build` directly so the database step never ran. All three failed, naming the right file.

## What a release costs an installed client

Owner: ClickUp [869f138qb](https://app.clickup.com/t/90121749478/869f138qb).

The service worker compares the new build's file hashes with the ones it has, and downloads
only the files that changed. So a release costs a returning player exactly the prefetched files
whose bytes moved.

Until this change, the importer wrote a fresh `generatedAt` into all five generated files on every
run - including the seed, where it sits in the `meta` row. Every release therefore changed the
seed, and every installed client downloaded all of it again, whether or not the game data had
moved. Measured on 2026-09-16 over the release tags:

| Transitions | Seed changed only in `generatedAt` | Seed changed for real |
| --- | ---: | ---: |
| since v0.2.0 (65) | **58** | 7 |
| v0.4.42 to v0.4.53 (11) | **10** | 1 (a new column) |

Each of those 58 cost 27.7 MB per returning player. The real changes that only added characters
were 2.4-13.8 KB gzipped; the two schema changes were about 0.4 MB.

Now `generatedAt` means "when this data last changed". At the end of an import,
`keepGeneratedAtWhenOnlyTimestampChanged` (`scripts/lib/optc-dataset.mjs`) compares the five files
with what was on disk before; when the timestamp is the only difference, it puts the previous files
back byte for byte. A release that brings no new data therefore costs an installed client
**nothing** for the dataset; one that does costs the new database, about 2.3 MB.

The check runs at the end on purpose. An import writes the files twice - the importer, then the
manual overlay, which rebuilds them from the seed and writes again with its own timestamp - so a
check inside the importer alone compared two versions that never agree. That was tried first and
measured: a data-identical import still moved the timestamp in all five files. With the check at
the end, the same import left them byte-identical.

To see what a given release changed in the dataset, compare the two tags:
`git diff --numstat vA.B.C vX.Y.Z -- public/assets/data/`. A seed line count of `1 1` is the
timestamp alone - the shape this change removes.

The date on the Settings screen's "App and data" card ("Data generated") reads the same field, so
it now shows when the data last changed rather than when the last release ran.

## How long the database takes

Owner: ClickUp [869f138qd](https://app.clickup.com/t/90121749478/869f138qd).

The database used to be rebuilt from the seed on **every** app start, on the main thread, one
statement at a time with a yield every 250. Opening the database file replaced that on the normal
path. The fallback still executes the seed, and now does it inside one transaction.

| Chromium, files cached | CPU x1 | CPU x4 | CPU x6 |
| --- | ---: | ---: | ---: |
| before: statement by statement | 634 ms | 1,584 ms | 2,353 ms |
| fallback now: inside one transaction | 496 ms | 1,003 ms | 1,406 ms |
| normal path now: open the database file | 29 ms | 120 ms | 178 ms |

In Node, `npm run perf:dataset` reads the same three: `seedExecuteMs` (the fallback, 232 ms on an
M4 Pro, 401 ms before the transaction), `databaseBuildMs` (the build step) and `databaseOpenMs`
(decompress, open, read one table - 16 ms).

**Why 250.** The interval predates any measurement and is kept because the measurement supports
it: inside the transaction, at 4x CPU, 250 statements take about 16 ms, so the page still gets a
frame roughly every 16 ms. Cost follows bytes rather than statement count, and the newest
characters carry the longest detail JSON, so the last chunks are the slowest (81 ms at 4x).

**The budget row.** The app sets a `performance.mark` named `optc:dataset-ready`, with the path it
took in `detail.source`, when the database is usable. `scripts/perf-route-load.mjs` loads
`/tabs/characters` in a fresh context, waits for the mark, and reports `datasetReadyMs` - desktop
unthrottled, mobile at 4x CPU, under its own measurement profile so the other browser rows keep
meaning "no throttling". A run where the mark says the database came from the seed statements is a
failure, not a fast number.

First observation, 2026-09-16, M4 Pro: **desktop 141 ms, mobile 437 ms**. The budgets (700 ms /
2,200 ms) are provisional - about 5x, for a slower CI machine - until the row has history.

The same run, against a control run of v0.4.53 on the same machine, shows what the database file
did to the routes that need it (`readyMs`, desktop; mobile moved the same way):

| Route | v0.4.53 | after |
| --- | ---: | ---: |
| Characters, search ready | 1,045 ms | 434 ms |
| Saved Teams | 2,045 ms | 951 ms |
| Captain Coverage | 1,511 ms | 583 ms |
| Manual Team Builder share link | 1,110 ms | 480 ms |

## What this does not cover

- Which host layer skips compression for `.sql` (Cloudflare in front of GitHub Pages) could not be
  isolated; it no longer matters, because nothing large is left for the host to compress.
- The first update from a version that still prefetched `optc-seed.sql` measures its progress
  against the old file's 27.7 MB, so that one update's bar can pause and then jump. That code runs
  in the version being replaced and cannot be changed from here.
