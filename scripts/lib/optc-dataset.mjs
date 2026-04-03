import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

export const validTypes = new Set(['STR', 'DEX', 'QCK', 'PSY', 'INT']);
const invalidClassPattern = /^Class\d+$/i;

export function flattenValues(value) {
  if (Array.isArray(value)) {
    return value.flatMap((entry) => flattenValues(entry));
  }

  return [value];
}

export function normalizeCharacterClasses(value) {
  return [...new Set(flattenValues(value))]
    .map((entry) => String(entry ?? '').trim())
    .filter((entry) => entry && !invalidClassPattern.test(entry));
}

export function createEmptyAssets() {
  return {
    exactLocal: null,
    thumbnailGlobal: null,
    thumbnailJapan: null,
    fullTransparent: null,
  };
}

export function createEmptyRegionAvailability() {
  return {
    exactLocal: false,
    thumbnailGlobal: false,
    thumbnailJapan: false,
    fullTransparent: false,
  };
}

export function createCharacterSearchText(name, type, classes) {
  return `${name} ${type} ${classes.join(' ')}`.toLowerCase();
}

function escapeSql(value) {
  return String(value).replaceAll("'", "''");
}

function sqlValue(value) {
  if (value === null || value === undefined) {
    return 'NULL';
  }

  if (typeof value === 'number') {
    return Number.isFinite(value) ? String(value) : 'NULL';
  }

  return `'${escapeSql(value)}'`;
}

export function buildManifest(characters, ships, sourceVersion, packs, generatedAt) {
  return {
    generatedAt,
    sourceVersion,
    characterCount: characters.length,
    detailCount: characters.filter(
      (character) => character.detail?.specialText || character.detail?.captainAbility,
    ).length,
    shipCount: ships.length,
    rumbleCount: characters.filter((character) => Boolean(character.detail?.rumbleData)).length,
    availableTypes: [
      ...new Set(
        characters.flatMap((character) =>
          String(character.type)
            .split(',')
            .map((type) => type.trim())
            .filter((type) => validTypes.has(type)),
        ),
      ),
    ].sort(),
    availableClasses: [...new Set(characters.flatMap((character) => character.classes))].sort(),
    packs: packs.map((pack) => ({ ...pack })),
  };
}

export function createSqlSeed(characters, ships, manifest) {
  const statements = [
    'PRAGMA foreign_keys = OFF;',
    'DROP TABLE IF EXISTS characters;',
    'DROP TABLE IF EXISTS character_details;',
    'DROP TABLE IF EXISTS ships;',
    'DROP TABLE IF EXISTS meta;',
    `
      CREATE TABLE characters (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        type TEXT NOT NULL,
        primary_class TEXT NOT NULL,
        secondary_class TEXT,
        classes_json TEXT NOT NULL,
        stars INTEGER NOT NULL,
        cost INTEGER NOT NULL,
        combo INTEGER NOT NULL,
        max_level INTEGER NOT NULL,
        max_experience INTEGER NOT NULL,
        min_hp INTEGER NOT NULL,
        min_atk INTEGER NOT NULL,
        min_rcv INTEGER NOT NULL,
        max_hp INTEGER NOT NULL,
        max_atk INTEGER NOT NULL,
        max_rcv INTEGER NOT NULL,
        growth REAL NOT NULL,
        region_json TEXT NOT NULL,
        assets_json TEXT NOT NULL,
        search_text TEXT NOT NULL
      );
    `,
    `
      CREATE TABLE character_details (
        character_id INTEGER PRIMARY KEY,
        detail_json TEXT NOT NULL
      );
    `,
    `
      CREATE TABLE ships (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        thumb TEXT,
        description TEXT NOT NULL
      );
    `,
    `
      CREATE TABLE meta (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `,
  ];

  for (const character of characters) {
    statements.push(`
      INSERT INTO characters (
        id, name, type, primary_class, secondary_class, classes_json, stars, cost, combo, max_level,
        max_experience, min_hp, min_atk, min_rcv, max_hp, max_atk, max_rcv, growth, region_json,
        assets_json, search_text
      ) VALUES (
        ${sqlValue(character.id)},
        ${sqlValue(character.name)},
        ${sqlValue(character.type)},
        ${sqlValue(character.primaryClass)},
        ${sqlValue(character.secondaryClass)},
        ${sqlValue(JSON.stringify(character.classes))},
        ${sqlValue(character.stars)},
        ${sqlValue(character.cost)},
        ${sqlValue(character.combo)},
        ${sqlValue(character.maxLevel)},
        ${sqlValue(character.maxExperience)},
        ${sqlValue(character.minHp)},
        ${sqlValue(character.minAtk)},
        ${sqlValue(character.minRcv)},
        ${sqlValue(character.maxHp)},
        ${sqlValue(character.maxAtk)},
        ${sqlValue(character.maxRcv)},
        ${sqlValue(character.growth)},
        ${sqlValue(JSON.stringify(character.regionAvailability))},
        ${sqlValue(JSON.stringify(character.assets))},
        ${sqlValue(character.searchText)}
      );
    `);

    statements.push(`
      INSERT INTO character_details (character_id, detail_json)
      VALUES (${sqlValue(character.id)}, ${sqlValue(JSON.stringify(character.detail))});
    `);
  }

  for (const ship of ships) {
    statements.push(`
      INSERT INTO ships (id, name, thumb, description)
      VALUES (
        ${sqlValue(ship.id)},
        ${sqlValue(ship.name)},
        ${sqlValue(ship.thumb)},
        ${sqlValue(ship.description)}
      );
    `);
  }

  statements.push(`
    INSERT INTO meta (key, value)
    VALUES ('manifest', ${sqlValue(JSON.stringify(manifest))});
  `);

  return statements.join('\n');
}

export function canResolveWithoutPlaceholder(character, packStatuses) {
  const installedByKey = new Map(packStatuses.map((pack) => [pack.key, Boolean(pack.installed)]));

  if (character.assets.exactLocal) {
    return true;
  }

  if (installedByKey.get('thumbnailsGlo') && character.assets.thumbnailGlobal) {
    return true;
  }

  if (installedByKey.get('thumbnailsJapan') && character.assets.thumbnailJapan) {
    return true;
  }

  if (installedByKey.get('fullTransparent') && character.assets.fullTransparent) {
    return true;
  }

  return false;
}

export function getSortedUnresolvedCharacters(characters, packStatuses) {
  return [...characters]
    .sort((left, right) => right.stars - left.stars || right.id - left.id)
    .filter((character) => !canResolveWithoutPlaceholder(character, packStatuses));
}

export function createUnresolvedCatalog(characters, packStatuses, sourceVersion, generatedAt) {
  const unresolvedCharacters = getSortedUnresolvedCharacters(characters, packStatuses).map(
    (character) => ({
      id: character.id,
      name: character.name,
      stars: character.stars,
      type: character.type,
      classes: character.classes,
      primaryClass: character.primaryClass,
      secondaryClass: character.secondaryClass,
      regionAvailability: character.regionAvailability,
      assets: character.assets,
    }),
  );

  return {
    generatedAt,
    sourceVersion,
    total: unresolvedCharacters.length,
    items: unresolvedCharacters,
  };
}

export function buildAutoBuilderAbilityCatalog(generatedAt, sourceVersion, abilities) {
  return {
    generatedAt,
    sourceVersion,
    abilityCount: abilities.length,
    abilities,
  };
}

export function buildPreviewPayload(generatedAt, characters, ships) {
  return {
    generatedAt,
    characters: characters.slice(0, 24),
    ships: ships.slice(0, 12),
  };
}

export async function writeGeneratedDatasetFiles(
  dataDir,
  manifest,
  sqlSeed,
  unresolvedCatalog,
  autoBuilderAbilityCatalog,
  preview,
) {
  await mkdir(dataDir, { recursive: true });

  await Promise.all([
    writeFile(path.join(dataDir, 'optc-manifest.json'), JSON.stringify(manifest, null, 2)),
    writeFile(path.join(dataDir, 'optc-seed.sql'), sqlSeed),
    writeFile(
      path.join(dataDir, 'optc-unresolved-images.json'),
      JSON.stringify(unresolvedCatalog, null, 2),
    ),
    writeFile(
      path.join(dataDir, 'optc-auto-builder-abilities.json'),
      JSON.stringify(autoBuilderAbilityCatalog, null, 2),
    ),
    writeFile(path.join(dataDir, 'optc-preview.json'), JSON.stringify(preview, null, 2)),
  ]);
}

export function parseJson(value, fallback) {
  if (typeof value !== 'string' || !value.length) {
    return fallback;
  }

  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}
