#!/usr/bin/env node
import { execFile } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { promisify } from 'node:util';

import initSqlJs from 'sql.js';

export const DATASET_CHANGE_DIGEST_SCHEMA_VERSION = 1;

const execFileAsync = promisify(execFile);
const require = createRequire(import.meta.url);
const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sqlJsWasmPath = path.join(path.dirname(require.resolve('sql.js')), 'sql-wasm.wasm');
const gitShowMaxBuffer = 256 * 1024 * 1024;
const defaultDataPrefix = 'public/assets/data';
const maxExamples = 8;

const datasetPaths = Object.freeze({
  manifest: 'optc-manifest.json',
  seed: 'optc-seed.sql',
  abilityCatalog: 'optc-auto-builder-abilities.json',
  preview: 'optc-preview.json',
  unresolvedImages: 'optc-unresolved-images.json',
});

const ignoredJsonKeys = new Set(['generatedAt']);

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function normalizePath(value) {
  return String(value ?? '').replace(/\\/g, '/').replace(/^\.\/+/u, '');
}

function normalizeJson(value) {
  if (Array.isArray(value)) {
    return value.map((entry) => normalizeJson(entry));
  }

  if (!isRecord(value)) {
    return value;
  }

  return Object.fromEntries(
    Object.keys(value)
      .filter((key) => !ignoredJsonKeys.has(key))
      .sort()
      .map((key) => [key, normalizeJson(value[key])]),
  );
}

function stableStringify(value) {
  return JSON.stringify(normalizeJson(value));
}

function parseJson(value, label) {
  try {
    return JSON.parse(value);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Unable to parse ${label}: ${message}`);
  }
}

function sortedNumberKeys(map) {
  return [...map.keys()].sort((left, right) => Number(left) - Number(right));
}

function sortedStringKeys(map) {
  return [...map.keys()].sort((left, right) => String(left).localeCompare(String(right)));
}

function countDelta(baseCount, headCount) {
  return {
    base: baseCount,
    head: headCount,
    delta: headCount - baseCount,
  };
}

function pushExample(examples, entry) {
  if (examples.length < maxExamples) {
    examples.push(entry);
  }
}

function listChangedObjectKeys(baseValue, headValue) {
  const keys = new Set([
    ...Object.keys(isRecord(baseValue) ? baseValue : {}),
    ...Object.keys(isRecord(headValue) ? headValue : {}),
  ]);

  return [...keys]
    .filter((key) => stableStringify(baseValue?.[key]) !== stableStringify(headValue?.[key]))
    .sort();
}

function indexByKey(values, keyName) {
  const result = new Map();

  for (const value of Array.isArray(values) ? values : []) {
    const key = value?.[keyName];
    if (key !== null && key !== undefined && String(key).trim()) {
      result.set(String(key), value);
    }
  }

  return result;
}

function summarizeKeyedArrayDelta(baseValues, headValues, keyName) {
  const base = indexByKey(baseValues, keyName);
  const head = indexByKey(headValues, keyName);
  const added = sortedStringKeys(head).filter((key) => !base.has(key));
  const removed = sortedStringKeys(base).filter((key) => !head.has(key));
  const changed = sortedStringKeys(head).filter(
    (key) => base.has(key) && stableStringify(base.get(key)) !== stableStringify(head.get(key)),
  );

  return {
    added,
    removed,
    changed,
  };
}

function idListDelta(baseValues, headValues) {
  const base = new Set((Array.isArray(baseValues) ? baseValues : []).map((value) => Number(value)));
  const head = new Set((Array.isArray(headValues) ? headValues : []).map((value) => Number(value)));

  return {
    added: [...head].filter((value) => !base.has(value)).sort((left, right) => left - right),
    removed: [...base].filter((value) => !head.has(value)).sort((left, right) => left - right),
  };
}

function rowObjects(result) {
  const columns = result?.[0]?.columns ?? [];
  const values = result?.[0]?.values ?? [];

  return values.map((row) =>
    Object.fromEntries(columns.map((column, index) => [column, row[index] ?? null])),
  );
}

function selectAll(database, sql) {
  return rowObjects(database.exec(sql));
}

function executeSqlSeed(database, sqlSeed) {
  const statements = String(sqlSeed)
    .split(/;\s*\n/u)
    .map((statement) => statement.trim())
    .filter(Boolean);

  for (const statement of statements) {
    database.run(`${statement};`);
  }
}

function parseDetailJson(value, characterId) {
  if (typeof value !== 'string' || !value.trim()) {
    return {};
  }

  return parseJson(value, `character ${characterId} detail_json`);
}

async function loadSeedSnapshot(sqlSeed, SQL) {
  const database = new SQL.Database();

  try {
    executeSqlSeed(database, sqlSeed);

    const characterRows = selectAll(
      database,
      `
        SELECT
          c.id,
          c.name,
          c.is_incomplete,
          c.type,
          c.primary_class,
          c.secondary_class,
          c.classes_json,
          c.stars,
          c.stars_label,
          c.cost,
          c.combo,
          c.min_hp,
          c.min_atk,
          c.min_rcv,
          c.max_hp,
          c.max_atk,
          c.max_rcv,
          c.growth,
          c.captain_hp_boost,
          c.captain_atk_boost,
          c.captain_average_boost,
          c.region_json,
          c.assets_json,
          c.search_text,
          d.detail_json
        FROM characters c
        LEFT JOIN character_details d ON d.character_id = c.id
        ORDER BY c.id ASC
      `,
    );
    const characters = new Map(
      characterRows.map((row) => {
        const id = Number(row.id);
        return [
          id,
          {
            id,
            name: String(row.name ?? ''),
            row: {
              id,
              name: String(row.name ?? ''),
              isIncomplete: Number(row.is_incomplete) === 1,
              type: String(row.type ?? ''),
              primaryClass: String(row.primary_class ?? ''),
              secondaryClass: row.secondary_class ?? null,
              classes: parseJson(row.classes_json ?? '[]', `character ${id} classes_json`),
              stars: Number(row.stars ?? 0),
              starsLabel: String(row.stars_label ?? ''),
              cost: Number(row.cost ?? 0),
              combo: Number(row.combo ?? 0),
              minHp: row.min_hp,
              minAtk: row.min_atk,
              minRcv: row.min_rcv,
              maxHp: row.max_hp,
              maxAtk: row.max_atk,
              maxRcv: row.max_rcv,
              growth: row.growth,
              captainHpBoost: Number(row.captain_hp_boost ?? 0),
              captainAtkBoost: Number(row.captain_atk_boost ?? 0),
              captainAverageBoost: Number(row.captain_average_boost ?? 0),
              regionAvailability: parseJson(row.region_json ?? '{}', `character ${id} region_json`),
              assets: parseJson(row.assets_json ?? '{}', `character ${id} assets_json`),
              searchText: String(row.search_text ?? ''),
            },
            detail: parseDetailJson(row.detail_json, id),
          },
        ];
      }),
    );

    const ships = new Map(
      selectAll(database, 'SELECT id, name, thumb, description FROM ships ORDER BY id ASC').map(
        (row) => [
          Number(row.id),
          {
            id: Number(row.id),
            name: String(row.name ?? ''),
            thumb: row.thumb ?? null,
            description: String(row.description ?? ''),
          },
        ],
      ),
    );

    return { characters, ships };
  } finally {
    database.close?.();
  }
}

async function readSnapshot(reader, label, SQL) {
  const [manifestText, seedSql, abilityText, previewText, unresolvedText] = await Promise.all([
    reader(datasetPaths.manifest),
    reader(datasetPaths.seed),
    reader(datasetPaths.abilityCatalog),
    reader(datasetPaths.preview),
    reader(datasetPaths.unresolvedImages),
  ]);
  const seed = await loadSeedSnapshot(seedSql, SQL);
  const abilityCatalog = parseJson(abilityText, `${label} ${datasetPaths.abilityCatalog}`);
  const preview = parseJson(previewText, `${label} ${datasetPaths.preview}`);
  const unresolvedImages = parseJson(unresolvedText, `${label} ${datasetPaths.unresolvedImages}`);

  return {
    label,
    manifest: parseJson(manifestText, `${label} ${datasetPaths.manifest}`),
    seed,
    abilityCatalog,
    preview,
    unresolvedImages,
  };
}

function createGitReader({ repoRoot = rootDir, ref, dataPrefix = defaultDataPrefix, execFileImpl = execFileAsync }) {
  return async (fileName) => {
    const filePath = `${normalizePath(dataPrefix).replace(/\/$/u, '')}/${fileName}`;
    const { stdout } = await execFileImpl('git', ['-C', repoRoot, 'show', `${ref}:${filePath}`], {
      encoding: 'utf8',
      maxBuffer: gitShowMaxBuffer,
    });
    return stdout;
  };
}

function createDirectoryReader({ dir }) {
  return async (fileName) => readFile(path.join(dir, fileName), 'utf8');
}

function summarizeManifest(base, head) {
  const countFields = [
    'schemaVersion',
    'characterCount',
    'detailCount',
    'shipCount',
    'rumbleCount',
  ];
  const countDeltas = Object.fromEntries(
    countFields.map((field) => [field, countDelta(Number(base[field] ?? 0), Number(head[field] ?? 0))]),
  );
  const packDelta = summarizeKeyedArrayDelta(base.packs, head.packs, 'key');

  return {
    sourceVersion: {
      base: base.sourceVersion ?? null,
      head: head.sourceVersion ?? null,
      changed: base.sourceVersion !== head.sourceVersion,
    },
    countDeltas,
    availableTypes: {
      base: Array.isArray(base.availableTypes) ? base.availableTypes : [],
      head: Array.isArray(head.availableTypes) ? head.availableTypes : [],
    },
    availableClasses: {
      baseCount: Array.isArray(base.availableClasses) ? base.availableClasses.length : 0,
      headCount: Array.isArray(head.availableClasses) ? head.availableClasses.length : 0,
      delta:
        (Array.isArray(head.availableClasses) ? head.availableClasses.length : 0) -
        (Array.isArray(base.availableClasses) ? base.availableClasses.length : 0),
    },
    packs: {
      addedCount: packDelta.added.length,
      removedCount: packDelta.removed.length,
      changedCount: packDelta.changed.length,
      examples: [...packDelta.added, ...packDelta.removed, ...packDelta.changed].slice(0, maxExamples),
    },
  };
}

function classifyCharacterChange(baseCharacter, headCharacter) {
  const changedFields = [];
  if (stableStringify(baseCharacter.row) !== stableStringify(headCharacter.row)) {
    changedFields.push(...listChangedObjectKeys(baseCharacter.row, headCharacter.row));
  }

  const baseDetail = baseCharacter.detail;
  const headDetail = headCharacter.detail;
  const detailKeys = listChangedObjectKeys(baseDetail, headDetail);
  const captainChanged = [
    'captainAbility',
    'captainAbilityVariants',
    'captainAbilityCoverage',
    'captainNotes',
  ].some((key) => detailKeys.includes(key));
  const tiersChanged =
    stableStringify(baseDetail.captainAbilityCoverage?.entries) !==
    stableStringify(headDetail.captainAbilityCoverage?.entries);
  const builderAbilitiesChanged =
    stableStringify(baseDetail.builderAbilities) !== stableStringify(headDetail.builderAbilities);
  const tagsChanged = stableStringify(baseDetail.characterTags) !== stableStringify(headDetail.characterTags);

  return {
    changedFields: [...new Set(changedFields)].sort(),
    changedDetailKeys: detailKeys,
    captainChanged,
    tiersChanged,
    builderAbilitiesChanged,
    tagsChanged,
  };
}

function summarizeBuilderAbilityChange(baseCharacter, headCharacter) {
  const baseAbilities = Array.isArray(baseCharacter.detail.builderAbilities)
    ? baseCharacter.detail.builderAbilities
    : [];
  const headAbilities = Array.isArray(headCharacter.detail.builderAbilities)
    ? headCharacter.detail.builderAbilities
    : [];
  const delta = summarizeKeyedArrayDelta(baseAbilities, headAbilities, 'key');

  return {
    id: headCharacter.id,
    name: headCharacter.name,
    addedKeys: delta.added,
    removedKeys: delta.removed,
    changedKeys: delta.changed,
  };
}

function summarizeCaptainChange(baseCharacter, headCharacter, classification) {
  const baseEntries = Array.isArray(baseCharacter.detail.captainAbilityCoverage?.entries)
    ? baseCharacter.detail.captainAbilityCoverage.entries
    : [];
  const headEntries = Array.isArray(headCharacter.detail.captainAbilityCoverage?.entries)
    ? headCharacter.detail.captainAbilityCoverage.entries
    : [];
  const baseTierCount = baseEntries.reduce((total, entry) => total + (entry.tiers?.length ?? 0), 0);
  const headTierCount = headEntries.reduce((total, entry) => total + (entry.tiers?.length ?? 0), 0);

  return {
    id: headCharacter.id,
    name: headCharacter.name,
    tierDelta: headTierCount - baseTierCount,
    entryDelta: headEntries.length - baseEntries.length,
    changedDetailKeys: classification.changedDetailKeys.filter((key) =>
      ['captainAbility', 'captainAbilityVariants', 'captainAbilityCoverage', 'captainNotes'].includes(key),
    ),
  };
}

function summarizeCharacters(baseCharacters, headCharacters) {
  const addedIds = sortedNumberKeys(headCharacters).filter((id) => !baseCharacters.has(id));
  const removedIds = sortedNumberKeys(baseCharacters).filter((id) => !headCharacters.has(id));
  const changedIds = sortedNumberKeys(headCharacters).filter(
    (id) =>
      baseCharacters.has(id) &&
      stableStringify(baseCharacters.get(id)) !== stableStringify(headCharacters.get(id)),
  );
  const examples = {
    added: [],
    removed: [],
    changed: [],
    captainCoverage: [],
    builderAbilities: [],
  };
  const counters = {
    changedCount: changedIds.length,
    captainCoverageChangedCount: 0,
    tierChangedCount: 0,
    builderAbilitiesChangedCount: 0,
    tagsChangedCount: 0,
  };

  for (const id of addedIds) {
    const character = headCharacters.get(id);
    pushExample(examples.added, { id, name: character.name });
  }

  for (const id of removedIds) {
    const character = baseCharacters.get(id);
    pushExample(examples.removed, { id, name: character.name });
  }

  for (const id of changedIds) {
    const baseCharacter = baseCharacters.get(id);
    const headCharacter = headCharacters.get(id);
    const classification = classifyCharacterChange(baseCharacter, headCharacter);

    if (classification.captainChanged) {
      counters.captainCoverageChangedCount += 1;
      pushExample(examples.captainCoverage, summarizeCaptainChange(baseCharacter, headCharacter, classification));
    }

    if (classification.tiersChanged) {
      counters.tierChangedCount += 1;
    }

    if (classification.builderAbilitiesChanged) {
      counters.builderAbilitiesChangedCount += 1;
      pushExample(examples.builderAbilities, summarizeBuilderAbilityChange(baseCharacter, headCharacter));
    }

    if (classification.tagsChanged) {
      counters.tagsChangedCount += 1;
    }

    pushExample(examples.changed, {
      id,
      name: headCharacter.name,
      changedFields: classification.changedFields,
      changedDetailKeys: classification.changedDetailKeys,
    });
  }

  return {
    addedCount: addedIds.length,
    removedCount: removedIds.length,
    ...counters,
    examples,
  };
}

function summarizeShips(baseShips, headShips) {
  const addedIds = sortedNumberKeys(headShips).filter((id) => !baseShips.has(id));
  const removedIds = sortedNumberKeys(baseShips).filter((id) => !headShips.has(id));
  const changedIds = sortedNumberKeys(headShips).filter(
    (id) => baseShips.has(id) && stableStringify(baseShips.get(id)) !== stableStringify(headShips.get(id)),
  );

  return {
    addedCount: addedIds.length,
    removedCount: removedIds.length,
    changedCount: changedIds.length,
    examples: {
      added: addedIds.slice(0, maxExamples).map((id) => ({ id, name: headShips.get(id).name })),
      removed: removedIds.slice(0, maxExamples).map((id) => ({ id, name: baseShips.get(id).name })),
      changed: changedIds.slice(0, maxExamples).map((id) => ({
        id,
        name: headShips.get(id).name,
        changedFields: listChangedObjectKeys(baseShips.get(id), headShips.get(id)),
      })),
    },
  };
}

function summarizeAbilityCatalog(baseCatalog, headCatalog) {
  const baseAbilities = Array.isArray(baseCatalog.abilities) ? baseCatalog.abilities : [];
  const headAbilities = Array.isArray(headCatalog.abilities) ? headCatalog.abilities : [];
  const delta = summarizeKeyedArrayDelta(baseAbilities, headAbilities, 'key');
  const baseByKey = indexByKey(baseAbilities, 'key');
  const headByKey = indexByKey(headAbilities, 'key');
  const changedExamples = delta.changed.slice(0, maxExamples).map((key) => {
    const base = baseByKey.get(key);
    const head = headByKey.get(key);
    const matchDelta = idListDelta(base?.matchingCharacterIds, head?.matchingCharacterIds);
    return {
      key,
      label: head?.label ?? base?.label ?? key,
      matchCountDelta: Number(head?.matchCount ?? 0) - Number(base?.matchCount ?? 0),
      addedMatchingCharacterIds: matchDelta.added.slice(0, maxExamples),
      removedMatchingCharacterIds: matchDelta.removed.slice(0, maxExamples),
      changedFields: listChangedObjectKeys(base, head).filter((field) => field !== 'matchingCharacterIds'),
    };
  });

  return {
    abilityCount: countDelta(Number(baseCatalog.abilityCount ?? 0), Number(headCatalog.abilityCount ?? 0)),
    addedCount: delta.added.length,
    removedCount: delta.removed.length,
    changedCount: delta.changed.length,
    examples: {
      added: delta.added.slice(0, maxExamples).map((key) => ({
        key,
        label: headByKey.get(key)?.label ?? key,
        matchCount: headByKey.get(key)?.matchCount ?? null,
      })),
      removed: delta.removed.slice(0, maxExamples).map((key) => ({
        key,
        label: baseByKey.get(key)?.label ?? key,
        matchCount: baseByKey.get(key)?.matchCount ?? null,
      })),
      changed: changedExamples,
    },
  };
}

function summarizePreview(basePreview, headPreview) {
  const baseCharacters = indexByKey(basePreview.characters, 'id');
  const headCharacters = indexByKey(headPreview.characters, 'id');
  const characterDelta = summarizeKeyedArrayDelta(basePreview.characters, headPreview.characters, 'id');
  const shipDelta = summarizeKeyedArrayDelta(basePreview.ships, headPreview.ships, 'id');

  return {
    characterCount: countDelta(baseCharacters.size, headCharacters.size),
    changedCharacters: characterDelta.changed.length,
    shipCount: countDelta(
      Array.isArray(basePreview.ships) ? basePreview.ships.length : 0,
      Array.isArray(headPreview.ships) ? headPreview.ships.length : 0,
    ),
    changedShips: shipDelta.changed.length,
  };
}

function summarizeUnresolvedImages(baseUnresolved, headUnresolved) {
  const baseItems = Array.isArray(baseUnresolved.items) ? baseUnresolved.items : [];
  const headItems = Array.isArray(headUnresolved.items) ? headUnresolved.items : [];
  const delta = summarizeKeyedArrayDelta(baseItems, headItems, 'id');

  return {
    total: countDelta(Number(baseUnresolved.total ?? baseItems.length), Number(headUnresolved.total ?? headItems.length)),
    addedCount: delta.added.length,
    removedCount: delta.removed.length,
    changedCount: delta.changed.length,
    examples: {
      added: delta.added.slice(0, maxExamples),
      removed: delta.removed.slice(0, maxExamples),
      changed: delta.changed.slice(0, maxExamples),
    },
  };
}

function buildWarnings(report) {
  const warnings = [];
  const changedCharacters = report.characters.changedCount;
  const totalCharacterMovement = report.characters.addedCount + report.characters.removedCount;
  const abilityMovement = report.abilityCatalog.addedCount + report.abilityCatalog.removedCount;

  if (changedCharacters > 250) {
    warnings.push(`Large generated character delta: ${changedCharacters} changed records.`);
  }

  if (totalCharacterMovement > 50) {
    warnings.push(`Large generated character add/remove delta: ${totalCharacterMovement} records.`);
  }

  if (report.characters.captainCoverageChangedCount > 100) {
    warnings.push(
      `Large captain coverage delta: ${report.characters.captainCoverageChangedCount} changed character(s).`,
    );
  }

  if (report.characters.builderAbilitiesChangedCount > 100) {
    warnings.push(
      `Large builder ability delta: ${report.characters.builderAbilitiesChangedCount} changed character(s).`,
    );
  }

  if (abilityMovement > 25 || report.abilityCatalog.changedCount > 50) {
    warnings.push(
      `Large ability catalog delta: ${report.abilityCatalog.addedCount} added, ${report.abilityCatalog.removedCount} removed, ${report.abilityCatalog.changedCount} changed.`,
    );
  }

  if (report.ships.addedCount + report.ships.removedCount + report.ships.changedCount > 25) {
    warnings.push(
      `Large ship delta: ${report.ships.addedCount} added, ${report.ships.removedCount} removed, ${report.ships.changedCount} changed.`,
    );
  }

  if (!report.manifest.sourceVersion.changed && (changedCharacters > 0 || totalCharacterMovement > 0)) {
    warnings.push('Generated character data changed while manifest sourceVersion stayed the same.');
  }

  if (
    report.manifest.sourceVersion.changed &&
    changedCharacters === 0 &&
    totalCharacterMovement === 0 &&
    abilityMovement === 0 &&
    report.abilityCatalog.changedCount === 0
  ) {
    warnings.push('Manifest sourceVersion changed without generated character or ability catalog changes.');
  }

  return warnings;
}

function hasMeaningfulChanges(report) {
  return (
    report.manifest.sourceVersion.changed ||
    Object.values(report.manifest.countDeltas).some((entry) => entry.delta !== 0) ||
    report.manifest.packs.addedCount > 0 ||
    report.manifest.packs.removedCount > 0 ||
    report.manifest.packs.changedCount > 0 ||
    report.characters.addedCount > 0 ||
    report.characters.removedCount > 0 ||
    report.characters.changedCount > 0 ||
    report.ships.addedCount > 0 ||
    report.ships.removedCount > 0 ||
    report.ships.changedCount > 0 ||
    report.abilityCatalog.addedCount > 0 ||
    report.abilityCatalog.removedCount > 0 ||
    report.abilityCatalog.changedCount > 0 ||
    report.preview.characterCount.delta !== 0 ||
    report.preview.changedCharacters > 0 ||
    report.preview.shipCount.delta !== 0 ||
    report.preview.changedShips > 0 ||
    report.unresolvedImages.total.delta !== 0 ||
    report.unresolvedImages.addedCount > 0 ||
    report.unresolvedImages.removedCount > 0 ||
    report.unresolvedImages.changedCount > 0
  );
}

export async function buildDatasetChangeDigest({
  baseRef,
  headRef,
  baseDir,
  headDir,
  repoRoot = rootDir,
  dataPrefix = defaultDataPrefix,
  generatedAt = new Date().toISOString(),
  execFileImpl = execFileAsync,
} = {}) {
  const SQL = await initSqlJs({
    locateFile: () => sqlJsWasmPath,
  });
  const baseReader = baseDir
    ? createDirectoryReader({ dir: baseDir })
    : createGitReader({ repoRoot, ref: baseRef, dataPrefix, execFileImpl });
  const headReader = headDir
    ? createDirectoryReader({ dir: headDir })
    : createGitReader({ repoRoot, ref: headRef, dataPrefix, execFileImpl });
  const [base, head] = await Promise.all([
    readSnapshot(baseReader, baseRef ?? baseDir ?? 'base', SQL),
    readSnapshot(headReader, headRef ?? headDir ?? 'head', SQL),
  ]);
  const report = {
    schemaVersion: DATASET_CHANGE_DIGEST_SCHEMA_VERSION,
    generatedAt,
    base: {
      ref: baseRef ?? null,
      dir: baseDir ?? null,
      sourceVersion: base.manifest.sourceVersion ?? null,
    },
    head: {
      ref: headRef ?? null,
      dir: headDir ?? null,
      sourceVersion: head.manifest.sourceVersion ?? null,
    },
    manifest: summarizeManifest(base.manifest, head.manifest),
    characters: summarizeCharacters(base.seed.characters, head.seed.characters),
    ships: summarizeShips(base.seed.ships, head.seed.ships),
    abilityCatalog: summarizeAbilityCatalog(base.abilityCatalog, head.abilityCatalog),
    preview: summarizePreview(base.preview, head.preview),
    unresolvedImages: summarizeUnresolvedImages(base.unresolvedImages, head.unresolvedImages),
  };
  report.warnings = buildWarnings(report);
  report.status = hasMeaningfulChanges(report) ? (report.warnings.length ? 'warning' : 'changed') : 'unchanged';

  return report;
}

function formatSigned(value) {
  return value > 0 ? `+${value}` : String(value);
}

function formatCountDelta(label, delta) {
  return `| ${label} | ${delta.base} | ${delta.head} | ${formatSigned(delta.delta)} |`;
}

function formatList(values) {
  return values.length ? values.join(', ') : 'none';
}

function formatCharacterExample(example) {
  return `#${example.id} ${example.name}`;
}

function appendExampleList(lines, examples, formatter) {
  if (!examples.length) {
    lines.push('- None');
    return;
  }

  for (const example of examples) {
    lines.push(`- ${formatter(example)}`);
  }
}

export function formatDatasetChangeDigestMarkdown(report) {
  const lines = [
    '# Dataset Change Digest',
    '',
    `Status: ${report.status}`,
    `Base: ${report.base.ref ?? report.base.dir ?? 'base'} (${report.base.sourceVersion ?? 'unknown'})`,
    `Head: ${report.head.ref ?? report.head.dir ?? 'head'} (${report.head.sourceVersion ?? 'unknown'})`,
    '',
    '## Manifest and Counts',
    '',
    `Source version: ${report.manifest.sourceVersion.base ?? 'unknown'} -> ${report.manifest.sourceVersion.head ?? 'unknown'}`,
    '',
    '| Field | Base | Head | Delta |',
    '| --- | ---: | ---: | ---: |',
    formatCountDelta('schemaVersion', report.manifest.countDeltas.schemaVersion),
    formatCountDelta('characterCount', report.manifest.countDeltas.characterCount),
    formatCountDelta('detailCount', report.manifest.countDeltas.detailCount),
    formatCountDelta('shipCount', report.manifest.countDeltas.shipCount),
    formatCountDelta('rumbleCount', report.manifest.countDeltas.rumbleCount),
    '',
    `Available types: ${formatList(report.manifest.availableTypes.head)}`,
    `Available classes: ${report.manifest.availableClasses.baseCount} -> ${report.manifest.availableClasses.headCount} (${formatSigned(report.manifest.availableClasses.delta)})`,
    `Packs changed: ${report.manifest.packs.changedCount}, added: ${report.manifest.packs.addedCount}, removed: ${report.manifest.packs.removedCount}`,
    '',
    '## Generated Characters',
    '',
    `Added: ${report.characters.addedCount}, removed: ${report.characters.removedCount}, changed: ${report.characters.changedCount}`,
    `Captain coverage changed: ${report.characters.captainCoverageChangedCount}, tier changes: ${report.characters.tierChangedCount}`,
    `Builder abilities changed: ${report.characters.builderAbilitiesChangedCount}, tags changed: ${report.characters.tagsChangedCount}`,
    '',
    '### Added Examples',
  ];

  appendExampleList(lines, report.characters.examples.added, formatCharacterExample);
  lines.push('', '### Removed Examples');
  appendExampleList(lines, report.characters.examples.removed, formatCharacterExample);
  lines.push('', '### Changed Examples');
  appendExampleList(
    lines,
    report.characters.examples.changed,
    (example) =>
      `${formatCharacterExample(example)} - row: ${formatList(example.changedFields)}, detail: ${formatList(
        example.changedDetailKeys,
      )}`,
  );
  lines.push('', '### Captain Coverage Examples');
  appendExampleList(
    lines,
    report.characters.examples.captainCoverage,
    (example) =>
      `${formatCharacterExample(example)} - tier delta ${formatSigned(example.tierDelta)}, entry delta ${formatSigned(
        example.entryDelta,
      )}, keys: ${formatList(example.changedDetailKeys)}`,
  );
  lines.push('', '### Builder Ability Examples');
  appendExampleList(
    lines,
    report.characters.examples.builderAbilities,
    (example) =>
      `${formatCharacterExample(example)} - added: ${formatList(example.addedKeys)}, removed: ${formatList(
        example.removedKeys,
      )}, changed: ${formatList(example.changedKeys)}`,
  );

  lines.push(
    '',
    '## Ability Catalog',
    '',
    '| Field | Base | Head | Delta |',
    '| --- | ---: | ---: | ---: |',
    formatCountDelta('abilityCount', report.abilityCatalog.abilityCount),
    '',
    `Added: ${report.abilityCatalog.addedCount}, removed: ${report.abilityCatalog.removedCount}, changed: ${report.abilityCatalog.changedCount}`,
    '',
    '### Added Abilities',
  );
  appendExampleList(
    lines,
    report.abilityCatalog.examples.added,
    (example) => `${example.key} (${example.label}) - matches ${example.matchCount ?? 'unknown'}`,
  );
  lines.push('', '### Removed Abilities');
  appendExampleList(
    lines,
    report.abilityCatalog.examples.removed,
    (example) => `${example.key} (${example.label}) - matches ${example.matchCount ?? 'unknown'}`,
  );
  lines.push('', '### Changed Abilities');
  appendExampleList(
    lines,
    report.abilityCatalog.examples.changed,
    (example) =>
      `${example.key} (${example.label}) - match delta ${formatSigned(example.matchCountDelta)}, added ids: ${formatList(
        example.addedMatchingCharacterIds.map(String),
      )}, removed ids: ${formatList(example.removedMatchingCharacterIds.map(String))}, fields: ${formatList(
        example.changedFields,
      )}`,
  );

  lines.push(
    '',
    '## Ships, Preview, and Image Placeholders',
    '',
    `Ships added: ${report.ships.addedCount}, removed: ${report.ships.removedCount}, changed: ${report.ships.changedCount}`,
    `Preview characters: ${report.preview.characterCount.base} -> ${report.preview.characterCount.head} (${formatSigned(
      report.preview.characterCount.delta,
    )}), changed preview characters: ${report.preview.changedCharacters}`,
    `Preview ships: ${report.preview.shipCount.base} -> ${report.preview.shipCount.head} (${formatSigned(
      report.preview.shipCount.delta,
    )}), changed preview ships: ${report.preview.changedShips}`,
    `Unresolved image placeholders: ${report.unresolvedImages.total.base} -> ${report.unresolvedImages.total.head} (${formatSigned(
      report.unresolvedImages.total.delta,
    )})`,
    '',
    '## Warnings',
  );

  if (report.warnings.length) {
    for (const warning of report.warnings) {
      lines.push(`- ${warning}`);
    }
  } else {
    lines.push('- None');
  }

  lines.push('', '## Reviewer Guidance', '');
  lines.push(
    '- Routine parser/import PRs usually have small, explainable captain coverage, builder ability, or count deltas tied to the changed parser rule or source-data file.',
    '- Large deltas, sourceVersion-stable generated changes, or ability catalog churn deserve a closer check against parser tests and generated JSON/SQL diffs.',
    '- Treat this digest as a review map, not as a replacement for focused tests or raw generated-data inspection when the summary looks surprising.',
  );

  return `${lines.join('\n')}\n`;
}

function parseArgs(argv) {
  const options = {};

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const equalsIndex = arg.indexOf('=');
    const name = equalsIndex >= 0 ? arg.slice(0, equalsIndex) : arg;
    const inlineValue = equalsIndex >= 0 ? arg.slice(equalsIndex + 1) : null;
    const readValue = () => {
      if (inlineValue !== null) {
        return inlineValue;
      }

      index += 1;
      if (index >= argv.length) {
        throw new Error(`Missing value for ${name}.`);
      }

      return argv[index];
    };

    switch (name) {
      case '--base-ref':
        options.baseRef = readValue();
        break;
      case '--head-ref':
        options.headRef = readValue();
        break;
      case '--base-dir':
        options.baseDir = readValue();
        break;
      case '--head-dir':
        options.headDir = readValue();
        break;
      case '--data-prefix':
        options.dataPrefix = readValue();
        break;
      case '--output':
        options.outputPath = readValue();
        break;
      case '--json-output':
        options.jsonOutputPath = readValue();
        break;
      case '--help':
      case '-h':
        options.help = true;
        break;
      default:
        throw new Error(`Unknown option: ${arg}`);
    }
  }

  return options;
}

function usage() {
  return `Usage: npm run dataset:digest -- --base-ref <sha> --head-ref <sha> --output <digest.md> --json-output <digest.json>

Alternative for fixtures/local generated directories:
  node scripts/dataset-change-digest.mjs --base-dir <dir> --head-dir <dir> [--output digest.md] [--json-output digest.json]`;
}

export async function runCli(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  if (options.help) {
    process.stdout.write(`${usage()}\n`);
    return null;
  }

  if ((!options.baseRef || !options.headRef) && (!options.baseDir || !options.headDir)) {
    throw new Error('Provide either --base-ref and --head-ref, or --base-dir and --head-dir.');
  }

  const report = await buildDatasetChangeDigest({
    baseRef: options.baseRef,
    headRef: options.headRef,
    baseDir: options.baseDir ? path.resolve(options.baseDir) : undefined,
    headDir: options.headDir ? path.resolve(options.headDir) : undefined,
    dataPrefix: options.dataPrefix,
  });
  const markdown = formatDatasetChangeDigestMarkdown(report);

  if (options.jsonOutputPath) {
    const outputPath = path.resolve(options.jsonOutputPath);
    await mkdir(path.dirname(outputPath), { recursive: true });
    await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`);
  }

  if (options.outputPath) {
    const outputPath = path.resolve(options.outputPath);
    await mkdir(path.dirname(outputPath), { recursive: true });
    await writeFile(outputPath, markdown);
  } else {
    process.stdout.write(markdown);
  }

  return report;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    await runCli();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
