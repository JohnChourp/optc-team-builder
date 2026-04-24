import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

import { type DatasetManifest, type LocalCharacterOverride } from '../models/optc.models';
import { OptcRepositoryService } from './optc-repository.service';

interface TestSqlRow {
  [key: string]: string | number | null;
}

interface SeedCharacterDetail {
  characterId: number;
  detail: {
    builderAbilities?: unknown;
  };
}

describe('OptcRepositoryService', () => {
  it('keeps generated dataset character details ready with builder ability arrays', () => {
    const seedDetails = extractCharacterDetailsFromSeed(
      readFileSync(resolve(process.cwd(), 'public/assets/data/optc-seed.sql'), 'utf8'),
    );
    const preview = JSON.parse(
      readFileSync(resolve(process.cwd(), 'public/assets/data/optc-preview.json'), 'utf8'),
    ) as {
      characters?: Array<{
        id?: unknown;
        detail?: {
          builderAbilities?: unknown;
        };
      }>;
    };

    expect(seedDetails.length).toBeGreaterThan(0);
    expect(
      seedDetails
        .filter(({ detail }) => !Array.isArray(detail.builderAbilities))
        .map(({ characterId }) => characterId),
    ).toEqual([]);
    expect(Array.isArray(preview.characters)).toBe(true);
    expect(
      (preview.characters ?? [])
        .filter((character) => !Array.isArray(character.detail?.builderAbilities))
        .map((character) => character.id),
    ).toEqual([]);
  });

  it('keeps a locked favorite candidate even when it sits below the default recent limit', async () => {
    const recentFavoriteRows = Array.from({ length: 1200 }, (_, index) =>
      createCharacterRow({
        id: 5000 - index,
        type: 'DEX',
      }),
    );
    const lockedFavoriteRow = createCharacterRow({
      id: 2700,
      name: 'Kaido - The Strongest Creature Alive',
      type: 'DEX',
    });
    const service = createRepositoryService([...recentFavoriteRows, lockedFavoriteRow]);

    const result = await service.getAutoBuilderCandidates(['DEX'], 1200, {
      allowedCharacterIds: [...recentFavoriteRows.map((row) => Number(row['id'])), 2700],
      lockedCharacterIds: [2700],
    });

    expect(result).toHaveLength(1201);
    expect(result.some((record) => record.id === 2700)).toBe(true);
  });

  it('filters favorites before applying the candidate limit', async () => {
    const nonFavoriteRows = Array.from({ length: 1200 }, (_, index) =>
      createCharacterRow({
        id: 5200 - index,
        type: index % 2 === 0 ? 'DEX' : 'PSY',
      }),
    );
    const favoriteRows = [
      createCharacterRow({ id: 3200, type: 'DEX' }),
      createCharacterRow({
        id: 2700,
        name: 'Kaido - The Strongest Creature Alive',
        type: 'DEX',
      }),
    ];
    const service = createRepositoryService([...nonFavoriteRows, ...favoriteRows]);

    const result = await service.getAutoBuilderCandidates(['DEX', 'STR', 'QCK', 'PSY'], 1200, {
      allowedCharacterIds: [3200, 2700],
      lockedCharacterIds: [2700],
    });

    expect(result.map((record) => record.id)).toEqual([3200, 2700]);
  });

  it('returns the full filtered pool when the candidate limit is null', async () => {
    const rows = Array.from({ length: 1202 }, (_, index) =>
      createCharacterRow({
        id: 6000 - index,
        type: 'DEX',
      }),
    );
    const service = createRepositoryService(rows);

    const result = await service.getAutoBuilderCandidates(['DEX'], null);

    expect(result).toHaveLength(1202);
    expect(result[0]?.id).toBe(6000);
    expect(result.at(-1)?.id).toBe(4799);
  });

  it('prefers thumbnailLocal for list images while keeping exactLocal for detail images', async () => {
    const service = createRepositoryService([
      createCharacterRow({
        id: 900001,
        name: 'Manual Pair',
        type: 'STR',
      }),
    ]);
    const selectAllMock = service['selectAll'] as ReturnType<typeof vi.fn>;
    selectAllMock.mockImplementation((query: string) =>
      Promise.resolve(
        query.includes('FROM ships')
          ? []
          : [
              createCharacterRow({
                id: 900001,
                name: 'Manual Pair',
                type: 'STR',
                assets: {
                  exactLocal: 'assets/exact-character-images/900001.png',
                  thumbnailLocal: 'assets/exact-character-images/900001-thumb.jpg',
                  thumbnailGlobal: null,
                  thumbnailJapan: null,
                  fullTransparent: null,
                },
              }),
            ],
      ),
    );

    const record = await service.getCharacterById(900001);

    expect(record?.imageUrl).toBe('assets/exact-character-images/900001-thumb.jpg');
    expect(record?.detailImageUrl).toBe('assets/exact-character-images/900001.png');
  });

  it('returns the full character catalog in canonical list order', async () => {
    const service = createRepositoryService([
      createCharacterRow({ id: 4101, stars: 5 }),
      createCharacterRow({ id: 4105, stars: 6 }),
      createCharacterRow({ id: 4103, stars: 6 }),
    ]);

    const result = await service.getAllCharacters();

    expect(result.map((record) => record.id)).toEqual([4105, 4103, 4101]);
  });

  it('returns linked variants when searching by a shared canonical id', async () => {
    const service = createRepositoryService([]);
    const selectAllMock = service['selectAll'] as ReturnType<typeof vi.fn>;
    const zoroRow = createCharacterRow({
      id: 4529,
      name: 'Clashing Blades Roronoa Zoro',
      type: 'DEX',
      primaryClass: 'Free Spirit',
      secondaryClass: 'Slasher',
      classes: ['Free Spirit', 'Slasher'],
      stars: 6,
    });
    const nusjuroRow = createCharacterRow({
      id: 900005,
      name: 'Clashing Blades St. Ethanbaron V. Nusjuro',
      type: 'STR',
      primaryClass: 'Cerebral',
      secondaryClass: 'Slasher',
      classes: ['Cerebral', 'Slasher'],
      stars: 6,
    });

    selectAllMock.mockImplementation((query: string, params: Array<string | number> = []) => {
      if (query.includes('FROM characters') && query.includes('search_text LIKE')) {
        expect(params[0]).toBe('4529');
        expect(params[1]).toBe('4529');
        return Promise.resolve([nusjuroRow, zoroRow]);
      }

      return Promise.resolve([]);
    });

    const result = await service.searchCharacters({
      searchTerm: '4529',
      typeFilter: '',
      classFilter: '',
      limit: 10,
      offset: 0,
    });

    expect(result.map((record) => record.id)).toEqual([900005, 4529]);
    expect(result.map((record) => record.name)).toEqual([
      'Clashing Blades St. Ethanbaron V. Nusjuro',
      'Clashing Blades Roronoa Zoro',
    ]);
  });

  it('matches linked variants by shared canonical id in detailed character search', async () => {
    const service = createRepositoryService([
      createCharacterRow({
        id: 4529,
        name: 'Clashing Blades Roronoa Zoro',
        type: 'DEX',
        primaryClass: 'Free Spirit',
        secondaryClass: 'Slasher',
        classes: ['Free Spirit', 'Slasher'],
        searchText: 'clashing blades roronoa zoro dex free spirit slasher 4529',
      }),
      createCharacterRow({
        id: 900005,
        name: 'Clashing Blades St. Ethanbaron V. Nusjuro',
        type: 'STR',
        primaryClass: 'Cerebral',
        secondaryClass: 'Slasher',
        classes: ['Cerebral', 'Slasher'],
        searchText:
          'clashing blades st. ethanbaron v. nusjuro str cerebral slasher 900005 4529 st ethanbaron v nusjuro',
      }),
    ]);

    const result = await service.searchDetailedCharacters({
      searchTerm: '4529',
      selectedTypes: [],
      selectedClasses: [],
      limit: 10,
      offset: 0,
    });

    expect(result.map((record) => record.id)).toEqual([900005, 4529]);
  });

  it('applies local override names, types, and classes to detailed search filtering', async () => {
    const service = createRepositoryService([createCharacterRow({ id: 4101, type: 'DEX' })], {
      overrides: [
        createOverride({
          characterId: 4101,
          name: 'Edited Ace',
          type: 'PSY',
          classes: ['Shooter', 'Free Spirit'],
        }),
      ],
    });

    const result = await service.searchDetailedCharacters({
      searchTerm: 'edited',
      selectedTypes: ['PSY'],
      selectedClasses: ['Shooter'],
      limit: 10,
      offset: 0,
    });

    expect(result.map((record) => record.id)).toEqual([4101]);
    expect(result[0]).toMatchObject({
      name: 'Edited Ace',
      type: 'PSY',
      primaryClass: 'Shooter',
      secondaryClass: 'Free Spirit',
    });
  });

  it('uses local override types and classes for auto-builder candidate filtering', async () => {
    const service = createRepositoryService([createCharacterRow({ id: 4101, type: 'DEX' })], {
      overrides: [
        createOverride({
          characterId: 4101,
          type: 'PSY',
          classes: ['Shooter', 'Free Spirit'],
        }),
      ],
    });

    const result = await service.getAutoBuilderCandidates(['PSY'], 1200, {
      selectedClasses: ['Shooter'],
    });

    expect(result.map((record) => record.id)).toEqual([4101]);
  });

  it('prefers local override images over dataset assets for list and detail views', async () => {
    const service = createRepositoryService([createCharacterRow({ id: 4101, type: 'DEX' })], {
      overrides: [
        createOverride({
          characterId: 4101,
          images: {
            thumbnailDataUrl: 'data:image/jpeg;base64,dGh1bWI=',
            detailDataUrl: 'data:image/jpeg;base64,ZGV0YWls',
          },
        }),
      ],
    });

    const [listRecord] = await service.getAllCharacters();
    const detailRecord = await service.getCharacterById(4101);

    expect(listRecord?.imageUrl).toBe('data:image/jpeg;base64,dGh1bWI=');
    expect(detailRecord?.detailImageUrl).toBe('data:image/jpeg;base64,ZGV0YWls');
  });

  it('keeps local override fields after a dataset refresh while retaining refreshed dataset assets', async () => {
    const override = createOverride({
      characterId: 4101,
      name: 'Local Ace',
      type: 'PSY',
      classes: ['Shooter', 'Free Spirit'],
      detail: {
        characterId: 4101,
        captainAbility: 'Local captain text.',
        captainAbilityVariants: [],
        captainNotes: null,
        specialName: 'Local Flame Emperor',
        specialText: 'Local special text.',
        specialNotes: null,
        superSpecialText: null,
        superSpecialCriteriaText: null,
        superSpecialNotes: null,
        superSpecialCriteria: null,
        partyConflictKeys: [],
        characterTags: ['local-override'],
        builderAbilities: [],
        sailorAbilities: [],
        sailorNotes: null,
        limitBreak: [],
        potentialAbilities: [],
        supportData: [],
        swapData: null,
        vsSpecial: null,
        superType: null,
        superTandemData: null,
        finalTapData: null,
        rushSugoSpecialData: null,
        superClass: null,
        rumbleData: null,
      },
      images: {
        thumbnailDataUrl: 'data:image/jpeg;base64,bG9jYWwtdGh1bWI=',
        detailDataUrl: 'data:image/jpeg;base64,bG9jYWwtZGV0YWls',
      },
    });

    const beforeImportService = createRepositoryService(
      [
        createCharacterRow({
          id: 4101,
          name: 'Imported Ace v1',
          type: 'DEX',
          primaryClass: 'Fighter',
          secondaryClass: 'Slasher',
          classes: ['Fighter', 'Slasher'],
          assets: {
            exactLocal: 'assets/exact-character-images/4101-v1.png',
            thumbnailLocal: null,
            thumbnailGlobal: 'assets/offline-packs/thumbnails-glo/4101-v1.png',
            thumbnailJapan: null,
            fullTransparent: null,
          },
        }),
      ],
      { overrides: [override] },
    );
    const afterImportService = createRepositoryService(
      [
        createCharacterRow({
          id: 4101,
          name: 'Imported Ace v2',
          type: 'STR',
          primaryClass: 'Driven',
          secondaryClass: 'Powerhouse',
          classes: ['Driven', 'Powerhouse'],
          assets: {
            exactLocal: 'assets/exact-character-images/4101-v2.png',
            thumbnailLocal: null,
            thumbnailGlobal: 'assets/offline-packs/thumbnails-glo/4101-v2.png',
            thumbnailJapan: 'assets/offline-packs/thumbnails-jap/4101-v2.png',
            fullTransparent: 'assets/offline-packs/full-transparent/4101-v2.png',
          },
        }),
      ],
      { overrides: [override] },
    );

    const beforeImportRecord = await beforeImportService.getCharacterById(4101);
    const afterImportRecord = await afterImportService.getCharacterById(4101);

    expect(beforeImportRecord).toMatchObject({
      name: 'Local Ace',
      type: 'PSY',
      primaryClass: 'Shooter',
      secondaryClass: 'Free Spirit',
      imageUrl: 'data:image/jpeg;base64,bG9jYWwtdGh1bWI=',
      detailImageUrl: 'data:image/jpeg;base64,bG9jYWwtZGV0YWls',
      detail: {
        specialName: 'Local Flame Emperor',
        specialText: 'Local special text.',
        characterTags: ['local-override'],
      },
      assets: {
        exactLocal: 'assets/exact-character-images/4101-v1.png',
        thumbnailGlobal: 'assets/offline-packs/thumbnails-glo/4101-v1.png',
        fullTransparent: null,
      },
    });
    expect(afterImportRecord).toMatchObject({
      name: 'Local Ace',
      type: 'PSY',
      primaryClass: 'Shooter',
      secondaryClass: 'Free Spirit',
      imageUrl: 'data:image/jpeg;base64,bG9jYWwtdGh1bWI=',
      detailImageUrl: 'data:image/jpeg;base64,bG9jYWwtZGV0YWls',
      detail: {
        captainAbility: 'Local captain text.',
        specialName: 'Local Flame Emperor',
        specialText: 'Local special text.',
        characterTags: ['local-override'],
      },
      assets: {
        exactLocal: 'assets/exact-character-images/4101-v2.png',
        thumbnailGlobal: 'assets/offline-packs/thumbnails-glo/4101-v2.png',
        thumbnailJapan: 'assets/offline-packs/thumbnails-jap/4101-v2.png',
        fullTransparent: 'assets/offline-packs/full-transparent/4101-v2.png',
      },
    });
  });

  it('applies app-local overrides on top of manual/custom dataset records', async () => {
    const service = createRepositoryService(
      [
        createCharacterRow({
          id: 900000,
          name: 'Manual Ace',
          type: 'DEX',
          primaryClass: 'Fighter',
          secondaryClass: 'Free Spirit',
          classes: ['Fighter', 'Free Spirit'],
          assets: {
            exactLocal: 'assets/exact-character-images/900000.png',
            thumbnailLocal: 'assets/exact-character-images/900000-thumb.png',
            thumbnailGlobal: null,
            thumbnailJapan: null,
            fullTransparent: null,
          },
        }),
      ],
      {
        overrides: [
          createOverride({
            characterId: 900000,
            name: 'Manual Ace Local Edit',
            type: 'PSY',
            classes: ['Shooter', 'Free Spirit'],
            detail: {
              characterId: 900000,
              captainAbility: null,
              captainAbilityVariants: [],
              captainNotes: null,
              specialName: 'Locally Edited Manual Special',
              specialText: 'Local manual override text.',
              specialNotes: null,
              superSpecialText: null,
              superSpecialCriteriaText: null,
              superSpecialNotes: null,
              superSpecialCriteria: null,
              partyConflictKeys: [],
              characterTags: ['manual-local-override'],
              builderAbilities: [],
              sailorAbilities: [],
              sailorNotes: null,
              limitBreak: [],
              potentialAbilities: [],
              supportData: [],
              swapData: null,
              vsSpecial: null,
              superType: null,
              superTandemData: null,
              finalTapData: null,
              rushSugoSpecialData: null,
              superClass: null,
              rumbleData: null,
            },
            images: {
              thumbnailDataUrl: 'data:image/jpeg;base64,bWFudWFsLXRodW1i',
              detailDataUrl: 'data:image/jpeg;base64,bWFudWFsLWRldGFpbA==',
            },
          }),
        ],
      },
    );

    const record = await service.getCharacterById(900000);

    expect(record).toMatchObject({
      id: 900000,
      name: 'Manual Ace Local Edit',
      type: 'PSY',
      primaryClass: 'Shooter',
      secondaryClass: 'Free Spirit',
      imageUrl: 'data:image/jpeg;base64,bWFudWFsLXRodW1i',
      detailImageUrl: 'data:image/jpeg;base64,bWFudWFsLWRldGFpbA==',
      detail: {
        specialName: 'Locally Edited Manual Special',
        specialText: 'Local manual override text.',
        characterTags: ['manual-local-override'],
      },
      assets: {
        exactLocal: 'assets/exact-character-images/900000.png',
        thumbnailLocal: 'assets/exact-character-images/900000-thumb.png',
      },
    });
  });

  it('only keeps locked candidates beyond the main limit when a finite limit is applied', async () => {
    const rows = Array.from({ length: 1202 }, (_, index) =>
      createCharacterRow({
        id: 7000 - index,
        type: 'DEX',
      }),
    );
    const lockedCandidateId = 5799;
    const service = createRepositoryService(rows);

    const limitedResult = await service.getAutoBuilderCandidates(['DEX'], 1200, {
      lockedCharacterIds: [lockedCandidateId],
    });
    const unlimitedResult = await service.getAutoBuilderCandidates(['DEX'], null, {
      lockedCharacterIds: [lockedCandidateId],
    });

    expect(limitedResult).toHaveLength(1201);
    expect(limitedResult.some((record) => record.id === lockedCandidateId)).toBe(true);
    expect(unlimitedResult).toHaveLength(1202);
  });

  it('uses token-based type matching so dual-type rows can match a single selected type', async () => {
    const service = createRepositoryService([
      createCharacterRow({
        id: 4100,
        type: 'DEX,INT',
      }),
    ]);

    const result = await service.getAutoBuilderCandidates(['DEX'], 1200);
    expect(result[0]?.type).toBe('DEX,INT');
  });

  it('adds any-match selected class filtering to auto-builder candidate queries', async () => {
    const service = createRepositoryService([
      createCharacterRow({ id: 4102, type: 'DEX', primaryClass: 'Fighter' }),
      createCharacterRow({ id: 4101, type: 'DEX', primaryClass: 'Slasher' }),
    ]);

    const result = await service.getAutoBuilderCandidates(['DEX'], 1200, {
      selectedClasses: ['Fighter', 'Slasher'],
    });

    expect(result.map((record) => record.id)).toEqual([4102, 4101]);
  });

  it('keeps locked candidates even when class and favorite filters would otherwise exclude them', async () => {
    const service = createRepositoryService([]);
    const selectAllMock = service['selectAll'] as ReturnType<typeof vi.fn>;
    const favoriteMatchRow = createCharacterRow({ id: 4101, type: 'DEX', primaryClass: 'Fighter' });
    const lockedOffClassRow = createCharacterRow({
      id: 4102,
      type: 'DEX',
      primaryClass: 'Shooter',
    });

    selectAllMock.mockResolvedValueOnce([favoriteMatchRow, lockedOffClassRow]);

    const result = await service.getAutoBuilderCandidates(['DEX'], 1200, {
      selectedClasses: ['Fighter'],
      allowedCharacterIds: [4101],
      lockedCharacterIds: [4102],
    });

    expect(result.map((record) => record.id)).toEqual([4102, 4101]);
  });

  it('lets exclusions override favorite and locked candidate inclusion', async () => {
    const service = createRepositoryService([]);
    const selectAllMock = service['selectAll'] as ReturnType<typeof vi.fn>;
    const favoriteMatchRow = createCharacterRow({ id: 4101, type: 'DEX', primaryClass: 'Fighter' });
    const lockedOffClassRow = createCharacterRow({
      id: 4102,
      type: 'DEX',
      primaryClass: 'Shooter',
    });

    selectAllMock.mockResolvedValueOnce([favoriteMatchRow, lockedOffClassRow]);

    const result = await service.getAutoBuilderCandidates(['DEX'], 1200, {
      selectedClasses: ['Fighter'],
      allowedCharacterIds: [4101],
      lockedCharacterIds: [4102],
      excludedCharacterIds: [4101, 4102],
    });

    expect(result).toEqual([]);
  });

  it('filters excluded character ids out of the candidate pool before the final limit', async () => {
    const service = createRepositoryService([
      createCharacterRow({ id: 4102, type: 'DEX' }),
      createCharacterRow({ id: 4101, type: 'DEX' }),
    ]);

    const result = await service.getAutoBuilderCandidates(['DEX'], 1200, {
      excludedCharacterIds: [4102],
    });

    expect(result.map((record) => record.id)).toEqual([4101]);
  });

  it('uses the default catalog sort for detailed character search when no explicit sort mode is provided', async () => {
    const service = createRepositoryService([
      createCharacterRow({ id: 4102, type: 'DEX', stars: 6 }),
      createCharacterRow({ id: 4101, type: 'DEX', stars: 5 }),
    ]);

    const result = await service.searchDetailedCharacters({
      searchTerm: '',
      selectedTypes: [],
      selectedClasses: [],
      limit: 10,
      offset: 0,
    });

    expect(result.map((record) => record.id)).toEqual([4102, 4101]);
  });

  it('uses newest-first sort for detailed character search when the picker requests it', async () => {
    const service = createRepositoryService([
      createCharacterRow({ id: 4101, type: 'DEX' }),
      createCharacterRow({ id: 4102, type: 'DEX' }),
    ]);

    const result = await service.searchDetailedCharacters({
      searchTerm: '',
      selectedTypes: [],
      selectedClasses: [],
      sortMode: 'newest',
      limit: 10,
      offset: 0,
    });

    expect(result.map((record) => record.id)).toEqual([4102, 4101]);
  });

  it('uses newest-first sort when the picker requests power-first ordering', async () => {
    const service = createRepositoryService([
      createCharacterRow({ id: 4101, type: 'DEX', cost: 55 }),
      createCharacterRow({ id: 4104, type: 'DEX', cost: 99 }),
      createCharacterRow({ id: 4102, type: 'DEX', cost: 65 }),
      createCharacterRow({ id: 4103, type: 'DEX', cost: 60 }),
    ]);
    const result = await service.searchDetailedCharacters({
      searchTerm: '',
      selectedTypes: [],
      selectedClasses: [],
      sortMode: 'powerFirst',
      limit: 10,
      offset: 0,
    });

    expect(result.map((record) => record.id)).toEqual([4104, 4103, 4102, 4101]);
  });

  it('queries detailed search directly without materializing the full catalog when no overrides exist', async () => {
    const service = createRepositoryService([createCharacterRow({ id: 4101, type: 'DEX' })]);
    const getAllDetailedCharactersSpy = vi
      .spyOn(service as never, 'getAllDetailedCharacters')
      .mockRejectedValue(
        new Error('searchDetailedCharacters should not materialize the full catalog'),
      );

    await expect(
      service.searchDetailedCharacters({
        searchTerm: '',
        selectedTypes: [],
        selectedClasses: [],
        sortMode: 'powerFirst',
        limit: 10,
        offset: 0,
      }),
    ).resolves.toEqual([expect.objectContaining({ id: 4101 })]);
    expect(getAllDetailedCharactersSpy).not.toHaveBeenCalled();
  });

  it('orders auto-builder candidates by newest character id regardless of cost', async () => {
    const service = createRepositoryService([
      createCharacterRow({ id: 5101, type: 'DEX', cost: 55 }),
      createCharacterRow({ id: 5104, type: 'DEX', cost: 99 }),
      createCharacterRow({ id: 5102, type: 'DEX', cost: 65 }),
      createCharacterRow({ id: 5105, type: 'DEX', cost: 65 }),
      createCharacterRow({ id: 5106, type: 'DEX', cost: 70 }),
      createCharacterRow({ id: 5103, type: 'DEX', cost: 60 }),
    ]);

    const result = await service.getAutoBuilderCandidates(['DEX'], 1200);

    expect(result.map((record) => record.id)).toEqual([5106, 5105, 5104, 5103, 5102, 5101]);
  });

  it('queries auto-builder candidates directly without materializing the full catalog when no overrides exist', async () => {
    const service = createRepositoryService([createCharacterRow({ id: 5101, type: 'DEX' })]);
    const getAllDetailedCharactersSpy = vi
      .spyOn(service as never, 'getAllDetailedCharacters')
      .mockRejectedValue(
        new Error('getAutoBuilderCandidates should not materialize the full catalog'),
      );

    await expect(service.getAutoBuilderCandidates(['DEX'], 1200)).resolves.toEqual([
      expect.objectContaining({ id: 5101 }),
    ]);
    expect(getAllDetailedCharactersSpy).not.toHaveBeenCalled();
  });

  it('returns precomputed builder abilities from detail_json for auto-builder candidates', async () => {
    const service = createRepositoryService([
      createCharacterRow({
        id: 5101,
        type: 'DEX',
        detail: {
          builderAbilities: [
            {
              key: 'remove_bind',
              label: 'Remove Bind',
              minTurns: 5,
              isCompleteRemoval: false,
              slotTokens: [],
              source: 'specialText',
              coverageMode: 'explicit',
            },
          ],
        },
      }),
    ]);

    const [candidate] = await service.getAutoBuilderCandidates(['DEX'], 1200);

    expect(candidate?.detail.builderAbilities).toEqual([
      expect.objectContaining({
        key: 'remove_bind',
        minTurns: 5,
        source: 'specialText',
      }),
    ]);
  });

  it('applies excluded character ids to character search queries', async () => {
    const service = createRepositoryService([]);
    const selectAllMock = service['selectAll'] as ReturnType<typeof vi.fn>;

    await service.searchCharacters({
      searchTerm: '',
      typeFilter: '',
      classFilter: '',
      excludedCharacterIds: [4101, 4102],
      limit: 10,
      offset: 0,
    });

    expect(selectAllMock).toHaveBeenCalledWith(expect.stringContaining('AND id NOT IN (?,?)'), [
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      4101,
      4102,
      10,
      0,
    ]);
  });

  it('resolves ship thumbnail urls when the ship offline pack is installed', async () => {
    const service = createRepositoryService([], {
      manifest: createManifest({
        packs: [
          createPack({
            key: 'shipThumbnails',
            id: 'ship-thumbnails',
            installed: true,
          }),
        ],
      }),
      shipRows: [
        createShipRow({
          id: 9001,
          name: 'Going Merry',
          thumb: 'ship_0001_t2.png',
        }),
      ],
    });

    const result = await service.getShips();

    expect(result).toEqual([
      {
        id: 9001,
        name: 'Going Merry',
        thumb: 'ship_0001_t2.png',
        thumbUrl: 'assets/offline-packs/ship-thumbnails/ship_0001_t2.png',
        description: 'Boosts ATK by 1.5x.',
      },
    ]);
  });

  it('keeps ship thumbnail urls null when the ship offline pack is missing', async () => {
    const service = createRepositoryService([], {
      shipRows: [
        createShipRow({
          id: 9001,
          name: 'Going Merry',
          thumb: 'ship_0001_t2.png',
        }),
      ],
    });

    const result = await service.getShips();

    expect(result).toEqual([
      {
        id: 9001,
        name: 'Going Merry',
        thumb: 'ship_0001_t2.png',
        thumbUrl: null,
        description: 'Boosts ATK by 1.5x.',
      },
    ]);
  });
});

function createRepositoryService(
  rows: TestSqlRow[],
  options: {
    manifest?: DatasetManifest;
    overrides?: LocalCharacterOverride[];
    shipRows?: TestSqlRow[];
  } = {},
): OptcRepositoryService {
  const service = Object.create(OptcRepositoryService.prototype) as OptcRepositoryService;
  const overridesByCharacterId = new Map(
    (options.overrides ?? []).map((override) => [override.characterId, override] as const),
  );

  Object.assign(service, {
    characterOverrides: {
      ready: vi.fn().mockResolvedValue(undefined),
      overridesByCharacterId: vi.fn(() => overridesByCharacterId),
    },
    getDatasetManifest: vi.fn().mockResolvedValue(options.manifest ?? createManifest()),
    selectAll: vi
      .fn()
      .mockImplementation((query: string, params: Array<string | number> = []) =>
        Promise.resolve(
          query.includes('FROM ships')
            ? (options.shipRows ?? [])
            : filterCharacterRowsForQuery(rows, query, params),
        ),
      ),
  });

  return service;
}

function extractCharacterDetailsFromSeed(sql: string): SeedCharacterDetail[] {
  const marker = 'INSERT INTO character_details (character_id, detail_json)';
  const details: SeedCharacterDetail[] = [];
  let searchIndex = 0;

  while (searchIndex < sql.length) {
    const insertIndex = sql.indexOf(marker, searchIndex);

    if (insertIndex === -1) {
      break;
    }

    const valuesIndex = sql.indexOf('VALUES', insertIndex);
    const tupleStartIndex = sql.indexOf('(', valuesIndex);

    if (valuesIndex === -1 || tupleStartIndex === -1) {
      throw new Error(`Malformed character_details insert near ${insertIndex}.`);
    }

    let currentIndex = tupleStartIndex + 1;

    while (/\s/u.test(sql[currentIndex] ?? '')) {
      currentIndex += 1;
    }

    let characterIdText = '';

    while (/[0-9]/u.test(sql[currentIndex] ?? '')) {
      characterIdText += sql[currentIndex];
      currentIndex += 1;
    }

    const characterId = Number(characterIdText);
    const jsonStartIndex = sql.indexOf("'", currentIndex);

    if (!Number.isInteger(characterId) || characterId <= 0 || jsonStartIndex === -1) {
      throw new Error(`Malformed character_details values near ${insertIndex}.`);
    }

    const parsedString = parseSqlStringLiteral(sql, jsonStartIndex);
    const detail = JSON.parse(parsedString.value) as SeedCharacterDetail['detail'];

    details.push({ characterId, detail });
    searchIndex = parsedString.endIndex + 1;
  }

  return details;
}

function parseSqlStringLiteral(
  sql: string,
  startIndex: number,
): { value: string; endIndex: number } {
  let value = '';

  for (let index = startIndex + 1; index < sql.length; index += 1) {
    const character = sql[index];

    if (character !== "'") {
      value += character;
      continue;
    }

    if (sql[index + 1] === "'") {
      value += "'";
      index += 1;
      continue;
    }

    return { value, endIndex: index };
  }

  throw new Error(`Unterminated SQL string literal near ${startIndex}.`);
}

function createManifest(overrides: Partial<DatasetManifest> = {}): DatasetManifest {
  return {
    generatedAt: '2026-03-25T00:00:00.000Z',
    sourceVersion: 'test',
    characterCount: 0,
    detailCount: 0,
    shipCount: 0,
    rumbleCount: 0,
    availableTypes: ['DEX', 'STR', 'QCK', 'PSY', 'INT'],
    availableClasses: ['Fighter', 'Slasher'],
    packs: [],
    ...overrides,
  };
}

function createPack(
  overrides: Partial<DatasetManifest['packs'][number]> = {},
): DatasetManifest['packs'][number] {
  return {
    key: overrides.key ?? 'shipThumbnails',
    id: overrides.id ?? 'ship-thumbnails',
    label: overrides.label ?? 'Ship thumbnails',
    localBasePath: overrides.localBasePath ?? 'assets/offline-packs/ship-thumbnails',
    fileCount: overrides.fileCount ?? 1,
    totalBytes: overrides.totalBytes ?? 1234,
    installed: overrides.installed ?? false,
  };
}

function createShipRow(
  overrides: Partial<{
    id: number;
    name: string;
    thumb: string | null;
    description: string;
  }> = {},
): TestSqlRow {
  return {
    id: overrides.id ?? 9001,
    name: overrides.name ?? 'Ship 9001',
    thumb: overrides.thumb ?? null,
    description: overrides.description ?? 'Boosts ATK by 1.5x.',
  };
}

function createCharacterRow(
  overrides: Partial<{
    id: number;
    name: string;
    searchText: string;
    type: string;
    primaryClass: string;
    secondaryClass: string | null;
    classes: string[];
    cost: number;
    stars: number;
    detail: Partial<LocalCharacterOverride['detail']>;
    assets: {
      exactLocal: string | null;
      thumbnailLocal?: string | null;
      thumbnailGlobal: string | null;
      thumbnailJapan: string | null;
      fullTransparent: string | null;
    };
  }> = {},
): TestSqlRow {
  const id = overrides.id ?? 5000;
  const primaryClass = overrides.primaryClass ?? 'Fighter';
  const secondaryClass = overrides.secondaryClass ?? null;

  return {
    id,
    name: overrides.name ?? `Unit ${id}`,
    search_text:
      overrides.searchText ??
      `${overrides.name ?? `Unit ${id}`} ${overrides.type ?? 'DEX'} ${(
        overrides.classes ?? [primaryClass, secondaryClass].filter(Boolean)
      ).join(' ')}`.toLowerCase(),
    type: overrides.type ?? 'DEX',
    primary_class: primaryClass,
    secondary_class: secondaryClass,
    classes_json: JSON.stringify(
      overrides.classes ?? [primaryClass, secondaryClass].filter(Boolean),
    ),
    stars: overrides.stars ?? 6,
    cost: overrides.cost ?? 55,
    combo: 4,
    min_hp: 1000,
    min_atk: 400,
    min_rcv: 120,
    max_hp: 3900,
    max_atk: 1900,
    max_rcv: 340,
    growth: 3,
    region_json: JSON.stringify({
      exactLocal: true,
      thumbnailGlobal: true,
      thumbnailJapan: false,
      fullTransparent: false,
    }),
    assets_json: JSON.stringify({
      ...(overrides.assets ?? {
        exactLocal: null,
        thumbnailLocal: null,
        thumbnailGlobal: null,
        thumbnailJapan: null,
        fullTransparent: null,
      }),
    }),
    detail_json: JSON.stringify({
      ...createCharacterDetail(id),
      ...(overrides.detail ?? {}),
      characterId: id,
    }),
  };
}

function createCharacterDetail(characterId: number): LocalCharacterOverride['detail'] {
  return {
    characterId,
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
    limitBreak: [],
    potentialAbilities: [],
    supportData: [],
    swapData: null,
    vsSpecial: null,
    superType: null,
    superTandemData: null,
    finalTapData: null,
    rushSugoSpecialData: null,
    superClass: null,
    rumbleData: null,
  };
}

function createOverride(
  overrides: Partial<LocalCharacterOverride> & Pick<LocalCharacterOverride, 'characterId'>,
): LocalCharacterOverride {
  return {
    characterId: overrides.characterId,
    name: overrides.name ?? `Override ${overrides.characterId}`,
    isIncomplete: overrides.isIncomplete ?? false,
    type: overrides.type ?? 'DEX',
    classes: overrides.classes ?? ['Fighter'],
    stars: overrides.stars ?? 6,
    cost: overrides.cost ?? 55,
    combo: overrides.combo ?? 4,
    minHp: overrides.minHp ?? 1000,
    minAtk: overrides.minAtk ?? 400,
    minRcv: overrides.minRcv ?? 120,
    maxHp: overrides.maxHp ?? 3900,
    maxAtk: overrides.maxAtk ?? 1900,
    maxRcv: overrides.maxRcv ?? 340,
    growth: overrides.growth ?? 3,
    detail: overrides.detail ?? createCharacterDetail(overrides.characterId),
    images: overrides.images ?? {
      thumbnailDataUrl: null,
      detailDataUrl: null,
    },
    createdAt: overrides.createdAt ?? '2026-04-13T09:15:00.000Z',
    updatedAt: overrides.updatedAt ?? '2026-04-13T09:15:00.000Z',
  };
}

function filterCharacterRowsForQuery(
  rows: TestSqlRow[],
  query: string,
  params: Array<string | number>,
): TestSqlRow[] {
  if (query.includes('WHERE c.id = ?')) {
    return rows.filter((row) => Number(row['id'] ?? 0) === Number(params[0] ?? 0));
  }

  if (query.includes('WHERE id IN (')) {
    const allowedIds = new Set(params.map((value) => Number(value)));

    return rows.filter((row) => allowedIds.has(Number(row['id'] ?? 0)));
  }

  let filteredRows = [...rows];

  if (query.includes("WHERE (? = '' OR search_text LIKE '%' || ? || '%')")) {
    const searchTerm = String(params[0] ?? '')
      .trim()
      .toLowerCase();
    const typeFilter = String(params[2] ?? '').trim();
    const classFilter = String(params[4] ?? '').trim();
    let paramIndex = 7;

    if (searchTerm.length > 0) {
      filteredRows = filteredRows.filter((row) =>
        String(row['search_text'] ?? '')
          .toLowerCase()
          .includes(searchTerm),
      );
    }

    if (typeFilter.length > 0) {
      filteredRows = filteredRows.filter((row) => String(row['type'] ?? '').includes(typeFilter));
    }

    if (classFilter.length > 0) {
      filteredRows = filteredRows.filter((row) => {
        const classes = [
          String(row['primary_class'] ?? ''),
          String(row['secondary_class'] ?? ''),
        ].filter((value) => value.length > 0);

        return classes.includes(classFilter);
      });
    }

    const allowedClauseMatch = query.match(/AND id IN \(([^)]+)\)/);

    if (allowedClauseMatch) {
      const allowedCount = countClausePlaceholders(allowedClauseMatch[1] ?? '');
      const allowedIds = new Set(
        params.slice(paramIndex, paramIndex + allowedCount).map((value) => Number(value)),
      );

      filteredRows = filteredRows.filter((row) => allowedIds.has(Number(row['id'] ?? 0)));
      paramIndex += allowedCount;
    }

    const excludedClauseMatch = query.match(/AND id NOT IN \(([^)]+)\)/);

    if (excludedClauseMatch) {
      const excludedCount = countClausePlaceholders(excludedClauseMatch[1] ?? '');
      const excludedIds = new Set(
        params.slice(paramIndex, paramIndex + excludedCount).map((value) => Number(value)),
      );

      filteredRows = filteredRows.filter((row) => !excludedIds.has(Number(row['id'] ?? 0)));
    }

    return applyOrderingAndWindow(filteredRows, query, params);
  }

  let paramIndex = 0;
  const detailedSearchTermToken = "c.search_text LIKE '%' || ? || '%'";

  if (query.includes(detailedSearchTermToken)) {
    const searchTerm = String(params[paramIndex] ?? '')
      .trim()
      .toLowerCase();

    filteredRows = filteredRows.filter((row) =>
      String(row['search_text'] ?? '')
        .toLowerCase()
        .includes(searchTerm),
    );
    paramIndex += 1;
  }

  const typeToken = "(',' || c.type || ',') LIKE ?";
  const typeTokenCount = countOccurrences(query, typeToken);

  if (typeTokenCount > 0) {
    const typePatterns = params
      .slice(paramIndex, paramIndex + typeTokenCount)
      .map((value) => String(value).replaceAll('%', ''));
    const requiresAllTypes = query.includes(`${typeToken} AND ${typeToken}`);

    filteredRows = filteredRows.filter((row) => {
      const normalizedTypeValue = `,${String(row['type'] ?? '')},`;
      const matches = typePatterns.map((pattern) => normalizedTypeValue.includes(pattern));

      return requiresAllTypes ? matches.every(Boolean) : matches.some(Boolean);
    });
    paramIndex += typeTokenCount;
  }

  const classToken = 'c.classes_json LIKE ?';
  const classTokenCount = countOccurrences(query, classToken);

  if (classTokenCount > 0) {
    const classPatterns = params
      .slice(paramIndex, paramIndex + classTokenCount)
      .map((value) => String(value).replaceAll('%', ''));
    const requiresAllClasses = query.includes(`${classToken} AND ${classToken}`);

    filteredRows = filteredRows.filter((row) => {
      const classesJson = String(row['classes_json'] ?? '');
      const matches = classPatterns.map((pattern) => classesJson.includes(pattern));

      return requiresAllClasses ? matches.every(Boolean) : matches.some(Boolean);
    });
    paramIndex += classTokenCount;
  }

  const lockedClauseMatch = query.match(/OR c\.id IN \(([^)]+)\)/);

  if (lockedClauseMatch) {
    paramIndex += countClausePlaceholders(lockedClauseMatch[1] ?? '');
  }

  const allowedClauseMatch = query.match(/AND c\.id IN \(([^)]+)\)/);

  if (allowedClauseMatch) {
    const allowedCount = countClausePlaceholders(allowedClauseMatch[1] ?? '');
    const allowedIds = new Set(
      params.slice(paramIndex, paramIndex + allowedCount).map((value) => Number(value)),
    );

    filteredRows = filteredRows.filter((row) => allowedIds.has(Number(row['id'] ?? 0)));
    paramIndex += allowedCount;
  }

  const excludedClauseMatch = query.match(/AND c\.id NOT IN \(([^)]+)\)/);

  if (excludedClauseMatch) {
    const excludedCount = countClausePlaceholders(excludedClauseMatch[1] ?? '');
    const excludedIds = new Set(
      params.slice(paramIndex, paramIndex + excludedCount).map((value) => Number(value)),
    );

    filteredRows = filteredRows.filter((row) => !excludedIds.has(Number(row['id'] ?? 0)));
  }

  return applyOrderingAndWindow(filteredRows, query, params);
}

function applyOrderingAndWindow(
  rows: TestSqlRow[],
  query: string,
  params: Array<string | number>,
): TestSqlRow[] {
  let orderedRows = rows;

  if (query.includes('ORDER BY c.id DESC')) {
    orderedRows = [...rows].sort(
      (left, right) => Number(right['id'] ?? 0) - Number(left['id'] ?? 0),
    );
  } else if (
    query.includes('ORDER BY c.stars DESC, c.id DESC') ||
    query.includes('ORDER BY stars DESC, id DESC')
  ) {
    orderedRows = [...rows].sort((left, right) => {
      const starDifference = Number(right['stars'] ?? 0) - Number(left['stars'] ?? 0);

      if (starDifference !== 0) {
        return starDifference;
      }

      return Number(right['id'] ?? 0) - Number(left['id'] ?? 0);
    });
  }

  if (query.includes('LIMIT ? OFFSET ?')) {
    const limit = Number(params.at(-2) ?? orderedRows.length);
    const offset = Number(params.at(-1) ?? 0);

    return orderedRows.slice(offset, offset + limit);
  }

  return orderedRows;
}

function countOccurrences(value: string, needle: string): number {
  return value.split(needle).length - 1;
}

function countClausePlaceholders(clause: string): number {
  return countOccurrences(clause, '?');
}
