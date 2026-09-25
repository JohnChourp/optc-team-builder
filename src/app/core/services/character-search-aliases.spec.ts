import '@angular/compiler';
import { signal } from '@angular/core';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { gzipSync } from 'node:zlib';

import type { Database, SqlJsStatic } from 'sql.js';
import { describe, expect, it, vi } from 'vitest';

import { type RumbleUnitScore } from '../models/auto-team-builder-rumble.models';
import { type CharacterDetailRecord, type DatasetManifest } from '../models/optc.models';
import { AutoTeamBuilderRumblePage } from '../../pages/auto-team-builder-rumble/auto-team-builder-rumble.page';
import { ManualTeamBuilderPage } from '../../pages/manual-team-builder/manual-team-builder.page';
import { RumbleCharactersPage } from '../../pages/rumble-characters/rumble-characters.page';
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
import {
  CHARACTER_SEARCH_TEXT_LIKE_CLAUSE,
  OptcRepositoryService,
} from './optc-repository.service';

vi.mock('@ionic/angular', () => ({
  IonIcon: class {},
  IonInput: class {},
  IonModal: class {},
  IonSearchbar: class {},
  IonSelect: class {},
  IonTextarea: class {},
  IonToggle: class {},
}));
vi.mock('@ionic/angular/ion-button', () => ({ IonButton: class {} }));
vi.mock('@ionic/angular/ion-buttons', () => ({ IonButtons: class {} }));
vi.mock('@ionic/angular/ion-content', () => ({ IonContent: class {} }));
vi.mock('@ionic/angular/ion-footer', () => ({ IonFooter: class {} }));
vi.mock('@ionic/angular/ion-header', () => ({ IonHeader: class {} }));
vi.mock('@ionic/angular/ion-menu-button', () => ({ IonMenuButton: class {} }));
vi.mock('@ionic/angular/ion-select-option', () => ({ IonSelectOption: class {} }));
vi.mock('@ionic/angular/ion-spinner', () => ({ IonSpinner: class {} }));
vi.mock('@ionic/angular/ion-title', () => ({ IonTitle: class {} }));
vi.mock('@ionic/angular/ion-toolbar', () => ({ IonToolbar: class {} }));

/*
 * 869f63gkm. Search finds a unit by the names players use for it - upstream's `aliases.js`, in the
 * `search_aliases` column - on every screen that searches characters, by the same rule as its name.
 * Of 5,893 Latin alias strings of shipped units, 294 found their unit before the import and 5,892
 * after it (the one left is part Japanese). The rows below carry the brief's own examples.
 */
const UNITS: ReadonlyArray<readonly [number, string, string]> = [
  [1, '"Dark King" Silvers Rayleigh - Old Soldier', 'v2 legend rayleigh'],
  [2, 'Blackbeard - Darkness Writhing in Hell', 'marshall d. teach'],
  [3, 'Charlotte Katakuri - General Barring the Way', 'story katakuri'],
  [4, 'Trafalgar Law - Surgeon of Death', ''],
  // An alias with a symbol the name lacks: a query of nothing but `&` is compared as typed.
  [5, 'Monkey D. Luffy - Gear 2', 'luffy & ace'],
];

/** Each query, and the unit it must find - by an alias for 1, 2, 3 and 5, by its name for 4. */
const QUERIES: ReadonlyArray<readonly [string, number[]]> = [
  ['V2 Legend Rayleigh', [1]],
  ['Marshall D Teach', [2]],
  ['marshall d. teach', [2]],
  ['Story Katakuri', [3]],
  ['Trafalgar Law', [4]],
  ['&', [5]],
  ['nobody at all', []],
];

const records = UNITS.map(([id, name, searchAliases]) => createRecord(id, name, searchAliases));

function expectEveryQuery(find: (query: string) => number[]): void {
  for (const [query, ids] of QUERIES) {
    expect(find(query), query).toEqual(ids);
  }
}

describe('every character search finds a unit by its community names', () => {
  it('on the Characters screen (the catalogue cache)', async () => {
    const cache = new CharacterCatalogCacheService(
      { getAllCharacters: async () => records } as never,
      { revision: () => 0 } as never,
      { activeRegionFilter: () => 'all' } as never,
    );

    await cache.ensureLoaded();

    expectEveryQuery((searchTerm) =>
      cache
        .queryCharacters({ searchTerm, sortMode: 'idAsc', limit: 100, offset: 0 })
        .map((character) => character.id),
    );
  });

  it('on Captain Coverage (the result pass)', () => {
    const dataset = buildCaptainCoverageResultPassDataset(
      records,
      new Map(records.map((record) => [record.id, record])),
    );

    expectEveryQuery(
      (searchTerm) =>
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
          searchTerm: searchTerm.trim().toLowerCase(),
          sortMode: 'catalog',
          idOrder: 'oldest',
        }).ids,
    );
  });

  it("on Manual Team Builder's tag-filtered list", async () => {
    const page = new ManualTeamBuilderPage(
      { favoriteShipIds: signal<number[]>([]) } as never,
      { getDetailedCharacterCatalog: async () => records } as never,
      { translate: (key: string) => key } as never,
      {} as never,
      {} as never,
    );
    const load = page as unknown as {
      loadTagFilteredCandidates(allowed: number[] | undefined): Promise<CharacterDetailRecord[]>;
    };

    for (const [query, ids] of QUERIES) {
      page.searchTerm.set(query);

      const found = await load.loadTagFilteredCandidates(undefined);

      expect(found.map((character) => character.id).sort(), query).toEqual(ids);
    }
  });

  it('on the Rumble characters screen', () => {
    const page = new RumbleCharactersPage(
      {} as never,
      {} as never,
      { favoriteCharacterIds: signal<number[]>([]) } as never,
      { translate: (key: string) => key } as never,
    );
    const search = page as unknown as {
      matchesSearch(character: CharacterDetailRecord, reasonChips: string[]): boolean;
    };

    expectEveryQuery((query) => {
      page.searchTerm.set(query);

      return records
        .filter((record) => search.matchesSearch(record, []))
        .map((record) => record.id);
    });
  });

  it("in the Rumble builder's character picker", () => {
    const page = new AutoTeamBuilderRumblePage(
      {} as never,
      {} as never,
      {
        savedRumbleOpponents: signal([]),
        favoriteCharacterIds: signal<number[]>([]),
        characterBoxes: signal([]),
        autoTeamBuilderWorkerPreference: signal({ mode: 'auto', manualCount: 1 }),
        resolveAutoTeamBuilderWorkerPreference: () => ({ manualMaxCount: 1 }),
      } as never,
      { translate: (key: string) => key } as never,
      {} as never,
      {} as never,
    );

    page.manualPickerCandidates.set(
      records.map(
        (character) =>
          ({
            character,
            normalized: {},
            baseScore: 0,
            breakdown: {},
            reasonChips: [],
            conflictKeys: [],
          }) as unknown as RumbleUnitScore,
      ),
    );

    expectEveryQuery((query) => {
      page.manualPickerSearchTerm.set(query);

      return page.manualPickerResults().map((candidate) => candidate.character.id);
    });
  });
});

describe('the SQL search reads the community names too, on both of the loader’s paths', () => {
  it.each<DatasetDatabaseSource>(['database-file', 'seed-statements'])(
    'finds a unit by its alias when the database comes from %s',
    async (source) => {
      const database = await openThroughLoader(source);

      try {
        const found = database.exec(
          `SELECT id FROM characters c WHERE ${CHARACTER_SEARCH_TEXT_LIKE_CLAUSE} ORDER BY id`,
          ['v2 legend rayleigh'],
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
      for (const [query, ids] of QUERIES) {
        const sqlIds = await searchIds(database, query, new Map());
        // One override is all it takes to switch the repository to its in-memory path.
        const memoryIds = await searchIds(database, query, new Map([[999999, {}]]));

        expect(sqlIds, query).toEqual(ids);
        expect(memoryIds, query).toEqual(ids);
      }
    } finally {
      database.close();
    }
  });
});

describe('the community names are searched, never shown', () => {
  it('no template binds them', () => {
    const templates = listFiles(resolve(process.cwd(), 'src/app'), '.html');

    // The control: the walk reaches the templates that show a character's name.
    expect(templates.some((file) => file.endsWith('character-detail.page.html'))).toBe(true);
    expect(
      templates.filter((file) => readFileSync(file, 'utf8').includes('searchAliases')),
    ).toEqual([]);
  });
});

function listFiles(directory: string, extension: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);

    return statSync(path).isDirectory()
      ? listFiles(path, extension)
      : path.endsWith(extension)
        ? [path]
        : [];
  });
}

/** The committed seed's own CREATE TABLE statements, and one row per unit above. */
function buildSeed(): string {
  const seed = readFileSync(resolve(process.cwd(), 'public/assets/data/optc-seed.sql'), 'utf8');
  const schema = seed.slice(0, seed.indexOf('INSERT INTO'));
  const quoted = (value: string) => `'${value.replace(/'/gu, "''")}'`;
  const rows = UNITS.map(([id, name, searchAliases]) =>
    [
      `INSERT INTO characters (id, name, is_incomplete, type, primary_class, classes_json, stars, stars_label, cost, combo, region_json, region_release_json, assets_json, search_text, families_json, search_aliases) VALUES (${id}, ${quoted(name)}, 0, 'STR', 'Fighter', '["Fighter"]', 5, '5', 30, 4, '{}', '{}', '{}', ${quoted(`${name.toLowerCase()} str fighter`)}, '[]', ${quoted(searchAliases)});`,
      `INSERT INTO character_details (character_id, detail_json) VALUES (${id}, '{}');`,
    ].join('\n'),
  );

  return `${schema}\n${rows.join('\n')}\n`;
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

  const found = await service.searchDetailedCharacters({
    searchTerm,
    selectedTypes: [],
    selectedClasses: [],
    sortMode: 'idAsc',
    limit: 100,
    offset: 0,
  });

  return found.map((record) => record.id);
}

function response(status: number, bytes: Uint8Array): DatasetDatabaseFetchResponse {
  return {
    ok: status >= 200 && status < 300,
    status,
    arrayBuffer: async () => new Uint8Array(bytes).buffer,
    text: async () => new TextDecoder().decode(bytes),
  };
}

function createRecord(id: number, name: string, searchAliases: string): CharacterDetailRecord {
  return {
    id,
    name,
    searchText: `${name.toLowerCase()} str fighter`,
    searchAliases,
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
