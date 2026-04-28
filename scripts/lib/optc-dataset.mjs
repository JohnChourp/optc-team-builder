import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { normalizeHtmlToText } from './html-text.mjs';

export const validTypes = new Set(['STR', 'DEX', 'QCK', 'PSY', 'INT']);
const invalidClassPattern = /^Class\d+$/i;
const captainBranchPattern =
  /\b(always active|standard captain|powered up captain|rampage captain)\s*:\s*/gi;
const captainEffectClauseSeparator =
  /,\s+(?=(?:and\s+)?(?:boosts?|reduces?|makes?|changes?|increases?|restores?|deals?|cuts?|lowers?|decreases?|sets?|adds?)\b)|\s+\band\s+(?=(?:boosts?|reduces?|makes?|changes?|increases?|restores?|deals?|cuts?|lowers?|decreases?|sets?|adds?)\b)/gi;
const defaultCaptainBranchLabels = new Set(['always active', 'standard captain']);
const preferredDefaultCaptainVariantKeys = [
  'base',
  'captain',
  'description',
  'level0',
  'llbbase',
  'level1',
];

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
    thumbnailLocal: null,
    thumbnailGlobal: null,
    thumbnailJapan: null,
  };
}

export function createEmptyRegionAvailability() {
  return {
    exactLocal: false,
    thumbnailGlobal: false,
    thumbnailJapan: false,
  };
}

export function createCharacterSearchText(nameOrOptions, type, classes) {
  const normalized = normalizeCharacterSearchInput(nameOrOptions, type, classes);

  return [
    normalized.name,
    normalized.type,
    normalized.classes.join(' '),
    normalized.id,
    normalized.canonicalId,
    ...normalized.aliases,
  ]
    .map((value) => String(value ?? '').trim())
    .filter((value, index, values) => value.length > 0 && values.indexOf(value) === index)
    .join(' ')
    .toLowerCase();
}

export function resolveCharacterCaptainBoosts(characterOrDetail) {
  const detail = characterOrDetail?.detail ?? characterOrDetail ?? {};
  const captainText = resolveDefaultCaptainAbilityText(detail);
  const defaultCaptainText = extractDefaultCaptainBoostText(captainText);
  const captainHpBoost = extractHighestCaptainBoost(defaultCaptainText, 'hp');
  const captainAtkBoost = extractHighestCaptainBoost(defaultCaptainText, 'atk');

  return {
    captainHpBoost,
    captainAtkBoost,
    captainAverageBoost: (captainHpBoost + captainAtkBoost) / 2,
  };
}

function resolveDefaultCaptainAbilityText(detail) {
  const variants = Array.isArray(detail?.captainAbilityVariants)
    ? detail.captainAbilityVariants
    : [];
  const preferredVariant = preferredDefaultCaptainVariantKeys
    .map((key) =>
      variants.find((variant) => String(variant?.key ?? '').toLowerCase() === key && variant?.text),
    )
    .find(Boolean);
  const fallbackVariant = variants.find((variant) => variant?.text);

  return String(
    preferredVariant?.text ?? fallbackVariant?.text ?? detail?.captainAbility ?? '',
  ).trim();
}

function extractDefaultCaptainBoostText(text) {
  const normalizedText = normalizeCaptainBoostText(text);
  const branches = extractCaptainBranches(normalizedText);

  if (!branches.length) {
    return normalizedText;
  }

  const defaultBranches = branches
    .filter((branch) => defaultCaptainBranchLabels.has(branch.label))
    .map((branch) => branch.text)
    .filter(Boolean);

  return defaultBranches.length
    ? defaultBranches.join('. ')
    : (branches[0]?.text ?? normalizedText);
}

function extractCaptainBranches(text) {
  const matches = [...text.matchAll(captainBranchPattern)];

  return matches
    .map((match, index) => {
      const nextMatch = matches[index + 1] ?? null;
      const start = (match.index ?? 0) + match[0].length;
      const end = nextMatch?.index ?? text.length;

      return {
        label: String(match[1] ?? '').toLowerCase(),
        text: text.slice(start, end).trim(),
      };
    })
    .filter((branch) => branch.text.length > 0);
}

function extractHighestCaptainBoost(text, stat) {
  const pattern = new RegExp(`\\b${stat}\\b[^.;]*?\\bby\\s+(\\d+(?:\\.\\d+)?)x`, 'gi');

  return extractDefaultCaptainBoostClauses(text).reduce((highest, clause) => {
    return [...clause.matchAll(pattern)].reduce((clauseHighest, match) => {
      if (isSelfOnlyCaptainBoostMatch(match[0])) {
        return clauseHighest;
      }

      const value = Number(match[1]);
      return Number.isFinite(value) && value > clauseHighest ? value : clauseHighest;
    }, highest);
  }, 0);
}

function extractDefaultCaptainBoostClauses(text) {
  return splitCaptainEffectClauses(text).filter(
    (clause) =>
      !isConditionalCaptainBoostClause(clause) &&
      /\bboosts?\b/i.test(clause) &&
      /\b(?:atk|hp)\b/i.test(clause) &&
      /\bby\s+\d+(?:\.\d+)?x\b/i.test(clause),
  );
}

function splitCaptainEffectClauses(text) {
  return splitCaptainSentences(text)
    .flatMap((clause) =>
      isConditionalCaptainBoostClause(clause)
        ? [clause]
        : clause.split(captainEffectClauseSeparator),
    )
    .map((clause) => clause.trim())
    .filter(Boolean);
}

function splitCaptainSentences(text) {
  const clauses = [];
  let current = '';
  const value = String(text ?? '');

  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    const previousCharacter = value[index - 1] ?? '';
    const nextCharacter = value[index + 1] ?? '';
    const isDecimalPoint =
      character === '.' && /\d/.test(previousCharacter) && /\d/.test(nextCharacter);

    if ((character === '.' && !isDecimalPoint) || character === ';') {
      clauses.push(current);
      current = '';
      continue;
    }

    current += character;
  }

  clauses.push(current);

  return clauses;
}

function isConditionalCaptainBoostClause(clause) {
  return /^(?:if|when)\b/i.test(clause.trim());
}

function isSelfOnlyCaptainBoostMatch(matchText) {
  const normalizedText = normalizeCaptainBoostText(matchText);

  return (
    /\b(?:atk|hp)\b[^,.;]{0,80}\b(?:this character|self)\b/i.test(normalizedText) ||
    /\bown\s+(?:atk|hp)\b/i.test(normalizedText)
  );
}

function normalizeCaptainBoostText(text) {
  return normalizeHtmlToText(text);
}

function normalizeCharacterSearchInput(nameOrOptions, type, classes) {
  if (nameOrOptions && typeof nameOrOptions === 'object' && !Array.isArray(nameOrOptions)) {
    const options = nameOrOptions;

    return {
      name: String(options.name ?? ''),
      type: String(options.type ?? ''),
      classes: Array.isArray(options.classes) ? options.classes.map((entry) => String(entry)) : [],
      id: options.id === null || options.id === undefined ? '' : String(options.id),
      canonicalId:
        options.canonicalId === null || options.canonicalId === undefined
          ? ''
          : String(options.canonicalId),
      aliases: Array.isArray(options.aliases)
        ? options.aliases
            .map((entry) => String(entry ?? '').trim())
            .filter((entry) => entry.length > 0)
        : [],
    };
  }

  return {
    name: String(nameOrOptions ?? ''),
    type: String(type ?? ''),
    classes: Array.isArray(classes) ? classes.map((entry) => String(entry)) : [],
    id: '',
    canonicalId: '',
    aliases: [],
  };
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
        is_incomplete INTEGER NOT NULL,
        type TEXT NOT NULL,
        primary_class TEXT NOT NULL,
        secondary_class TEXT,
        classes_json TEXT NOT NULL,
        stars INTEGER NOT NULL,
        cost INTEGER NOT NULL,
        combo INTEGER NOT NULL,
        min_hp INTEGER,
        min_atk INTEGER,
        min_rcv INTEGER,
        max_hp INTEGER,
        max_atk INTEGER,
        max_rcv INTEGER,
        growth REAL,
        captain_hp_boost REAL NOT NULL DEFAULT 0,
        captain_atk_boost REAL NOT NULL DEFAULT 0,
        captain_average_boost REAL NOT NULL DEFAULT 0,
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
    const resolvedCaptainBoosts = resolveCharacterCaptainBoosts(character);
    const captainBoosts = {
      captainHpBoost:
        typeof character.captainHpBoost === 'number'
          ? character.captainHpBoost
          : resolvedCaptainBoosts.captainHpBoost,
      captainAtkBoost:
        typeof character.captainAtkBoost === 'number'
          ? character.captainAtkBoost
          : resolvedCaptainBoosts.captainAtkBoost,
    };
    captainBoosts.captainAverageBoost =
      typeof character.captainAverageBoost === 'number'
        ? character.captainAverageBoost
        : (captainBoosts.captainHpBoost + captainBoosts.captainAtkBoost) / 2;

    statements.push(`
      INSERT INTO characters (
        id, name, is_incomplete, type, primary_class, secondary_class, classes_json, stars, cost, combo,
        min_hp, min_atk, min_rcv, max_hp, max_atk, max_rcv, growth,
        captain_hp_boost, captain_atk_boost, captain_average_boost, region_json,
        assets_json, search_text
      ) VALUES (
        ${sqlValue(character.id)},
        ${sqlValue(character.name)},
        ${sqlValue(character.isIncomplete ? 1 : 0)},
        ${sqlValue(character.type)},
        ${sqlValue(character.primaryClass)},
        ${sqlValue(character.secondaryClass)},
        ${sqlValue(JSON.stringify(character.classes))},
        ${sqlValue(character.stars)},
        ${sqlValue(character.cost)},
        ${sqlValue(character.combo)},
        ${sqlValue(character.minHp)},
        ${sqlValue(character.minAtk)},
        ${sqlValue(character.minRcv)},
        ${sqlValue(character.maxHp)},
        ${sqlValue(character.maxAtk)},
        ${sqlValue(character.maxRcv)},
        ${sqlValue(character.growth)},
        ${sqlValue(captainBoosts.captainHpBoost)},
        ${sqlValue(captainBoosts.captainAtkBoost)},
        ${sqlValue(captainBoosts.captainAverageBoost)},
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

  return statements.join('\n').replace(/[ \t]+$/gm, '');
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
