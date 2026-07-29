import { describe, expect, it, vi } from 'vitest';

import { type CharacterListItem } from '../models/optc.models';
import { CharacterCatalogCacheService } from './character-catalog-cache.service';

describe('CharacterCatalogCacheService', () => {
  it('loads the full catalog only once even when ensureLoaded is called concurrently', async () => {
    let overrideRevision = 0;
    let resolveCatalog!: (catalog: CharacterListItem[]) => void;
    const repository = {
      getAllCharacters: vi.fn(
        () =>
          new Promise<CharacterListItem[]>((resolve) => {
            resolveCatalog = resolve;
          }),
      ),
    };
    const service = new CharacterCatalogCacheService(
      repository as never,
      {
        revision: () => overrideRevision,
      } as never,
    );

    const firstLoad = service.ensureLoaded();
    const secondLoad = service.ensureLoaded();

    expect(repository.getAllCharacters).toHaveBeenCalledOnce();
    expect(service.loading()).toBe(true);

    resolveCatalog([createCharacter(101), createCharacter(202)]);
    await Promise.all([firstLoad, secondLoad]);

    expect(service.loaded()).toBe(true);
    expect(service.loading()).toBe(false);
    expect(service.catalog().map((character) => character.id)).toEqual([101, 202]);
  });

  it('keeps the catalog warm across repeated queries without resetting it', async () => {
    let overrideRevision = 0;
    const repository = {
      getAllCharacters: vi.fn().mockResolvedValue([createCharacter(101), createCharacter(202)]),
    };
    const service = new CharacterCatalogCacheService(
      repository as never,
      {
        revision: () => overrideRevision,
      } as never,
    );

    await service.ensureLoaded();
    const firstCatalogRef = service.catalog();

    expect(
      service.queryCharacters({
        searchTerm: '',
        limit: 10,
        offset: 0,
      }),
    ).toHaveLength(2);
    expect(
      service
        .queryCharacters({
          searchTerm: '202',
          limit: 10,
          offset: 0,
        })
        .map((character) => character.id),
    ).toEqual([202]);
    expect(service.catalog()).toBe(firstCatalogRef);
    expect(repository.getAllCharacters).toHaveBeenCalledOnce();
  });

  it('matches filtering and pagination semantics for cached character queries', async () => {
    let overrideRevision = 0;
    const repository = {
      getAllCharacters: vi.fn().mockResolvedValue([
        createCharacter(401, {
          name: 'Luffy Base',
          type: 'DEX,INT',
          primaryClass: 'Fighter',
          classes: ['Fighter', 'Slasher'],
        }),
        createCharacter(305, {
          name: 'Zoro',
          type: 'DEX',
          primaryClass: 'Slasher',
          classes: ['Slasher'],
        }),
        createCharacter(299, {
          name: 'Nami',
          type: 'PSY',
          primaryClass: 'Shooter',
          classes: ['Shooter'],
        }),
      ]),
    };
    const service = new CharacterCatalogCacheService(
      repository as never,
      {
        revision: () => overrideRevision,
      } as never,
    );

    await service.ensureLoaded();

    expect(
      service
        .queryCharacters({
          searchTerm: 'luffy',
          limit: 10,
          offset: 0,
        })
        .map((character) => character.id),
    ).toEqual([401]);
    expect(
      service
        .queryCharacters({
          searchTerm: '',
          typeFacet: { values: ['DEX'], matchMode: 'any' },
          limit: 10,
          offset: 0,
        })
        .map((character) => character.id),
    ).toEqual([401, 305]);
    expect(
      service
        .queryCharacters({
          searchTerm: '',
          classFacet: { values: ['Slasher'], matchMode: 'any' },
          limit: 10,
          offset: 0,
        })
        .map((character) => character.id),
      // 401 carries Slasher as its SECOND entry in `classes` while its
      // primary/secondary pair only names Fighter. The old primary/secondary
      // read dropped it; the shared predicate reads the full array.
    ).toEqual([401, 305]);
    expect(
      service
        .queryCharacters({
          searchTerm: '',
          allowedCharacterIds: [305, 299],
          excludedCharacterIds: [299],
          limit: 1,
          offset: 0,
        })
        .map((character) => character.id),
    ).toEqual([305]);
    expect(
      service
        .queryCharacters({
          searchTerm: '',
          limit: 1,
          offset: 1,
        })
        .map((character) => character.id),
    ).toEqual([305]);
    expect(
      service.queryCharacters({
        searchTerm: '',
        allowedCharacterIds: [],
        limit: 10,
        offset: 0,
      }),
    ).toEqual([]);
  });

  it('sorts cached character queries before applying pagination', async () => {
    let overrideRevision = 0;
    const repository = {
      getAllCharacters: vi
        .fn()
        .mockResolvedValue([
          createCharacter(300, { name: 'Zoro' }),
          createCharacter(100, { name: 'Luffy' }),
          createCharacter(200, { name: 'Ace' }),
          createCharacter(400, { name: 'Brook' }),
        ]),
    };
    const service = new CharacterCatalogCacheService(
      repository as never,
      {
        revision: () => overrideRevision,
      } as never,
    );

    await service.ensureLoaded();

    expect(
      service
        .queryCharacters({
          searchTerm: '',
          sortMode: 'catalog',
          limit: 10,
          offset: 0,
        })
        .map((character) => character.id),
    ).toEqual([400, 300, 200, 100]);
    expect(
      service
        .queryCharacters({
          searchTerm: '',
          sortMode: 'catalog',
          idOrder: 'oldest',
          limit: 2,
          offset: 1,
        })
        .map((character) => character.id),
    ).toEqual([200, 300]);
    expect(
      service
        .queryCharacters({
          searchTerm: '',
          sortMode: 'nameAsc',
          limit: 2,
          offset: 1,
        })
        .map((character) => character.id),
    ).toEqual([400, 100]);
    expect(
      service
        .queryCharacters({
          searchTerm: '',
          sortMode: 'nameDesc',
          limit: 10,
          offset: 0,
        })
        .map((character) => character.id),
    ).toEqual([300, 100, 400, 200]);
    expect(
      service
        .queryCharacters({
          searchTerm: '',
          sortMode: 'idAsc',
          limit: 10,
          offset: 0,
        })
        .map((character) => character.id),
    ).toEqual([100, 200, 300, 400]);
    expect(
      service
        .queryCharacters({
          searchTerm: '',
          sortMode: 'idDesc',
          limit: 10,
          offset: 0,
        })
        .map((character) => character.id),
    ).toEqual([400, 300, 200, 100]);
  });

  it('sorts cached character queries by captain boost metrics', async () => {
    const repository = {
      getAllCharacters: vi.fn().mockResolvedValue([
        createCharacter(100, { captainHpBoost: 1.5, captainAtkBoost: 5, captainAverageBoost: 3.25 }),
        createCharacter(300, { captainHpBoost: 1.2, captainAtkBoost: 6, captainAverageBoost: 3.6 }),
        createCharacter(400, { captainHpBoost: 1.8, captainAtkBoost: 4, captainAverageBoost: 2.9 }),
        createCharacter(200, { captainHpBoost: 1.8, captainAtkBoost: 4, captainAverageBoost: 2.9 }),
      ]),
    };
    const service = new CharacterCatalogCacheService(
      repository as never,
      { revision: () => 0 } as never,
    );

    await service.ensureLoaded();

    const baseQuery = {
      searchTerm: '',
      limit: 10,
      offset: 0,
    };

    expect(
      service.queryCharacters({ ...baseQuery, sortMode: 'captainHpBoost' }).map((character) => character.id),
    ).toEqual([400, 200, 100, 300]);
    expect(
      service
        .queryCharacters({ ...baseQuery, sortMode: 'captainHpBoost', idOrder: 'oldest' })
        .map((character) => character.id),
    ).toEqual([200, 400, 100, 300]);
    expect(
      service.queryCharacters({ ...baseQuery, sortMode: 'captainAtkBoost' }).map((character) => character.id),
    ).toEqual([300, 100, 400, 200]);
    expect(
      service
        .queryCharacters({ ...baseQuery, sortMode: 'captainAverageBoost' })
        .map((character) => character.id),
    ).toEqual([300, 100, 400, 200]);
  });

  it('returns characters by id while preserving the input order', async () => {
    let overrideRevision = 0;
    const repository = {
      getAllCharacters: vi
        .fn()
        .mockResolvedValue([createCharacter(401), createCharacter(305), createCharacter(299)]),
    };
    const service = new CharacterCatalogCacheService(
      repository as never,
      {
        revision: () => overrideRevision,
      } as never,
    );

    await service.ensureLoaded();

    expect(
      service.getCharactersByIds([299, 401, 999, 305]).map((character) => character.id),
    ).toEqual([299, 401, 305]);
  });

  it('matches linked variants by shared canonical-id search text in cached queries', async () => {
    let overrideRevision = 0;
    const repository = {
      getAllCharacters: vi.fn().mockResolvedValue([
        createCharacter(4529, {
          name: 'Clashing Blades Roronoa Zoro',
          searchText: 'clashing blades roronoa zoro dex free spirit slasher 4529',
        }),
        createCharacter(900005, {
          name: 'Clashing Blades St. Ethanbaron V. Nusjuro',
          type: 'STR',
          primaryClass: 'Cerebral',
          secondaryClass: 'Slasher',
          classes: ['Cerebral', 'Slasher'],
          searchText:
            'clashing blades st. ethanbaron v. nusjuro str cerebral slasher 900005 4529 st ethanbaron v nusjuro',
        }),
      ]),
    };
    const service = new CharacterCatalogCacheService(
      repository as never,
      {
        revision: () => overrideRevision,
      } as never,
    );

    await service.ensureLoaded();

    expect(
      service
        .queryCharacters({
          searchTerm: '4529',
          limit: 10,
          offset: 0,
        })
        .map((character) => character.id),
    ).toEqual([900005, 4529]);
  });

  it('matches dual-type characters for either selected type in any mode', async () => {
    const service = await createFacetService();

    expect(
      service
        .queryCharacters({
          searchTerm: '',
          typeFacet: { values: ['QCK'], matchMode: 'any' },
          limit: 10,
          offset: 0,
        })
        .map((character) => character.id),
      // 701 stores 'STR,QCK' and 702 stores 'QCK,STR' — the same pair, both orders.
    ).toEqual([703, 702, 701]);
    expect(
      service
        .queryCharacters({
          searchTerm: '',
          typeFacet: { values: ['STR'], matchMode: 'any' },
          limit: 10,
          offset: 0,
        })
        .map((character) => character.id),
    ).toEqual([702, 701]);
  });

  it('requires both selected types in all mode', async () => {
    const service = await createFacetService();

    expect(
      service
        .queryCharacters({
          searchTerm: '',
          typeFacet: { values: ['STR', 'QCK'], matchMode: 'all' },
          limit: 10,
          offset: 0,
        })
        .map((character) => character.id),
    ).toEqual([702, 701]);
    expect(
      service
        .queryCharacters({
          searchTerm: '',
          typeFacet: { values: ['STR', 'INT'], matchMode: 'all' },
          limit: 10,
          offset: 0,
        })
        .map((character) => character.id),
    ).toEqual([]);
  });

  it('matches a class from the full classes array, not only primary and secondary', async () => {
    const service = await createFacetService();

    expect(
      service
        .queryCharacters({
          searchTerm: '',
          classFacet: { values: ['Cerebral'], matchMode: 'any' },
          limit: 10,
          offset: 0,
        })
        .map((character) => character.id),
      // 704 is a three-class local override: Cerebral is only in `classes`.
    ).toEqual([704]);
  });

  it('returns nothing for an all-mode selection of three classes only because the mode is demoted', async () => {
    const service = await createFacetService();

    expect(
      service
        .queryCharacters({
          searchTerm: '',
          // Demoted to `any` by the boundary normalizer, so this is NOT an empty result.
          classFacet: { values: ['Fighter', 'Slasher', 'Cerebral'], matchMode: 'all' },
          limit: 10,
          offset: 0,
        })
        .map((character) => character.id),
    ).toEqual([704, 703, 702, 701]);
    expect(
      service
        .queryCharacters({
          searchTerm: '',
          classFacet: { values: ['Fighter', 'Cerebral'], matchMode: 'all' },
          limit: 10,
          offset: 0,
        })
        .map((character) => character.id),
    ).toEqual([704]);
  });

  it('applies no filter for an omitted or empty facet', async () => {
    const service = await createFacetService();

    expect(
      service
        .queryCharacters({ searchTerm: '', limit: 10, offset: 0 })
        .map((character) => character.id),
    ).toEqual([704, 703, 702, 701]);
    expect(
      service
        .queryCharacters({
          searchTerm: '',
          typeFacet: { values: ['   '], matchMode: 'all' },
          classFacet: { values: [], matchMode: 'all' },
          limit: 10,
          offset: 0,
        })
        .map((character) => character.id),
    ).toEqual([704, 703, 702, 701]);
  });

  it('filters before sorting and slicing', async () => {
    const service = await createFacetService();

    expect(
      service
        .queryCharacters({
          searchTerm: '',
          typeFacet: { values: ['QCK'], matchMode: 'any' },
          sortMode: 'idAsc',
          limit: 2,
          offset: 1,
        })
        .map((character) => character.id),
      // Filter (3 of 4 rows) -> sort ascending -> slice(1, 3).
    ).toEqual([702, 703]);
  });

  it('reloads the cached catalog after the override revision changes', async () => {
    let overrideRevision = 0;
    const repository = {
      getAllCharacters: vi
        .fn()
        .mockResolvedValueOnce([createCharacter(101, { name: 'Base name' })])
        .mockResolvedValueOnce([createCharacter(101, { name: 'Edited name' })]),
    };
    const service = new CharacterCatalogCacheService(
      repository as never,
      {
        revision: () => overrideRevision,
      } as never,
    );

    await service.ensureLoaded();
    expect(service.catalog()[0]?.name).toBe('Base name');

    overrideRevision = 1;
    await service.ensureLoaded();

    expect(repository.getAllCharacters).toHaveBeenCalledTimes(2);
    expect(service.catalog()[0]?.name).toBe('Edited name');
  });
});

async function createFacetService(): Promise<CharacterCatalogCacheService> {
  const repository = {
    getAllCharacters: vi.fn().mockResolvedValue([
      createCharacter(701, {
        type: 'STR,QCK',
        primaryClass: 'Fighter',
        secondaryClass: 'Slasher',
        classes: ['Fighter', 'Slasher'],
      }),
      createCharacter(702, {
        type: 'QCK,STR',
        primaryClass: 'Slasher',
        secondaryClass: 'Fighter',
        classes: ['Slasher', 'Fighter'],
      }),
      createCharacter(703, {
        type: 'QCK',
        primaryClass: 'Fighter',
        secondaryClass: null,
        classes: ['Fighter'],
      }),
      createCharacter(704, {
        type: 'INT',
        primaryClass: 'Fighter',
        secondaryClass: 'Slasher',
        // Three-class local override: `Cerebral` is reachable only via `classes`.
        classes: ['Fighter', 'Slasher', 'Cerebral'],
      }),
    ]),
  };
  const service = new CharacterCatalogCacheService(repository as never, {
    revision: () => 0,
  } as never);

  await service.ensureLoaded();

  return service;
}

function createCharacter(
  id: number,
  overrides: Partial<CharacterListItem> = {},
): CharacterListItem {
  return {
    id,
    name: overrides.name ?? `Character ${id}`,
    searchText: overrides.searchText,
    isIncomplete: overrides.isIncomplete ?? false,
    type: overrides.type ?? 'DEX',
    primaryClass: overrides.primaryClass ?? 'Fighter',
    secondaryClass: overrides.secondaryClass ?? null,
    classes: overrides.classes ?? [overrides.primaryClass ?? 'Fighter'],
    stars: overrides.stars ?? 6,
    cost: overrides.cost ?? 55,
    combo: overrides.combo ?? 4,
    captainHpBoost: overrides.captainHpBoost ?? 0,
    captainAtkBoost: overrides.captainAtkBoost ?? 0,
    captainAverageBoost: overrides.captainAverageBoost ?? 0,
    stats: overrides.stats ?? {
      min: { hp: 1000, atk: 500, rcv: 100 },
      max: { hp: 3000, atk: 1500, rcv: 300 },
      growth: 1,
    },
    regionAvailability: overrides.regionAvailability ?? {
      exactLocal: true,
      thumbnailGlobal: true,
      thumbnailJapan: false,
    },
    assets: overrides.assets ?? {
      exactLocal: null,
      thumbnailLocal: null,
      thumbnailGlobal: null,
      thumbnailJapan: null,
    },
    imageUrl: overrides.imageUrl ?? `assets/characters/${id}.png`,
  };
}
