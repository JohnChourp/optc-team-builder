import '@angular/compiler';
import { describe, expect, it, beforeEach, vi } from 'vitest';

import { Preferences } from '@capacitor/preferences';

import { UserStateService } from './user-state.service';

vi.mock('@capacitor/preferences', () => ({
  Preferences: {
    get: vi.fn(),
    set: vi.fn(),
  },
}));

describe('UserStateService saved teams', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it('toggles favorite ships and persists the normalized order', async () => {
    const { service, setCalls } = await createService([], [], [9001]);

    await service.toggleShipFavorite(9002);

    expect(service.favoriteShipIds()).toEqual([9002, 9001]);
    expect(setCalls.at(-1)).toEqual({
      key: 'favoriteShipIds',
      value: JSON.stringify([9002, 9001]),
    });

    await service.toggleShipFavorite(9001);

    expect(service.favoriteShipIds()).toEqual([9002]);
    expect(setCalls.at(-1)).toEqual({
      key: 'favoriteShipIds',
      value: JSON.stringify([9002]),
    });
  });

  it('hydrates and overwrites favorite ship ids with normalized values', async () => {
    const { service, setCalls } = await createService([], [], [9002, 9002, -1, 9001]);

    expect(service.favoriteShipIds()).toEqual([9002, 9002, -1, 9001]);

    await service.setFavoriteShipIds([9003, 9003, 0, -1, 9001]);

    expect(service.favoriteShipIds()).toEqual([9003, 9001]);
    expect(setCalls.at(-1)).toEqual({
      key: 'favoriteShipIds',
      value: JSON.stringify([9003, 9001]),
    });
  });

  it('hydrates the auto team builder worker preference and resolves the effective count', async () => {
    vi.stubGlobal('navigator', { hardwareConcurrency: 12 });
    const { service } = await createService([], [], [], [], {
      mode: 'manual',
      manualCount: 20,
    });

    expect(service.autoTeamBuilderWorkerPreference()).toEqual({
      mode: 'manual',
      manualCount: 12,
    });
    expect(service.resolveAutoTeamBuilderWorkerPreference()).toEqual({
      mode: 'manual',
      manualCount: 12,
      detectedCoreCount: 12,
      effectiveCount: 12,
    });
  });

  it('falls back to the safe auto worker preference when stored data is invalid', async () => {
    vi.stubGlobal('navigator', { hardwareConcurrency: 6 });
    const { service } = await createService([], [], [], [], {
      mode: 'broken',
      manualCount: -5,
    } as never);

    expect(service.autoTeamBuilderWorkerPreference()).toEqual({
      mode: 'auto',
      manualCount: 1,
    });
    expect(service.resolveAutoTeamBuilderWorkerCount()).toBe(5);
  });

  it('persists normalized auto team builder worker preferences', async () => {
    vi.stubGlobal('navigator', { hardwareConcurrency: 10 });
    const { service, setCalls } = await createService();

    await service.setAutoTeamBuilderWorkerPreference({
      mode: 'manual',
      manualCount: 25,
    });

    expect(service.autoTeamBuilderWorkerPreference()).toEqual({
      mode: 'manual',
      manualCount: 10,
    });
    expect(setCalls.at(-1)).toEqual({
      key: 'autoTeamBuilderWorkerPreference',
      value: JSON.stringify({
        mode: 'manual',
        manualCount: 10,
      }),
    });
  });

  it('deletes only the requested saved teams and persists the next state', async () => {
    const { service, setCalls } = await createService([
      createTeam('team-1', 'Slashers'),
      createTeam('team-2', 'Driven'),
    ]);

    await service.deleteTeams(['team-2', 'missing']);

    expect(service.savedTeams().map((team) => team.id)).toEqual(['team-1']);
    expect(JSON.parse(setCalls.at(-1)?.value ?? '[]')).toEqual([createTeam('team-1', 'Slashers')]);
  });

  it('clears all saved teams without touching other persisted state', async () => {
    const { service, setCalls } = await createService([
      createTeam('team-1', 'Slashers'),
      createTeam('team-2', 'Driven'),
    ]);

    await service.clearAllSavedTeams();

    expect(service.savedTeams()).toEqual([]);
    expect(setCalls.at(-1)).toEqual({
      key: 'savedTeams',
      value: JSON.stringify([]),
    });
    expect(service.savedEnemies()).toEqual([]);
    expect(service.favoriteCharacterIds()).toEqual([]);
  });

  it('merges imported teams by id and keeps untouched teams behind them', async () => {
    const { service, setCalls } = await createService([
      createTeam('team-1', 'Original one'),
      createTeam('team-2', 'Untouched'),
    ]);

    const result = await service.mergeImportedTeams([
      {
        ...createTeam('team-1', 'Updated import'),
        notes: 'merged',
        shipId: 9001,
      },
      createTeam('team-3', 'Brand new'),
    ]);

    expect(result).toMatchObject({
      addedCount: 1,
      updatedCount: 1,
    });
    expect(service.savedTeams().map((team) => team.id)).toEqual(['team-1', 'team-3', 'team-2']);
    expect(service.savedTeams()[0]?.name).toBe('Updated import');
    expect(
      JSON.parse(setCalls.at(-1)?.value ?? '[]').map((team: { id: string }) => team.id),
    ).toEqual(['team-1', 'team-3', 'team-2']);
  });

  it('updates an existing saved team by id while preserving createdAt and refreshing updatedAt', async () => {
    const originalTeam = createTeam('team-1', 'Original one');
    const { service, setCalls } = await createService([originalTeam]);

    const result = await service.saveTeam({
      id: 'team-1',
      name: '  Updated name  ',
      notes: '  updated notes  ',
      shipId: 9001,
      slots: [999, null, 202, null, null, 303],
    });

    expect(result).toMatchObject({
      id: 'team-1',
      name: 'Updated name',
      notes: 'updated notes',
      shipId: 9001,
      slots: [999, null, 202, null, null, 303],
      createdAt: originalTeam.createdAt,
    });
    expect(result.updatedAt).not.toBe(originalTeam.updatedAt);
    expect(service.savedTeams()).toHaveLength(1);
    expect(service.savedTeams()[0]).toMatchObject({
      id: 'team-1',
      name: 'Updated name',
      notes: 'updated notes',
      shipId: 9001,
      slots: [999, null, 202, null, null, 303],
      createdAt: originalTeam.createdAt,
    });
    expect(service.savedTeams()[0]?.updatedAt).not.toBe(originalTeam.updatedAt);
    expect(JSON.parse(setCalls.at(-1)?.value ?? '[]')[0]).toMatchObject({
      id: 'team-1',
      name: 'Updated name',
      notes: 'updated notes',
      shipId: 9001,
      slots: [999, null, 202, null, null, 303],
      createdAt: originalTeam.createdAt,
    });
  });

  it('returns a saved team by normalized id', async () => {
    const { service } = await createService([
      createTeam('team-1', 'Slashers'),
      createTeam('team-2', 'Driven'),
    ]);

    expect(service.getSavedTeamById(' team-2 ')).toMatchObject({
      id: 'team-2',
      name: 'Driven',
    });
    expect(service.getSavedTeamById('missing-team')).toBeNull();
  });

  it('saves a normalized enemy preset and persists it in front of older enemies', async () => {
    const { service, setCalls } = await createService([], [createEnemy('enemy-1', 'Old enemy')]);

    const result = await service.saveEnemy({
      name: '  Forest Boss  ',
      notes: '  removes bind and despair  ',
      imageDataUrl: 'data:image/jpeg;base64,ZmFrZS1pbWFnZQ==',
      selectedTypes: ['dex', 'PSY', 'dex'],
      selectedClasses: ['Fighter', ' Slasher ', 'Fighter'],
      requiredAbilities: [
        {
          abilityKey: ' remove_bind ',
          minTurns: 5,
          slotTokens: [],
          requiredCharacterCount: 1,
        },
        {
          abilityKey: 'remove_bind',
          minTurns: 5,
          slotTokens: [],
          requiredCharacterCount: 2,
        },
      ],
      enemyMechanics: [],
      requireAllSelectedTypesInTeam: true,
      requireAllSelectedClassesPerCharacter: false,
      requireAllSpecialsSupportTeam: true,
    });

    expect(result).toMatchObject({
      name: 'Forest Boss',
      notes: 'removes bind and despair',
      imageDataUrl: 'data:image/jpeg;base64,ZmFrZS1pbWFnZQ==',
      selectedTypes: ['DEX', 'PSY'],
      selectedClasses: ['Fighter', 'Slasher'],
      requiredAbilities: [
        {
          abilityKey: 'remove_bind',
          minTurns: 5,
          slotTokens: [],
          requiredCharacterCount: 2,
        },
      ],
      enemyMechanics: [],
      requireAllSelectedTypesInTeam: true,
      requireAllSelectedClassesPerCharacter: false,
      requireAllSpecialsSupportTeam: true,
    });
    expect(service.savedEnemies()[0]?.id).toBe(result.id);
    expect(service.savedEnemies()[1]?.id).toBe('enemy-1');
    expect(setCalls.at(-1)?.key).toBe('savedEnemies');
  });

  it('hydrates legacy or invalid enemy image payloads as null', async () => {
    const { service } = await createService(
      [],
      [
        {
          ...createEnemy('enemy-1', 'Legacy enemy'),
        },
        {
          ...createEnemy('enemy-2', 'Invalid image enemy'),
          imageDataUrl: 'https://example.com/enemy.png',
        },
      ],
    );

    expect(service.savedEnemies()[0]).toMatchObject({
      id: 'enemy-1',
      imageDataUrl: null,
    });
    expect(service.savedEnemies()[1]).toMatchObject({
      id: 'enemy-2',
      imageDataUrl: null,
    });
  });

  it('deletes only the requested saved enemies and persists the next enemy state', async () => {
    const { service, setCalls } = await createService(
      [],
      [createEnemy('enemy-1', 'Forest Boss'), createEnemy('enemy-2', 'Arena Boss')],
    );

    await service.deleteEnemies(['enemy-2', 'missing']);

    expect(service.savedEnemies().map((enemy) => enemy.id)).toEqual(['enemy-1']);
    expect(setCalls.at(-1)?.key).toBe('savedEnemies');
    expect(JSON.parse(setCalls.at(-1)?.value ?? '[]')).toEqual([
      createEnemy('enemy-1', 'Forest Boss'),
    ]);
  });

  it('clears all saved enemies without touching teams or favorites', async () => {
    const { service, setCalls } = await createService(
      [createTeam('team-1', 'Slashers')],
      [createEnemy('enemy-1', 'Forest Boss'), createEnemy('enemy-2', 'Arena Boss')],
    );

    await service.clearAllSavedEnemies();

    expect(service.savedEnemies()).toEqual([]);
    expect(setCalls.at(-1)).toEqual({
      key: 'savedEnemies',
      value: JSON.stringify([]),
    });
    expect(service.savedTeams()).toEqual([createTeam('team-1', 'Slashers')]);
    expect(service.favoriteCharacterIds()).toEqual([]);
  });

  it('clears all favorite character ids without touching teams or enemies', async () => {
    const { service, setCalls } = await createService(
      [createTeam('team-1', 'Slashers')],
      [createEnemy('enemy-1', 'Forest Boss')],
      [],
      [101, 202],
    );

    await service.clearAllFavoriteCharacterIds();

    expect(service.favoriteCharacterIds()).toEqual([]);
    expect(setCalls.at(-1)).toEqual({
      key: 'favoriteCharacterIds',
      value: JSON.stringify([]),
    });
    expect(service.savedTeams()).toEqual([createTeam('team-1', 'Slashers')]);
    expect(service.savedEnemies()).toEqual([createEnemy('enemy-1', 'Forest Boss')]);
  });

  it('clears all favorite ship ids without touching teams, enemies, or character favorites', async () => {
    const { service, setCalls } = await createService(
      [createTeam('team-1', 'Slashers')],
      [createEnemy('enemy-1', 'Forest Boss')],
      [9001, 9002],
      [101, 202],
    );

    await service.clearAllFavoriteShipIds();

    expect(service.favoriteShipIds()).toEqual([]);
    expect(setCalls.at(-1)).toEqual({
      key: 'favoriteShipIds',
      value: JSON.stringify([]),
    });
    expect(service.savedTeams()).toEqual([createTeam('team-1', 'Slashers')]);
    expect(service.savedEnemies()).toEqual([createEnemy('enemy-1', 'Forest Boss')]);
    expect(service.favoriteCharacterIds()).toEqual([101, 202]);
  });

  it('merges imported enemies by id and keeps untouched enemies behind them', async () => {
    const originalEnemy = createEnemy('enemy-1', 'Forest Boss');
    const { service, setCalls } = await createService(
      [],
      [originalEnemy, createEnemy('enemy-2', 'Arena Boss')],
    );

    const result = await service.mergeImportedEnemies([
      {
        ...createEnemy('enemy-1', 'Updated Forest Boss'),
        notes: 'merged',
        selectedTypes: ['STR'],
      },
      createEnemy('enemy-3', 'Brand new enemy'),
    ]);

    expect(result).toMatchObject({
      addedCount: 1,
      updatedCount: 1,
    });
    expect(service.savedEnemies().map((enemy) => enemy.id)).toEqual([
      'enemy-1',
      'enemy-3',
      'enemy-2',
    ]);
    expect(service.savedEnemies()[0]).toMatchObject({
      id: 'enemy-1',
      name: 'Updated Forest Boss',
      notes: 'merged',
      selectedTypes: ['STR'],
      createdAt: originalEnemy.createdAt,
    });
    expect(service.savedEnemies()[0]?.updatedAt).not.toBe(originalEnemy.updatedAt);
    expect(
      JSON.parse(setCalls.at(-1)?.value ?? '[]').map((enemy: { id: string }) => enemy.id),
    ).toEqual(['enemy-1', 'enemy-3', 'enemy-2']);
  });
});

async function createService(
  storedTeams: unknown[] = [],
  storedEnemies: unknown[] = [],
  storedFavoriteShipIds: number[] = [],
  storedFavoriteCharacterIds: number[] = [],
  storedAutoTeamBuilderWorkerPreference: unknown = { mode: 'auto', manualCount: 7 },
) {
  const store = new Map<string, string>([
    ['favoriteCharacterIds', JSON.stringify(storedFavoriteCharacterIds)],
    ['favoriteShipIds', JSON.stringify(storedFavoriteShipIds)],
    ['recentCharacterIds', JSON.stringify([])],
    ['savedTeams', JSON.stringify(storedTeams)],
    ['savedEnemies', JSON.stringify(storedEnemies)],
    ['autoTeamBuilderWorkerPreference', JSON.stringify(storedAutoTeamBuilderWorkerPreference)],
  ]);
  const setCalls: Array<{ key: string; value: string }> = [];

  vi.mocked(Preferences.get).mockImplementation(async ({ key }) => ({
    value: store.get(key) ?? null,
  }));
  vi.mocked(Preferences.set).mockImplementation(async ({ key, value }) => {
    setCalls.push({ key, value });
    store.set(key, value);
  });

  const i18n = {
    translate: vi.fn((key: string) => {
      if (key === 'common.defaults.untitledCrew') {
        return 'Untitled Crew';
      }

      if (key === 'common.defaults.untitledEnemy') {
        return 'Untitled Enemy';
      }

      return key;
    }),
  };
  const service = new UserStateService(i18n as never);

  await service.ready();

  return { service, setCalls };
}

function createTeam(id: string, name: string) {
  return {
    id,
    name,
    notes: '',
    shipId: null,
    slots: [101, null, 202, null, null, 303],
    createdAt: '2026-03-29T10:00:00.000Z',
    updatedAt: '2026-03-29T10:05:00.000Z',
  };
}

function createEnemy(id: string, name: string) {
  return {
    id,
    name,
    notes: '',
    imageDataUrl: null,
    selectedTypes: ['DEX'],
    selectedClasses: ['Fighter'],
    requiredAbilities: [],
    enemyMechanics: [],
    requireAllSelectedTypesInTeam: false,
    requireAllSelectedClassesPerCharacter: false,
    requireAllSpecialsSupportTeam: false,
    createdAt: '2026-03-29T10:00:00.000Z',
    updatedAt: '2026-03-29T10:05:00.000Z',
  };
}
