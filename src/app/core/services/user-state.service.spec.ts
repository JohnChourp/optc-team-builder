import '@angular/compiler';
import { describe, expect, it, beforeEach, vi } from 'vitest';

import { BUILT_IN_CREW_FORGE_IMAGE_PROFILES } from '../data/crew-forge-built-in-profiles';
import { type PreferencesAdapterService } from './preferences-adapter.service';
import { UserStateService } from './user-state.service';

let preferences: { get: ReturnType<typeof vi.fn>; set: ReturnType<typeof vi.fn> };

describe('UserStateService saved teams', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
    preferences = {
      get: vi.fn().mockResolvedValue({ value: null }),
      set: vi.fn().mockResolvedValue(undefined),
    };
  });

  it('hydrates only requested domains until full ready is requested', async () => {
    const store = new Map<string, string>([
      ['favoriteCharacterIds', JSON.stringify([101])],
      ['favoriteShipIds', JSON.stringify([9001])],
      ['recentCharacterIds', JSON.stringify([202])],
      ['characterBoxes', JSON.stringify([])],
      ['savedTeams', JSON.stringify([createTeam('team-1', 'Team 1')])],
      ['savedEnemies', JSON.stringify([createEnemy('enemy-1', 'Enemy 1')])],
      ['savedRumbleTeams', JSON.stringify([])],
      ['crewForgeImageProfiles', JSON.stringify([])],
      ['crewForgeLastImageProfileId', JSON.stringify(null)],
      ['autoTeamBuilderWorkerPreference', JSON.stringify({ mode: 'auto', manualCount: 7 })],
    ]);
    const i18n = {
      translate: vi.fn((key: string) => key),
    };

    preferences.get.mockImplementation(async ({ key }) => ({
      value: store.get(key) ?? null,
    }));

    const service = new UserStateService(i18n as never, preferences as unknown as PreferencesAdapterService);

    await service.readySavedEnemies();
    expect(service.savedEnemies().map((enemy) => enemy.id)).toEqual(['enemy-1']);
    expect(preferences.get.mock.calls.map(([call]) => call.key)).toEqual([
      'savedEnemies',
    ]);

    preferences.get.mockClear();
    await service.ready();
    expect(preferences.get.mock.calls.map(([call]) => call.key)).toEqual(
      expect.arrayContaining([
        'favoriteCharacterIds',
        'favoriteShipIds',
        'recentCharacterIds',
        'characterBoxes',
        'savedTeams',
        'savedRumbleTeams',
        'crewForgeImageProfiles',
        'crewForgeLastImageProfileId',
        'autoTeamBuilderWorkerPreference',
      ]),
    );
    expect(preferences.get.mock.calls.map(([call]) => call.key)).not.toContain(
      'savedEnemies',
    );
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

  it('hydrates the manual worker preference and clamps it to 65% of detected cores', async () => {
    vi.stubGlobal('navigator', { hardwareConcurrency: 14 });
    const { service } = await createService([], [], [], [], {
      mode: 'manual',
      manualCount: 20,
    });

    expect(service.autoTeamBuilderWorkerPreference()).toEqual({
      mode: 'manual',
      manualCount: 9,
    });
    expect(service.resolveAutoTeamBuilderWorkerPreference()).toEqual({
      mode: 'manual',
      manualCount: 9,
      detectedCoreCount: 14,
      manualMaxCount: 9,
      manualMaxPercent: 64,
      effectiveCount: 9,
    });
  });

  it('caps manual worker mode to seven workers on twelve-core devices', async () => {
    vi.stubGlobal('navigator', { hardwareConcurrency: 12 });
    const { service } = await createService([], [], [], [], {
      mode: 'manual',
      manualCount: 20,
    });

    expect(service.autoTeamBuilderWorkerPreference()).toEqual({
      mode: 'manual',
      manualCount: 7,
    });
    expect(service.resolveAutoTeamBuilderWorkerPreference()).toEqual({
      mode: 'manual',
      manualCount: 7,
      detectedCoreCount: 12,
      manualMaxCount: 7,
      manualMaxPercent: 58,
      effectiveCount: 7,
    });
  });

  it('keeps auto worker mode capped at four workers on high-core devices', async () => {
    vi.stubGlobal('navigator', { hardwareConcurrency: 12 });
    const { service } = await createService([], [], [], [], {
      mode: 'auto',
      manualCount: 7,
    });

    expect(service.resolveAutoTeamBuilderWorkerPreference()).toEqual({
      mode: 'auto',
      manualCount: 7,
      detectedCoreCount: 12,
      manualMaxCount: 7,
      manualMaxPercent: 58,
      effectiveCount: 4,
    });
    expect(service.resolveAutoTeamBuilderWorkerCount()).toBe(4);
  });

  it('keeps auto worker mode clamped to at least one worker on low-core devices', async () => {
    vi.stubGlobal('navigator', { hardwareConcurrency: 1 });
    const { service } = await createService([], [], [], [], {
      mode: 'auto',
      manualCount: 7,
    });

    expect(service.resolveAutoTeamBuilderWorkerPreference()).toEqual({
      mode: 'auto',
      manualCount: 1,
      detectedCoreCount: 1,
      manualMaxCount: 1,
      manualMaxPercent: 100,
      effectiveCount: 1,
    });
    expect(service.resolveAutoTeamBuilderWorkerCount()).toBe(1);
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
    expect(service.resolveAutoTeamBuilderWorkerCount()).toBe(4);
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
      manualCount: 6,
    });
    expect(setCalls.at(-1)).toEqual({
      key: 'autoTeamBuilderWorkerPreference',
      value: JSON.stringify({
        mode: 'manual',
        manualCount: 6,
      }),
    });
  });

  it('hydrates saved character boxes and returns them by normalized id', async () => {
    const { service } = await createService([], [], [], [], { mode: 'auto', manualCount: 7 }, [
      createBox('box-1', 'Powerhouse Box', [101, 202]),
    ]);

    expect(service.characterBoxes()).toEqual([createBox('box-1', 'Powerhouse Box', [101, 202])]);
    expect(service.getCharacterBoxById(' box-1 ')).toMatchObject({
      id: 'box-1',
      name: 'Powerhouse Box',
    });
  });

  it('saves a normalized character box and preserves createdAt on update', async () => {
    const originalBox = createBox('box-1', 'Original Box', [101, 202]);
    const { service, setCalls } = await createService(
      [],
      [],
      [],
      [],
      { mode: 'auto', manualCount: 7 },
      [originalBox],
    );

    const result = await service.saveCharacterBox({
      id: 'box-1',
      name: '  Updated Box  ',
      characterIds: [303, 303, 101, -1],
    });

    expect(result).toMatchObject({
      id: 'box-1',
      name: 'Updated Box',
      characterIds: [303, 101],
      createdAt: originalBox.createdAt,
    });
    expect(result?.updatedAt).not.toBe(originalBox.updatedAt);
    expect(setCalls.at(-1)?.key).toBe('characterBoxes');
    expect(JSON.parse(setCalls.at(-1)?.value ?? '[]')).toEqual([
      expect.objectContaining({
        id: 'box-1',
        name: 'Updated Box',
        characterIds: [303, 101],
        createdAt: originalBox.createdAt,
      }),
    ]);
  });

  it('rejects invalid character boxes and deletes existing ones without touching other state', async () => {
    const { service, setCalls } = await createService(
      [createTeam('team-1', 'Slashers')],
      [createEnemy('enemy-1', 'Forest Boss')],
      [],
      [101],
      { mode: 'auto', manualCount: 7 },
      [createBox('box-1', 'Valid Box', [101])],
    );

    await expect(
      service.saveCharacterBox({
        name: '   ',
        characterIds: [202],
      }),
    ).resolves.toBeNull();

    await service.deleteCharacterBox('box-1');

    expect(service.characterBoxes()).toEqual([]);
    expect(setCalls.at(-1)).toEqual({
      key: 'characterBoxes',
      value: JSON.stringify([]),
    });
    expect(service.savedTeams()).toEqual([createTeam('team-1', 'Slashers')]);
    expect(service.savedEnemies()).toEqual([createEnemy('enemy-1', 'Forest Boss')]);
    expect(service.favoriteCharacterIds()).toEqual([101]);
  });

  it('clears all character boxes without touching teams, enemies, or favorites', async () => {
    const { service, setCalls } = await createService(
      [createTeam('team-1', 'Slashers')],
      [createEnemy('enemy-1', 'Forest Boss')],
      [],
      [101],
      { mode: 'auto', manualCount: 7 },
      [createBox('box-1', 'Valid Box', [101]), createBox('box-2', 'Extra Box', [202])],
    );

    await service.clearAllCharacterBoxes();

    expect(service.characterBoxes()).toEqual([]);
    expect(setCalls.at(-1)).toEqual({
      key: 'characterBoxes',
      value: JSON.stringify([]),
    });
    expect(service.savedTeams()).toEqual([createTeam('team-1', 'Slashers')]);
    expect(service.savedEnemies()).toEqual([createEnemy('enemy-1', 'Forest Boss')]);
    expect(service.favoriteCharacterIds()).toEqual([101]);
  });

  it('merges imported character boxes by id and preserves createdAt on updates', async () => {
    const originalBox = createBox('box-1', 'Original Box', [101, 202]);
    const { service, setCalls } = await createService(
      [],
      [],
      [],
      [],
      { mode: 'auto', manualCount: 7 },
      [originalBox, createBox('box-2', 'Untouched Box', [303])],
    );

    const result = await service.mergeImportedCharacterBoxes([
      {
        ...createBox('box-1', 'Updated Import', [404]),
        createdAt: '2026-04-14T10:00:00.000Z',
        updatedAt: '2026-04-14T10:05:00.000Z',
      },
      createBox('box-3', 'Brand New Box', [505]),
    ]);

    expect(result).toMatchObject({
      addedCount: 1,
      updatedCount: 1,
    });
    expect(service.characterBoxes().map((box) => box.id)).toEqual(['box-1', 'box-3', 'box-2']);
    expect(service.characterBoxes()[0]).toMatchObject({
      id: 'box-1',
      name: 'Updated Import',
      characterIds: [404],
      createdAt: originalBox.createdAt,
    });
    expect(service.characterBoxes()[0]?.updatedAt).not.toBe(originalBox.updatedAt);
    expect(JSON.parse(setCalls.at(-1)?.value ?? '[]').map((box: { id: string }) => box.id)).toEqual(
      ['box-1', 'box-3', 'box-2'],
    );
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
      rawEnemyText: ' 4 turn(s) Special Bind\nNon-Normal Attacks deal 1 damage ',
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
    });

    expect(result).toMatchObject({
      name: 'Forest Boss',
      notes: 'removes bind and despair',
      rawEnemyText: ' 4 turn(s) Special Bind\nNon-Normal Attacks deal 1 damage ',
      imageDataUrl: 'data:image/jpeg;base64,ZmFrZS1pbWFnZQ==',
      selectedTypes: ['DEX', 'PSY'],
      selectedClasses: ['Fighter', 'Slasher'],
      requiredAbilities: [
        {
          abilityKey: 'remove_bind',
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
    });
    expect(service.savedEnemies()[0]?.id).toBe(result.id);
    expect(service.savedEnemies()[1]?.id).toBe('enemy-1');
    expect(setCalls.at(-1)?.key).toBe('savedEnemies');
  });

  it('hydrates legacy raw text as empty and invalid enemy image payloads as null', async () => {
    const { rawEnemyText: _rawEnemyText, ...legacyEnemy } = createEnemy('enemy-1', 'Legacy enemy');
    const { service } = await createService(
      [],
      [
        legacyEnemy,
        {
          ...createEnemy('enemy-2', 'Invalid image enemy'),
          rawEnemyText: 123,
          imageDataUrl: 'https://example.com/enemy.png',
        },
      ],
    );

    expect(service.savedEnemies()[0]).toMatchObject({
      id: 'enemy-1',
      rawEnemyText: '',
      imageDataUrl: null,
    });
    expect(service.savedEnemies()[1]).toMatchObject({
      id: 'enemy-2',
      rawEnemyText: '',
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

  it('hydrates crew forge image profiles and restores the last selected profile id', async () => {
    const storedProfile = createCrewForgeProfile('profile-1', 'Main Profile');
    const { service } = await createService(
      [],
      [],
      [],
      [],
      { mode: 'auto', manualCount: 7 },
      [],
      [storedProfile],
      'profile-1',
    );

    expect(service.crewForgeImageProfiles()).toEqual([
      ...BUILT_IN_CREW_FORGE_IMAGE_PROFILES,
      storedProfile,
    ]);
    expect(service.crewForgeLastImageProfileId()).toBe('profile-1');
    expect(service.findCrewForgeImageProfileByDimensions(1080, 1920)?.id).toBe('profile-1');
  });

  it('exposes the bundled crew forge profile to fresh users and restores its preferred id', async () => {
    const { service } = await createService(
      [],
      [],
      [],
      [],
      { mode: 'auto', manualCount: 7 },
      [],
      [],
      'crew-forge-default-android-1080x2400-character-recruitment',
    );

    const builtInProfile = service.crewForgeImageProfiles()[0];

    expect(builtInProfile).toMatchObject({
      id: 'crew-forge-default-android-1080x2400-character-recruitment',
      source: 'built-in',
      imageWidth: 1080,
      imageHeight: 2400,
    });
    expect(builtInProfile?.slotDefinitions.map((slot) => slot.key)).toEqual([
      'leader-1',
      'leader-2',
      'leader-3',
      'leader-4',
      'sub-1',
      'sub-2',
      'sub-3',
      'sub-4',
      'sub-5',
      'sub-6',
      'sub-7',
      'sub-8',
    ]);
    expect(builtInProfile?.slotDefinitions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: 'leader-1',
          x: 149,
          y: 856,
          width: 179,
          height: 179,
        }),
        expect.objectContaining({
          key: 'leader-4',
          x: 740,
          y: 856,
          width: 179,
          height: 179,
        }),
        expect.objectContaining({
          key: 'sub-1',
          x: 149,
          y: 1179,
          width: 179,
          height: 179,
        }),
        expect.objectContaining({
          key: 'sub-8',
          x: 740,
          y: 1384,
          width: 179,
          height: 179,
        }),
      ]),
    );
    expect(service.crewForgeLastImageProfileId()).toBe(
      'crew-forge-default-android-1080x2400-character-recruitment',
    );
    expect(service.findCrewForgeImageProfileByDimensions(1080, 2400)?.id).toBe(
      'crew-forge-default-android-1080x2400-character-recruitment',
    );
  });

  it('saves normalized crew forge profiles and persists examples and exemplars through dedicated helpers', async () => {
    const originalProfile = createCrewForgeProfile('profile-1', 'Original Profile');
    const { service, setCalls } = await createService(
      [],
      [],
      [],
      [],
      { mode: 'auto', manualCount: 7 },
      [],
      [originalProfile],
      'profile-1',
    );

    const savedProfile = await service.saveCrewForgeImageProfile({
      id: 'profile-1',
      name: '  Updated Profile  ',
      imageWidth: 1080,
      imageHeight: 1920,
      slotDefinitions: originalProfile.slotDefinitions.map((slot, index) => ({
        ...slot,
        x: index,
      })),
      preprocess: {
        ...originalProfile.preprocess,
        matchThreshold: 0.95,
      },
      examples: originalProfile.examples,
      exemplars: originalProfile.exemplars,
    });

    expect(savedProfile).toMatchObject({
      id: 'profile-1',
      name: 'Updated Profile',
    });
    expect(service.crewForgeLastImageProfileId()).toBe('profile-1');

    await service.saveCrewForgeImageExample('profile-1', {
      name: ' Example Screenshot ',
      imageDataUrl: 'data:image/png;base64,ZXhhbXBsZQ==',
      imageWidth: 1080,
      imageHeight: 1920,
    });
    await service.saveCrewForgeImageExemplar('profile-1', {
      slotKey: 'leader-1',
      characterId: 101,
      fingerprint: Array.from({ length: 256 }, () => 0.5),
      cropDataUrl: 'data:image/png;base64,Y3JvcA==',
    });

    expect(
      service.crewForgeImageProfiles().find((profile) => profile.id === 'profile-1')?.examples,
    ).toEqual([
      expect.objectContaining({
        name: 'Example Screenshot',
        imageWidth: 1080,
        imageHeight: 1920,
      }),
    ]);
    expect(
      service.crewForgeImageProfiles().find((profile) => profile.id === 'profile-1')?.exemplars,
    ).toEqual([
      expect.objectContaining({
        slotKey: 'leader-1',
        characterId: 101,
      }),
    ]);
    expect(setCalls.map((call) => call.key)).toContain('crewForgeImageProfiles');
  });

  it('forks built-in profiles into user copies before saving examples and exemplars', async () => {
    const { service, setCalls } = await createService(
      [],
      [],
      [],
      [],
      { mode: 'auto', manualCount: 7 },
      [],
      [],
      'crew-forge-default-android-1080x2400-character-recruitment',
    );

    const exampleProfile = await service.saveCrewForgeImageExample(
      'crew-forge-default-android-1080x2400-character-recruitment',
      {
        name: 'Built-in Example',
        imageDataUrl: 'data:image/png;base64,ZXhhbXBsZQ==',
        imageWidth: 1080,
        imageHeight: 2400,
      },
    );

    expect(exampleProfile).toMatchObject({
      source: 'user',
      name: 'Android 1080×2400 Recruitment Copy',
    });
    expect(exampleProfile?.id).not.toBe(
      'crew-forge-default-android-1080x2400-character-recruitment',
    );
    expect(exampleProfile?.examples).toHaveLength(1);

    const exemplarProfile = await service.saveCrewForgeImageExemplar(exampleProfile?.id ?? '', {
      slotKey: 'leader-1',
      characterId: 101,
      fingerprint: Array.from({ length: 256 }, () => 0.5),
      cropDataUrl: 'data:image/png;base64,Y3JvcA==',
    });

    expect(exemplarProfile).toMatchObject({
      id: exampleProfile?.id,
      source: 'user',
    });
    expect(exemplarProfile?.exemplars).toEqual([
      expect.objectContaining({
        slotKey: 'leader-1',
        characterId: 101,
      }),
    ]);
    expect(setCalls.map((call) => call.key)).toContain('crewForgeImageProfiles');
  });
});

async function createService(
  storedTeams: unknown[] = [],
  storedEnemies: unknown[] = [],
  storedFavoriteShipIds: number[] = [],
  storedFavoriteCharacterIds: number[] = [],
  storedAutoTeamBuilderWorkerPreference: unknown = { mode: 'auto', manualCount: 7 },
  storedCharacterBoxes: unknown[] = [],
  storedCrewForgeImageProfiles: unknown[] = [],
  storedCrewForgeLastImageProfileId: string | null = null,
) {
  const store = new Map<string, string>([
    ['favoriteCharacterIds', JSON.stringify(storedFavoriteCharacterIds)],
    ['favoriteShipIds', JSON.stringify(storedFavoriteShipIds)],
    ['recentCharacterIds', JSON.stringify([])],
    ['characterBoxes', JSON.stringify(storedCharacterBoxes)],
    ['savedTeams', JSON.stringify(storedTeams)],
    ['savedEnemies', JSON.stringify(storedEnemies)],
    ['savedRumbleTeams', JSON.stringify([])],
    ['crewForgeImageProfiles', JSON.stringify(storedCrewForgeImageProfiles)],
    ['crewForgeLastImageProfileId', JSON.stringify(storedCrewForgeLastImageProfileId)],
    ['autoTeamBuilderWorkerPreference', JSON.stringify(storedAutoTeamBuilderWorkerPreference)],
  ]);
  const setCalls: Array<{ key: string; value: string }> = [];

  preferences.get.mockImplementation(async ({ key }) => ({
    value: store.get(key) ?? null,
  }));
  preferences.set.mockImplementation(async ({ key, value }) => {
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
  const service = new UserStateService(i18n as never, preferences as unknown as PreferencesAdapterService);

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
    rawEnemyText: '',
    imageDataUrl: null,
    selectedTypes: ['DEX'],
    selectedClasses: ['Fighter'],
    selectedCharacterTags: [],
    selectedCharacterNames: [],
    requiredAbilities: [],
    requiredCharacterGroups: [],
    battleRequirements: [],
    enemyMechanics: [],
    requireAllSelectedTypesInTeam: false,
    requireAllSelectedClassesPerCharacter: false,
    requireAllSelectedCharacterTagsInTeam: false,
    requireAllSelectedCharacterNamesInTeam: false,
    associatedTeamIds: [],
    createdAt: '2026-03-29T10:00:00.000Z',
    updatedAt: '2026-03-29T10:05:00.000Z',
  };
}

function createBox(id: string, name: string, characterIds: number[]) {
  return {
    id,
    name,
    characterIds,
    createdAt: '2026-03-29T10:00:00.000Z',
    updatedAt: '2026-03-29T10:05:00.000Z',
  };
}

function createCrewForgeProfile(id: string, name: string) {
  return {
    id,
    name,
    source: 'user' as const,
    imageWidth: 1080,
    imageHeight: 1920,
    slotDefinitions: [
      createCrewForgeSlot('leader-1', 'Leader 1', 'leader'),
      createCrewForgeSlot('leader-2', 'Leader 2', 'leader'),
      createCrewForgeSlot('leader-3', 'Leader 3', 'leader'),
      createCrewForgeSlot('leader-4', 'Leader 4', 'leader'),
      createCrewForgeSlot('sub-1', 'Sub 1', 'sub'),
      createCrewForgeSlot('sub-2', 'Sub 2', 'sub'),
      createCrewForgeSlot('sub-3', 'Sub 3', 'sub'),
      createCrewForgeSlot('sub-4', 'Sub 4', 'sub'),
      createCrewForgeSlot('sub-5', 'Sub 5', 'sub'),
      createCrewForgeSlot('sub-6', 'Sub 6', 'sub'),
      createCrewForgeSlot('sub-7', 'Sub 7', 'sub'),
      createCrewForgeSlot('sub-8', 'Sub 8', 'sub'),
    ],
    preprocess: {
      fingerprintSize: 16,
      contrast: 1,
      brightness: 0,
      grayscale: true,
      invert: false,
      blurRadius: 0,
      matchThreshold: 0.92,
      emptyVarianceThreshold: 0.005,
    },
    examples: [],
    exemplars: [],
    createdAt: '2026-03-29T10:00:00.000Z',
    updatedAt: '2026-03-29T10:05:00.000Z',
  };
}

function createCrewForgeSlot(key: string, label: string, role: 'leader' | 'sub') {
  return {
    key,
    label,
    role,
    x: 10,
    y: 10,
    width: 120,
    height: 120,
  };
}
