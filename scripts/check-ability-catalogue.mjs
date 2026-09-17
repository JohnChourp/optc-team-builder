#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import {
  auditAbilityCatalogue,
  indexBuilderAbilities,
  mapAbilitiesByCharacter,
} from './lib/ability-catalogue-index.mjs';
import { buildDatasetDatabaseBytes, loadSqlJs } from './lib/dataset-binary.mjs';

/**
 * 869f138qm. The 1.6 MB ability catalogue beside a database that already holds the same rows.
 *
 * `optc-auto-builder-abilities.json` is prefetched next to the SQLite seed, both written by the
 * same import from the same upstream. The question this guard answers is the one the ClickUp task
 * asked: what does the JSON hold that the database does not?
 *
 * Measured 2026-09-17, and it is worth stating plainly because it decides what this lane is for:
 * nothing, in the id lists. The importer parses each character's ability text and stores the result
 * in that character's `character_details.detail_json.builderAbilities`; the catalogue is the
 * inverted index of exactly those rows, and all 241 keys some character has re-derive with
 * identical id sets. Rebuilding the whole index from the database took 76 ms in Node.
 *
 * What is genuinely only in the file: the 22 keys no character has, which an index cannot
 * represent, and each key's label, category, group and ordering, which live in the importer's
 * ability definitions rather than in the data. That is why the artifact still exists. The id lists
 * are why it can drift - two files regenerated separately, one of them by hand-editable character
 * overrides, and until now nothing compared them.
 *
 * The check re-derives the lists from the seed rather than calling the importer's accumulator. A
 * guard that runs the code under test proves the file was written, not that it is right.
 *
 * Run: npm run abilities:catalogue-check
 */

const APP_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SEED_PATH = path.join(APP_ROOT, 'public/assets/data/optc-seed.sql');
const CATALOGUE_PATH = path.join(APP_ROOT, 'public/assets/data/optc-auto-builder-abilities.json');

/** `character_details` rows as the index wants them, plus every id the seed has. */
export function readSeedBuilderAbilities(databaseBytes, SQL) {
  const database = new SQL.Database(databaseBytes);

  try {
    const detailResult = database.exec('SELECT character_id, detail_json FROM character_details');
    const characterResult = database.exec('SELECT id FROM characters');
    const rows = (detailResult[0]?.values ?? []).map(([characterId, detailJson]) => ({
      characterId,
      builderAbilities: JSON.parse(detailJson).builderAbilities ?? [],
    }));

    return {
      rows,
      characterIds: new Set((characterResult[0]?.values ?? []).map(([id]) => id)),
    };
  } finally {
    database.close();
  }
}

export async function checkAbilityCatalogue({
  seedPath = SEED_PATH,
  cataloguePath = CATALOGUE_PATH,
  SQL = null,
} = {}) {
  const sql = SQL ?? (await loadSqlJs());
  const databaseBytes = buildDatasetDatabaseBytes(sql, readFileSync(seedPath, 'utf8'));
  const { rows, characterIds } = readSeedBuilderAbilities(databaseBytes, sql);
  const catalogue = JSON.parse(readFileSync(cataloguePath, 'utf8'));
  const index = indexBuilderAbilities(rows);
  const result = auditAbilityCatalogue({
    catalogue,
    index,
    characterIds,
    abilitiesByCharacter: mapAbilitiesByCharacter(rows),
  });

  return {
    ...result,
    abilityCount: Array.isArray(catalogue.abilities) ? catalogue.abilities.length : 0,
    indexedKeyCount: index.size,
    characterCount: rows.length,
  };
}

export function formatAbilityCatalogueResult(result) {
  const lines = ['# Ability catalogue check', ''];

  lines.push(
    `Re-derived ${result.indexedKeyCount} ability key(s) from ${result.characterCount} character(s) in the seed, against ${result.abilityCount} catalogue entries.`,
  );

  if (result.definitionOnlyKeys.length) {
    lines.push(
      `${result.definitionOnlyKeys.length} key(s) are defined with no character - only the catalogue can carry those.`,
    );
  }

  lines.push('');

  if (result.ok) {
    lines.push(
      'Status: passed - every catalogue id list is exactly the index of the seed it was built from.',
    );
  } else {
    lines.push('Status: FAILED');

    for (const finding of result.findings) {
      lines.push(`- [${finding.kind}] ${finding.detail}`);
    }
  }

  return lines.join('\n');
}

async function main() {
  const result = await checkAbilityCatalogue();

  console.log(formatAbilityCatalogueResult(result));
  process.exitCode = result.ok ? 0 : 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
