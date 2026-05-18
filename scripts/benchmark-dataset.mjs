import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';

import initSqlJs from 'sql.js';

const require = createRequire(import.meta.url);
const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const assertMode = process.argv.includes('--assert');
const repeatArg = process.argv.find((arg) => arg.startsWith('--repeat='));
const repeatCount = Math.max(1, Number.parseInt(repeatArg?.split('=')[1] ?? '8', 10) || 8);

const thresholds = {
  abilityCatalogLoadMs: 750,
  combinedAverageMs: 75,
  filterAverageMs: 60,
  previewLoadMs: 750,
  searchAverageMs: 60,
  seedExecuteMs: 12000,
  sqlJsInitMs: 2500,
  sqlSeedReadMs: 1500,
};

async function main() {
  const results = {};

  const preview = await measure('previewLoadMs', async () =>
    JSON.parse(await readDatasetFile('optc-preview.json')),
  );
  const abilityCatalog = await measure('abilityCatalogLoadMs', async () =>
    JSON.parse(await readDatasetFile('optc-auto-builder-abilities.json')),
  );
  const seedSql = await measure('sqlSeedReadMs', () => readDatasetFile('optc-seed.sql'));
  const SQL = await measure('sqlJsInitMs', () =>
    initSqlJs({
      locateFile: () => path.join(path.dirname(require.resolve('sql.js')), 'sql-wasm.wasm'),
    }),
  );
  const database = new SQL.Database();

  await measure('seedExecuteMs', () => executeSeed(database, seedSql));

  results.previewCharacterCount = preview.characters?.length ?? 0;
  results.previewShipCount = preview.ships?.length ?? 0;
  results.abilityCount = abilityCatalog.abilities?.length ?? 0;
  results.searchAverageMs = averageMeasure(() =>
    selectAll(
      database,
      `
        SELECT id, name, type
        FROM characters
        WHERE search_text LIKE '%' || ? || '%'
        ORDER BY id DESC
        LIMIT 50
      `,
      ['luffy'],
    ),
  );
  results.filterAverageMs = averageMeasure(() =>
    selectAll(
      database,
      `
        SELECT id, name, type
        FROM characters
        WHERE type = ?
          AND classes_json LIKE ?
        ORDER BY captain_average_boost DESC, id DESC
        LIMIT 100
      `,
      ['DEX', '%"Fighter"%'],
    ),
  );
  results.combinedAverageMs = averageMeasure(() =>
    selectAll(
      database,
      `
        SELECT id, name, type
        FROM characters
        WHERE search_text LIKE '%' || ? || '%'
          AND type = ?
          AND classes_json LIKE ?
        ORDER BY name COLLATE NOCASE ASC, id DESC
        LIMIT 25
      `,
      ['monkey', 'STR', '%"Fighter"%'],
    ),
  );

  database.close?.();

  const measured = {
    ...results,
    ...Object.fromEntries(Object.entries(timings).map(([key, value]) => [key, round(value)])),
    combinedAverageMs: round(results.combinedAverageMs),
    filterAverageMs: round(results.filterAverageMs),
    searchAverageMs: round(results.searchAverageMs),
  };

  console.log(JSON.stringify(measured, null, 2));

  if (assertMode) {
    assertBenchmark(measured);
  }
}

const timings = {};

async function measure(name, callback) {
  const start = performance.now();
  const result = await callback();
  timings[name] = performance.now() - start;
  return result;
}

function averageMeasure(callback) {
  const start = performance.now();

  for (let index = 0; index < repeatCount; index += 1) {
    callback();
  }

  return (performance.now() - start) / repeatCount;
}

async function readDatasetFile(fileName) {
  return readFile(path.join(rootDir, 'public', 'assets', 'data', fileName), 'utf8');
}

async function executeSeed(database, seedSql) {
  const statements = seedSql
    .split(/;\s*\n/u)
    .map((statement) => statement.trim())
    .filter(Boolean);

  for (const statement of statements) {
    database.run(`${statement};`);
  }
}

function selectAll(database, sql, params) {
  const result = database.exec(sql, params);

  return result[0]?.values ?? [];
}

function assertBenchmark(measured) {
  const failures = Object.entries(thresholds)
    .filter(([key, maxMs]) => measured[key] > maxMs)
    .map(([key, maxMs]) => `${key} ${measured[key]}ms > ${maxMs}ms`);

  if (measured.previewCharacterCount <= 0) {
    failures.push('previewCharacterCount must be positive');
  }

  if (measured.abilityCount <= 0) {
    failures.push('abilityCount must be positive');
  }

  if (failures.length) {
    throw new Error(`Dataset benchmark assertions failed: ${failures.join('; ')}`);
  }
}

function round(value) {
  return Math.round(value * 100) / 100;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
