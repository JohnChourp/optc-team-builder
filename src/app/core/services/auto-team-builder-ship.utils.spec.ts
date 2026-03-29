import { describe, expect, it } from 'vitest';

import { type AutoBuildInput, type AutoBuildResult } from '../models/auto-team-builder.models';
import { type CharacterDetailRecord, type ShipRecord } from '../models/optc.models';
import { resolveAutoBuildShipSelection } from './auto-team-builder-ship.utils';

describe('auto team builder ship selection', () => {
  it('returns the manual ship override when a valid ship id is selected', () => {
    const ships = [
      createShip(14, 'Thousand Sunny', 'Boosts ATK by 1.5x.'),
      createShip(
        15,
        'Kuja Pirate Ship',
        'Boosts ATK of Free Spirit characters by 1.5x and their HP by 1.35x, reduces the HP of everyone else by 99%.',
      ),
    ];

    const selection = resolveAutoBuildShipSelection(
      createResult(
        Array.from({ length: 6 }, (_, index) =>
          createCharacter(index + 1, {
            primaryClass: 'Free Spirit',
            classes: ['Free Spirit'],
          }),
        ),
        14,
      ),
      ships,
    );

    expect(selection).toEqual({
      ship: ships[0],
      source: 'manual',
      reasonChips: expect.arrayContaining(['Manual ship', 'ATK 1.5x']),
    });
  });

  it('prefers the fully matching class ship over a universal alternative', () => {
    const ships = [
      createShip(14, 'Thousand Sunny', 'Boosts ATK by 1.5x.'),
      createShip(
        15,
        'Kuja Pirate Ship',
        'Boosts ATK of Free Spirit characters by 1.5x and their HP by 1.35x, reduces the HP of everyone else by 99%.',
      ),
    ];

    const selection = resolveAutoBuildShipSelection(
      createResult(
        Array.from({ length: 6 }, (_, index) =>
          createCharacter(index + 1, {
            primaryClass: 'Free Spirit',
            classes: ['Free Spirit'],
          }),
        ),
      ),
      ships,
    );

    expect(selection?.source).toBe('recommended');
    expect(selection?.ship.id).toBe(15);
    expect(selection?.reasonChips).toEqual(expect.arrayContaining(['ATK 1.5x', 'HP 1.35x']));
  });

  it('avoids a restrictive class ship when the team is mixed', () => {
    const ships = [
      createShip(14, 'Thousand Sunny', 'Boosts ATK by 1.5x.'),
      createShip(
        15,
        'Kuja Pirate Ship',
        'Boosts ATK of Free Spirit characters by 1.5x and their HP by 1.35x, reduces the HP of everyone else by 99%.',
      ),
    ];

    const selection = resolveAutoBuildShipSelection(
      createResult([
        createCharacter(1, {
          primaryClass: 'Free Spirit',
          classes: ['Free Spirit'],
        }),
        createCharacter(2, {
          primaryClass: 'Fighter',
          classes: ['Fighter'],
        }),
        createCharacter(3, {
          primaryClass: 'Free Spirit',
          classes: ['Free Spirit'],
        }),
        createCharacter(4, {
          primaryClass: 'Slasher',
          classes: ['Slasher'],
        }),
        createCharacter(5, {
          primaryClass: 'Free Spirit',
          classes: ['Free Spirit'],
        }),
        createCharacter(6, {
          primaryClass: 'Driven',
          classes: ['Driven'],
        }),
      ]),
      ships,
    );

    expect(selection?.source).toBe('recommended');
    expect(selection?.ship.id).toBe(14);
  });
});

function createResult(
  characters: CharacterDetailRecord[],
  manualShipId: number | null = null,
): Pick<AutoBuildResult, 'slots' | 'input'> {
  const input: AutoBuildInput = {
    types: ['DEX'],
    selectedClasses: ['Free Spirit'],
    requireAllSelectedTypesInTeam: false,
    requireAllSelectedClassesPerCharacter: false,
    requireAllSpecialsSupportTeam: false,
    requiredAbilities: [],
    favoritesOnly: false,
    lockedCharacterIds: [],
    captainCharacterId: null,
    friendCaptainCharacterId: null,
    manualShipId,
    candidateLimit: 1200,
  };

  return {
    input,
    slots: characters.map((character, index) => ({
      role: index === 0 ? 'captain' : index === 1 ? 'friendCaptain' : 'sub',
      character,
      reasonChips: [],
    })),
  };
}

function createShip(id: number, name: string, description: string): ShipRecord {
  return {
    id,
    name,
    thumb: null,
    description,
  };
}

function createCharacter(
  id: number,
  overrides: Partial<CharacterDetailRecord> = {},
): CharacterDetailRecord {
  return {
    id,
    name: `Character ${id}`,
    type: 'DEX',
    classes: ['Free Spirit'],
    primaryClass: 'Free Spirit',
    secondaryClass: null,
    stars: 6,
    cost: 55,
    combo: 4,
    maxLevel: 99,
    maxExperience: 1,
    stats: {
      min: { hp: 1, atk: 1, rcv: 1 },
      max: { hp: 1000, atk: 1000, rcv: 1000 },
      growth: 1,
    },
    regionAvailability: {
      exactLocal: true,
      thumbnailGlobal: true,
      thumbnailJapan: false,
      fullTransparent: false,
    },
    assets: {
      exactLocal: null,
      thumbnailGlobal: null,
      thumbnailJapan: null,
      fullTransparent: null,
    },
    imageUrl: '/assets/test-character.png',
    detailImageUrl: '/assets/test-character-detail.png',
    detail: {
      characterId: id,
      captainAbility: null,
      specialName: null,
      specialText: null,
      specialNotes: null,
      builderAbilities: [],
      sailorAbilities: [],
      sailorNotes: null,
      limitBreak: [],
      potentialAbilities: [],
      supportData: [],
      swapData: null,
      vsSpecial: null,
      superType: null,
      superClass: null,
      rumbleData: null,
    },
    ...overrides,
  };
}
