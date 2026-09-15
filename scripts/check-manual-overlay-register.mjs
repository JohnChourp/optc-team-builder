#!/usr/bin/env node
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
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
