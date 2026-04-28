import '@angular/compiler';
import { JSDOM } from 'jsdom';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { Preferences } from '@capacitor/preferences';

import { type CharacterListItem, type LocalCharacterOverride } from '../models/optc.models';
import { CharacterOverridesService } from './character-overrides.service';
import { applyOverrideToCharacterListItem } from './character-overrides.utils';

vi.mock('@capacitor/preferences', () => ({
  Preferences: {
    get: vi.fn(),
    set: vi.fn(),
  },
}));

describe('CharacterOverridesService', () => {
  beforeAll(() => {
    vi.stubGlobal('DOMParser', new JSDOM('').window.DOMParser);
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('hydrates saved overrides and normalizes invalid image payloads away', async () => {
    vi.mocked(Preferences.get).mockResolvedValue({
      value: JSON.stringify([
        createOverride({
          characterId: 4101,
          images: {
            thumbnailDataUrl: 'https://example.com/thumb.png',
            detailDataUrl: 'data:image/jpeg;base64,ZGV0YWls',
          },
        }),
      ]),
    });

    const service = new CharacterOverridesService();
    await service.ready();

    expect(service.getOverrideByCharacterId(4101)).toMatchObject({
      characterId: 4101,
      images: {
        thumbnailDataUrl: null,
        detailDataUrl: 'data:image/jpeg;base64,ZGV0YWls',
      },
    });
  });

  it('saves a normalized override and bumps the revision', async () => {
    vi.mocked(Preferences.get).mockResolvedValue({ value: null });
    const service = new CharacterOverridesService();
    await service.ready();

    await service.saveOverride(
      createOverride({
        characterId: 4101,
        name: '  Edited Ace  ',
        type: 'psy',
        classes: ['Shooter', ' Shooter ', 'Free Spirit'],
      }),
    );

    expect(service.revision()).toBe(1);
    expect(service.getOverrideByCharacterId(4101)).toMatchObject({
      name: 'Edited Ace',
      type: 'PSY',
      classes: ['Shooter', 'Free Spirit'],
    });
    expect(vi.mocked(Preferences.set)).toHaveBeenCalledOnce();
  });

  it('merges imported overrides with added and updated counts', async () => {
    vi.mocked(Preferences.get).mockResolvedValue({
      value: JSON.stringify([createOverride({ characterId: 4101, name: 'Original' })]),
    });
    const service = new CharacterOverridesService();
    await service.ready();

    const result = await service.mergeImportedOverrides([
      createOverride({ characterId: 4101, name: 'Updated import' }),
      createOverride({ characterId: 4102, name: 'New import' }),
    ]);

    expect(result).toMatchObject({
      addedCount: 1,
      updatedCount: 1,
    });
    expect(service.overrides().map((override) => override.characterId)).toEqual([4101, 4102]);
  });

  it('deletes overrides by character id', async () => {
    vi.mocked(Preferences.get).mockResolvedValue({
      value: JSON.stringify([
        createOverride({ characterId: 4101 }),
        createOverride({ characterId: 4102 }),
      ]),
    });
    const service = new CharacterOverridesService();
    await service.ready();

    await service.deleteOverride(4101);

    expect(service.overrides().map((override) => override.characterId)).toEqual([4102]);
  });

  it('derives override captain boosts from normalized HTML captain variants', () => {
    const baseOverride = createOverride({ characterId: 4101 });
    const override = createOverride({
      characterId: 4101,
      detail: {
        ...baseOverride.detail,
        captainAbilityVariants: [
          {
            key: 'base',
            label: 'Base Captain Ability',
            text: '<p><b>Always Active: </b>Boosts HP of DEX characters by 1.3x &amp;lt;script&amp;gt;.</p><script>Boosts ATK of all characters by 99x.</script><ul><li><b>Standard Captain: </b>Boosts ATK of DEX characters by 3.5x.</li></ul>',
          },
        ],
      },
    });

    expect(applyOverrideToCharacterListItem(createCharacterListItem(4101), override)).toMatchObject(
      {
        captainHpBoost: 1.3,
        captainAtkBoost: 3.5,
        captainAverageBoost: 2.4,
      },
    );
  });
});

function createCharacterListItem(characterId: number): CharacterListItem {
  return {
    id: characterId,
    name: `Character ${characterId}`,
    isIncomplete: false,
    type: 'DEX',
    classes: ['Fighter'],
    primaryClass: 'Fighter',
    secondaryClass: null,
    stars: 6,
    cost: 55,
    combo: 4,
    captainHpBoost: 0,
    captainAtkBoost: 0,
    captainAverageBoost: 0,
    stats: {
      min: { hp: 1000, atk: 500, rcv: 100 },
      max: { hp: 3000, atk: 1500, rcv: 300 },
      growth: 1,
    },
    regionAvailability: {
      exactLocal: true,
      thumbnailGlobal: true,
      thumbnailJapan: false,
    },
    assets: {
      exactLocal: null,
      thumbnailLocal: null,
      thumbnailGlobal: null,
      thumbnailJapan: null,
    },
    imageUrl: `assets/characters/${characterId}.png`,
  };
}

function createOverride(
  overrides: Record<string, unknown> & { characterId: number },
): LocalCharacterOverride {
  return {
    characterId: overrides.characterId,
    name: overrides['name'] ?? `Override ${overrides.characterId}`,
    isIncomplete: overrides['isIncomplete'] ?? false,
    type: overrides['type'] ?? 'DEX',
    classes: overrides['classes'] ?? ['Fighter'],
    stars: overrides['stars'] ?? 6,
    cost: overrides['cost'] ?? 55,
    combo: overrides['combo'] ?? 4,
    minHp: overrides['minHp'] ?? 1000,
    minAtk: overrides['minAtk'] ?? 400,
    minRcv: overrides['minRcv'] ?? 120,
    maxHp: overrides['maxHp'] ?? 3900,
    maxAtk: overrides['maxAtk'] ?? 1900,
    maxRcv: overrides['maxRcv'] ?? 340,
    growth: overrides['growth'] ?? 3,
    detail: overrides['detail'] ?? {
      characterId: overrides.characterId,
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
    },
    images: overrides['images'] ?? {
      thumbnailDataUrl: null,
      detailDataUrl: null,
    },
    createdAt: overrides['createdAt'] ?? '2026-04-13T09:15:00.000Z',
    updatedAt: overrides['updatedAt'] ?? '2026-04-13T09:15:00.000Z',
  } as LocalCharacterOverride;
}
