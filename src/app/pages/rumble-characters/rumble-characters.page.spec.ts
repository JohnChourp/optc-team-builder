import '@angular/compiler';
import { signal } from '@angular/core';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

import {
  type NormalizedRumbleRoleTag,
  type RumbleUnitScore,
} from '../../core/models/auto-team-builder-rumble.models';
import { RumbleCharactersPage } from './rumble-characters.page';

vi.mock('@ionic/angular/standalone', () => ({
  IonButton: class {},
  IonButtons: class {},
  IonContent: class {},
  IonHeader: class {},
  IonIcon: class {},
  IonInput: class {},
  IonMenuButton: class {},
  IonSearchbar: class {},
  IonSelect: class {},
  IonSelectOption: class {},
  IonSpinner: class {},
  IonTitle: class {},
  IonToggle: class {},
  IonToolbar: class {},
}));

describe('RumbleCharactersPage', () => {
  it('loads Rumble candidates and scores them through the existing builder service', async () => {
    const scoredUnits = [createUnit({ id: 1001 })];
    const { page, repository, rumbleBuilder, i18n } = createPage({ scoredUnits });

    await page.ngOnInit();

    expect(i18n.preloadScope).toHaveBeenCalledWith('rumble-characters');
    expect(repository.getRumbleBuilderCandidates).toHaveBeenCalled();
    expect(rumbleBuilder.scoreCandidates).toHaveBeenCalledWith(['raw-candidate']);
    expect(page.cardViews().map((card) => card.character.id)).toEqual([1001]);
  });

  it('filters favorites-only and hide-favorites modes as mutually exclusive scopes', () => {
    const { page } = createPage({
      favoriteIds: [1002],
      scoredUnits: [createUnit({ id: 1001 }), createUnit({ id: 1002 })],
    });

    page.candidates.set([createUnit({ id: 1001 }), createUnit({ id: 1002 })]);
    page.onFavoritesOnlyToggle({ detail: { checked: true } } as CustomEvent<{ checked: boolean }>);

    expect(page.favoritesOnly()).toBe(true);
    expect(page.hideFavorites()).toBe(false);
    expect(page.cardViews().map((card) => card.character.id)).toEqual([1002]);

    page.onHideFavoritesToggle({ detail: { checked: true } } as CustomEvent<{ checked: boolean }>);

    expect(page.favoritesOnly()).toBe(false);
    expect(page.hideFavorites()).toBe(true);
    expect(page.cardViews().map((card) => card.character.id)).toEqual([1001]);
  });

  it('filters by search, type, and class', () => {
    const { page } = createPage({
      scoredUnits: [
        createUnit({ id: 1001, name: 'Luffy', type: 'STR', classes: ['Fighter'] }),
        createUnit({ id: 1002, name: 'Zoro', type: 'DEX', classes: ['Slasher'] }),
      ],
    });

    page.candidates.set([
      createUnit({ id: 1001, name: 'Luffy', type: 'STR', classes: ['Fighter'] }),
      createUnit({ id: 1002, name: 'Zoro', type: 'DEX', classes: ['Slasher'] }),
    ]);
    page.onSearchChange({ detail: { value: 'zoro' } } as CustomEvent<{ value: string }>);
    page.onTypeChange({ detail: { value: 'DEX' } } as CustomEvent<{ value: string }>);
    page.onClassChange({ detail: { value: 'Slasher' } } as CustomEvent<{ value: string }>);

    expect(page.cardViews().map((card) => card.character.id)).toEqual([1002]);
  });

  it('filters by role, Rumble type, cooldown, and cost', () => {
    const { page } = createPage({
      scoredUnits: [
        createUnit({
          id: 1001,
          cost: 55,
          cooldown: 30,
          roles: ['attacker', 'booster'],
          rumbleType: 'STR',
        }),
        createUnit({
          id: 1002,
          cost: 70,
          cooldown: 18,
          roles: ['attacker'],
          rumbleType: 'DEX',
        }),
        createUnit({
          id: 1003,
          cost: 45,
          cooldown: 16,
          roles: ['attacker', 'booster'],
          rumbleType: 'STR',
        }),
      ],
    });

    page.candidates.set([
      createUnit({
        id: 1001,
        cost: 55,
        cooldown: 30,
        roles: ['attacker', 'booster'],
        rumbleType: 'STR',
      }),
      createUnit({
        id: 1002,
        cost: 70,
        cooldown: 18,
        roles: ['attacker'],
        rumbleType: 'DEX',
      }),
      createUnit({
        id: 1003,
        cost: 45,
        cooldown: 16,
        roles: ['attacker', 'booster'],
        rumbleType: 'STR',
      }),
    ]);
    page.onRolesChange({
      detail: { value: ['attacker', 'booster'] },
    } as CustomEvent<{ value: string[] }>);
    page.onRumbleTypeChange({ detail: { value: 'STR' } } as CustomEvent<{ value: string }>);
    page.onMaxCooldownChange({ detail: { value: '20' } } as CustomEvent<{ value: string }>);
    page.onMaxCostChange({ detail: { value: '50' } } as CustomEvent<{ value: string }>);

    expect(page.cardViews().map((card) => card.character.id)).toEqual([1003]);
  });

  it('keeps the Build Focus control and core filters in the template', () => {
    const template = readFileSync(
      resolve(process.cwd(), 'src/app/pages/rumble-characters/rumble-characters.page.html'),
      'utf8',
    );

    expect(template).toContain("scope: 'rumble-characters'");
    expect(template).toContain('onFavoritesOnlyToggle($event)');
    expect(template).toContain('onHideFavoritesToggle($event)');
    expect(template).toContain('onRolesChange($event)');
    expect(template).toContain('onRumbleTypeChange($event)');
    expect(template).toContain('onMaxCooldownChange($event)');
    expect(template).toContain('onMaxCostChange($event)');
    expect(template).toContain('buffFocusRanks');
    expect(template).toContain('moveBuffFocusStat(stat,');
  });
});

function createPage(
  overrides: {
    favoriteIds?: number[];
    scoredUnits?: RumbleUnitScore[];
  } = {},
) {
  const favoriteIds = signal(overrides.favoriteIds ?? []);
  const repository = {
    getDatasetManifest: vi.fn().mockResolvedValue({
      characterCount: 3,
      detailCount: 3,
      rumbleCount: 3,
      availableTypes: ['STR', 'DEX'],
      availableClasses: ['Fighter', 'Slasher'],
      packs: [],
    }),
    getRumbleBuilderCandidates: vi.fn().mockResolvedValue(['raw-candidate']),
  };
  const rumbleBuilder = {
    scoreCandidates: vi.fn().mockReturnValue(overrides.scoredUnits ?? []),
  };
  const userState = {
    ready: vi.fn().mockResolvedValue(undefined),
    favoriteCharacterIds: favoriteIds,
    toggleFavorite: vi.fn().mockImplementation(async (characterId: number) => {
      const currentFavoriteIds = favoriteIds();
      favoriteIds.set(
        currentFavoriteIds.includes(characterId)
          ? currentFavoriteIds.filter((favoriteId) => favoriteId !== characterId)
          : [...currentFavoriteIds, characterId],
      );
    }),
  };
  const i18n = {
    preloadScope: vi.fn().mockResolvedValue(undefined),
    translate: vi.fn((key: string, params?: Record<string, string | number>) =>
      params?.['name'] ? `${key}:${params['name']}` : key,
    ),
  };
  const page = new RumbleCharactersPage(
    repository as never,
    rumbleBuilder as never,
    userState as never,
    i18n as never,
  );

  return { page, repository, rumbleBuilder, userState, i18n };
}

function createUnit(overrides: {
  classes?: string[];
  cooldown?: number | null;
  cost?: number;
  id: number;
  name?: string;
  roles?: NormalizedRumbleRoleTag[];
  rumbleType?: string;
  type?: string;
}): RumbleUnitScore {
  const classes = overrides.classes ?? ['Fighter'];
  const primaryClass = classes[0] ?? 'Fighter';
  const secondaryClass = classes[1] ?? null;

  return {
    character: {
      id: overrides.id,
      name: overrides.name ?? `Unit ${overrides.id}`,
      searchText: overrides.name ?? `Unit ${overrides.id}`,
      isIncomplete: false,
      type: overrides.type ?? 'STR',
      classes,
      primaryClass,
      secondaryClass,
      stars: 6,
      cost: overrides.cost ?? 55,
      combo: 4,
      captainHpBoost: 0,
      captainAtkBoost: 0,
      captainAverageBoost: 0,
      stats: {
        min: { hp: null, atk: null, rcv: null },
        max: { hp: 5000, atk: 1800, rcv: 400 },
        growth: null,
      },
      regionAvailability: {
        exactLocal: true,
        thumbnailGlobal: true,
        thumbnailJapan: false,
      },
      assets: {
        exactLocal: null,
        thumbnailGlobal: null,
        thumbnailJapan: null,
      },
      imageUrl: `/characters/${overrides.id}.png`,
      detail: {
        characterId: overrides.id,
        rumbleData: {},
      },
      detailImageUrl: `/characters/${overrides.id}.png`,
    },
    normalized: {
      raw: {},
      basedOnId: null,
      rumbleType: overrides.rumbleType ?? 'STR',
      def: 130,
      spd: 140,
      cost: overrides.cost ?? 55,
      cooldown: overrides.cooldown ?? 30,
      targetLabel: null,
      patternCount: 0,
      maxPassiveLevel: null,
      maxSpecialLevel: null,
      maxPassiveEffects: [],
      maxSpecialEffects: [],
      maxSpecialCooldown: null,
      baseResistances: [],
      llbResistances: [],
      passiveEffects: [],
      specialEffects: [],
      roleTags: overrides.roles ?? [],
    },
    baseScore: 100 + overrides.id / 1000,
    breakdown: {
      statScore: 50,
      passiveScore: 30,
      specialScore: 20,
      synergyScore: 0,
      recencyScore: 0,
      total: 100 + overrides.id / 1000,
    },
    reasonChips: ['Rumble Data'],
    conflictKeys: [],
  } as RumbleUnitScore;
}
