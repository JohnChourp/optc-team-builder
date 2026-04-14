import { copyFile, mkdir, readFile, readdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';

import initSqlJs from 'sql.js';

import { enrichCharactersWithBuilderAbilities } from '../auto-team-builder-ability-parser.mjs';
import { loadBuilderAbilityCorrections } from './builder-ability-corrections.mjs';
import {
  buildAutoBuilderAbilityCatalog,
  buildManifest,
  buildPreviewPayload,
  createEmptyAssets,
  createEmptyRegionAvailability,
  createSqlSeed,
  createUnresolvedCatalog,
  createCharacterSearchText,
  parseJson,
  writeGeneratedDatasetFiles,
} from './optc-dataset.mjs';
import {
  buildAppliedManualCharacter,
  createEmptyManualDetail,
  isManualCharacterId,
  loadManualCharacterOverlay,
} from './manual-character-overlay.mjs';

const require = createRequire(import.meta.url);
const sqlJsWasmPath = path.join(path.dirname(require.resolve('sql.js')), 'sql-wasm.wasm');

export async function applyManualCharacterOverlay({
  rootDir,
  dataDir = path.join(rootDir, 'public', 'assets', 'data'),
  seedPath = path.join(dataDir, 'optc-seed.sql'),
  manifestPath = path.join(dataDir, 'optc-manifest.json'),
  overlayPath = path.join(rootDir, 'scripts', 'data', 'manual-characters.json'),
  correctionsPath = path.join(rootDir, 'scripts', 'data', 'builder-ability-corrections.json'),
  sourceImageDir = path.join(rootDir, 'scripts', 'data', 'character-images'),
  exactImagesDir = path.join(rootDir, 'public', 'assets', 'exact-character-images'),
  logger = null,
} = {}) {
  const currentOutputs = await readCurrentOutputs(dataDir);
  const dataset = await loadCurrentDataset(seedPath, manifestPath);
  const abilityCorrections = await loadBuilderAbilityCorrections(correctionsPath);
  const manualRecords = await loadManualCharacterOverlay(overlayPath, {
    availableClasses: dataset.manifest.availableClasses,
  });

  await materializeManualCharacterImages(manualRecords, sourceImageDir, exactImagesDir);

  const nextCharacters = [
    ...dataset.characters.filter((character) => !isManualCharacterId(character.id)),
    ...[...manualRecords.values()].map((record) => buildAppliedManualCharacter(record)),
  ].sort((left, right) => left.id - right.id);

  const generatedAt = dataset.manifest.generatedAt;
  const provisionalOutputs = await buildGeneratedOutputs({
    characters: nextCharacters,
    ships: dataset.ships,
    sourceVersion: dataset.manifest.sourceVersion,
    packs: dataset.manifest.packs,
    generatedAt,
    abilityCorrections,
    logger,
  });

  if (outputsMatch(currentOutputs, provisionalOutputs)) {
    logger?.(
      `[manual-characters] no-op, ${manualRecords.size} manual character(s) already applied.`,
    );

    return {
      written: false,
      manualCharacterCount: manualRecords.size,
      characterCount: nextCharacters.length,
      manifest: provisionalOutputs.manifest,
    };
  }

  const finalGeneratedAt = new Date().toISOString();
  const finalOutputs = await buildGeneratedOutputs({
    characters: nextCharacters,
    ships: dataset.ships,
    sourceVersion: dataset.manifest.sourceVersion,
    packs: dataset.manifest.packs,
    generatedAt: finalGeneratedAt,
    abilityCorrections,
    logger,
  });

  await writeGeneratedDatasetFiles(
    dataDir,
    finalOutputs.manifest,
    finalOutputs.sqlSeed,
    finalOutputs.unresolvedCatalog,
    finalOutputs.autoBuilderAbilityCatalog,
    finalOutputs.preview,
  );

  logger?.(
    `[manual-characters] applied ${manualRecords.size} manual character(s), total characters ${nextCharacters.length}.`,
  );

  return {
    written: true,
    manualCharacterCount: manualRecords.size,
    characterCount: nextCharacters.length,
    manifest: finalOutputs.manifest,
  };
}

async function buildGeneratedOutputs({
  characters,
  ships,
  sourceVersion,
  packs,
  generatedAt,
  abilityCorrections,
  logger,
}) {
  const nextCharacters = characters.map((character) => structuredClone(character));
  const autoBuilderAbilities = await enrichCharactersWithBuilderAbilities(nextCharacters, {
    abilityCorrections,
    logger,
  });
  const manifest = buildManifest(nextCharacters, ships, sourceVersion, packs, generatedAt);
  const unresolvedCatalog = createUnresolvedCatalog(
    nextCharacters,
    manifest.packs,
    sourceVersion,
    generatedAt,
  );
  const preview = buildPreviewPayload(generatedAt, nextCharacters, ships);
  const autoBuilderAbilityCatalog = buildAutoBuilderAbilityCatalog(
    generatedAt,
    sourceVersion,
    autoBuilderAbilities,
  );
  const sqlSeed = createSqlSeed(nextCharacters, ships, manifest);

  return {
    manifest,
    preview,
    unresolvedCatalog,
    autoBuilderAbilityCatalog,
    sqlSeed,
  };
}

async function loadCurrentDataset(seedPath, manifestPath) {
  const SQL = await initSqlJs({
    locateFile: () => sqlJsWasmPath,
  });
  const database = new SQL.Database();
  const seedSql = await readFile(seedPath, 'utf8');

  executeSqlSeed(database, seedSql);

  const hasIncompleteColumn = tableHasColumn(database, 'characters', 'is_incomplete');
  const characters = selectAll(
    database,
    `
      SELECT
        c.id,
        c.name,
        ${hasIncompleteColumn ? 'c.is_incomplete' : '0 AS is_incomplete'},
        c.type,
        c.primary_class,
        c.secondary_class,
        c.classes_json,
        c.stars,
        c.cost,
        c.combo,
        c.max_level,
        c.max_experience,
        c.min_hp,
        c.min_atk,
        c.min_rcv,
        c.max_hp,
        c.max_atk,
        c.max_rcv,
        c.growth,
        c.region_json,
        c.assets_json,
        c.search_text,
        d.detail_json
      FROM characters c
      LEFT JOIN character_details d ON d.character_id = c.id
      ORDER BY c.id ASC
    `,
  ).map((row) => hydrateCharacterRow(row));
  const ships = selectAll(database, 'SELECT id, name, thumb, description FROM ships ORDER BY id ASC').map(
    (row) => ({
      id: Number(row.id),
      name: String(row.name ?? ''),
      thumb: typeof row.thumb === 'string' && row.thumb.length ? row.thumb : null,
      description: String(row.description ?? ''),
    }),
  );
  const manifestRow = selectAll(database, "SELECT value FROM meta WHERE key = 'manifest' LIMIT 1")[0];
  const fileManifest = parseJson(await readFile(manifestPath, 'utf8'), null);
  const manifest = parseJson(manifestRow?.value, fileManifest);

  if (!manifest) {
    throw new Error('Unable to load current dataset manifest.');
  }

  return {
    characters,
    ships,
    manifest,
  };
}

function tableHasColumn(database, tableName, columnName) {
  const pragma = database.exec(`PRAGMA table_info(${tableName})`);
  const rows = pragma[0]?.values ?? [];
  return rows.some((row) => row[1] === columnName);
}

function hydrateCharacterRow(row) {
  const characterId = Number(row.id);
  const classes = parseJson(row.classes_json, []);

  return {
    id: characterId,
    name: String(row.name ?? ''),
    isIncomplete: Number(row.is_incomplete) === 1,
    type: String(row.type ?? ''),
    primaryClass: String(row.primary_class ?? ''),
    secondaryClass:
      typeof row.secondary_class === 'string' && row.secondary_class.length
        ? row.secondary_class
        : null,
    classes: Array.isArray(classes) ? classes.map((entry) => String(entry)) : [],
    stars: Number(row.stars),
    cost: Number(row.cost),
    combo: Number(row.combo),
    maxLevel: Number(row.max_level),
    maxExperience: parseNullableNumber(row.max_experience),
    minHp: parseNullableNumber(row.min_hp),
    minAtk: parseNullableNumber(row.min_atk),
    minRcv: parseNullableNumber(row.min_rcv),
    maxHp: parseNullableNumber(row.max_hp),
    maxAtk: parseNullableNumber(row.max_atk),
    maxRcv: parseNullableNumber(row.max_rcv),
    growth: parseNullableNumber(row.growth),
    searchText:
      typeof row.search_text === 'string' && row.search_text.length
        ? row.search_text
        : createCharacterSearchText(String(row.name ?? ''), String(row.type ?? ''), classes),
    regionAvailability: parseJson(row.region_json, createEmptyRegionAvailability()),
    assets: parseJson(row.assets_json, createEmptyAssets()),
    detail: parseJson(row.detail_json, createEmptyManualDetail(characterId)),
  };
}

function parseNullableNumber(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function selectAll(database, query, params = []) {
  const statement = database.prepare(query, params);
  const rows = [];

  while (statement.step()) {
    rows.push(statement.getAsObject());
  }

  statement.free();

  return rows;
}

function executeSqlSeed(database, seedSql) {
  for (const statement of splitSqlStatements(seedSql)) {
    database.run(statement);
  }
}

function splitSqlStatements(seedSql) {
  const statements = [];
  let startIndex = 0;
  let inString = false;

  for (let index = 0; index < seedSql.length; index += 1) {
    const character = seedSql[index];

    if (character === "'") {
      const nextCharacter = seedSql[index + 1];

      if (inString && nextCharacter === "'") {
        index += 1;
        continue;
      }

      inString = !inString;
      continue;
    }

    if (character === ';' && !inString) {
      const statement = seedSql.slice(startIndex, index + 1).trim();

      if (statement.length) {
        statements.push(statement);
      }

      startIndex = index + 1;
    }
  }

  const trailingStatement = seedSql.slice(startIndex).trim();

  if (trailingStatement.length) {
    statements.push(trailingStatement);
  }

  return statements;
}

async function materializeManualCharacterImages(records, sourceImageDir, exactImagesDir) {
  await mkdir(sourceImageDir, { recursive: true });
  await mkdir(exactImagesDir, { recursive: true });

  const existingExactFiles = await readdir(exactImagesDir).catch(() => []);

  await Promise.all(
    existingExactFiles
      .filter((fileName) => isReservedCharacterFile(fileName))
      .map((fileName) => rm(path.join(exactImagesDir, fileName), { force: true })),
  );

  for (const record of records.values()) {
    const sourcePath = path.join(sourceImageDir, record.image.file);
    const destinationPath = path.join(exactImagesDir, record.image.file);

    await copyFile(sourcePath, destinationPath);
  }
}

function isReservedCharacterFile(fileName) {
  const characterId = Number.parseInt(path.parse(fileName).name, 10);
  return isManualCharacterId(characterId);
}

async function readCurrentOutputs(dataDir) {
  return {
    manifest: await readOptionalFile(path.join(dataDir, 'optc-manifest.json')),
    sqlSeed: await readOptionalFile(path.join(dataDir, 'optc-seed.sql')),
    unresolvedCatalog: await readOptionalFile(path.join(dataDir, 'optc-unresolved-images.json')),
    autoBuilderAbilityCatalog: await readOptionalFile(
      path.join(dataDir, 'optc-auto-builder-abilities.json'),
    ),
    preview: await readOptionalFile(path.join(dataDir, 'optc-preview.json')),
  };
}

function outputsMatch(currentOutputs, nextOutputs) {
  return (
    currentOutputs.manifest === JSON.stringify(nextOutputs.manifest, null, 2) &&
    currentOutputs.sqlSeed === nextOutputs.sqlSeed &&
    currentOutputs.unresolvedCatalog === JSON.stringify(nextOutputs.unresolvedCatalog, null, 2) &&
    currentOutputs.autoBuilderAbilityCatalog ===
      JSON.stringify(nextOutputs.autoBuilderAbilityCatalog, null, 2) &&
    currentOutputs.preview === JSON.stringify(nextOutputs.preview, null, 2)
  );
}

async function readOptionalFile(targetPath) {
  try {
    return await readFile(targetPath, 'utf8');
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return '';
    }

    throw error;
  }
}
