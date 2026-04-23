import '@angular/compiler';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { Preferences } from '@capacitor/preferences';

import { CharacterOverridesService } from './character-overrides.service';

vi.mock('@capacitor/preferences', () => ({
  Preferences: {
    get: vi.fn(),
    set: vi.fn(),
  },
}));

describe('CharacterOverridesService', () => {
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
});

function createOverride(overrides: Record<string, unknown> & { characterId: number }) {
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
  };
}
