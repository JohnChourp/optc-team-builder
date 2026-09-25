import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { normalizeHtmlToText } from './html-text.mjs';
import { resolveCaptainBoosts } from '../../src/app/core/grammar/captain-boost-grammar.ts';

export const DATASET_SCHEMA_VERSION = 2;
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
    thumbnailLocal: null,
    thumbnailGlobal: null,
    thumbnailJapan: null,
  };
}

/**
 * 869f13284. Which regions the app found ARTWORK for. Every field here is derived from whether an
 * image asset exists, which is why none of them is named for availability: `region_release_json`
 * and `createEmptyRegionRelease` carry that, from upstream's own flag file.
 */
export function createEmptyRegionArtwork() {
  return {
    exactLocal: false,
    thumbnailGlobal: false,
    thumbnailJapan: false,
  };
}

/**
 * 869f13284. Unknown until upstream's flag file says otherwise - never `false` by default.
 *
 * `createSqlSeed` falls back to this for any character that carries no release record, which is
 * the correct answer for a manually added character: it has no upstream flag row, so its
 * availability is genuinely unknown rather than absent.
 */
export function createEmptyRegionRelease() {
  return {
    availableOnGlobal: null,
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

/**
 * 869f63guq. The grammar itself lives in `src/app/core/grammar/captain-boost-grammar.ts`, which the
 * app imports too, so a Local edit and the Auto Team Builder read a Captain boost exactly the way
 * this column was written. Only the unwrapping of a record into its detail is left here.
 */
export function resolveCharacterCaptainBoosts(characterOrDetail) {
  return resolveCaptainBoosts(
    characterOrDetail?.detail ?? characterOrDetail ?? {},
    normalizeHtmlToText,
  );
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

/**
 * 869f63gtc. Which upstream repository and commit the data was read from.
 *
 * `sourceVersion` cannot answer that: both candidate repositories report `dbVersion 36`, and their
 * `version.js` has not changed since 2016-05-23. The importer passes both fields; the manual overlay
 * reads them back out of the manifest it rebuilds and passes them on, so neither write drops them. A
 * caller with neither writes neither, rather than a null that looks like a recorded answer.
 */
export function readManifestSourceProvenance(manifest) {
  const repository =
    typeof manifest?.sourceRepository === 'string' ? manifest.sourceRepository.trim() : '';
  const commit = typeof manifest?.sourceCommit === 'string' ? manifest.sourceCommit.trim() : '';

  return repository || commit ? { repository, commit } : null;
}

export function buildManifest(
  characters,
  ships,
  sourceVersion,
  packs,
  generatedAt,
  sourceProvenance = null,
) {
  return {
    schemaVersion: DATASET_SCHEMA_VERSION,
    generatedAt,
    sourceVersion,
    ...(sourceProvenance?.repository ? { sourceRepository: sourceProvenance.repository } : {}),
    ...(sourceProvenance?.commit ? { sourceCommit: sourceProvenance.commit } : {}),
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
    'DROP TABLE IF EXISTS character_evolutions;',
    'DROP TABLE IF EXISTS character_drops;',
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
        stars_label TEXT NOT NULL,
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
        max_sockets INTEGER,
        special_cooldown_max INTEGER,
        special_cooldown_min INTEGER,
        region_json TEXT NOT NULL,
        region_release_json TEXT NOT NULL,
        assets_json TEXT NOT NULL,
        search_text TEXT NOT NULL,
        families_json TEXT NOT NULL
      );
    `,
    `
      CREATE TABLE character_details (
        character_id INTEGER PRIMARY KEY,
        detail_json TEXT NOT NULL
      );
    `,
    /*
     * 869f1935z. Both directions of the evolution graph. `evolves_from_json` is the one a player
     * asks for - *"you already own its base form"* turns a blocker into a task - and it cannot be
     * derived from the forward edge without scanning every row.
     */
    `
      CREATE TABLE character_evolutions (
        character_id INTEGER PRIMARY KEY,
        evolves_to_json TEXT NOT NULL,
        evolves_from_json TEXT NOT NULL
      );
    `,
    `
      CREATE TABLE character_drops (
        character_id INTEGER PRIMARY KEY,
        sources_json TEXT NOT NULL
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
        id, name, is_incomplete, type, primary_class, secondary_class, classes_json, stars, stars_label, cost, combo,
        min_hp, min_atk, min_rcv, max_hp, max_atk, max_rcv, growth,
        captain_hp_boost, captain_atk_boost, captain_average_boost,
        max_sockets, special_cooldown_max, special_cooldown_min, region_json, region_release_json,
        assets_json, search_text, families_json
      ) VALUES (
        ${sqlValue(character.id)},
        ${sqlValue(character.name)},
        ${sqlValue(character.isIncomplete ? 1 : 0)},
        ${sqlValue(character.type)},
        ${sqlValue(character.primaryClass)},
        ${sqlValue(character.secondaryClass)},
        ${sqlValue(JSON.stringify(character.classes))},
        ${sqlValue(character.stars)},
        ${sqlValue(character.starsLabel ?? String(character.stars))},
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
        ${sqlValue(character.maxSockets ?? null)},
        ${sqlValue(character.specialCooldownMax ?? null)},
        ${sqlValue(character.specialCooldownMin ?? null)},
        ${sqlValue(JSON.stringify(character.regionArtwork ?? createEmptyRegionArtwork()))},
        ${sqlValue(JSON.stringify(character.regionRelease ?? createEmptyRegionRelease()))},
        ${sqlValue(JSON.stringify(character.assets))},
        ${sqlValue(character.searchText)},
        ${sqlValue(JSON.stringify(character.families ?? []))}
      );
    `);

    statements.push(`
      INSERT INTO character_details (character_id, detail_json)
      VALUES (${sqlValue(character.id)}, ${sqlValue(JSON.stringify(character.detail))});
    `);

    /*
     * Only rows that carry something. A manually added character - and any unit the upstream graph
     * does not mention - simply has no row, which the repository reads as "nothing recorded" rather
     * than as "not farmable". The distinction matters: a wrong "farm this stage" costs real stamina,
     * and so does a confident "there is no way to get this".
     */
    const evolvesTo = character.evolvesTo ?? [];
    const evolvesFrom = character.evolvesFrom ?? [];

    if (evolvesTo.length > 0 || evolvesFrom.length > 0) {
      statements.push(`
        INSERT INTO character_evolutions (character_id, evolves_to_json, evolves_from_json)
        VALUES (
          ${sqlValue(character.id)},
          ${sqlValue(JSON.stringify(evolvesTo))},
          ${sqlValue(JSON.stringify(evolvesFrom))}
        );
      `);
    }

    const dropSources = character.dropSources ?? [];

    if (dropSources.length > 0) {
      statements.push(`
        INSERT INTO character_drops (character_id, sources_json)
        VALUES (${sqlValue(character.id)}, ${sqlValue(JSON.stringify(dropSources))});
      `);
    }
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
      starsLabel: character.starsLabel ?? String(character.stars),
      type: character.type,
      classes: character.classes,
      primaryClass: character.primaryClass,
      secondaryClass: character.secondaryClass,
      regionArtwork: character.regionArtwork,
      regionRelease: character.regionRelease,
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

/** The five files an import writes, by the key each has in an outputs object. */
export const GENERATED_DATASET_FILES = Object.freeze({
  manifest: 'optc-manifest.json',
  sqlSeed: 'optc-seed.sql',
  unresolvedCatalog: 'optc-unresolved-images.json',
  autoBuilderAbilityCatalog: 'optc-auto-builder-abilities.json',
  preview: 'optc-preview.json',
});

/**
 * The exact text each file is written as. The writer and the "did anything change" comparison
 * both go through here, so the two cannot disagree about what a file contains.
 */
export function serializeGeneratedDatasetFiles({
  manifest,
  sqlSeed,
  unresolvedCatalog,
  autoBuilderAbilityCatalog,
  preview,
}) {
  return {
    manifest: JSON.stringify(manifest, null, 2),
    sqlSeed,
    unresolvedCatalog: JSON.stringify(unresolvedCatalog, null, 2),
    /*
     * 869f138qm. Minified, unlike the four beside it, because this one is prefetched. Pretty
     * printing was 880,193 of its 1,674,521 bytes - 52.6% of a file every first visit downloads,
     * and every installed client re-downloads whenever it changes. Indentation of an index nobody
     * reads by hand: `npm run dataset:digest` is what a data change is reviewed through, and the
     * app parses it. 1,674,521 -> 794,328 B on disk, 192,575 -> 137,657 B gzipped.
     */
    autoBuilderAbilityCatalog: JSON.stringify(autoBuilderAbilityCatalog),
    preview: JSON.stringify(preview, null, 2),
  };
}

/** What is on disk now, with `''` for a file that does not exist yet. */
export async function readGeneratedDatasetFiles(dataDir) {
  const entries = await Promise.all(
    Object.entries(GENERATED_DATASET_FILES).map(async ([key, fileName]) => {
      try {
        return [key, await readFile(path.join(dataDir, fileName), 'utf8')];
      } catch (error) {
        if (error?.code === 'ENOENT') {
          return [key, ''];
        }

        throw error;
      }
    }),
  );

  return Object.fromEntries(entries);
}

export function generatedDatasetFilesMatch(currentFiles, outputs) {
  const nextFiles = serializeGeneratedDatasetFiles(outputs);

  return Object.keys(GENERATED_DATASET_FILES).every((key) => currentFiles[key] === nextFiles[key]);
}

export function readManifestGeneratedAt(manifestText) {
  try {
    const generatedAt = JSON.parse(manifestText)?.generatedAt;

    return typeof generatedAt === 'string' && !Number.isNaN(Date.parse(generatedAt))
      ? generatedAt
      : null;
  } catch {
    return null;
  }
}

/** 869f63gtc. The recorded upstream commit, or `null` when the manifest records none. */
export function readManifestSourceCommit(manifestText) {
  try {
    const commit = JSON.parse(manifestText)?.sourceCommit;

    return typeof commit === 'string' && /^[0-9a-f]{40}$/u.test(commit) ? commit : null;
  } catch {
    return null;
  }
}

/**
 * 869f138qb. Puts the previous files back when an import changed nothing but `generatedAt`.
 *
 * `generatedAt` is written into all five files, including the seed's `meta` row, and the service
 * worker hashes the seed. So an import that found no new data still changed the seed, and every
 * installed client downloaded the whole dataset again. Measured on 2026-09-16: 58 of the 65
 * releases since v0.2.0 changed nothing in the seed except that timestamp.
 *
 * The comparison has to run on what the import finally leaves on disk. An import writes the
 * files twice - the importer, then the manual overlay, which rebuilds them from the seed and
 * writes again with a timestamp of its own - so a check inside either step alone compares two
 * versions that never agree. Measured the same day: a check in the importer alone still let a
 * data-identical import move the timestamp in all five files.
 *
 * Returns the timestamp that was kept, or `null` when the data really changed (or there was
 * nothing to compare against) and the new files stand. `generatedAt` therefore means "when this
 * data last changed".
 *
 * 869f63gtc. The upstream commit the manifest records moves on nearly every import too - upstream
 * pushes filters, events and files the importer never reads - and the seed embeds the manifest, so
 * a new commit alone would have made every client download the whole seed again. It is kept the
 * same way: when the timestamp and the commit are the only differences, the previous files stand,
 * and `sourceCommit` means "the commit this data last changed at" - which the new commit's data is
 * byte-for-byte identical to. A different REPOSITORY is never substituted, so it always counts.
 */
export async function keepGeneratedAtWhenOnlyTimestampChanged({ dataDir, previousFiles }) {
  const previousGeneratedAt = readManifestGeneratedAt(previousFiles.manifest);

  if (!previousGeneratedAt) {
    return null;
  }

  const currentFiles = await readGeneratedDatasetFiles(dataDir);
  const currentGeneratedAt = readManifestGeneratedAt(currentFiles.manifest);

  if (!currentGeneratedAt || currentGeneratedAt === previousGeneratedAt) {
    return null;
  }

  const previousCommit = readManifestSourceCommit(previousFiles.manifest);
  const currentCommit = readManifestSourceCommit(currentFiles.manifest);
  const restorePrevious = (text) => {
    const withPreviousTimestamp = text.split(currentGeneratedAt).join(previousGeneratedAt);

    return previousCommit && currentCommit && previousCommit !== currentCommit
      ? withPreviousTimestamp.split(currentCommit).join(previousCommit)
      : withPreviousTimestamp;
  };
  const onlyTheTimestampMoved = Object.keys(GENERATED_DATASET_FILES).every(
    (key) => restorePrevious(currentFiles[key]) === previousFiles[key],
  );

  if (!onlyTheTimestampMoved) {
    return null;
  }

  await Promise.all(
    Object.entries(GENERATED_DATASET_FILES).map(([key, fileName]) =>
      writeFile(path.join(dataDir, fileName), previousFiles[key]),
    ),
  );

  return previousGeneratedAt;
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

  const files = serializeGeneratedDatasetFiles({
    manifest,
    sqlSeed,
    unresolvedCatalog,
    autoBuilderAbilityCatalog,
    preview,
  });

  await Promise.all(
    Object.entries(GENERATED_DATASET_FILES).map(([key, fileName]) =>
      writeFile(path.join(dataDir, fileName), files[key]),
    ),
  );
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
