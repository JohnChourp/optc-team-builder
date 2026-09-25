import '@angular/compiler';
import { describe, expect, it } from 'vitest';

import {
  type CharacterDetailRecord,
  type CharacterIdOrder,
} from '../models/optc.models';
import { createCaptainCoverageFilterState } from './captain-coverage-filter.utils';
import {
  buildCaptainCoverageResultPassDataset,
  runCaptainCoverageResultPass,
} from './captain-coverage-result-pass.utils';
import { CharacterCatalogCacheService } from './character-catalog-cache.service';
import { createEmptyCharacterFacetSelection } from './character-facet-filter.utils';
import { compareCharacterNamesNoCase } from './character-name-order.utils';
import { createEmptyCharacterTagSetSelection } from './character-tag-set.utils';
import { OptcRepositoryService } from './optc-repository.service';

/*
 * 869f6td2q. "Name A→Z" had two orders: the SQL path's `COLLATE NOCASE` and a collator everywhere
 * else, 1,063 of 4,622 positions apart. Every in-memory path now uses `compareCharacterNamesNoCase`,
 * and this file holds it to the real thing - a SQLite engine, not a re-typed idea of one.
 *
 * The names are the shapes that moved: real roster names with `&`, `-`, `:`, `'`, a leading `"`, a
 * `VS`, and the one name in the dataset with a character outside ASCII (`’`). Three more stand in
 * for what a reader can type into a local override: an accented capital and its small letter (which
 * NOCASE does NOT fold), a case-only twin (which it does), and an emoji beside a full-width `!` -
 * the pair a plain UTF-16 compare puts in the opposite order to SQLite.
 */
const HARD_CASES: ReadonlyArray<readonly [number, string]> = [
  [101, '"Buddha" Sengoku - Supreme Commander of the Navy'],
  [102, 'Ace & Sabo - Raging Flame and Dragon'],
  [103, "Ace - Delinquent Kids' Christmas"],
  [104, 'Ace VS Akainu - Clashing Explosion'],
  [105, 'Ace vs. Akainu'],
  [106, "Brook - Straw Hat Pirates' Attack"],
  [107, 'Brook - Straw Hat Pirates: Born Again'],
  [108, "Buggy's Delivery"],
  [109, 'Buggy: Mischievous Jester - Happy Spooky Halloween!'],
  [110, 'Usopp-un - Hercules\u2019 Student'],
  [111, 'Usopp - Tabasco Star'],
  [112, 'P\u00e9dro'],
  [113, 'Pez'],
  [114, 'Pedro'],
  [115, 'luffy'],
  [116, 'Luffy'],
  [117, 'Luffy \uff01'],
  [118, 'Luffy \u{1F600}'],
  [120, '\u00c9mile'],
  [121, '\u00e9mile'],
];

const ORDERS: ReadonlyArray<readonly ['nameAsc' | 'nameDesc', CharacterIdOrder]> = [
  ['nameAsc', 'newest'],
  ['nameAsc', 'oldest'],
  ['nameDesc', 'newest'],
  ['nameDesc', 'oldest'],
];

/** The order a real SQLite engine gives, with the tie-break the repository's clause adds. */
async function sqliteOrder(
  sortMode: 'nameAsc' | 'nameDesc',
  idOrder: CharacterIdOrder,
): Promise<number[]> {
  const initSqlJs = (await import('sql.js')).default;
  const SQL = await initSqlJs();
  const database = new SQL.Database();

  try {
    database.run('CREATE TABLE characters (id INTEGER PRIMARY KEY, name TEXT NOT NULL);');

    for (const [id, name] of HARD_CASES) {
      database.exec('INSERT INTO characters (id, name) VALUES (?, ?);', [id, name]);
    }

    const result = database.exec(
      `SELECT id FROM characters ORDER BY name COLLATE NOCASE ${
        sortMode === 'nameAsc' ? 'ASC' : 'DESC'
      }, id ${idOrder === 'oldest' ? 'ASC' : 'DESC'}`,
    );

    return (result[0]?.values ?? []).map(([id]) => Number(id));
  } finally {
    database.close();
  }
}

function sortInMemory(
  compare: (left: string, right: string) => number,
  sortMode: 'nameAsc' | 'nameDesc',
  idOrder: CharacterIdOrder,
): number[] {
  return [...HARD_CASES]
    .sort(([leftId, leftName], [rightId, rightName]) => {
      const nameDifference =
        sortMode === 'nameAsc' ? compare(leftName, rightName) : compare(rightName, leftName);

      return nameDifference || (idOrder === 'oldest' ? leftId - rightId : rightId - leftId);
    })
    .map(([id]) => id);
}

describe('compareCharacterNamesNoCase', () => {
  it('orders the hard cases exactly as SQLite NOCASE does, in both directions', async () => {
    for (const [sortMode, idOrder] of ORDERS) {
      expect(sortInMemory(compareCharacterNamesNoCase, sortMode, idOrder)).toEqual(
        await sqliteOrder(sortMode, idOrder),
      );
    }
  });

  it('disagrees with the collator it replaced on these names, so the case above can fail', async () => {
    // The control. Were the collator to agree here, the assertion above would prove nothing.
    const collator = (left: string, right: string) =>
      left.localeCompare(right, undefined, { sensitivity: 'base' });

    expect(sortInMemory(collator, 'nameAsc', 'newest')).not.toEqual(
      await sqliteOrder('nameAsc', 'newest'),
    );
  });

  it('folds the ASCII capitals and nothing else', () => {
    expect(compareCharacterNamesNoCase('LUFFY', 'luffy')).toBe(0);
    expect(compareCharacterNamesNoCase('Ace VS Akainu', 'Ace vs Akainu')).toBe(0);
    // NOCASE leaves an accented capital alone: `É` is U+00C9 and sorts before `é`, U+00E9.
    expect(compareCharacterNamesNoCase('\u00c9mile', '\u00e9mile')).toBeLessThan(0);
    // `&` (0x26) before `-` (0x2D): the pair that moved most often in the roster.
    expect(
      compareCharacterNamesNoCase('Ace & Sabo', "Ace - Delinquent Kids' Christmas"),
    ).toBeLessThan(0);
  });

  it('puts a character above U+FFFF after the rest of the BMP, as a byte compare does', () => {
    expect(compareCharacterNamesNoCase('Luffy \uff01', 'Luffy \u{1F600}')).toBeLessThan(0);
    expect(compareCharacterNamesNoCase('Luffy \u{1F600}', 'Luffy \uff01')).toBeGreaterThan(0);
  });
});

describe('every in-memory "Name A→Z" gives the SQL order', () => {
  it('on the Characters screen (the catalogue cache)', async () => {
    const records = createRecords();
    const cache = new CharacterCatalogCacheService(
      { getAllCharacters: async () => records } as never,
      { revision: () => 0 } as never,
      { activeRegionFilter: () => 'all' } as never,
    );

    await cache.ensureLoaded();

    for (const [sortMode, idOrder] of ORDERS) {
      const ids = cache
        .queryCharacters({ searchTerm: '', sortMode, idOrder, limit: 100, offset: 0 })
        .map((character) => character.id);

      expect(ids).toEqual(await sqliteOrder(sortMode, idOrder));
    }
  });

  it('on Character Boxes once the reader has saved a local override', async () => {
    const records = createRecords();
    const service = Object.create(OptcRepositoryService.prototype) as OptcRepositoryService;

    // One override is all it takes to switch `searchDetailedCharacters` to its in-memory path.
    Object.assign(service, {
      userState: { activeRegionFilter: () => 'all' },
      characterOverrides: {
        ready: async () => undefined,
        revision: () => 1,
        overridesByCharacterId: () => new Map([[116, {}]]),
      },
      getDetailedCharacterCatalog: async () => records,
    });

    for (const [sortMode, idOrder] of ORDERS) {
      const ids = (
        await service.searchDetailedCharacters({
          searchTerm: '',
          selectedTypes: [],
          selectedClasses: [],
          sortMode,
          idOrder,
          limit: 100,
          offset: 0,
        })
      ).map((record) => record.id);

      expect(ids).toEqual(await sqliteOrder(sortMode, idOrder));
    }
  });

  it('on Captain Coverage (the result pass)', async () => {
    const records = createRecords();
    const dataset = buildCaptainCoverageResultPassDataset(
      records,
      new Map(records.map((record) => [record.id, record])),
    );

    for (const [sortMode, idOrder] of ORDERS) {
      const { ids } = runCaptainCoverageResultPass(dataset, {
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
        searchTerm: '',
        sortMode,
        idOrder,
      });

      expect(ids).toEqual(await sqliteOrder(sortMode, idOrder));
    }
  });
});

function createRecords(): CharacterDetailRecord[] {
  return HARD_CASES.map(([id, name]) => createRecord(id, name));
}

function createRecord(id: number, name: string): CharacterDetailRecord {
  return {
    id,
    name,
    searchText: name.toLowerCase(),
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
