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
- the shipped database is not the database the shipped seed builds.

Each rule was broken on purpose against a real build before the lane was registered: prefetching
the raw seed again, shipping a seed changed after the database was built, and building with
`ng build` directly so the database step never ran. All three failed, naming the right file.

## What this does not cover

- Which host layer skips compression for `.sql` (Cloudflare in front of GitHub Pages) could not be
  isolated; it no longer matters, because nothing large is left for the host to compress.
- The first update from a version that still prefetched `optc-seed.sql` measures its progress
  against the old file's 27.7 MB, so that one update's bar can pause and then jump. That code runs
  in the version being replaced and cannot be changed from here.
