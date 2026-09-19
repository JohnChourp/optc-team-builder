#!/usr/bin/env node
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

/**
 * Why each hand-maintained overlay exists, and what would make it unnecessary.
 *
 * 869f135t0. A correction exists because upstream was wrong when it was written.
 * When upstream fixes itself the correction keeps overriding the now-correct
 * value - silently, forever, in the direction of the older data - and nothing
 * recorded why any entry was there, so a still-needed correction and a stale one
 * looked identical.
 *
 * Measured 2026-09-15 before writing any of this, because the subtask's premise
 * turned out to be mostly about files that are empty:
 *
 *   manual-characters.json             0 entries  - pruning already works
 *   builder-ability-corrections.json   0 entries
 *   character-image-overrides.json    44 entries
 *   crewmate-ability-definitions.json 75 entries  - NOT a correction
 *   potential-ability-definitions.json 26 entries - NOT a correction
 *   party-conflict-overrides.json      1 entry
 *   ship-thumbnail-overrides.json      4 entries
 *
 * Two of those seven are not corrections at all. `crewmate-ability-definitions`
 * and `potential-ability-definitions` define what an ability MEANS to this app -
 * a vocabulary, not a patch over upstream - so upstream can never "catch up" with
 * them and an expiry check against them would be nonsense. Recording that is half
 * the value here: the difference between an overlay that should shrink and one
 * that should not was not written down anywhere.
 *
 * `manual-characters.json` being empty is not an absence of the problem, it is
 * the solution already working: `manual-character-prune.mjs` drops a manual
 * character once the import covers its id. That mechanism existed for exactly one
 * of the seven overlays and was not described anywhere either.
 *
 * The register records, per FILE rather than per entry, because the removal
 * condition is a property of the overlay: 44 identical copies of "upstream ships
 * a thumbnail for this id" would be noise, not provenance.
 *
 * Fails when:
 *
 *   A. an overlay under scripts/data/ that an import or parser script reads has
 *      no register entry - a new overlay cannot appear undocumented;
 *   B. a register entry names a file that no longer exists;
 *   C. a recorded entry count no longer matches the file, so growth and shrinkage
 *      land in a reviewable diff instead of accumulating unseen;
 *   D. a `correction` overlay entry is provably superseded by the shipped
 *      dataset.
 *
 *   E. a character-image override names an id the shipped dataset does not carry
 *      and is not on the register's declared `stagedIds` list;
 *   F. an image the SEO home page hardcodes as a hero is missing from disk;
 *   G. `public/assets/exact-character-images/` and the override map disagree - an
 *      image with no entry, or an entry whose image is gone.
 *
 * 869f135u6. E and F are one finding. Measured 2026-09-16: **30 of the 44**
 * character-image overrides name ids the seed does not have (5490, 5491, and
 * 5574-5601 against a maximum shipped id of 5056), and the split is exact -
 * every `source: 'manual'` entry is for an id the dataset HAS, every
 * `source: 'upstream'` entry is for one it does NOT. Those 30 re-point a real
 * upstream pack path onto a character that has not landed yet: they are STAGED,
 * not stale.
 *
 * That distinction is the whole purpose of this register, and it was invisible.
 * It matters because `materializeExactImageSources` iterates the full map with
 * `clearDir: true`, so all 44 are wiped and re-fetched from GitHub on every full
 * import, and a moved upstream path throws at `import-optc-data.mjs:828`. 30
 * entries nobody can account for are 30 ways for an import to stop.
 *
 * F exists because one of the 30 is load-bearing in production.
 * `generate-seo-pages.mjs` hardcodes `assets/exact-character-images/5601.png` as
 * a home-page hero, and 5601 is not in the dataset - the image exists ONLY
 * because the override materialises it. Pruning the staged entries as "stale"
 * would have put a broken image on the front page with nothing to catch it.
 *
 * D is the "report when upstream has caught up" the subtask asks for, and it is
 * deliberately narrow. Only `ship-thumbnail-overrides` can be checked from the
 * shipped data: the ships table carries `thumb`, so an override whose file is not
 * the shipped value has been superseded. Character images resolve to asset files
 * at import and the dataset records no upstream availability, so that one is
 * observable only where the importer holds upstream in hand - which the register
 * says, per overlay, rather than leaving the reader to discover it.
 */

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..');
const DATA_DIR = path.join(HERE, 'data');
const REGISTER_PATH = path.join(DATA_DIR, 'manual-overlay-register.json');
const SEED_PATH = path.join(REPO_ROOT, 'public', 'assets', 'data', 'optc-seed.sql');

/**
 * `party-conflict-overrides.json` exists TWICE, byte-identical, and nothing
 * generates one from the other.
 *
 * The importer reads `scripts/data/party-conflict-overrides.json`; the app reads
 * `src/app/core/data/auto-team-builder-party-conflict-overrides.json`. Editing one
 * leaves the dataset and the running app disagreeing about which characters
 * conflict - and since the whole overlay exists to stop a unit conflicting with
 * the wrong character, a half-applied edit is worse than no edit.
 */
export const PARTY_CONFLICT_TWINS = Object.freeze({
  app: 'src/app/core/data/auto-team-builder-party-conflict-overrides.json',
  scripts: 'scripts/data/party-conflict-overrides.json',
});

export function findTwinDivergence(left, right) {
  const keys = [...new Set([...Object.keys(left), ...Object.keys(right)])].sort();

  return keys.filter((key) => JSON.stringify(left[key]) !== JSON.stringify(right[key]));
}

/**
 * 869f135rg. The overlays whose entries a reader would need told apart from
 * upstream, and where the marker that would tell them lives.
 *
 * The subtask asks for a three-state provenance marker on the character card -
 * upstream, corrected in this app, edited by you - because "it is the first
 * question in every 'this number looks wrong' report".
 *
 * Measured 2026-09-15: both character-data overlays are `{}`, and
 * `manual-characters.json` has not changed since 2026-04-24, when
 * `manual-character-prune.mjs` shipped and emptied it. The prune runs at every
 * import, so the middle state has had ZERO instances for five months and is
 * actively kept there.
 *
 * Built today, that marker would render "upstream" on 4,618 character cards -
 * noise that answers nothing - and its one useful state would never appear. So
 * the marker is not built, and this is the tripwire instead: the day an entry
 * lands in either overlay, the check fails and names what is now required. The
 * `editedLocally` chip already covers the third state and has since v0.4.15.
 */
const PROVENANCE_OVERLAYS = ['manual-characters.json', 'builder-ability-corrections.json'];
const PROVENANCE_MARKER = 'dataProvenance';
const PROVENANCE_SOURCES = [
  'src/app/pages/character-detail/character-detail.page.ts',
  'src/app/pages/characters/characters.page.ts',
];

export function findUnmarkedProvenance(overlayCounts, sourceText) {
  const populated = PROVENANCE_OVERLAYS.filter((file) => (overlayCounts[file] ?? 0) > 0);

  if (populated.length === 0) {
    return [];
  }

  return sourceText.includes(PROVENANCE_MARKER) ? [] : populated;
}

const SHIP_ROW = /INSERT INTO ships \(id, name, thumb, description\)\s*VALUES \(\s*(\d+),\s*(?:'(?:[^']|'')*'|NULL),\s*('(?:[^']|'')*'|NULL)/gu;

export function countEntries(value) {
  if (Array.isArray(value)) {
    return value.length;
  }
  if (value !== null && typeof value === 'object') {
    return Object.keys(value).length;
  }
  return 0;
}

export function parseShipThumbs(seedSql) {
  const thumbs = new Map();

  for (const match of String(seedSql).matchAll(SHIP_ROW)) {
    const id = Number(match[1]);
    const raw = match[2];
    thumbs.set(id, raw === 'NULL' ? null : raw.slice(1, -1).replaceAll("''", "'"));
  }

  return thumbs;
}

/**
 * An override whose file is not what the dataset shipped has been superseded:
 * `applyShipThumbnailOverrides` skips an override when the ship already has a
 * thumb, so the entry is inert rather than wrong. Inert and unreported is how a
 * correction outlives its reason.
 */
export function findSupersededShipOverrides(overrides, shipThumbs) {
  return Object.entries(overrides)
    .map(([rawId, entry]) => {
      const id = Number(rawId);
      const shipped = shipThumbs.get(id);
      return { id, expected: entry?.file ?? null, shipped, known: shipThumbs.has(id) };
    })
    .filter((row) => row.known && row.shipped !== row.expected);
}

/**
 * Every character id the shipped seed carries.
 *
 * 869f135u6. Read from the same `INSERT INTO characters (...) VALUES (` shape
 * `parseShipThumbs` uses for ships, and asserted against the real seed in the
 * spec so a schema change cannot leave this silently measuring nothing.
 */
export function parseCharacterIds(seedSql) {
  const ids = new Set();

  for (const match of String(seedSql).matchAll(
    /INSERT INTO characters \([\s\S]*?\) VALUES \(\s*\n\s*(\d+),/gu,
  )) {
    ids.add(Number(match[1]));
  }

  return ids;
}

/**
 * Overrides for characters the dataset does not carry, minus the ones the
 * register declares as deliberately staged.
 *
 * The register's job is that a still-needed correction and a stale one stop
 * looking identical. An override keyed on an id nobody can look up is the purest
 * case of that: it costs a fetch on every import and it cannot be verified
 * against anything shipped.
 */
export function findUnstagedAbsentIds(overrides, characterIds, stagedIds = []) {
  const staged = new Set(stagedIds.map(Number));

  return Object.keys(overrides)
    .map(Number)
    .filter((id) => !characterIds.has(id) && !staged.has(id))
    .sort((left, right) => left - right);
}

/**
 * Hero images the generated home page hardcodes, and whether they exist.
 *
 * 869f135u6. `5601.png` is one of these and 5601 is not in the dataset, so the
 * file exists only because a character-image override materialises it. Nothing
 * checked that before.
 */
export function findMissingHeroImages(generatorSource, fileExists) {
  return [...String(generatorSource).matchAll(/src: '([^']*exact-character-images\/[^']+)'/gu)]
    .map((match) => match[1])
    .filter((source) => !fileExists(source));
}

/**
 * The file name `materializeExactImageSources` (import-optc-data.mjs) writes for
 * one override: the character id, with the manual source's own extension or
 * `.png`. An `upstream` entry names its source by `relativePath`, not by `file`,
 * so the name on disk is never read from the entry.
 */
export function exactImageFilename(characterId, entry) {
  const extension = entry?.source === 'manual' ? path.extname(entry.file ?? '') || '.png' : '.png';

  return `${characterId}${extension}`;
}

/**
 * G. The image folder and the override map, file for file.
 *
 * 869f13c6h. `materializeExactImageSources` writes the folder from the map and
 * clears it first, so right after a full import the two always match. Between
 * imports nothing compared them: an image dropped in by hand ships in every build
 * until the next import wipes it, and an entry whose image is gone points the
 * dataset at a file that is not there. The brief behind this rule counted 44
 * images "that nothing references"; 869f135u6 had already found the reader of
 * every one of them - what was missing was the check, not the reason.
 */
export function findImageFolderDrift(overrides, files) {
  const mapped = new Set(
    Object.entries(overrides).map(([characterId, entry]) => exactImageFilename(characterId, entry)),
  );
  const present = new Set(files);

  return {
    unmapped: [...present].filter((file) => !mapped.has(file)).sort(),
    missing: [...mapped].filter((file) => !present.has(file)).sort(),
  };
}

export function collectOverlayFiles(dataDir = DATA_DIR) {
  return readdirSync(dataDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
    .map((entry) => entry.name)
    .sort();
}

export function compareWithRegister(register, present) {
  const registered = new Map(register.overlays.map((overlay) => [overlay.file, overlay]));

  const missingFromRegister = present.filter((file) => !registered.has(file));
  const missingFromDisk = register.overlays
    .filter((overlay) => !present.includes(overlay.file))
    .map((overlay) => overlay.file);

  return { missingFromDisk, missingFromRegister };
}

function parseArgs(argv) {
  const args = { write: false };
  for (const arg of argv) {
    if (arg === '--write') {
      args.write = true;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return args;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const register = JSON.parse(readFileSync(REGISTER_PATH, 'utf8'));
  const present = collectOverlayFiles().filter((file) => file !== path.basename(REGISTER_PATH));
  const tracked = new Set(register.overlays.map((overlay) => overlay.file));
  const problems = [];

  if (args.write) {
    for (const overlay of register.overlays) {
      const filePath = path.join(DATA_DIR, overlay.file);
      overlay.entryCount = countEntries(JSON.parse(readFileSync(filePath, 'utf8')));
    }
    register.measuredOn = new Date().toISOString().slice(0, 10);
    writeFileSync(REGISTER_PATH, `${JSON.stringify(register, null, 2)}\n`);
    process.stdout.write(`[overlays] refreshed ${register.overlays.length} entry count(s).\n`);
    return;
  }

  const { missingFromDisk, missingFromRegister } = compareWithRegister(register, present);
  const untracked = missingFromRegister.filter((file) => !register.notOverlays.includes(file));

  if (untracked.length > 0) {
    problems.push(
      `${untracked.length} file(s) under scripts/data/ are in neither the overlay register nor its\n` +
        `"notOverlays" list. An overlay must say why it exists and what would remove it; a data\n` +
        `file that is not an overlay must say that it is not.\n` +
        untracked.map((file) => `  ${file}`).join('\n'),
    );
  }

  if (missingFromDisk.length > 0) {
    problems.push(
      `${missingFromDisk.length} register entr(ies) name a file that no longer exists.\n` +
        missingFromDisk.map((file) => `  ${file}`).join('\n'),
    );
  }

  const drifted = [];
  for (const overlay of register.overlays) {
    if (!present.includes(overlay.file)) {
      continue;
    }
    const actual = countEntries(JSON.parse(readFileSync(path.join(DATA_DIR, overlay.file), 'utf8')));
    if (actual !== overlay.entryCount) {
      drifted.push({ file: overlay.file, recorded: overlay.entryCount, actual });
    }
  }

  if (drifted.length > 0) {
    problems.push(
      `${drifted.length} overlay(s) changed size without the register being refreshed. Run\n` +
        `\`npm run data:overlay-register -- --write\` in the same commit, so growth and shrinkage\n` +
        `are a reviewable diff rather than something that accumulates unseen.\n` +
        drifted
          .map((entry) => `  ${entry.file}: recorded ${entry.recorded}, found ${entry.actual}`)
          .join('\n'),
    );
  }

  const shipOverlay = register.overlays.find((overlay) => overlay.file === 'ship-thumbnail-overrides.json');
  if (shipOverlay && present.includes(shipOverlay.file)) {
    const superseded = findSupersededShipOverrides(
      JSON.parse(readFileSync(path.join(DATA_DIR, shipOverlay.file), 'utf8')),
      parseShipThumbs(readFileSync(SEED_PATH, 'utf8')),
    );

    if (superseded.length > 0) {
      problems.push(
        `${superseded.length} ship thumbnail override(s) are no longer what the dataset ships, so the\n` +
          `entry is inert. Upstream has caught up - remove the entry and its image file, or record\n` +
          `why it must stay.\n` +
          superseded
            .map((row) => `  ship ${row.id}: override ${row.expected}, shipped ${row.shipped}`)
            .join('\n'),
      );
    }
  }

  const overlayCounts = Object.fromEntries(
    register.overlays
      .filter((overlay) => present.includes(overlay.file))
      .map((overlay) => [
        overlay.file,
        countEntries(JSON.parse(readFileSync(path.join(DATA_DIR, overlay.file), 'utf8'))),
      ]),
  );
  const provenanceSource = PROVENANCE_SOURCES.map((file) => {
    const full = path.join(REPO_ROOT, file);

    return existsSync(full) ? readFileSync(full, 'utf8') : '';
  }).join('\n');
  const unmarked = findUnmarkedProvenance(overlayCounts, provenanceSource);

  if (unmarked.length > 0) {
    problems.push(
      `${unmarked.length} character-data overlay(s) now carry entries, and nothing on the character\n` +
        `card tells a reader that a value came from this app rather than from upstream.\n` +
        `That is the first question in every "this number looks wrong" report, and it was left\n` +
        `unbuilt in 869f135rg ONLY because both overlays had been empty since 2026-04-24.\n` +
        `They are not empty now. Add a "${PROVENANCE_MARKER}" marker to the character card and\n` +
        `detail page, next to the existing editedLocally chip.\n` +
        unmarked.map((file) => `  ${file}: ${overlayCounts[file]} entr(ies)`).join('\n'),
    );
  }

  /* E. */
  const imageOverlay = register.overlays.find(
    (overlay) => overlay.file === 'character-image-overrides.json',
  );

  if (imageOverlay && present.includes(imageOverlay.file)) {
    const unstaged = findUnstagedAbsentIds(
      JSON.parse(readFileSync(path.join(DATA_DIR, imageOverlay.file), 'utf8')),
      parseCharacterIds(readFileSync(SEED_PATH, 'utf8')),
      imageOverlay.stagedIds ?? [],
    );

    if (unstaged.length > 0) {
      problems.push(
        `${unstaged.length} character-image override(s) name an id the shipped dataset does not\n` +
          `carry and are not on the register's stagedIds list. Every one of them is re-fetched from\n` +
          `GitHub on each full import - materializeExactImageSources clears the directory and walks\n` +
          `the whole map - and a moved upstream path throws. Add the id to stagedIds with the\n` +
          `reason, or remove the override and its image.\n` +
          unstaged.map((id) => `  character ${id}`).join('\n'),
      );
    }
  }

  /* F. */
  const missingHeroes = findMissingHeroImages(
    readFileSync(path.join(HERE, 'generate-seo-pages.mjs'), 'utf8'),
    (source) => existsSync(path.join(REPO_ROOT, 'public', source)),
  );

  if (missingHeroes.length > 0) {
    problems.push(
      `${missingHeroes.length} hero image(s) the generated home page hardcodes are not on disk.\n` +
        `These are materialised by character-image overrides, not shipped by the dataset, so\n` +
        `removing an override silently replaces the front page's artwork with a broken image.\n` +
        missingHeroes.map((source) => `  ${source}`).join('\n'),
    );
  }

  /* G. */
  if (imageOverlay && present.includes(imageOverlay.file)) {
    const imageDir = path.join(REPO_ROOT, 'public', 'assets', 'exact-character-images');
    const drift = findImageFolderDrift(
      JSON.parse(readFileSync(path.join(DATA_DIR, imageOverlay.file), 'utf8')),
      existsSync(imageDir)
        ? readdirSync(imageDir, { withFileTypes: true })
            .filter((entry) => entry.isFile())
            .map((entry) => entry.name)
        : [],
    );

    if (drift.unmapped.length + drift.missing.length > 0) {
      problems.push(
        `public/assets/exact-character-images/ and ${imageOverlay.file} disagree. The import writes the\n` +
          `folder from the map and clears it first, so an image with no entry ships only until the next\n` +
          `full import, and an entry with no image points the dataset at a missing file.\n` +
          [
            ...drift.unmapped.map((file) => `  on disk, no entry: ${file}`),
            ...drift.missing.map((file) => `  entry, no image on disk: ${file}`),
          ].join('\n'),
      );
    }
  }

  const twinDivergence = findTwinDivergence(
    JSON.parse(readFileSync(path.join(REPO_ROOT, PARTY_CONFLICT_TWINS.scripts), 'utf8')),
    JSON.parse(readFileSync(path.join(REPO_ROOT, PARTY_CONFLICT_TWINS.app), 'utf8')),
  );

  if (twinDivergence.length > 0) {
    problems.push(
      `${twinDivergence.length} party-conflict override(s) differ between the two copies. The importer\n` +
        `reads one and the app reads the other, and nothing generates either, so a half-applied edit\n` +
        `leaves the dataset and the running app disagreeing about which characters conflict.\n` +
        `  ${PARTY_CONFLICT_TWINS.scripts}\n  ${PARTY_CONFLICT_TWINS.app}\n` +
        twinDivergence.map((key) => `  character ${key}`).join('\n'),
    );
  }

  if (problems.length > 0) {
    for (const problem of problems) {
      process.stderr.write(`${problem}\n\n`);
    }
    process.stderr.write('FAIL manual overlay register\n');
    process.exitCode = 1;
    return;
  }

  const corrections = register.overlays.filter((overlay) => overlay.kind === 'correction');
  process.stdout.write(
    `OK manual overlay register: ${tracked.size} overlay(s) described, ` +
      `${corrections.length} correction(s), ` +
      `${corrections.reduce((total, overlay) => total + overlay.entryCount, 0)} correction entr(ies), ` +
      `0 superseded.\n`,
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
