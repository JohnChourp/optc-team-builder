import '@angular/compiler';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { gzipSync } from 'node:zlib';

import type { Database, SqlJsStatic } from 'sql.js';
import { describe, expect, it } from 'vitest';

import {
  matchesCharacterSearchTerm,
  normalizeCharacterSearchText,
  toCharacterSearchTerm,
} from '../grammar/character-search-text';
import { type CharacterDetailRecord, type DatasetManifest } from '../models/optc.models';
import { createCaptainCoverageFilterState } from './captain-coverage-filter.utils';
import {
  buildCaptainCoverageResultPassDataset,
  runCaptainCoverageResultPass,
} from './captain-coverage-result-pass.utils';
import { CharacterCatalogCacheService } from './character-catalog-cache.service';
import { createEmptyCharacterFacetSelection } from './character-facet-filter.utils';

import { createEmptyCharacterTagSetSelection } from './character-tag-set.utils';
import {
  DATASET_DATABASE_PATH,
  DATASET_SEED_PATH,
  loadDatasetDatabase,
  type DatasetDatabaseFetchResponse,
  type DatasetDatabaseSource,
} from './dataset-database-loader.utils';
import { CHARACTER_SEARCH_TEXT_LIKE_CLAUSE, OptcRepositoryService } from './optc-repository.service';

/*
 * 869f63gkm. Character search compares words, not punctuation. "Monkey D Luffy" found 0 cards and
 * "Monkey D. Luffy" 115; "Mr 1" 0 against 10. The names below are the shipped ones.
 */
const NAMES = [
  'Monkey D. Luffy - Gear 2',
  'Portgas D. Ace - Mt. Corvo\'s Brothers 3',
  'Mr. 1 (Daz Bonez) - Killing Machine',
  'Usopp-un - Hercules\u2019 Student',
  'Mohji & Richie',
  "Roronoa Zoro - Lion's Song",
  'Mr. 2 Bon Clay - Voyage Log: B.W.',
  'Trafalgar Law - Surgeon of Death',
];

describe('normalizeCharacterSearchText', () => {
  it('keeps the words and drops the punctuation between them', () => {
    expect(normalizeCharacterSearchText('Monkey D. Luffy - Gear 2')).toBe('monkey d luffy gear 2');
    expect(normalizeCharacterSearchText('Mohji & Richie')).toBe('mohji richie');
    expect(normalizeCharacterSearchText('logia-type / devil fruit user')).toBe(
      'logia type devil fruit user',
    );
    expect(normalizeCharacterSearchText('  Monkey  D.Luffy ')).toBe('monkey d luffy');
  });

  it('joins the letters around an apostrophe, whichever apostrophe it is', () => {
    expect(normalizeCharacterSearchText("Lion's Song")).toBe('lions song');
    expect(normalizeCharacterSearchText('Hercules\u2019 Student')).toBe('hercules student');
    expect(normalizeCharacterSearchText('Hercules\u2018 Student')).toBe('hercules student');
  });
});

describe('matchesCharacterSearchTerm', () => {
  const find = (query: string): string[] => {
    const term = toCharacterSearchTerm(query);

    return term ? NAMES.filter((name) => matchesCharacterSearchTerm(name, term)) : [...NAMES];
  };

  it('finds a card whatever punctuation the player typed', () => {
    expect(find('Monkey D Luffy')).toEqual(['Monkey D. Luffy - Gear 2']);
    expect(find('monkey d. luffy')).toEqual(['Monkey D. Luffy - Gear 2']);
    expect(find('Portgas D Ace')).toEqual(["Portgas D. Ace - Mt. Corvo's Brothers 3"]);
    expect(find('Mr 1')).toEqual(['Mr. 1 (Daz Bonez) - Killing Machine']);
    expect(find("Hercules' Student")).toEqual(['Usopp-un - Hercules\u2019 Student']);
    expect(find('lions song')).toEqual(["Roronoa Zoro - Lion's Song"]);
    expect(find('mohji richie')).toEqual(['Mohji & Richie']);
  });

  it('still finds nothing where there is nothing, and leaves the controls alone', () => {
    expect(find('Trafalgar Law')).toEqual(['Trafalgar Law - Surgeon of Death']);
    expect(find('luffy zoro')).toEqual([]);
    expect(find('Mr 3')).toEqual([]);
    // An empty or blank query asks for nothing and filters nothing.
    expect(toCharacterSearchTerm('   ')).toBeNull();
  });

  it('compares a query with no letter or digit as typed, so `&` still lists the pairs', () => {
    expect(toCharacterSearchTerm(' & ')).toEqual({ normalized: '', literal: '&' });
    expect(find('&')).toEqual(['Mohji & Richie']);
    expect(find(':')).toEqual(['Mr. 2 Bon Clay - Voyage Log: B.W.']);
  });

  it('finds every card it found before: every substring of every name still matches', () => {
    // The rule is only safe because it maps a substring to a substring. Checked exhaustively here
    // rather than argued: before 869f63gkm a query matched when the lower-cased name contained it.
    const misses: string[] = [];

    for (const name of NAMES) {
      for (let start = 0; start < name.length; start += 1) {
        for (let end = start + 1; end <= name.length; end += 1) {
          const query = name.slice(start, end);
          const term = toCharacterSearchTerm(query);

          if (term && !matchesCharacterSearchTerm(name, term)) {
            misses.push(`${JSON.stringify(query)} in ${JSON.stringify(name)}`);
          }
        }
      }
    }

    expect(misses).toEqual([]);
  });
});

describe('every character search reads the same words', () => {
  const records = NAMES.map((name, index) => createRecord(index + 1, name));

  it('on the Characters screen (the catalogue cache)', async () => {
    const cache = new CharacterCatalogCacheService(
      { getAllCharacters: async () => records } as never,
      { revision: () => 0 } as never,
      { activeRegionFilter: () => 'all' } as never,
    );
    const find = (searchTerm: string) =>
      cache
        .queryCharacters({ searchTerm, sortMode: 'idAsc', limit: 100, offset: 0 })
        .map((character) => character.id);

    await cache.ensureLoaded();

    expect(find('Monkey D Luffy')).toEqual([1]);
    expect(find('Mr 1')).toEqual([3]);
    expect(find("Hercules' Student")).toEqual([4]);
    expect(find('&')).toEqual([5]);
    expect(find('Trafalgar Law')).toEqual([8]);
  });

  it('on Captain Coverage (the result pass)', () => {
    const dataset = buildCaptainCoverageResultPassDataset(
      records,
      new Map(records.map((record) => [record.id, record])),
    );
    const find = (searchTerm: string) =>
      runCaptainCoverageResultPass(dataset, {
        captain: null,
        filterState: createCaptainCoverageFilterState(),
        characterBoxIds: null,
        typeFacet: createEmptyCharacterFacetSelection(),
        classFacet: createEmptyCharacterFacetSelection(),
        costRange: { min: null, max: null },
        favoritesOnly: false,
        hideFavorites: false,
        favoriteIds: [],
        characterTagSetSelection: createEmptyCharacterTagSetSelection(),
        requireSuperTandemPresence: false,
        requireSuperTypesClassesPresence: false,
        // The page trims and lower-cases before the pass, as it always has.
        searchTerm: searchTerm.trim().toLowerCase(),
        sortMode: 'catalog',
        idOrder: 'oldest',
      }).ids;

    expect(find('Portgas D Ace')).toEqual([2]);
    expect(find('Mr 1')).toEqual([3]);
    expect(find('&')).toEqual([5]);
  });
});

describe('the SQL search reads the same words, on both of the loader\u2019s paths', () => {
  const SCHEMA = readSeedSchema();

  it.each<DatasetDatabaseSource>(['database-file', 'seed-statements'])(
    'registers optc_search_text when the database comes from %s',
    async (source) => {
      const database = await openThroughLoader(source);

      try {
        const found = database.exec(
          `SELECT id FROM characters c WHERE ${CHARACTER_SEARCH_TEXT_LIKE_CLAUSE} ORDER BY id`,
          ['monkey d luffy'],
        );

        expect((found[0]?.values ?? []).map(([id]) => Number(id))).toEqual([1]);
      } finally {
        database.close();
      }
    },
  );

  it('gives Character Boxes the same cards with and without a local override', async () => {
    const database = await openThroughLoader('database-file');

    try {
      for (const query of ['Monkey D Luffy', 'Mr 1', "Hercules' Student", '&', 'Trafalgar Law']) {
        const sqlIds = await searchIds(database, query, new Map());
        // One override is all it takes to switch the repository to its in-memory path.
        const memoryIds = await searchIds(database, query, new Map([[999999, {}]]));

        expect(memoryIds).toEqual(sqlIds);
        expect(sqlIds.length).toBeGreaterThan(0);
      }

      expect(await searchIds(database, 'Monkey D Luffy', new Map())).toEqual([1]);
      expect(await searchIds(database, '&', new Map())).toEqual([5]);
    } finally {
      database.close();
    }
  });

  /** The seed's own CREATE TABLE statements, and one row per name above. */
  function buildSeed(): string {
    const rows = NAMES.map((name, index) => {
      const id = index + 1;
      const quoted = (value: string) => `'${value.replace(/'/gu, "''")}'`;

      return [
        `INSERT INTO characters (id, name, is_incomplete, type, primary_class, classes_json, stars, stars_label, cost, combo, region_json, region_release_json, assets_json, search_text, families_json) VALUES (${id}, ${quoted(name)}, 0, 'STR', 'Fighter', '["Fighter"]', 5, '5', 30, 4, '{}', '{}', '{}', ${quoted(`${name.toLowerCase()} str fighter`)}, '[]');`,
        `INSERT INTO character_details (character_id, detail_json) VALUES (${id}, '{}');`,
      ].join('\n');
    });

    return `${SCHEMA}\n${rows.join('\n')}\n`;
  }

  async function openThroughLoader(source: DatasetDatabaseSource): Promise<Database> {
    const initSqlJs = (await import('sql.js')).default;
    const SQL: SqlJsStatic = await initSqlJs();
    const seed = buildSeed();
    const built = new SQL.Database();

    built.run(seed);

    const file = gzipSync(new Uint8Array((built as unknown as { export(): Uint8Array }).export()));

    built.close();

    const loaded = await loadDatasetDatabase({
      sql: SQL,
      fetch: async (path) =>
        path === DATASET_SEED_PATH
          ? response(200, new TextEncoder().encode(seed))
          : path === DATASET_DATABASE_PATH && source === 'database-file'
            ? response(200, file)
            : response(404, new Uint8Array()),
      decompressionStream: source === 'database-file' ? DecompressionStream : undefined,
      yieldToMainThread: async () => undefined,
      warn: () => undefined,
    });

    expect(loaded.source).toBe(source);

    return loaded.database;
  }

  async function searchIds(
    database: Database,
    searchTerm: string,
    overridesByCharacterId: Map<number, unknown>,
  ): Promise<number[]> {
    const service = Object.create(OptcRepositoryService.prototype) as OptcRepositoryService;

    Object.assign(service, {
      databasePromise: Promise.resolve(database),
      userState: { activeRegionFilter: () => 'all' },
      characterOverrides: {
        ready: async () => undefined,
        revision: () => overridesByCharacterId.size,
        overridesByCharacterId: () => overridesByCharacterId,
      },
      getDatasetManifest: async () => ({ packs: [] }) as unknown as DatasetManifest,
    });

    const records = await service.searchDetailedCharacters({
      searchTerm,
      selectedTypes: [],
      selectedClasses: [],
      sortMode: 'idAsc',
      limit: 100,
      offset: 0,
    });

    return records.map((record) => record.id);
  }
});

function readSeedSchema(): string {
  const seed = readFileSync(resolve(process.cwd(), 'public/assets/data/optc-seed.sql'), 'utf8');

  return seed.slice(0, seed.indexOf('INSERT INTO'));
}

function response(status: number, bytes: Uint8Array): DatasetDatabaseFetchResponse {
  return {
    ok: status >= 200 && status < 300,
    status,
    arrayBuffer: async () => new Uint8Array(bytes).buffer,
    text: async () => new TextDecoder().decode(bytes),
  };
}

function createRecord(id: number, name: string): CharacterDetailRecord {
  return {
    id,
    name,
    searchText: `${name.toLowerCase()} str fighter`,
    isIncomplete: false,
    type: 'STR',
    classes: ['Fighter'],
    primaryClass: 'Fighter',
    secondaryClass: null,
    stars: 5,
    cost: 30,
    combo: 4,
    captainHpBoost: 0,
    captainAtkBoost: 0,
    captainAverageBoost: 0,
    stats: {
      min: { hp: null, atk: null, rcv: null },
      max: { hp: null, atk: null, rcv: null },
      growth: null,
    },
    regionArtwork: { exactLocal: false, thumbnailGlobal: false, thumbnailJapan: false },
    regionRelease: { availableOnGlobal: null },
    assets: { exactLocal: null, thumbnailGlobal: null, thumbnailJapan: null },
    imageUrl: 'assets/placeholders/character-card.svg',
    detailImageUrl: 'assets/placeholders/character-card.svg',
    detail: {
      characterId: id,
      captainAbility: null,
      captainAbilityVariants: [],
      captainNotes: null,
      specialName: null,
      specialText: null,
      specialNotes: null,
      superSpecialText: null,
      superSpecialCriteriaText: null,
      superSpecialNotes: null,
      superSpecialCriteria: null,
      partyConflictKeys: [],
      characterTags: [],
      builderAbilities: [],
      sailorAbilities: [],
      sailorNotes: null,
      potentialAbilities: [],
      supportData: [],
      swapData: null,
      vsSpecial: null,
      superType: null,
      superClass: null,
      rumbleData: null,
    },
  } satisfies CharacterDetailRecord;
}
