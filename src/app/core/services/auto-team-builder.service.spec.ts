import { describe, expect, it, vi } from 'vitest';

import {
  AUTO_TEAM_CANDIDATE_LIMIT,
  AUTO_TEAM_BUILDER_DEFAULT_TYPE,
  createEmptyAutoBuildManualSlots,
  type AutoBuildManualSlotSelection,
  type AutoBuildInput,
  type AutoBuildProgressSnapshot,
  type AutoTeamBuilderType,
} from '../models/auto-team-builder.models';
import { type CharacterDetailRecord, type ShipRecord } from '../models/optc.models';
import { AutoTeamBuildCancelledError } from './auto-team-builder.engine';
import { AutoTeamBuilderService } from './auto-team-builder.service';
import {
  buildAutoBuildCandidate,
  buildAutoTeamResult,
  hasReadableEffectText,
  resolveLeaderSuperEffectScopeFromEffectText,
} from './auto-team-builder.utils';

const INPUT = createInput();
type AutoTeamBuilderServiceWithWorkerFactory = AutoTeamBuilderService & {
  createWorker: () => Worker | null;
};

describe('Auto team builder', () => {
  it('parses type-targeted leader super effect scope text', () => {
    expect(
      resolveLeaderSuperEffectScopeFromEffectText(
        'Changes DEX and STR characters to Super DEX and Super STR.',
      ),
    ).toEqual({
      allowedClasses: [],
      allowedTypes: ['DEX', 'STR'],
      isParseable: true,
    });
  });

  it('parses class-targeted leader super effect scope text', () => {
    expect(
      resolveLeaderSuperEffectScopeFromEffectText(
        'Transforms Free Spirit characters into Super Free Spirit characters.',
      ),
    ).toEqual({
      allowedClasses: ['Free Spirit'],
      allowedTypes: [],
      isParseable: true,
    });
  });

  it('parses burst, consistency, utility, and multi-class captain scope from effect text', () => {
    const candidate = buildAutoBuildCandidate(
      createCharacterRecord({
        id: 5900,
        primaryClass: 'Fighter',
        detail: {
          captainAbility:
            'Boosts ATK of DEX, Fighter and Slasher characters by 5.25x and HP by 1.4x.',
          specialText:
            'Boosts orb effects by 2.5x, boosts color affinity by 2x, changes orbs into Matching Orbs, reduces Bind and Despair by 5 turns and reduces Special Cooldown by 1 turn.',
        },
      }),
      createInput(['DEX'], ['Fighter', 'Slasher']),
      0,
      1,
    );

    expect(candidate.tags.captainScope.allowedClasses).toEqual(['Fighter', 'Slasher']);
    expect(candidate.tags.captainScope.allowedTypes).toEqual(['DEX']);
    expect(candidate.tags.captainScope.hasCostRestriction).toBe(false);
    expect(candidate.tags.captainScope.maxAllowedCost).toBeNull();
    expect(candidate.tags.captainScope.hasClassRestriction).toBe(true);
    expect(candidate.tags.captainScope.hasTypeRestriction).toBe(true);
    expect(candidate.tags.captainScope.matchedSelectedClasses).toEqual(['Fighter', 'Slasher']);
    expect(candidate.tags.captainScope.coversAllSelectedClasses).toBe(true);
    expect(candidate.tags.captainScope.matchedSelectedTypes).toEqual(['DEX']);
    expect(candidate.tags.captainScope.coversAllSelectedTypes).toBe(true);
    expect(candidate.tags.captainScope.matchesClass).toBe(true);
    expect(candidate.matchesAllSelectedClasses).toBe(false);
    expect(candidate.tags.burstRoles).toEqual(
      expect.arrayContaining(['atkBoost', 'orbBoost', 'colorAffinity']),
    );
    expect(candidate.tags.consistencyRoles).toEqual(
      expect.arrayContaining(['matchingOrbs', 'orbChange', 'cooldownReduction']),
    );
    expect(candidate.tags.utilityRoles).toEqual(expect.arrayContaining(['bind', 'despair']));
  });

  it('builds combined captain labels for partial multi-type coverage', () => {
    const candidate = buildAutoBuildCandidate(
      createCharacterRecord({
        id: 5915,
        type: 'DEX',
        primaryClass: 'Fighter',
        detail: {
          captainAbility: 'Boosts ATK of DEX, PSY and Fighter characters by 5x and HP by 1.3x.',
          specialText: 'Boosts color affinity of DEX and PSY characters by 2x for 1 turn.',
        },
      }),
      createInput(['DEX', 'PSY', 'INT']),
      0,
      1,
    );

    expect(candidate.tags.captainScope.matchedSelectedTypes).toEqual(['DEX', 'PSY']);
    expect(candidate.tags.captainScope.matchedSelectedTypeCount).toBe(2);
    expect(candidate.tags.captainScope.coversAllSelectedTypes).toBe(false);
    expect(candidate.reasonChips).toContain('DEX / PSY captain');
  });

  it('derives a hard captain cost restriction from low-cost-only Buggy text', () => {
    const candidate = buildAutoBuildCandidate(
      createCharacterRecord({
        id: 2035,
        name: 'Buggy the Genius Jester',
        type: 'INT',
        cost: 40,
        primaryClass: 'Driven',
        secondaryClass: 'Shooter',
        detail: {
          captainAbility:
            'Boosts ATK of Cost 40 or less characters by 1.75x and reduces ATK and HP of Cost 41 or higher characters by 50%. Guarantees duplicating a drop upon completion of the island.',
          specialText:
            'Boosts ATK of Cost 40 or less characters by 2x for 2 turns and changes orbs of Cost 40 or lower characters into Matching Orbs.',
        },
      }),
      createInput(['DEX', 'STR', 'QCK', 'PSY', 'INT']),
      0,
      1,
    );

    expect(candidate.tags.captainScope.hasCostRestriction).toBe(true);
    expect(candidate.tags.captainScope.maxAllowedCost).toBe(40);
  });

  it('does not treat bonus low-cost captain branches as a hard cost restriction', () => {
    const candidate = buildAutoBuildCandidate(
      createCharacterRecord({
        id: 4111,
        name: 'Buggy & Crocodile & Mihawk',
        type: 'QCK',
        primaryClass: 'Driven',
        secondaryClass: 'Slasher',
        detail: {
          captainAbility:
            'Reduces Special Cooldown of Driven and Slasher characters by 1 turn at the start of the fight, boosts HP of Driven and Slasher characters by 1.3x, boosts ATK of Driven and Slasher characters by 5.5x, by 6x instead if they are a Cost 40 or less character, makes [TND] orbs beneficial for Driven and Slasher characters, and reduces damage received by 20%.',
          specialText: 'Boosts Orb Effects of Driven and Slasher characters by 2.75x for 2 turns.',
        },
      }),
      createInput(['QCK'], ['Driven', 'Slasher']),
      0,
      1,
    );

    expect(candidate.tags.captainScope.hasCostRestriction).toBe(false);
    expect(candidate.tags.captainScope.maxAllowedCost).toBeNull();
  });

  it('ignores recent placeholders with empty effect text', () => {
    const emptyRecent = createCharacterRecord({
      id: 6000,
      primaryClass: 'Fighter',
      detail: {},
    });

    expect(hasReadableEffectText(emptyRecent)).toBe(false);

    const result = buildAutoTeamResult(
      [
        emptyRecent,
        createCaptainRecord(),
        createAtkSubRecord(),
        createAffinitySubRecord(),
        createUtilitySubRecord(),
        createConsistencySubRecord(),
      ],
      INPUT,
    );

    expect(result).not.toBeNull();
    expect(result?.candidateCount).toBe(5);
    expect(result?.slots.some((slot) => slot.character.id === 6000)).toBe(false);
  });

  it('covers required abilities team-wide across different characters', () => {
    const result = buildAutoTeamResult(
      [
        createCaptainRecord(),
        createCharacterRecord({
          id: 5801,
          primaryClass: 'Fighter',
          detail: {
            specialText: 'Reduces Bind duration by 5 turns.',
            builderAbilities: [
              {
                key: 'remove_bind',
                label: 'Remove Bind',
                minTurns: 5,
                isCompleteRemoval: false,
                slotTokens: [],
                source: 'specialText',
              },
            ],
          },
        }),
        createCharacterRecord({
          id: 5802,
          primaryClass: 'Fighter',
          detail: {
            specialText: 'Reduces Despair duration by 6 turns.',
            builderAbilities: [
              {
                key: 'remove_despair',
                label: 'Remove Despair',
                minTurns: 6,
                isCompleteRemoval: false,
                slotTokens: [],
                source: 'specialText',
              },
            ],
          },
        }),
        createAffinitySubRecord(),
        createUtilitySubRecord(),
        createConsistencySubRecord(),
      ],
      {
        ...INPUT,
        requiredAbilities: [
          { abilityKey: 'remove_bind', minTurns: 5, slotTokens: [], requiredCharacterCount: 1 },
          { abilityKey: 'remove_despair', minTurns: 5, slotTokens: [], requiredCharacterCount: 1 },
        ],
      },
    );

    expect(result).not.toBeNull();
    expect(result?.coverage.abilityRequirements.matchesAll).toBe(true);
    expect(result?.coverage.abilityRequirements.matched).toEqual([
      { abilityKey: 'remove_bind', minTurns: 5, slotTokens: [], requiredCharacterCount: 1 },
      { abilityKey: 'remove_despair', minTurns: 5, slotTokens: [], requiredCharacterCount: 1 },
    ]);
  });

  it('requires multiple matching team slots for the same ability when the count is greater than one', () => {
    const result = buildAutoTeamResult(
      [
        createCaptainRecord(),
        createCharacterRecord({
          id: 5801,
          primaryClass: 'Fighter',
          detail: {
            specialText: 'Reduces Bind duration by 5 turns.',
            builderAbilities: [
              {
                key: 'remove_bind',
                label: 'Remove Bind',
                minTurns: 5,
                isCompleteRemoval: false,
                slotTokens: [],
                source: 'specialText',
              },
            ],
          },
        }),
        createCharacterRecord({
          id: 5808,
          primaryClass: 'Fighter',
          detail: {
            specialText: 'Reduces Bind duration by 6 turns.',
            builderAbilities: [
              {
                key: 'remove_bind',
                label: 'Remove Bind',
                minTurns: 6,
                isCompleteRemoval: false,
                slotTokens: [],
                source: 'specialText',
              },
            ],
          },
        }),
        createAffinitySubRecord(),
        createUtilitySubRecord(),
        createConsistencySubRecord(),
      ],
      {
        ...INPUT,
        requiredAbilities: [
          { abilityKey: 'remove_bind', minTurns: 5, slotTokens: [], requiredCharacterCount: 2 },
        ],
      },
    );

    expect(result).not.toBeNull();
    expect(result?.coverage.abilityRequirements.matchesAll).toBe(true);
    expect(result?.coverage.abilityRequirements.matched).toEqual([
      { abilityKey: 'remove_bind', minTurns: 5, slotTokens: [], requiredCharacterCount: 2 },
    ]);
  });

  it('fails when the team does not reach the requested ability slot count', () => {
    const result = buildAutoTeamResult(
      [
        createCaptainRecord(),
        createCharacterRecord({
          id: 5801,
          primaryClass: 'Fighter',
          detail: {
            specialText: 'Reduces Bind duration by 5 turns.',
            builderAbilities: [
              {
                key: 'remove_bind',
                label: 'Remove Bind',
                minTurns: 5,
                isCompleteRemoval: false,
                slotTokens: [],
                source: 'specialText',
              },
            ],
          },
        }),
        createAtkSubRecord(),
        createAffinitySubRecord(),
        createUtilitySubRecord(),
        createConsistencySubRecord(),
      ],
      {
        ...INPUT,
        requiredAbilities: [
          { abilityKey: 'remove_bind', minTurns: 5, slotTokens: [], requiredCharacterCount: 2 },
        ],
      },
    );

    expect(result).toBeNull();
  });

  it('counts duplicated captain and friend captain slots separately toward the requirement', () => {
    const sharedLeader = createCharacterRecord({
      id: 5812,
      primaryClass: 'Fighter',
      detail: {
        captainAbility: 'Boosts ATK of DEX and Fighter characters by 5.5x.',
        specialText: 'Reduces Bind duration by 5 turns.',
        builderAbilities: [
          {
            key: 'remove_bind',
            label: 'Remove Bind',
            minTurns: 5,
            isCompleteRemoval: false,
            slotTokens: [],
            source: 'specialText',
          },
        ],
      },
    });
    const result = buildAutoTeamResult(
      [
        sharedLeader,
        createAtkSubRecord(),
        createAffinitySubRecord(),
        createUtilitySubRecord(),
        createConsistencySubRecord(),
        createOffClassRedundantSubRecord(),
      ],
      {
        ...INPUT,
        captainCharacterId: 5812,
        friendCaptainCharacterId: 5812,
        requiredAbilities: [
          { abilityKey: 'remove_bind', minTurns: 5, slotTokens: [], requiredCharacterCount: 2 },
        ],
      },
    );

    expect(result).not.toBeNull();
    expect(result?.coverage.abilityRequirements.matchesAll).toBe(true);
  });

  it('requires both leader slots to satisfy guaranteed extra-drop requirements', () => {
    const input = createInput(['DEX', 'STR', 'QCK', 'PSY', 'INT'], ['Fighter']);
    const result = buildAutoTeamResult(createExtraDropLeaderSelectionRecords(), {
      ...input,
      requiredAbilities: [
        {
          abilityKey: 'extra_drop_guaranteed',
          minTurns: null,
          slotTokens: [],
          requiredCharacterCount: 1,
        },
      ],
    });

    expect(result).not.toBeNull();
    expect(result?.slots[0]?.character.detail.builderAbilities).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: 'extra_drop_guaranteed', source: 'captainAbility' }),
      ]),
    );
    expect(result?.slots[1]?.character.detail.builderAbilities).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: 'extra_drop_guaranteed', source: 'captainAbility' }),
      ]),
    );
    expect(result?.slots[0]?.character.id).not.toBe(1588);
    expect(result?.slots[1]?.character.id).not.toBe(1588);
    expect(result?.coverage.abilityRequirements.matchesAll).toBe(true);
  });

  it('does not let a sub-only extra-drop character satisfy leader-only extra-drop rules', () => {
    const input = createInput(['DEX', 'STR', 'QCK', 'PSY', 'INT'], ['Fighter'], {
      captainCharacterId: 1588,
      friendCaptainCharacterId: 1588,
    });
    const result = buildAutoTeamResult(createSubOnlyExtraDropTeamRecords(), {
      ...input,
      requiredAbilities: [
        {
          abilityKey: 'extra_drop_guaranteed',
          minTurns: null,
          slotTokens: [],
          requiredCharacterCount: 1,
        },
      ],
    });

    expect(result).toBeNull();
  });

  it('fails when a manually selected captain lacks the required guaranteed extra-drop ability', () => {
    const input = createInput(['DEX', 'STR', 'QCK', 'PSY', 'INT'], ['Fighter'], {
      captainCharacterId: 1588,
      friendCaptainCharacterId: 2035,
    });
    const result = buildAutoTeamResult(createExtraDropLeaderSelectionRecords(), {
      ...input,
      requiredAbilities: [
        {
          abilityKey: 'extra_drop_guaranteed',
          minTurns: null,
          slotTokens: [],
          requiredCharacterCount: 1,
        },
      ],
    });

    expect(result).toBeNull();
  });

  it('allows matching base character names when the unique-name toggle is off', () => {
    const result = buildAutoTeamResult(
      [
        createCharacterRecord({
          id: 5814,
          name: 'Monkey D. Luffy',
          primaryClass: 'Fighter',
          detail: {
            captainAbility: 'Boosts ATK of DEX and Fighter characters by 5.5x.',
          },
        }),
        createCharacterRecord({
          id: 5815,
          name: 'Monkey D. Luffy - Gear 2',
          primaryClass: 'Fighter',
          detail: {
            specialText: 'Boosts ATK of Fighter characters by 2.25x for 1 turn.',
          },
        }),
        createCharacterRecord({
          id: 5816,
          name: 'Portgas D. Ace',
          primaryClass: 'Fighter',
          detail: {
            captainAbility: 'Boosts ATK of DEX and Fighter characters by 5.25x.',
          },
        }),
        createAtkSubRecord(),
        createAffinitySubRecord(),
        createUtilitySubRecord(),
        createConsistencySubRecord(),
      ],
      createInput(['DEX'], ['Fighter'], {
        manualSlots: createManualSlots({
          captain: [5814],
          friendCaptain: [5816],
          sub1: [5815],
        }),
      }),
    );

    expect(result).not.toBeNull();
    expect(result?.slots.map((slot) => slot.character.name)).toEqual(
      expect.arrayContaining(['Monkey D. Luffy', 'Monkey D. Luffy - Gear 2']),
    );
  });

  it('rejects teams that reuse the same base character name when the toggle is on', () => {
    const result = buildAutoTeamResult(
      [
        createCharacterRecord({
          id: 5814,
          name: 'Monkey D. Luffy',
          primaryClass: 'Fighter',
          detail: {
            captainAbility: 'Boosts ATK of DEX and Fighter characters by 5.5x.',
          },
        }),
        createCharacterRecord({
          id: 5815,
          name: 'Monkey D. Luffy - Gear 2',
          primaryClass: 'Fighter',
          detail: {
            specialText: 'Boosts ATK of Fighter characters by 2.25x for 1 turn.',
          },
        }),
        createCharacterRecord({
          id: 5816,
          name: 'Portgas D. Ace',
          primaryClass: 'Fighter',
          detail: {
            captainAbility: 'Boosts ATK of DEX and Fighter characters by 5.25x.',
          },
        }),
        createAtkSubRecord(),
        createAffinitySubRecord(),
        createUtilitySubRecord(),
        createConsistencySubRecord(),
      ],
      createInput(['DEX'], ['Fighter'], {
        requireUniqueBaseCharacterNames: true,
        manualSlots: createManualSlots({
          captain: [5814],
          friendCaptain: [5816],
          sub1: [5815],
        }),
      }),
    );

    expect(result).toBeNull();
  });

  it('rejects duplicate base names across manual leader and sub slot picks when the toggle is on', () => {
    const result = buildAutoTeamResult(
      [
        createCharacterRecord({
          id: 5817,
          name: 'Monkey D. Luffy',
          primaryClass: 'Fighter',
          detail: {
            captainAbility: 'Boosts ATK of DEX and Fighter characters by 5.5x.',
          },
        }),
        createCharacterRecord({
          id: 5818,
          name: 'Portgas D. Ace',
          primaryClass: 'Fighter',
          detail: {
            captainAbility: 'Boosts ATK of DEX and Fighter characters by 5.1x.',
          },
        }),
        createCharacterRecord({
          id: 5819,
          name: 'Monkey D. Luffy - Gear 2',
          primaryClass: 'Fighter',
          detail: {
            specialText: 'Boosts ATK of Fighter characters by 2.25x for 1 turn.',
          },
        }),
        createAtkSubRecord(),
        createAffinitySubRecord(),
        createUtilitySubRecord(),
        createConsistencySubRecord(),
      ],
      createInput(['DEX'], ['Fighter'], {
        requireUniqueBaseCharacterNames: true,
        manualSlots: createManualSlots({
          captain: [5817],
          friendCaptain: [5818],
          sub1: [5819],
        }),
      }),
    );

    expect(result).toBeNull();
  });

  it('allows the friend captain to reuse the same base character name when the toggle is on', () => {
    const result = buildAutoTeamResult(
      [
        createCharacterRecord({
          id: 5822,
          name: 'Monkey D. Luffy',
          primaryClass: 'Fighter',
          detail: {
            captainAbility: 'Boosts ATK of DEX and Fighter characters by 5.5x.',
          },
        }),
        createCharacterRecord({
          id: 5823,
          name: 'Monkey D. Luffy - Gear Third',
          primaryClass: 'Fighter',
          detail: {
            captainAbility: 'Boosts ATK of DEX and Fighter characters by 5.1x.',
          },
        }),
        createCharacterRecord({
          id: 5824,
          name: 'Portgas D. Ace',
          primaryClass: 'Fighter',
          detail: {
            specialText: 'Boosts ATK of Fighter characters by 2.25x for 1 turn.',
          },
        }),
        createAtkSubRecord(),
        createAffinitySubRecord(),
        createUtilitySubRecord(),
        createConsistencySubRecord(),
      ],
      createInput(['DEX'], ['Fighter'], {
        requireUniqueBaseCharacterNames: true,
        manualSlots: createManualSlots({
          captain: [5822],
          friendCaptain: [5823],
          sub1: [5824],
        }),
      }),
    );

    expect(result).not.toBeNull();
    expect(result?.slots.map((slot) => slot.character.name)).toEqual(
      expect.arrayContaining(['Monkey D. Luffy', 'Monkey D. Luffy - Gear Third']),
    );
  });

  it('rejects a composite in-game conflict like General Franky and Tony Tony Chopper', () => {
    const result = buildAutoTeamResult(
      [
        createCharacterRecord({
          id: 3574,
          name: 'General Franky - Dream Docking',
          primaryClass: 'Fighter',
          detail: {
            captainAbility: 'Boosts ATK of DEX and Fighter characters by 5.5x.',
          },
        }),
        createCharacterRecord({
          id: 5825,
          name: 'Portgas D. Ace',
          primaryClass: 'Fighter',
          detail: {
            captainAbility: 'Boosts ATK of DEX and Fighter characters by 5.25x.',
          },
        }),
        createCharacterRecord({
          id: 2797,
          name: 'Tony Tony Chopper - Long-Awaited Present',
          primaryClass: 'Fighter',
          detail: {
            specialText: 'Boosts ATK of Fighter characters by 2.25x for 1 turn.',
          },
        }),
        createAtkSubRecord(),
        createAffinitySubRecord(),
        createUtilitySubRecord(),
        createConsistencySubRecord(),
      ],
      createInput(['DEX'], ['Fighter'], {
        requireUniqueBaseCharacterNames: true,
        manualSlots: createManualSlots({
          captain: [3574],
          friendCaptain: [5825],
          sub1: [2797],
        }),
      }),
    );

    expect(result).toBeNull();
  });

  it('allows a composite in-game conflict when the unique-name toggle is off', () => {
    const result = buildAutoTeamResult(
      [
        createCharacterRecord({
          id: 3574,
          name: 'General Franky - Dream Docking',
          primaryClass: 'Fighter',
          detail: {
            captainAbility: 'Boosts ATK of DEX and Fighter characters by 5.5x.',
          },
        }),
        createCharacterRecord({
          id: 5826,
          name: 'Portgas D. Ace',
          primaryClass: 'Fighter',
          detail: {
            captainAbility: 'Boosts ATK of DEX and Fighter characters by 5.25x.',
          },
        }),
        createCharacterRecord({
          id: 2797,
          name: 'Tony Tony Chopper - Long-Awaited Present',
          primaryClass: 'Fighter',
          detail: {
            specialText: 'Boosts ATK of Fighter characters by 2.25x for 1 turn.',
          },
        }),
        createAtkSubRecord(),
        createAffinitySubRecord(),
        createUtilitySubRecord(),
        createConsistencySubRecord(),
      ],
      createInput(['DEX'], ['Fighter'], {
        manualSlots: createManualSlots({
          captain: [3574],
          friendCaptain: [5826],
          sub1: [2797],
        }),
      }),
    );

    expect(result).not.toBeNull();
  });

  it('rejects overlapping explicit party conflict keys even when display names are unrelated', () => {
    const result = buildAutoTeamResult(
      [
        createCharacterRecord({
          id: 5827,
          name: 'Holiday Tank Pilot',
          primaryClass: 'Fighter',
          detail: {
            captainAbility: 'Boosts ATK of DEX and Fighter characters by 5.5x.',
            partyConflictKeys: ['franky', 'tony tony chopper'],
          },
        }),
        createCharacterRecord({
          id: 5828,
          name: 'Portgas D. Ace',
          primaryClass: 'Fighter',
          detail: {
            captainAbility: 'Boosts ATK of DEX and Fighter characters by 5.25x.',
          },
        }),
        createCharacterRecord({
          id: 5829,
          name: 'Winter Medic',
          primaryClass: 'Fighter',
          detail: {
            specialText: 'Boosts ATK of Fighter characters by 2.25x for 1 turn.',
            partyConflictKeys: ['tony tony chopper'],
          },
        }),
        createAtkSubRecord(),
        createAffinitySubRecord(),
        createUtilitySubRecord(),
        createConsistencySubRecord(),
      ],
      createInput(['DEX'], ['Fighter'], {
        requireUniqueBaseCharacterNames: true,
        manualSlots: createManualSlots({
          captain: [5827],
          friendCaptain: [5828],
          sub1: [5829],
        }),
      }),
    );

    expect(result).toBeNull();
  });

  it('rejects linked variants that share an explicit canonical conflict key', () => {
    const result = buildAutoTeamResult(
      [
        createCharacterRecord({
          id: 4529,
          name: 'Clashing Blades Roronoa Zoro',
          primaryClass: 'Slasher',
          secondaryClass: 'Free Spirit',
          detail: {
            captainAbility: 'Boosts ATK of DEX and Slasher characters by 5.5x.',
            partyConflictKeys: ['linked-variant-4529'],
          },
        }),
        createCharacterRecord({
          id: 900005,
          name: 'Clashing Blades St. Ethanbaron V. Nusjuro',
          primaryClass: 'Slasher',
          secondaryClass: 'Cerebral',
          detail: {
            captainAbility: 'Boosts ATK of STR and Slasher characters by 5.5x.',
            partyConflictKeys: ['linked-variant-4529'],
          },
        }),
        createAtkSubRecord(),
        createAffinitySubRecord(),
        createUtilitySubRecord(),
        createConsistencySubRecord(),
      ],
      createInput(['DEX', 'STR'], ['Slasher'], {
        requireUniqueBaseCharacterNames: true,
        manualSlots: createManualSlots({
          captain: [4529],
          friendCaptain: [900005],
        }),
      }),
    );

    expect(result).toBeNull();
  });

  it('treats distinct normalized base names like Chef Sanji and Sanji as unique', () => {
    const result = buildAutoTeamResult(
      [
        createCharacterRecord({
          id: 5820,
          name: 'Sanji',
          primaryClass: 'Fighter',
          detail: {
            captainAbility: 'Boosts ATK of DEX and Fighter characters by 5.5x.',
          },
        }),
        createCharacterRecord({
          id: 5821,
          name: 'Chef Sanji - Hot Rock Stew',
          primaryClass: 'Fighter',
          detail: {
            captainAbility: 'Boosts ATK of DEX and Fighter characters by 5.1x.',
          },
        }),
        createAtkSubRecord(),
        createAffinitySubRecord(),
        createUtilitySubRecord(),
        createConsistencySubRecord(),
      ],
      createInput(['DEX'], ['Fighter'], {
        requireUniqueBaseCharacterNames: true,
        manualSlots: createManualSlots({
          captain: [5820],
          friendCaptain: [5821],
        }),
      }),
    );

    expect(result).not.toBeNull();
    expect(result?.slots.map((slot) => slot.character.name)).toEqual(
      expect.arrayContaining(['Sanji', 'Chef Sanji - Hot Rock Stew']),
    );
  });

  it('counts each slot only once even if the same character has multiple matching parsed abilities', () => {
    const result = buildAutoTeamResult(
      [
        createCaptainRecord(),
        createCharacterRecord({
          id: 5813,
          primaryClass: 'Fighter',
          detail: {
            specialText: 'Reduces Bind duration by 5 turns and by 7 turns again.',
            builderAbilities: [
              {
                key: 'remove_bind',
                label: 'Remove Bind',
                minTurns: 5,
                isCompleteRemoval: false,
                slotTokens: [],
                source: 'specialText',
              },
              {
                key: 'remove_bind',
                label: 'Remove Bind',
                minTurns: 7,
                isCompleteRemoval: false,
                slotTokens: [],
                source: 'specialText',
              },
            ],
          },
        }),
        createAtkSubRecord(),
        createAffinitySubRecord(),
        createUtilitySubRecord(),
        createConsistencySubRecord(),
      ],
      {
        ...INPUT,
        requiredAbilities: [
          { abilityKey: 'remove_bind', minTurns: 5, slotTokens: [], requiredCharacterCount: 2 },
        ],
      },
    );

    expect(result).toBeNull();
  });

  it('matches at least N turns and typed slot tokens for slot barrier requirements', () => {
    const result = buildAutoTeamResult(
      [
        createCaptainRecord(),
        createCharacterRecord({
          id: 5803,
          primaryClass: 'Fighter',
          detail: {
            specialText: 'Removes [DEX] and [STR] Slot Barrier completely.',
            builderAbilities: [
              {
                key: 'remove_slot_barrier',
                label: 'Remove Slot Barrier',
                minTurns: 99,
                isCompleteRemoval: true,
                slotTokens: ['DEX', 'STR'],
                source: 'specialText',
              },
            ],
          },
        }),
        createAtkSubRecord(),
        createAffinitySubRecord(),
        createUtilitySubRecord(),
        createConsistencySubRecord(),
      ],
      {
        ...INPUT,
        requiredAbilities: [
          {
            abilityKey: 'remove_slot_barrier',
            minTurns: 3,
            slotTokens: ['DEX'],
            requiredCharacterCount: 1,
          },
        ],
      },
    );

    expect(result).not.toBeNull();
    expect(result?.coverage.abilityRequirements.matchesAll).toBe(true);
  });

  it('matches explicit pain removal from special text for the requested turn count', () => {
    const result = buildAutoTeamResult(
      [
        createCaptainRecord(),
        createCharacterRecord({
          id: 5805,
          primaryClass: 'Fighter',
          detail: {
            specialText: 'Recovers HP and reduces Pain duration by 5 turns.',
            builderAbilities: [
              {
                key: 'remove_pain',
                label: 'Remove Pain',
                minTurns: 5,
                isCompleteRemoval: false,
                slotTokens: [],
                source: 'specialText',
                coverageMode: 'explicit',
              },
            ],
          },
        }),
        createAtkSubRecord(),
        createAffinitySubRecord(),
        createUtilitySubRecord(),
        createConsistencySubRecord(),
      ],
      {
        ...INPUT,
        requiredAbilities: [
          { abilityKey: 'remove_pain', minTurns: 5, slotTokens: [], requiredCharacterCount: 1 },
        ],
      },
    );

    expect(result).not.toBeNull();
    expect(result?.coverage.abilityRequirements.matchesAll).toBe(true);
    expect(result?.coverage.abilityRequirements.matched).toEqual([
      { abilityKey: 'remove_pain', minTurns: 5, slotTokens: [], requiredCharacterCount: 1 },
    ]);
  });

  it('matches selectable debuff counters as pain coverage when turns are sufficient', () => {
    const result = buildAutoTeamResult(
      [
        createCaptainRecord(),
        createCharacterRecord({
          id: 5806,
          primaryClass: 'Fighter',
          detail: {
            specialText:
              'Reduces 1 selected debuff duration by 5 turns and changes all orbs into Matching orbs.',
            builderAbilities: [
              {
                key: 'remove_pain',
                label: 'Remove Pain',
                minTurns: 5,
                isCompleteRemoval: false,
                slotTokens: [],
                source: 'specialText',
                coverageMode: 'selectedDebuff',
              },
            ],
          },
        }),
        createAtkSubRecord(),
        createAffinitySubRecord(),
        createUtilitySubRecord(),
        createConsistencySubRecord(),
      ],
      {
        ...INPUT,
        requiredAbilities: [
          { abilityKey: 'remove_pain', minTurns: 1, slotTokens: [], requiredCharacterCount: 1 },
        ],
      },
    );

    expect(result).not.toBeNull();
    expect(result?.coverage.abilityRequirements.matchesAll).toBe(true);
  });

  it('allows captain-sourced pain removal to satisfy a higher turn requirement', () => {
    const result = buildAutoTeamResult(
      [
        createCharacterRecord({
          id: 5811,
          primaryClass: 'Fighter',
          detail: {
            captainAbility:
              'Boosts ATK by 5x, reduces Pain duration by 10 turns and recovers 3,000 HP at end of turn.',
            builderAbilities: [
              {
                key: 'remove_pain',
                label: 'Remove Pain',
                minTurns: 10,
                isCompleteRemoval: false,
                slotTokens: [],
                source: 'captainAbility',
                coverageMode: 'explicit',
              },
            ],
          },
        }),
        createAtkSubRecord(),
        createAffinitySubRecord(),
        createUtilitySubRecord(),
        createConsistencySubRecord(),
        createOffClassRedundantSubRecord(),
      ],
      {
        ...INPUT,
        requiredAbilities: [
          { abilityKey: 'remove_pain', minTurns: 10, slotTokens: [], requiredCharacterCount: 1 },
        ],
      },
    );

    expect(result).not.toBeNull();
    expect(result?.coverage.abilityRequirements.matchesAll).toBe(true);
  });

  it('fails when pain removal coverage does not reach the requested turn count', () => {
    const result = buildAutoTeamResult(
      [
        createCaptainRecord(),
        createCharacterRecord({
          id: 5807,
          primaryClass: 'Fighter',
          detail: {
            specialText:
              'Reduces 1 selected debuff duration by 5 turns and changes all orbs into Matching orbs.',
            builderAbilities: [
              {
                key: 'remove_pain',
                label: 'Remove Pain',
                minTurns: 5,
                isCompleteRemoval: false,
                slotTokens: [],
                source: 'specialText',
                coverageMode: 'selectedDebuff',
              },
            ],
          },
        }),
        createAtkSubRecord(),
        createAffinitySubRecord(),
        createUtilitySubRecord(),
        createConsistencySubRecord(),
      ],
      {
        ...INPUT,
        requiredAbilities: [
          { abilityKey: 'remove_pain', minTurns: 10, slotTokens: [], requiredCharacterCount: 1 },
        ],
      },
    );

    expect(result).toBeNull();
  });

  it('allows captain-sourced builder abilities to satisfy a requirement', () => {
    const result = buildAutoTeamResult(
      [
        createCharacterRecord({
          id: 5810,
          primaryClass: 'Fighter',
          detail: {
            captainAbility:
              "Boosts ATK by 5x and deals 10% of enemies' current HP in True damage, ignoring Normal Attack Only, to all enemies at the end of each turn.",
            builderAbilities: [
              {
                key: 'ignore_normal_attack_only',
                label: 'Ignore Normal Attack Only (NAO)',
                minTurns: null,
                isCompleteRemoval: false,
                slotTokens: [],
                source: 'captainAbility',
              },
            ],
          },
        }),
        createAtkSubRecord(),
        createAffinitySubRecord(),
        createUtilitySubRecord(),
        createConsistencySubRecord(),
        createOffClassRedundantSubRecord(),
      ],
      {
        ...INPUT,
        requiredAbilities: [
          {
            abilityKey: 'ignore_normal_attack_only',
            minTurns: null,
            slotTokens: [],
            requiredCharacterCount: 1,
          },
        ],
      },
    );

    expect(result).not.toBeNull();
    expect(result?.coverage.abilityRequirements.matchesAll).toBe(true);
    expect(result?.coverage.abilityRequirements.matched).toEqual([
      {
        abilityKey: 'ignore_normal_attack_only',
        minTurns: null,
        slotTokens: [],
        requiredCharacterCount: 1,
      },
    ]);
  });

  it('fails when no candidate covers the required ability tokens', () => {
    const result = buildAutoTeamResult(
      [
        createCaptainRecord(),
        createCharacterRecord({
          id: 5804,
          primaryClass: 'Fighter',
          detail: {
            specialText: 'Removes [DEX] Slot Barrier completely.',
            builderAbilities: [
              {
                key: 'remove_slot_barrier',
                label: 'Remove Slot Barrier',
                minTurns: 99,
                isCompleteRemoval: true,
                slotTokens: ['DEX'],
                source: 'specialText',
              },
            ],
          },
        }),
        createAtkSubRecord(),
        createAffinitySubRecord(),
        createUtilitySubRecord(),
        createConsistencySubRecord(),
      ],
      {
        ...INPUT,
        requiredAbilities: [
          {
            abilityKey: 'remove_slot_barrier',
            minTurns: 3,
            slotTokens: ['QCK'],
            requiredCharacterCount: 1,
          },
        ],
      },
    );

    expect(result).toBeNull();
  });

  it('duplicates the best captain and prefers complementary class-matching subs', () => {
    const result = buildAutoTeamResult(
      [
        createCaptainRecord(),
        createAtkSubRecord(),
        createAffinitySubRecord(),
        createUtilitySubRecord(),
        createConsistencySubRecord(),
        createOffClassRedundantSubRecord(),
      ],
      INPUT,
    );

    expect(result).not.toBeNull();
    expect(result?.slots[0]?.role).toBe('captain');
    expect(result?.slots[1]?.role).toBe('friendCaptain');
    expect(result?.slots[0]?.character.id).toBe(result?.slots[1]?.character.id);

    const teamIds = result?.slots.map((slot) => slot.character.id) ?? [];

    expect(teamIds).toEqual(expect.arrayContaining([5900, 5890, 5880, 5870, 5860]));
    expect(teamIds).not.toContain(5850);
    expect(result?.coverage.utility).toContain('Bind clear');
    expect(result?.coverage.coversAllSelectedClasses).toBe(true);
    expect(result?.coverage.coversAllSelectedTypes).toBe(true);
  });

  it('prefers the newer equivalent captain after filtering unreadable recent placeholders', () => {
    const result = buildAutoTeamResult(
      [
        createCharacterRecord({
          id: 6000,
          primaryClass: 'Fighter',
          detail: {},
        }),
        createCharacterRecord({
          id: 5901,
          primaryClass: 'Fighter',
          secondaryClass: 'Free Spirit',
          detail: {
            captainAbility:
              'Boosts ATK of DEX and Fighter characters by 5.25x and HP by 1.3x, reduces Special Cooldown of crew by 1 turn.',
            specialText:
              'Boosts orb effects of DEX and Fighter characters by 2.25x for 1 turn and changes orbs into Matching Orbs.',
          },
        }),
        createCharacterRecord({
          id: 5899,
          primaryClass: 'Fighter',
          secondaryClass: 'Free Spirit',
          detail: {
            captainAbility:
              'Boosts ATK of DEX and Fighter characters by 5.25x and HP by 1.3x, reduces Special Cooldown of crew by 1 turn.',
            specialText:
              'Boosts orb effects of DEX and Fighter characters by 2.25x for 1 turn and changes orbs into Matching Orbs.',
          },
        }),
        createAtkSubRecord(),
        createAffinitySubRecord(),
        createUtilitySubRecord(),
        createConsistencySubRecord(),
      ],
      INPUT,
    );

    expect(result).not.toBeNull();
    expect(result?.candidateCount).toBe(6);
    expect(result?.slots[0]?.character.id).toBe(5901);
    expect(result?.slots[1]?.character.id).toBe(5901);
    expect(result?.slots.some((slot) => slot.character.id === 6000)).toBe(false);
  });

  it('prefers higher-cost captains within the power-first bucket over stronger lower-cost options', () => {
    const result = buildAutoTeamResult(
      [
        createPowerFirstCaptainRecord({
          id: 6100,
          name: 'Cost 65 Captain',
          cost: 65,
          atkMultiplier: 4.75,
        }),
        createPowerFirstCaptainRecord({
          id: 6101,
          name: 'Cost 55 Stronger Captain',
          cost: 55,
          atkMultiplier: 8.5,
          universal: true,
        }),
        createAtkSubRecord(),
        createAffinitySubRecord(),
        createUtilitySubRecord(),
        createConsistencySubRecord(),
      ],
      INPUT,
    );

    expect(result).not.toBeNull();
    expect(result?.slots[0]?.character.id).toBe(6100);
    expect(result?.slots[1]?.character.id).toBe(6100);
  });

  it('breaks same-cost captain ties with the newer id even when the older one has a stronger ability', () => {
    const result = buildAutoTeamResult(
      [
        createPowerFirstCaptainRecord({
          id: 6200,
          name: 'Older Stronger Captain',
          cost: 65,
          atkMultiplier: 9,
          universal: true,
        }),
        createPowerFirstCaptainRecord({
          id: 6201,
          name: 'Newer Weaker Captain',
          cost: 65,
          atkMultiplier: 4.5,
        }),
        createAtkSubRecord(),
        createAffinitySubRecord(),
        createUtilitySubRecord(),
        createConsistencySubRecord(),
      ],
      INPUT,
    );

    expect(result).not.toBeNull();
    expect(result?.slots[0]?.character.id).toBe(6201);
    expect(result?.slots[1]?.character.id).toBe(6201);
  });

  it('prefers the newer power-first captain over an older ability-first alternative', () => {
    const result = buildAutoTeamResult(
      [
        createPowerFirstCaptainRecord({
          id: 6300,
          name: 'Older Ability-First Captain',
          cost: 60,
          atkMultiplier: 9.25,
          universal: true,
        }),
        createPowerFirstCaptainRecord({
          id: 6305,
          name: 'Newer Power-First Captain',
          cost: 60,
          atkMultiplier: 4.25,
        }),
        createAtkSubRecord(),
        createAffinitySubRecord(),
        createUtilitySubRecord(),
        createConsistencySubRecord(),
      ],
      INPUT,
    );

    expect(result).not.toBeNull();
    expect(result?.slots[0]?.character.id).toBe(6305);
    expect(result?.slots[1]?.character.id).toBe(6305);
  });

  it('uses power-first ordering for captain and friend captain pair selection', () => {
    const result = buildAutoTeamResult(
      [
        createPowerFirstCaptainRecord({
          id: 6400,
          name: 'Captain Slot Cost 65',
          cost: 65,
          atkMultiplier: 4.5,
        }),
        createPowerFirstCaptainRecord({
          id: 6390,
          name: 'Captain Slot Stronger Cost 60',
          cost: 60,
          atkMultiplier: 8.5,
          universal: true,
        }),
        createPowerFirstCaptainRecord({
          id: 6500,
          name: 'Friend Slot Cost 65',
          cost: 65,
          atkMultiplier: 4.25,
        }),
        createPowerFirstCaptainRecord({
          id: 6490,
          name: 'Friend Slot Stronger Cost 55',
          cost: 55,
          atkMultiplier: 8.75,
          universal: true,
        }),
        createAtkSubRecord(),
        createAffinitySubRecord(),
        createUtilitySubRecord(),
        createConsistencySubRecord(),
      ],
      createInput(['DEX'], ['Fighter'], {
        manualSlots: createManualSlots({
          captain: [6400, 6390],
          friendCaptain: [6500, 6490],
        }),
      }),
    );

    expect(result).not.toBeNull();
    expect(result?.slots[0]?.character.id).toBe(6400);
    expect(result?.slots[1]?.character.id).toBe(6500);
  });

  it('prefers higher-cost modern subs over low-cost utility outliers when coverage is already met', () => {
    const result = buildAutoTeamResult(
      [
        createCaptainRecord(),
        createAtkSubRecord(),
        createAffinitySubRecord(),
        createUtilitySubRecord(),
        createCharacterRecord({
          id: 6200,
          name: 'Modern Powerhouse Sub',
          cost: 65,
          primaryClass: 'Fighter',
          detail: {
            specialText: 'Deals 100x character ATK in typeless damage to one enemy.',
          },
        }),
        createCharacterRecord({
          id: 267,
          name: 'Rainbow Striped Dragon',
          type: 'INT',
          cost: 20,
          primaryClass: 'Fighter',
          detail: {
            specialText: 'Reduces the defense of all enemies by 50% for 1 turn.',
          },
        }),
      ],
      INPUT,
    );

    expect(result).not.toBeNull();

    const teamIds = result?.slots.map((slot) => slot.character.id) ?? [];

    expect(teamIds).toContain(6200);
    expect(teamIds).not.toContain(267);
  });

  it('uses one selected leader for both captain slots', () => {
    const result = buildAutoTeamResult(createStrictMixedTeamRecords(), {
      ...createInput(['DEX', 'PSY'], ['Fighter', 'Slasher'], {
        lockedCharacterIds: [5925],
        captainCharacterId: 5925,
        friendCaptainCharacterId: 5925,
      }),
    });

    expect(result).not.toBeNull();
    expect(result?.slots[0]?.character.id).toBe(5925);
    expect(result?.slots[1]?.character.id).toBe(5925);
  });

  it('uses two selected leaders in the chosen captain and friend order', () => {
    const result = buildAutoTeamResult(createDualLeaderMixedTeamRecords(), {
      ...createInput(['DEX', 'PSY'], ['Fighter', 'Slasher'], {
        lockedCharacterIds: [5925, 5927],
        captainCharacterId: 5927,
        friendCaptainCharacterId: 5925,
      }),
    });

    expect(result).not.toBeNull();
    expect(result?.slots[0]?.character.id).toBe(5927);
    expect(result?.slots[1]?.character.id).toBe(5925);
    expect(result?.coverage.selectedClassMatches).toBe(6);
    expect(result?.coverage.selectedTypeMatches).toBe(6);
  });

  it('builds Kaido teams only from the classes boosted by the selected leader', () => {
    const result = buildAutoTeamResult(createKaidoLeaderTeamRecords(), {
      ...createInput(['DEX', 'STR', 'QCK', 'PSY', 'INT'], ['Powerhouse', 'Striker'], {
        lockedCharacterIds: [2700],
        captainCharacterId: 2700,
        friendCaptainCharacterId: 2700,
      }),
    });

    expect(result).not.toBeNull();
    expect(result?.coverage.leaderCriteria.derivedAllowedClasses).toEqual([
      'Powerhouse',
      'Striker',
    ]);
    expect(result?.coverage.leaderCriteria.hasCostRestriction).toBe(false);
    expect(result?.coverage.leaderCriteria.maxAllowedCost).toBeNull();
    expect(result?.coverage.leaderCriteria.hasClassRestriction).toBe(true);
    expect(result?.coverage.leaderCriteria.hasTypeRestriction).toBe(false);
    expect(result?.coverage.leaderCriteria.matchingSlots).toBe(6);
    expect(
      result?.slots.every((slot) =>
        slot.character.classes.some((characterClass) =>
          ['Powerhouse', 'Striker'].includes(characterClass),
        ),
      ),
    ).toBe(true);
    expect(result?.slots.some((slot) => slot.character.id === 2705)).toBe(false);
  });

  it('fails when a locked sub is outside the active leader scope', () => {
    const result = buildAutoTeamResult(createKaidoLeaderTeamRecords(), {
      ...createInput(['DEX', 'STR', 'QCK', 'PSY', 'INT'], ['Powerhouse', 'Striker'], {
        lockedCharacterIds: [2700, 2705],
        captainCharacterId: 2700,
        friendCaptainCharacterId: 2700,
      }),
    });

    expect(result).toBeNull();
  });

  it('intersects dual leader class scope before filling subs', () => {
    const result = buildAutoTeamResult(createIntersectedLeaderTeamRecords(), {
      ...createInput(['DEX', 'PSY'], ['Powerhouse'], {
        lockedCharacterIds: [2710, 2711],
        captainCharacterId: 2710,
        friendCaptainCharacterId: 2711,
      }),
    });

    expect(result).not.toBeNull();
    expect(result?.coverage.leaderCriteria.dualLeaderMode).toBe('intersection');
    expect(result?.coverage.leaderCriteria.derivedAllowedClasses).toEqual(['Powerhouse']);
    expect(
      result?.slots.slice(2).every((slot) => slot.character.classes.includes('Powerhouse')),
    ).toBe(true);
    expect(result?.slots.some((slot) => slot.character.id === 2716)).toBe(false);
  });

  it('falls back to generic roster selection when captain ability has no clear scope', () => {
    const result = buildAutoTeamResult(createScopeFreeLeaderTeamRecords(), {
      ...createInput(['DEX', 'PSY'], ['Fighter'], {
        lockedCharacterIds: [2720],
        captainCharacterId: 2720,
        friendCaptainCharacterId: 2720,
      }),
    });

    expect(result).not.toBeNull();
    expect(result?.coverage.leaderCriteria.hasCostRestriction).toBe(false);
    expect(result?.coverage.leaderCriteria.maxAllowedCost).toBeNull();
    expect(result?.coverage.leaderCriteria.hasClassRestriction).toBe(false);
    expect(result?.coverage.leaderCriteria.hasTypeRestriction).toBe(false);
    expect(result?.coverage.leaderCriteria.allSlotsMatch).toBe(true);
    expect(result?.slots.some((slot) => slot.character.id === 2724)).toBe(true);
  });

  it('filters dual Buggy teams to cost-40-or-less characters', () => {
    const result = buildAutoTeamResult(createBuggyLeaderTeamRecords(), {
      ...createInput(['DEX', 'STR', 'QCK', 'PSY', 'INT'], [], {
        lockedCharacterIds: [2035],
        captainCharacterId: 2035,
        friendCaptainCharacterId: 2035,
      }),
    });

    expect(result).not.toBeNull();
    expect(result?.coverage.leaderCriteria.hasCostRestriction).toBe(true);
    expect(result?.coverage.leaderCriteria.maxAllowedCost).toBe(40);
    expect(result?.slots.every((slot) => slot.character.cost <= 40)).toBe(true);
    expect(result?.slots.some((slot) => slot.character.id === 2534)).toBe(false);
    expect(result?.slots.some((slot) => slot.character.id === 2577)).toBe(false);
  });

  it('rejects a leader with only non-roster super special criteria when the toggle is enabled', () => {
    const result = buildAutoTeamResult(
      [
        createLeaderWithSuperCriteriaRecord(
          7001,
          'Monkey D. Luffy',
          createNonRosterSuperCriteria(),
        ),
        createAtkSubRecord(),
        createAffinitySubRecord(),
        createUtilitySubRecord(),
        createConsistencySubRecord(),
        createCharacterRecord({
          id: 7002,
          name: 'Roronoa Zoro',
          primaryClass: 'Fighter',
          detail: {
            specialText: 'Boosts chain by 1.2x for 1 turn.',
          },
        }),
      ],
      createInput(['DEX'], ['Fighter'], {
        requireLeaderSuperSpecialCriteria: true,
      }),
    );

    expect(result).toBeNull();
  });

  it('accepts a mixed super special criteria leader when the roster branch is satisfied', () => {
    const result = buildAutoTeamResult(
      [
        createLeaderWithSuperCriteriaRecord(
          7010,
          'Monkey D. Luffy',
          createMixedRosterSuperCriteria(1, ['Roronoa Zoro', 'Nami']),
        ),
        createCharacterRecord({
          id: 7011,
          name: 'Roronoa Zoro',
          primaryClass: 'Fighter',
          detail: {
            specialText: 'Boosts chain by 1.2x for 1 turn.',
          },
        }),
        createAtkSubRecord(),
        createAffinitySubRecord(),
        createUtilitySubRecord(),
        createConsistencySubRecord(),
      ],
      createInput(['DEX'], ['Fighter'], {
        requireLeaderSuperSpecialCriteria: true,
      }),
    );

    expect(result).not.toBeNull();
    expect(result?.slots.some((slot) => slot.character.name === 'Roronoa Zoro')).toBe(true);
  });

  it('enforces both leaders super special criteria when both selected leaders have them', () => {
    const result = buildAutoTeamResult(
      [
        createLeaderWithSuperCriteriaRecord(
          7020,
          'Monkey D. Luffy',
          createRosterSuperCriteria(1, ['Roronoa Zoro']),
        ),
        createLeaderWithSuperCriteriaRecord(
          7021,
          'Trafalgar D. Water Law',
          createRosterSuperCriteria(1, ['Nami']),
        ),
        createCharacterRecord({
          id: 7022,
          name: 'Roronoa Zoro',
          primaryClass: 'Fighter',
          detail: {
            specialText: 'Boosts chain by 1.2x for 1 turn.',
          },
        }),
        createCharacterRecord({
          id: 7023,
          name: 'Nami',
          primaryClass: 'Fighter',
          detail: {
            specialText: 'Reduces paralysis duration by 5 turns.',
          },
        }),
        createUtilitySubRecord(),
        createConsistencySubRecord(),
      ],
      createInput(['DEX'], ['Fighter'], {
        requireLeaderSuperSpecialCriteria: true,
        lockedCharacterIds: [7020, 7021],
        captainCharacterId: 7020,
        friendCaptainCharacterId: 7021,
      }),
    );

    expect(result).not.toBeNull();
    expect(result?.slots.some((slot) => slot.character.name === 'Roronoa Zoro')).toBe(true);
    expect(result?.slots.some((slot) => slot.character.name === 'Nami')).toBe(true);
  });

  it('builds teams only from the leader super effect scope when enabled', () => {
    const result = buildAutoTeamResult(
      [
        createLeaderWithSuperEffectScopeRecord(7200, {
          type: 'DEX',
          primaryClass: 'Fighter',
          superTypeEffect: 'Changes DEX characters to Super DEX.',
        }),
        createSuperEffectScopeSubRecord(7201, {
          type: 'DEX',
          primaryClass: 'Fighter',
        }),
        createSuperEffectScopeSubRecord(7202, {
          type: 'DEX',
          primaryClass: 'Slasher',
        }),
        createSuperEffectScopeSubRecord(7203, {
          type: 'DEX',
          primaryClass: 'Driven',
        }),
        createSuperEffectScopeSubRecord(7204, {
          type: 'DEX',
          primaryClass: 'Powerhouse',
        }),
        createSuperEffectScopeSubRecord(7205, {
          type: 'STR',
          primaryClass: 'Fighter',
        }),
      ],
      createInput(['DEX'], ['Fighter'], {
        requireAllSlotsInLeaderSuperEffectScope: true,
        lockedCharacterIds: [7200],
        captainCharacterId: 7200,
        friendCaptainCharacterId: 7200,
      }),
    );

    expect(result).not.toBeNull();
    expect(result?.slots.every((slot) => slot.character.type.includes('DEX'))).toBe(true);
    expect(result?.slots.some((slot) => slot.character.id === 7205)).toBe(false);
  });

  it('intersects captain and friend captain super effect scopes', () => {
    const result = buildAutoTeamResult(
      [
        createLeaderWithSuperEffectScopeRecord(7210, {
          type: 'DEX',
          primaryClass: 'Fighter',
          superTypeEffect: 'Changes DEX characters to Super DEX.',
        }),
        createLeaderWithSuperEffectScopeRecord(7211, {
          type: 'DEX',
          primaryClass: 'Fighter',
          superClassEffect: 'Transforms Fighter characters into Super Fighter characters.',
        }),
        createSuperEffectScopeSubRecord(7212, {
          type: 'DEX',
          primaryClass: 'Fighter',
        }),
        createSuperEffectScopeSubRecord(7213, {
          type: 'DEX',
          primaryClass: 'Fighter',
        }),
        createSuperEffectScopeSubRecord(7214, {
          type: 'DEX',
          primaryClass: 'Striker',
        }),
        createSuperEffectScopeSubRecord(7215, {
          type: 'PSY',
          primaryClass: 'Fighter',
        }),
        createSuperEffectScopeSubRecord(7216, {
          type: 'DEX',
          primaryClass: 'Fighter',
        }),
        createSuperEffectScopeSubRecord(7217, {
          type: 'DEX',
          primaryClass: 'Fighter',
        }),
      ],
      createInput(['DEX'], ['Fighter'], {
        requireAllSlotsInLeaderSuperEffectScope: true,
        lockedCharacterIds: [7210, 7211],
        captainCharacterId: 7210,
        friendCaptainCharacterId: 7211,
      }),
    );

    expect(result).not.toBeNull();
    expect(
      result?.slots.every(
        (slot) => slot.character.type.includes('DEX') && slot.character.classes.includes('Fighter'),
      ),
    ).toBe(true);
    expect(result?.slots.some((slot) => slot.character.id === 7214)).toBe(false);
    expect(result?.slots.some((slot) => slot.character.id === 7215)).toBe(false);
  });

  it('rejects manual sub picks outside the leader super effect scope', () => {
    const result = buildAutoTeamResult(
      [
        createLeaderWithSuperEffectScopeRecord(7220, {
          type: 'DEX',
          primaryClass: 'Fighter',
          superTypeEffect: 'Changes DEX characters to Super DEX.',
        }),
        createSuperEffectScopeSubRecord(7221, {
          type: 'DEX',
          primaryClass: 'Fighter',
        }),
        createSuperEffectScopeSubRecord(7222, {
          type: 'DEX',
          primaryClass: 'Slasher',
        }),
        createSuperEffectScopeSubRecord(7223, {
          type: 'DEX',
          primaryClass: 'Driven',
        }),
        createSuperEffectScopeSubRecord(7224, {
          type: 'DEX',
          primaryClass: 'Powerhouse',
        }),
        createSuperEffectScopeSubRecord(7225, {
          type: 'STR',
          primaryClass: 'Fighter',
        }),
      ],
      createInput(['DEX'], ['Fighter'], {
        requireAllSlotsInLeaderSuperEffectScope: true,
        manualSlots: createManualSlots({
          captain: [7220],
          friendCaptain: [7220],
          sub1: [7225],
        }),
        lockedCharacterIds: [7220, 7225],
        captainCharacterId: 7220,
        friendCaptainCharacterId: 7220,
      }),
    );

    expect(result).toBeNull();
  });

  it('rejects leaders without parseable super effect scope when the filter is enabled', () => {
    const result = buildAutoTeamResult(
      [
        createLeaderWithSuperEffectScopeRecord(7230, {
          type: 'DEX',
          primaryClass: 'Fighter',
          superTypeEffect: 'Boosts crew ATK by 1.3x for 1 turn.',
        }),
        createSuperEffectScopeSubRecord(7231, {
          type: 'DEX',
          primaryClass: 'Fighter',
        }),
        createSuperEffectScopeSubRecord(7232, {
          type: 'DEX',
          primaryClass: 'Slasher',
        }),
        createSuperEffectScopeSubRecord(7233, {
          type: 'DEX',
          primaryClass: 'Driven',
        }),
        createSuperEffectScopeSubRecord(7234, {
          type: 'DEX',
          primaryClass: 'Powerhouse',
        }),
        createSuperEffectScopeSubRecord(7235, {
          type: 'DEX',
          primaryClass: 'Shooter',
        }),
      ],
      createInput(['DEX'], ['Fighter'], {
        requireAllSlotsInLeaderSuperEffectScope: true,
        lockedCharacterIds: [7230],
        captainCharacterId: 7230,
        friendCaptainCharacterId: 7230,
      }),
    );

    expect(result).toBeNull();
  });

  it('filters super leaders out of auto leader selection during the hidden default exact attempt', () => {
    const result = buildAutoTeamResult(
      [
        createLeaderWithSuperEffectScopeRecord(7236, {
          type: 'DEX',
          primaryClass: 'Fighter',
          superTypeEffect: 'Changes DEX characters to Super DEX.',
        }),
        createUniversalCaptainRecord(),
        createAtkSubRecord(),
        createAffinitySubRecord(),
        createUtilitySubRecord(),
        createConsistencySubRecord(),
      ],
      createInput(['DEX'], ['Fighter']),
      { requireLeadersWithoutSuperEffects: true },
    );

    expect(result).not.toBeNull();
    expect(result?.slots[0]?.character.id).toBe(5905);
    expect(result?.slots[1]?.character.id).toBe(5905);
    expect(result?.slots[0]?.character.id).not.toBe(7236);
    expect(result?.slots[1]?.character.id).not.toBe(7236);
  });

  it('rejects manual leaders with super effects during the hidden default exact attempt', () => {
    const result = buildAutoTeamResult(
      [
        createLeaderWithSuperEffectScopeRecord(7237, {
          type: 'DEX',
          primaryClass: 'Fighter',
          superClassEffect: 'Transforms Fighter characters into Super Fighter characters.',
        }),
        createAtkSubRecord(),
        createAffinitySubRecord(),
        createUtilitySubRecord(),
        createConsistencySubRecord(),
      ],
      createInput(['DEX'], ['Fighter'], {
        lockedCharacterIds: [7237],
        captainCharacterId: 7237,
        friendCaptainCharacterId: 7237,
      }),
      { requireLeadersWithoutSuperEffects: true },
    );

    expect(result).toBeNull();
  });

  it('still allows super units in sub slots during the hidden default exact attempt', () => {
    const result = buildAutoTeamResult(
      [
        createCaptainRecord(),
        createLeaderWithSuperEffectScopeRecord(7238, {
          type: 'DEX',
          primaryClass: 'Fighter',
          superTypeEffect: 'Changes DEX characters to Super DEX.',
        }),
        createAtkSubRecord(),
        createAffinitySubRecord(),
        createUtilitySubRecord(),
      ],
      createInput(['DEX'], ['Fighter'], {
        lockedCharacterIds: [5900],
        captainCharacterId: 5900,
        friendCaptainCharacterId: 5900,
      }),
      { requireLeadersWithoutSuperEffects: true },
    );

    expect(result).not.toBeNull();
    expect(result?.slots.some((slot) => slot.character.id === 7238)).toBe(true);
  });

  it('prefers the newer captain when universal and partial multi-type captains share the same cost', () => {
    const result = buildAutoTeamResult(
      [
        createPartialMultiTypeCaptainRecord(),
        createUniversalCaptainRecord(),
        createAtkSubRecord(),
        createAffinitySubRecord(),
        createUtilitySubRecord(),
        createConsistencySubRecord(),
      ],
      createInput(['DEX', 'PSY']),
    );

    expect(result).not.toBeNull();
    expect(result?.slots[0]?.character.id).toBe(5906);
    expect(result?.slots[0]?.reasonChips).toContain('DEX captain');
  });

  it('builds one strict type-coverage team when all selected types can be covered', () => {
    const result = buildAutoTeamResult(
      [
        createStrictMixedCaptainRecord(),
        createSlasherQckAtkSubRecord(),
        createAffinitySubRecord(),
        createUtilitySubRecord(),
        createConsistencySubRecord(),
      ],
      createInput(['DEX', 'QCK'], ['Fighter', 'Slasher'], { requireAllSelectedTypesInTeam: true }),
    );

    expect(result).not.toBeNull();
    expect(result?.coverage.coveredSelectedClasses).toEqual(['Fighter', 'Slasher']);
    expect(result?.coverage.coveredSelectedTypes).toEqual(['DEX', 'QCK']);
    expect(result?.coverage.coversAllSelectedClasses).toBe(true);
    expect(result?.coverage.coversAllSelectedTypes).toBe(true);
  });

  it('returns a team when class strict mode is off and not all selected classes are covered', () => {
    const result = buildAutoTeamResult(
      [
        createCaptainRecord(),
        createAtkSubRecord(),
        createAffinitySubRecord(),
        createUtilitySubRecord(),
        createConsistencySubRecord(),
      ],
      createInput(['DEX'], ['Fighter', 'Shooter']),
    );

    expect(result).not.toBeNull();
    expect(result?.coverage.coveredSelectedClasses).toEqual(['Fighter']);
    expect(result?.coverage.coversAllSelectedClasses).toBe(false);
  });

  it('returns a team when type strict mode is off and not all selected types are covered', () => {
    const result = buildAutoTeamResult(
      [
        createCaptainRecord(),
        createAtkSubRecord(),
        createAffinitySubRecord(),
        createUtilitySubRecord(),
        createConsistencySubRecord(),
      ],
      createInput(['DEX', 'INT']),
    );

    expect(result).not.toBeNull();
    expect(result?.coverage.coveredSelectedTypes).toEqual(['DEX']);
    expect(result?.coverage.coversAllSelectedTypes).toBe(false);
  });

  it('fails strict type coverage when a selected type cannot be covered', () => {
    const result = buildAutoTeamResult(
      [
        createCaptainRecord(),
        createAtkSubRecord(),
        createAffinitySubRecord(),
        createUtilitySubRecord(),
        createConsistencySubRecord(),
      ],
      createInput(['DEX', 'INT'], ['Fighter'], { requireAllSelectedTypesInTeam: true }),
    );

    expect(result).toBeNull();
  });

  it('builds a team only when every chosen unit has all selected classes in strict class mode', () => {
    const result = buildAutoTeamResult(createAllClassStrictTeamRecords(), {
      ...createInput(['DEX'], ['Fighter', 'Slasher']),
      requireAllSelectedClassesPerCharacter: true,
    });

    expect(result).not.toBeNull();
    expect(result?.slots.every((slot) => slot.character.classes.includes('Fighter'))).toBe(true);
    expect(result?.slots.every((slot) => slot.character.classes.includes('Slasher'))).toBe(true);
  });

  it('fails strict class mode when even one slot cannot be filled by an all-class candidate', () => {
    const result = buildAutoTeamResult(createInsufficientStrictClassTeamRecords(), {
      ...createInput(['DEX'], ['Fighter', 'Slasher']),
      requireAllSelectedClassesPerCharacter: true,
    });

    expect(result).toBeNull();
  });

  it('keeps locked characters in the generated team and fills the remaining slots', () => {
    const lockedCharacterIds = [5926, 5880];
    const result = buildAutoTeamResult(createStrictMixedTeamRecords(), {
      ...createInput(['DEX', 'PSY'], ['Fighter', 'Slasher']),
      lockedCharacterIds,
    });

    expect(result).not.toBeNull();
    expect(result?.slots.some((slot) => slot.character.id === 5926)).toBe(true);
    expect(result?.slots.some((slot) => slot.character.id === 5880)).toBe(true);
  });

  it('falls back to the first four legacy locked subs when more than four sub picks are provided', () => {
    const records = [
      ...createAllClassStrictTeamRecords(),
      createCharacterRecord({
        id: 5936,
        type: 'DEX',
        primaryClass: 'Fighter',
        secondaryClass: 'Slasher',
        detail: {
          specialText: 'Boosts ATK of Fighter and Slasher characters by 2x for 1 turn.',
        },
      }),
    ];
    const result = buildAutoTeamResult(records, {
      ...createInput(['DEX'], ['Fighter', 'Slasher']),
      lockedCharacterIds: [5930, 5931, 5932, 5933, 5934, 5936],
    });

    expect(result).not.toBeNull();
    expect(result?.slots.some((slot) => slot.character.id === 5936)).toBe(false);
  });

  it('forces captain selection from locked picks when five locked characters are provided', () => {
    const lockedCharacterIds = [5925, 5926, 5880, 5870, 5860];
    const result = buildAutoTeamResult(createStrictMixedTeamRecords(), {
      ...createInput(['DEX', 'PSY'], ['Fighter', 'Slasher']),
      lockedCharacterIds,
    });

    expect(result).not.toBeNull();
    expect(lockedCharacterIds).toContain(result?.slots[0]?.character.id ?? -1);

    const uniqueTeamIds = new Set(result?.slots.map((slot) => slot.character.id) ?? []);

    expect(uniqueTeamIds).toEqual(new Set(lockedCharacterIds));
  });

  it('builds a six-slot team when five manual picks include two distinct leaders', () => {
    const lockedCharacterIds = [5925, 5927, 5926, 5880, 5870];
    const result = buildAutoTeamResult(createDualLeaderMixedTeamRecords(), {
      ...createInput(['DEX', 'PSY'], ['Fighter', 'Slasher'], {
        lockedCharacterIds,
        captainCharacterId: 5925,
        friendCaptainCharacterId: 5927,
      }),
    });

    expect(result).not.toBeNull();
    expect(result?.slots).toHaveLength(6);
    expect(result?.slots[0]?.character.id).toBe(5925);
    expect(result?.slots[1]?.character.id).toBe(5927);
    expect(new Set(result?.slots.map((slot) => slot.character.id) ?? [])).toEqual(
      new Set([5925, 5927, 5926, 5880, 5870, 5860]),
    );
  });

  it('requests combined candidates from the repository service when multiple types are selected', async () => {
    const repository = {
      getAutoBuilderCandidates: vi.fn().mockResolvedValue(createStrictMixedTeamRecords()),
    };
    const service = new AutoTeamBuilderService(repository as never);

    await service.buildTeam(['Fighter', 'Slasher'], ['DEX', 'PSY']);

    expect(repository.getAutoBuilderCandidates).toHaveBeenCalledWith(
      ['DEX', 'PSY'],
      AUTO_TEAM_CANDIDATE_LIMIT,
      {
        selectedClasses: ['Fighter', 'Slasher'],
        allowedCharacterIds: undefined,
        lockedCharacterIds: [],
        excludedCharacterIds: [],
      },
    );
  });

  it('normalizes and forwards excluded character ids to the repository query', async () => {
    const repository = {
      getAutoBuilderCandidates: vi.fn().mockResolvedValue(createStrictMixedTeamRecords()),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(['Fighter', 'Slasher'], ['DEX', 'PSY'], {
      excludedCharacterIds: [5926, 5926, -1, 0],
    });

    expect(result?.input.excludedCharacterIds).toEqual([5926]);
    expect(repository.getAutoBuilderCandidates).toHaveBeenCalledWith(
      ['DEX', 'PSY'],
      AUTO_TEAM_CANDIDATE_LIMIT,
      {
        selectedClasses: ['Fighter', 'Slasher'],
        allowedCharacterIds: undefined,
        lockedCharacterIds: [],
        excludedCharacterIds: [5926],
      },
    );
  });

  it('normalizes duplicate classes before building', async () => {
    const repository = {
      getAutoBuilderCandidates: vi.fn().mockResolvedValue(createStrictMixedTeamRecords()),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(
      ['Fighter', ' Slasher ', 'fighter'],
      ['DEX', 'PSY', 'DEX'],
    );

    expect(repository.getAutoBuilderCandidates).toHaveBeenCalledWith(
      ['DEX', 'PSY'],
      AUTO_TEAM_CANDIDATE_LIMIT,
      {
        selectedClasses: ['Fighter', 'Slasher'],
        allowedCharacterIds: undefined,
        lockedCharacterIds: [],
        excludedCharacterIds: [],
      },
    );
    expect(result?.input.selectedClasses).toEqual(['Fighter', 'Slasher']);
    expect(result?.requestedInput.selectedClasses).toEqual(['Fighter', 'Slasher']);
    expect(result?.relaxation.usedFallback).toBe(false);
  });

  it('defaults to DEX when no types are provided', async () => {
    const repository = {
      getAutoBuilderCandidates: vi.fn().mockResolvedValue(createSingleTypeRecords()),
    };
    const service = new AutoTeamBuilderService(repository as never);

    await service.buildTeam(['Fighter']);

    expect(repository.getAutoBuilderCandidates).toHaveBeenCalledWith(
      [AUTO_TEAM_BUILDER_DEFAULT_TYPE],
      AUTO_TEAM_CANDIDATE_LIMIT,
      {
        selectedClasses: ['Fighter'],
        allowedCharacterIds: undefined,
        lockedCharacterIds: [],
        excludedCharacterIds: [],
      },
    );
  });

  it('builds teams from favorites only when favorites mode is enabled', async () => {
    const repository = {
      getAutoBuilderCandidates: vi.fn().mockResolvedValue(createStrictMixedTeamRecords()),
    };
    const service = new AutoTeamBuilderService(repository as never);
    const favoriteCharacterIds = [5925, 5926, 5880, 5870, 5860];

    const result = await service.buildTeam(['Fighter', 'Slasher'], ['DEX', 'PSY'], {
      favoritesOnly: true,
      favoriteCharacterIds,
    });

    expect(result).not.toBeNull();
    expect(result?.input.favoritesOnly).toBe(true);
    expect(result?.slots.every((slot) => favoriteCharacterIds.includes(slot.character.id))).toBe(
      true,
    );
    expect(repository.getAutoBuilderCandidates).toHaveBeenCalledWith(
      ['DEX', 'PSY'],
      AUTO_TEAM_CANDIDATE_LIMIT,
      {
        selectedClasses: ['Fighter', 'Slasher'],
        allowedCharacterIds: favoriteCharacterIds,
        lockedCharacterIds: [],
        excludedCharacterIds: [],
      },
    );
  });

  it('builds teams only from candidate character ids when a box scope is provided', async () => {
    const repository = {
      getAutoBuilderCandidates: vi.fn().mockResolvedValue(createStrictMixedTeamRecords()),
    };
    const service = new AutoTeamBuilderService(repository as never);
    const candidateCharacterIds = [5926, 5870, 5860];

    const result = await service.buildTeam(['Fighter', 'Slasher'], ['DEX', 'PSY'], {
      candidateCharacterIds,
    });

    expect(result).not.toBeNull();
    expect(repository.getAutoBuilderCandidates).toHaveBeenCalledWith(
      ['DEX', 'PSY'],
      AUTO_TEAM_CANDIDATE_LIMIT,
      {
        selectedClasses: ['Fighter', 'Slasher'],
        allowedCharacterIds: candidateCharacterIds,
        lockedCharacterIds: [],
        excludedCharacterIds: [],
      },
    );
  });

  it('intersects candidate character ids with favorites when both scopes are enabled', async () => {
    const repository = {
      getAutoBuilderCandidates: vi.fn().mockResolvedValue(createStrictMixedTeamRecords()),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(['Fighter', 'Slasher'], ['DEX', 'PSY'], {
      candidateCharacterIds: [5925, 5926, 5880],
      favoritesOnly: true,
      favoriteCharacterIds: [5926, 5870, 5860],
    });

    expect(result).not.toBeNull();
    expect(repository.getAutoBuilderCandidates).toHaveBeenCalledWith(
      ['DEX', 'PSY'],
      AUTO_TEAM_CANDIDATE_LIMIT,
      {
        selectedClasses: ['Fighter', 'Slasher'],
        allowedCharacterIds: [5926],
        lockedCharacterIds: [],
        excludedCharacterIds: [],
      },
    );
  });

  it('carries favorite ship filters into the result input and ship selection', async () => {
    const repository = {
      getAutoBuilderCandidates: vi.fn().mockResolvedValue(createStrictMixedTeamRecords()),
      getShips: vi
        .fn()
        .mockResolvedValue([
          createShipRecord(9001, 'Ship 9001', 'Boosts ATK by 1.5x.'),
          createShipRecord(9002, 'Ship 9002', 'Boosts ATK by 1.6x.'),
        ]),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(['Fighter', 'Slasher'], ['DEX', 'PSY'], {
      favoriteShipsOnly: true,
      favoriteShipIds: [9002],
    });

    expect(result?.input.favoriteShipsOnly).toBe(true);
    expect(result?.input.favoriteShipIds).toEqual([9002]);
    expect(result?.requestedInput.favoriteShipIds).toEqual([9002]);
    expect(result?.shipSelection?.ship.id).toBe(9002);
  });

  it('returns null in favorites mode when no favorite candidate ids match', async () => {
    const repository = {
      getAutoBuilderCandidates: vi.fn().mockResolvedValue([]),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(['Fighter', 'Slasher'], ['DEX', 'PSY'], {
      favoritesOnly: true,
      favoriteCharacterIds: [999_999],
    });

    expect(result).toBeNull();
    expect(repository.getAutoBuilderCandidates).toHaveBeenCalledWith(
      ['DEX', 'PSY'],
      AUTO_TEAM_CANDIDATE_LIMIT,
      {
        selectedClasses: ['Fighter', 'Slasher'],
        allowedCharacterIds: [999_999],
        lockedCharacterIds: [],
        excludedCharacterIds: [],
      },
    );
  });

  it('returns null when the selected character box scope is empty', async () => {
    const repository = {
      getAutoBuilderCandidates: vi.fn(),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(['Fighter', 'Slasher'], ['DEX', 'PSY'], {
      candidateCharacterIds: [],
    });

    expect(result).toBeNull();
    expect(repository.getAutoBuilderCandidates).not.toHaveBeenCalled();
  });

  it('normalizes omitted constraints to false', async () => {
    const repository = {
      getAutoBuilderCandidates: vi.fn().mockResolvedValue(createSingleTypeRecords()),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(['Fighter'], ['DEX']);

    expect(result?.input.requireAllSelectedTypesInTeam).toBe(false);
    expect(result?.input.requireAllSelectedClassesPerCharacter).toBe(false);
    expect(result?.input.requireUniqueBaseCharacterNames).toBe(false);
    expect(result?.input.favoritesOnly).toBe(false);
    expect(result?.input.favoriteShipsOnly).toBe(false);
    expect(result?.input.favoriteShipIds).toEqual([]);
    expect(result?.input.lockedCharacterIds).toEqual([]);
    expect(result?.requestedInput.lockedCharacterIds).toEqual([]);
    expect(result?.input.captainCharacterId).toBeNull();
    expect(result?.input.friendCaptainCharacterId).toBeNull();
  });

  it('keeps non-favorite manual picks while querying the auto-fill pool from favorites only', async () => {
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue([createCaptainRecord(), ...createStrictMixedTeamRecords()]),
    };
    const service = new AutoTeamBuilderService(repository as never);
    const favoriteCharacterIds = [5926, 5870, 5860];

    const result = await service.buildTeam(['Fighter', 'Slasher'], ['DEX', 'PSY'], {
      favoritesOnly: true,
      favoriteCharacterIds,
      manualSlots: createManualSlots({
        captain: [5925],
        sub1: [5900],
      }),
    });

    expect(result).not.toBeNull();
    expect(result?.slots.some((slot) => slot.character.id === 5925)).toBe(true);
    expect(result?.slots.some((slot) => slot.character.id === 5900)).toBe(true);
    expect(repository.getAutoBuilderCandidates).toHaveBeenCalledWith(
      ['DEX', 'PSY'],
      AUTO_TEAM_CANDIDATE_LIMIT,
      {
        selectedClasses: ['Fighter', 'Slasher'],
        allowedCharacterIds: favoriteCharacterIds,
        lockedCharacterIds: [5925, 5900],
        excludedCharacterIds: [],
      },
    );
  });

  it('keeps manual picks outside the selected character box while querying auto-fill from the box scope', async () => {
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue([createCaptainRecord(), ...createStrictMixedTeamRecords()]),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(['Fighter', 'Slasher'], ['DEX', 'PSY'], {
      candidateCharacterIds: [5926, 5870, 5860],
      manualSlots: createManualSlots({
        captain: [5925],
        sub1: [5900],
      }),
    });

    expect(result).not.toBeNull();
    expect(result?.slots.some((slot) => slot.character.id === 5925)).toBe(true);
    expect(result?.slots.some((slot) => slot.character.id === 5900)).toBe(true);
    expect(repository.getAutoBuilderCandidates).toHaveBeenCalledWith(
      ['DEX', 'PSY'],
      AUTO_TEAM_CANDIDATE_LIMIT,
      {
        selectedClasses: ['Fighter', 'Slasher'],
        allowedCharacterIds: [5926, 5870, 5860],
        lockedCharacterIds: [5925, 5900],
        excludedCharacterIds: [],
      },
    );
  });

  it('normalizes and deduplicates locked ids before building', async () => {
    const repository = {
      getAutoBuilderCandidates: vi.fn().mockResolvedValue(createStrictMixedTeamRecords()),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(['Fighter', 'Slasher'], ['DEX', 'PSY'], {
      lockedCharacterIds: [5925, 5925, 5926, 0, -1],
      captainCharacterId: 5925,
    });

    expect(result?.input.lockedCharacterIds).toEqual([5925, 5926]);
  });

  it('normalizes a single selected leader into both captain ids', async () => {
    const repository = {
      getAutoBuilderCandidates: vi.fn().mockResolvedValue(createStrictMixedTeamRecords()),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(['Fighter', 'Slasher'], ['DEX', 'PSY'], {
      lockedCharacterIds: [5925],
      captainCharacterId: 5925,
    });

    expect(result?.input.captainCharacterId).toBe(5925);
    expect(result?.input.friendCaptainCharacterId).toBe(5925);
  });

  it('derives legacy leader ids from slot-based manual selections and keeps shared leaders valid', async () => {
    const repository = {
      getAutoBuilderCandidates: vi.fn().mockResolvedValue(createStrictMixedTeamRecords()),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(['Fighter', 'Slasher'], ['DEX', 'PSY'], {
      manualSlots: createManualSlots({
        captain: [5925, 5926],
        friendCaptain: [5925],
        sub1: [5926, 5880],
        sub2: [5880, 5870],
      }),
    });

    expect(result?.input.manualSlots).toEqual(
      createManualSlots({
        captain: [5925, 5926],
        friendCaptain: [5925],
        sub1: [5880],
        sub2: [5870],
      }),
    );
    expect(result?.input.lockedCharacterIds).toEqual([5925, 5926, 5880, 5870]);
    expect(result?.input.captainCharacterId).toBe(5925);
    expect(result?.input.friendCaptainCharacterId).toBe(5925);
  });

  it('prefers slot-based manual selections over legacy locked ids when both are provided', async () => {
    const repository = {
      getAutoBuilderCandidates: vi.fn().mockResolvedValue(createStrictMixedTeamRecords()),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(['Fighter', 'Slasher'], ['DEX', 'PSY'], {
      manualSlots: createManualSlots({
        captain: [5925],
        sub1: [5880],
      }),
      lockedCharacterIds: [5900],
      captainCharacterId: 5900,
      friendCaptainCharacterId: 5900,
    });

    expect(result?.input.manualSlots).toEqual(
      createManualSlots({
        captain: [5925],
        sub1: [5880],
      }),
    );
    expect(result?.input.lockedCharacterIds).toEqual([5925, 5880]);
    expect(result?.input.captainCharacterId).toBe(5925);
    expect(result?.input.friendCaptainCharacterId).toBe(5925);
  });

  it('returns null when a slot-based manual pick is missing from the available candidate pool', async () => {
    const repository = {
      getAutoBuilderCandidates: vi.fn().mockResolvedValue(createStrictMixedTeamRecords()),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(['Fighter', 'Slasher'], ['DEX', 'PSY'], {
      manualSlots: createManualSlots({
        captain: [999999],
      }),
    });

    expect(result).toBeNull();
  });

  it('returns null when a selected leader is outside the locked picks', async () => {
    const repository = {
      getAutoBuilderCandidates: vi.fn().mockResolvedValue(createStrictMixedTeamRecords()),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(['Fighter', 'Slasher'], ['DEX', 'PSY'], {
      lockedCharacterIds: [5926],
      captainCharacterId: 5925,
      friendCaptainCharacterId: 5925,
    });

    expect(result).toBeNull();
    expect(repository.getAutoBuilderCandidates).not.toHaveBeenCalled();
  });

  it('keeps a non-favorite legacy leader while querying the auto-fill pool from favorites only', async () => {
    const repository = {
      getAutoBuilderCandidates: vi.fn().mockResolvedValue(createStrictMixedTeamRecords()),
    };
    const service = new AutoTeamBuilderService(repository as never);
    const favoriteCharacterIds = [5926, 5880, 5870, 5860];

    const result = await service.buildTeam(['Fighter', 'Slasher'], ['DEX', 'PSY'], {
      favoritesOnly: true,
      favoriteCharacterIds,
      lockedCharacterIds: [5925],
      captainCharacterId: 5925,
      friendCaptainCharacterId: 5925,
    });

    expect(result).not.toBeNull();
    expect(result?.slots[0]?.character.id).toBe(5925);
    expect(result?.slots[1]?.character.id).toBe(5925);
    expect(repository.getAutoBuilderCandidates).toHaveBeenCalledWith(
      ['DEX', 'PSY'],
      AUTO_TEAM_CANDIDATE_LIMIT,
      {
        selectedClasses: ['Fighter', 'Slasher'],
        allowedCharacterIds: favoriteCharacterIds,
        lockedCharacterIds: [5925],
        excludedCharacterIds: [],
      },
    );
  });

  it('returns requestedInput and no relaxation metadata when exact coverage succeeds', async () => {
    const repository = {
      getAutoBuilderCandidates: vi.fn().mockResolvedValue(createStrictMixedTeamRecords()),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(['Fighter', 'Slasher'], ['DEX', 'PSY']);

    expect(result).not.toBeNull();
    expect(result?.requestedInput.selectedClasses).toEqual(['Fighter', 'Slasher']);
    expect(result?.requestedInput.types).toEqual(['DEX', 'PSY']);
    expect(result?.relaxation).toEqual({
      usedFallback: false,
      droppedTypes: [],
      droppedClasses: [],
      minimumLeaderSuperEffectMatchingSlots: null,
      allowedLeadersWithSuperEffects: false,
      ignoredLeaderSuperEffectScope: false,
      ignoredLeaderSuperSpecialCriteria: false,
    });
  });

  it('relaxes leader super special criteria before dropping classes or types', async () => {
    const repository = {
      getAutoBuilderCandidates: vi.fn().mockResolvedValue([
        createLeaderWithSuperCriteriaRecord(
          7001,
          'Monkey D. Luffy',
          createNonRosterSuperCriteria(),
        ),
        createAtkSubRecord(),
        createAffinitySubRecord(),
        createUtilitySubRecord(),
        createConsistencySubRecord(),
        createCharacterRecord({
          id: 7002,
          name: 'Roronoa Zoro',
          primaryClass: 'Fighter',
          detail: {
            specialText: 'Boosts chain by 1.2x for 1 turn.',
          },
        }),
      ]),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(['Fighter'], ['DEX']);

    expect(result).not.toBeNull();
    expect(result?.requestedInput.requireLeaderSuperSpecialCriteria).toBe(true);
    expect(result?.input.requireLeaderSuperSpecialCriteria).toBe(false);
    expect(result?.relaxation).toEqual({
      usedFallback: true,
      droppedTypes: [],
      droppedClasses: [],
      minimumLeaderSuperEffectMatchingSlots: null,
      allowedLeadersWithSuperEffects: true,
      ignoredLeaderSuperEffectScope: false,
      ignoredLeaderSuperSpecialCriteria: true,
    });
  });

  it('still allows the leader super special fallback when type or class strict mode is enabled', async () => {
    const repository = {
      getAutoBuilderCandidates: vi.fn().mockResolvedValue([
        createLeaderWithSuperCriteriaRecord(
          7101,
          'Monkey D. Luffy',
          createNonRosterSuperCriteria(),
        ),
        createAtkSubRecord(),
        createAffinitySubRecord(),
        createUtilitySubRecord(),
        createConsistencySubRecord(),
        createCharacterRecord({
          id: 7102,
          name: 'Roronoa Zoro',
          primaryClass: 'Fighter',
          detail: {
            specialText: 'Boosts chain by 1.2x for 1 turn.',
          },
        }),
      ]),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(['Fighter'], ['DEX'], {
      requireAllSelectedTypesInTeam: true,
    });

    expect(result).not.toBeNull();
    expect(result?.input.requireLeaderSuperSpecialCriteria).toBe(false);
    expect(result?.relaxation.ignoredLeaderSuperSpecialCriteria).toBe(true);
    expect(result?.relaxation.droppedTypes).toEqual([]);
    expect(result?.relaxation.droppedClasses).toEqual([]);
  });

  it('relaxes the leader super effect scope filter one matching slot at a time', async () => {
    const repository = {
      getAutoBuilderCandidates: vi.fn().mockResolvedValue([
        createLeaderWithSuperEffectScopeRecord(7240, {
          type: 'DEX',
          primaryClass: 'Fighter',
          superTypeEffect: 'Changes DEX characters to Super DEX.',
        }),
        createSuperEffectScopeSubRecord(7241, {
          type: 'DEX',
          primaryClass: 'Fighter',
        }),
        createSuperEffectScopeSubRecord(7242, {
          type: 'DEX',
          primaryClass: 'Slasher',
        }),
        createSuperEffectScopeSubRecord(7243, {
          type: 'DEX',
          primaryClass: 'Driven',
        }),
        createSuperEffectScopeSubRecord(7244, {
          type: 'STR',
          primaryClass: 'Powerhouse',
        }),
        createSuperEffectScopeSubRecord(7245, {
          type: 'STR',
          primaryClass: 'Shooter',
        }),
      ]),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(['Fighter'], ['DEX'], {
      requireAllSlotsInLeaderSuperEffectScope: true,
    });

    expect(result).not.toBeNull();
    expect(result?.input.requireAllSlotsInLeaderSuperEffectScope).toBe(true);
    expect(result?.input.minimumLeaderSuperEffectMatchingSlots).toBe(5);
    expect(result?.input.requireLeaderSuperSpecialCriteria).toBe(true);
    expect(result?.slots.filter((slot) => slot.character.type.includes('DEX'))).toHaveLength(5);
    expect(result?.relaxation).toEqual({
      usedFallback: true,
      droppedTypes: [],
      droppedClasses: [],
      minimumLeaderSuperEffectMatchingSlots: 5,
      allowedLeadersWithSuperEffects: false,
      ignoredLeaderSuperEffectScope: false,
      ignoredLeaderSuperSpecialCriteria: false,
    });
  });

  it('falls back to special criteria only after exhausting the leader super effect scope relaxations', async () => {
    const repository = {
      getAutoBuilderCandidates: vi.fn().mockResolvedValue([
        createLeaderWithSuperEffectScopeRecord(7250, {
          type: 'DEX',
          primaryClass: 'Fighter',
          superTypeEffect: 'Changes DEX characters to Super DEX.',
        }),
        createLeaderWithSuperEffectScopeRecord(7251, {
          type: 'PSY',
          primaryClass: 'Striker',
          superClassEffect: 'Transforms Fighter characters into Super Fighter characters.',
        }),
        createCharacterRecord({
          id: 7252,
          name: 'Roronoa Zoro',
          type: 'DEX',
          primaryClass: 'Fighter',
          detail: {
            specialText: 'Boosts chain by 1.2x for 1 turn.',
          },
        }),
        createAtkSubRecord(),
        createAffinitySubRecord(),
        createUtilitySubRecord(),
      ]),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(['Fighter'], ['DEX'], {
      requireAllSlotsInLeaderSuperEffectScope: true,
      requireLeaderSuperSpecialCriteria: true,
      captainCharacterId: 7250,
      friendCaptainCharacterId: 7251,
      lockedCharacterIds: [7250, 7251],
    });

    expect(result).not.toBeNull();
    expect(result?.requestedInput.requireAllSlotsInLeaderSuperEffectScope).toBe(true);
    expect(result?.requestedInput.requireLeaderSuperSpecialCriteria).toBe(true);
    expect(result?.input.requireAllSlotsInLeaderSuperEffectScope).toBe(false);
    expect(result?.input.minimumLeaderSuperEffectMatchingSlots).toBeNull();
    expect(result?.input.requireLeaderSuperSpecialCriteria).toBe(true);
    expect(result?.slots.some((slot) => slot.character.id === 7252)).toBe(true);
    expect(result?.relaxation).toEqual({
      usedFallback: true,
      droppedTypes: [],
      droppedClasses: [],
      minimumLeaderSuperEffectMatchingSlots: null,
      allowedLeadersWithSuperEffects: false,
      ignoredLeaderSuperEffectScope: true,
      ignoredLeaderSuperSpecialCriteria: false,
    });
  });

  it('allows super leaders before dropping types or classes when the default exact attempt fails', async () => {
    const repository = {
      getAutoBuilderCandidates: vi.fn().mockResolvedValue([
        createLeaderWithSuperEffectScopeRecord(7256, {
          type: 'DEX',
          primaryClass: 'Fighter',
          superTypeEffect: 'Changes DEX characters to Super DEX.',
        }),
        createLeaderWithSuperEffectScopeRecord(7257, {
          type: 'DEX',
          primaryClass: 'Fighter',
          superClassEffect: 'Transforms Fighter characters into Super Fighter characters.',
        }),
        createAtkSubRecord(),
        createAffinitySubRecord(),
        createUtilitySubRecord(),
        createConsistencySubRecord(),
      ]),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(['Fighter'], ['DEX']);

    expect(result).not.toBeNull();
    expect(result?.requestedInput.requireAllSlotsInLeaderSuperEffectScope).toBe(false);
    expect(result?.input.requireAllSlotsInLeaderSuperEffectScope).toBe(false);
    expect(result?.relaxation.usedFallback).toBe(true);
    expect(result?.relaxation.allowedLeadersWithSuperEffects).toBe(true);
    expect(result?.relaxation.droppedTypes).toEqual([]);
    expect(result?.relaxation.droppedClasses).toEqual([]);
    expect([7256, 7257]).toContain(result?.slots[0]?.character.id ?? -1);
    expect([7256, 7257]).toContain(result?.slots[1]?.character.id ?? -1);
  });

  it('re-allows super leaders before dropping types during flexible fallback attempts', async () => {
    const repository = {
      getAutoBuilderCandidates: vi.fn().mockResolvedValue(createSingleTypeRecords()),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(['Fighter'], ['DEX', 'INT']);

    expect(result).not.toBeNull();
    expect(result?.relaxation.usedFallback).toBe(true);
    expect(result?.relaxation.allowedLeadersWithSuperEffects).toBe(true);
    expect(result?.relaxation.droppedTypes).toEqual(['INT']);
  });

  it('keeps the requested scope filter untouched when scope mode is explicitly enabled', async () => {
    const repository = {
      getAutoBuilderCandidates: vi
        .fn()
        .mockResolvedValue([
          createCaptainRecord(),
          createAtkSubRecord(),
          createAffinitySubRecord(),
          createUtilitySubRecord(),
          createConsistencySubRecord(),
        ]),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(['Fighter'], ['DEX'], {
      requireAllSlotsInLeaderSuperEffectScope: true,
    });

    expect(result).not.toBeNull();
    expect(result?.requestedInput.requireAllSlotsInLeaderSuperEffectScope).toBe(true);
    expect(result?.input.requireAllSlotsInLeaderSuperEffectScope).toBe(false);
    expect(result?.relaxation.allowedLeadersWithSuperEffects).toBe(false);
  });

  it('drops the weakest uncovered class in flexible mode when exact class coverage fails', async () => {
    const repository = {
      getAutoBuilderCandidates: vi.fn().mockResolvedValue(createSingleTypeRecords()),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(['Fighter', 'Shooter'], ['DEX']);

    expect(result).not.toBeNull();
    expect(result?.requestedInput.selectedClasses).toEqual(['Fighter', 'Shooter']);
    expect(result?.input.selectedClasses).toEqual(['Fighter']);
    expect(result?.relaxation).toEqual({
      usedFallback: true,
      droppedTypes: [],
      droppedClasses: ['Shooter'],
      minimumLeaderSuperEffectMatchingSlots: null,
      allowedLeadersWithSuperEffects: true,
      ignoredLeaderSuperEffectScope: false,
      ignoredLeaderSuperSpecialCriteria: true,
    });
  });

  it('relaxes class coverage independently of removed special-support rules', async () => {
    const repository = {
      getAutoBuilderCandidates: vi.fn().mockResolvedValue(createTeamwideSpecialScopedRecords()),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(['Fighter', 'Shooter'], ['DEX', 'PSY']);

    expect(result).not.toBeNull();
    expect(result?.requestedInput.selectedClasses).toEqual(['Fighter', 'Shooter']);
    expect(result?.input.selectedClasses).toEqual(['Fighter']);
  });

  it('drops the weakest uncovered type in flexible mode when exact type coverage fails', async () => {
    const repository = {
      getAutoBuilderCandidates: vi.fn().mockResolvedValue(createSingleTypeRecords()),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(['Fighter'], ['DEX', 'INT']);

    expect(result).not.toBeNull();
    expect(result?.requestedInput.types).toEqual(['DEX', 'INT']);
    expect(result?.input.types).toEqual(['DEX']);
    expect(result?.relaxation).toEqual({
      usedFallback: true,
      droppedTypes: ['INT'],
      droppedClasses: [],
      minimumLeaderSuperEffectMatchingSlots: null,
      allowedLeadersWithSuperEffects: true,
      ignoredLeaderSuperEffectScope: false,
      ignoredLeaderSuperSpecialCriteria: true,
    });
  });

  it('does not relax filters when any strict toggle is enabled', async () => {
    const repository = {
      getAutoBuilderCandidates: vi.fn().mockResolvedValue(createSingleTypeRecords()),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(['Fighter'], ['DEX', 'INT'], {
      requireAllSelectedTypesInTeam: true,
    });

    expect(result).toBeNull();
  });

  it('forwards progress snapshots from the worker runtime', async () => {
    const repository = {
      getAutoBuilderCandidates: vi.fn().mockResolvedValue(createStrictMixedTeamRecords()),
    };
    const service = new AutoTeamBuilderService(repository as never);
    const worker = new FakeWorker((request) => {
      worker.emitMessage({
        type: 'progress',
        runId: request.runId,
        snapshot: {
          stage: 'exactAttempt',
          candidateCount: 6,
          completedAttempts: 0,
          totalAttempts: 1,
          attemptCountFinal: false,
          elapsedMs: 12,
          estimatedRemainingMs: null,
          averageFallbackAttemptMs: null,
          completedFallbackAttempts: 0,
          currentDroppedTypes: [],
          currentDroppedClasses: [],
          currentAllowedLeadersWithSuperEffects: false,
          currentIgnoredLeaderSuperSpecialCriteria: false,
          messageKey: 'progress.exactAttempt',
          messageParams: {
            current: 1,
            total: 1,
          },
        },
      });
      worker.emitMessage({
        type: 'result',
        runId: request.runId,
        result: null,
      });
    });
    const progressSnapshots: AutoBuildProgressSnapshot[] = [];

    const createWorkerSpy = vi.spyOn(
      service as AutoTeamBuilderServiceWithWorkerFactory,
      'createWorker',
    );
    createWorkerSpy.mockReturnValue(worker as never);

    await service.buildTeam(
      ['Fighter', 'Slasher'],
      ['DEX', 'PSY'],
      {},
      {
        onProgress: (snapshot) => progressSnapshots.push(snapshot),
      },
    );

    expect(progressSnapshots).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          stage: 'loadingCandidates',
          elapsedMs: 0,
          estimatedRemainingMs: null,
          averageFallbackAttemptMs: null,
          completedFallbackAttempts: 0,
        }),
        expect.objectContaining({
          stage: 'exactAttempt',
          elapsedMs: 12,
          estimatedRemainingMs: null,
          averageFallbackAttemptMs: null,
          completedFallbackAttempts: 0,
          messageKey: 'progress.exactAttempt',
          messageParams: {
            current: 1,
            total: 1,
          },
        }),
      ]),
    );
  });

  it('rejects with cancellation and terminates the worker when the signal aborts', async () => {
    const repository = {
      getAutoBuilderCandidates: vi.fn().mockResolvedValue(createStrictMixedTeamRecords()),
    };
    const service = new AutoTeamBuilderService(repository as never);
    const worker = new FakeWorker();
    const abortController = new AbortController();

    const createWorkerSpy = vi.spyOn(
      service as AutoTeamBuilderServiceWithWorkerFactory,
      'createWorker',
    );
    createWorkerSpy.mockReturnValue(worker as never);

    const buildPromise = service.buildTeam(
      ['Fighter', 'Slasher'],
      ['DEX', 'PSY'],
      {},
      {
        signal: abortController.signal,
      },
    );

    await Promise.resolve();
    abortController.abort();

    await expect(buildPromise).rejects.toBeInstanceOf(AutoTeamBuildCancelledError);
    expect(worker.terminated).toBe(true);
  });

  it('falls back to the main-thread engine when no worker is available', async () => {
    const repository = {
      getAutoBuilderCandidates: vi.fn().mockResolvedValue(createStrictMixedTeamRecords()),
    };
    const service = new AutoTeamBuilderService(repository as never);
    const createWorkerSpy = vi.spyOn(
      service as AutoTeamBuilderServiceWithWorkerFactory,
      'createWorker',
    );
    createWorkerSpy.mockReturnValue(null);

    const result = await service.buildTeam(['Fighter', 'Slasher'], ['DEX', 'PSY']);

    expect(createWorkerSpy).toHaveBeenCalledOnce();
    expect(result).not.toBeNull();
    expect(result?.relaxation.usedFallback).toBe(false);
    expect(result?.coverage.coversAllSelectedClasses).toBe(true);
  });

  it('keeps the single-worker search path when workerCount is 1', async () => {
    const repository = {
      getAutoBuilderCandidates: vi.fn().mockResolvedValue(createStrictMixedTeamRecords()),
    };
    const service = new AutoTeamBuilderService(repository as never);
    const worker = new FakeWorker((request) => {
      if (request.type !== 'run') {
        throw new Error(`Unexpected request type: ${request.type}`);
      }

      worker.emitMessage({
        type: 'result',
        runId: request.runId,
        result: null,
      });
    });
    const createWorkerSpy = vi.spyOn(
      service as AutoTeamBuilderServiceWithWorkerFactory,
      'createWorker',
    );
    createWorkerSpy.mockReturnValue(worker as never);

    await service.buildTeam(
      ['Fighter', 'Slasher'],
      ['DEX', 'PSY'],
      {},
      {
        workerCount: 1,
      },
    );

    expect(worker.requests).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'run',
        }),
      ]),
    );
  });

  it('waits for earlier pooled fallback attempts before resolving a later valid result', async () => {
    const repository = {
      getAutoBuilderCandidates: vi.fn().mockResolvedValue(createSingleTypeRecords()),
      getShips: vi.fn().mockResolvedValue([]),
    };
    const service = new AutoTeamBuilderService(repository as never);
    const deferredFallbackRunIds: string[] = [];
    const workerA = new PooledFakeWorker((request) => {
      if (request.type === 'init') {
        workerA.emitMessage({ type: 'ready' });
        return;
      }

      if (request.type !== 'runAttempt') {
        return;
      }

      if (
        request.input.types.length === 2 &&
        request.input.selectedClasses.length === 1 &&
        request.requireLeadersWithoutSuperEffects
      ) {
        workerA.emitMessage({
          type: 'result',
          runId: request.runId,
          result: null,
        });
        return;
      }

      if (
        request.input.types.length === 2 &&
        request.input.selectedClasses.length === 1 &&
        !request.requireLeadersWithoutSuperEffects
      ) {
        deferredFallbackRunIds.push(request.runId);
        return;
      }

      if (request.input.types.length === 2 && request.input.selectedClasses.length === 0) {
        workerA.emitMessage({
          type: 'result',
          runId: request.runId,
          result: null,
        });
      }
    });
    const workerB = new PooledFakeWorker((request) => {
      if (request.type === 'init') {
        workerB.emitMessage({ type: 'ready' });
        return;
      }

      if (
        request.type === 'runAttempt' &&
        request.input.types.length === 2 &&
        request.input.selectedClasses.length === 0
      ) {
        workerB.emitMessage({
          type: 'result',
          runId: request.runId,
          result: null,
        });
        return;
      }

      if (
        request.type === 'runAttempt' &&
        request.input.types.length === 1 &&
        request.input.selectedClasses.length === 1
      ) {
        workerB.emitMessage({
          type: 'result',
          runId: request.runId,
          result: buildWorkerResult(createInput(['DEX'], ['Fighter'])),
        });
      }
    });
    const createWorkerSpy = vi.spyOn(
      service as AutoTeamBuilderServiceWithWorkerFactory,
      'createWorker',
    );
    createWorkerSpy.mockReturnValueOnce(workerA as never).mockReturnValueOnce(workerB as never);

    let settled = false;
    const buildPromise = service
      .buildTeam(
        ['Fighter'],
        ['DEX', 'INT'],
        { requireLeaderSuperSpecialCriteria: false },
        { workerCount: 2 },
      )
      .then((result) => {
        settled = true;
        return result;
      });

    await flushMicrotasks();
    expect(settled).toBe(false);
    expect(deferredFallbackRunIds).toHaveLength(1);

    workerA.emitMessage({
      type: 'result',
      runId: deferredFallbackRunIds[0],
      result: null,
    });

    const result = await buildPromise;

    expect(result?.input.types).toEqual(['DEX']);
    expect(result?.input.selectedClasses).toEqual(['Fighter']);
    expect(workerA.terminated).toBe(true);
    expect(workerB.terminated).toBe(true);
  });

  it('redispatches pooled fallback work on the next microtask without a timer-based pause', async () => {
    const repository = {
      getAutoBuilderCandidates: vi.fn().mockResolvedValue(createSingleTypeRecords()),
      getShips: vi.fn().mockResolvedValue([]),
    };
    const service = new AutoTeamBuilderService(repository as never);
    let deferredWorkerARunId: string | null = null;
    let deferredWorkerBRunId: string | null = null;
    let workerARunAttemptCount = 0;
    let workerBRunAttemptCount = 0;

    const workerA = new PooledFakeWorker((request) => {
      if (request.type === 'init') {
        workerA.emitMessage({ type: 'ready' });
        return;
      }

      if (request.type !== 'runAttempt') {
        return;
      }

      workerARunAttemptCount += 1;

      if (workerARunAttemptCount === 1) {
        workerA.emitMessage({
          type: 'result',
          runId: request.runId,
          result: null,
        });
        return;
      }

      if (workerARunAttemptCount === 2) {
        deferredWorkerARunId = request.runId;
        return;
      }

      workerA.emitMessage({
        type: 'result',
        runId: request.runId,
        result: buildWorkerResult(createInput(['DEX'], ['Fighter'])),
      });
    });

    const workerB = new PooledFakeWorker((request) => {
      if (request.type === 'init') {
        workerB.emitMessage({ type: 'ready' });
        return;
      }

      if (request.type !== 'runAttempt') {
        return;
      }

      workerBRunAttemptCount += 1;

      if (workerBRunAttemptCount === 1) {
        deferredWorkerBRunId = request.runId;
      }
    });

    const createWorkerSpy = vi.spyOn(
      service as AutoTeamBuilderServiceWithWorkerFactory,
      'createWorker',
    );
    createWorkerSpy.mockReturnValueOnce(workerA as never).mockReturnValueOnce(workerB as never);

    const buildPromise = service.buildTeam(
      ['Fighter'],
      ['DEX', 'INT'],
      { requireLeaderSuperSpecialCriteria: false },
      { workerCount: 2 },
    );

    await flushMicrotasks();

    expect(deferredWorkerARunId).not.toBeNull();
    expect(deferredWorkerBRunId).not.toBeNull();
    expect(workerARunAttemptCount).toBe(2);
    expect(workerBRunAttemptCount).toBe(1);

    workerA.emitMessage({
      type: 'result',
      runId: deferredWorkerARunId,
      result: null,
    });

    await flushMicrotasks();

    expect(workerARunAttemptCount).toBeGreaterThan(2);
    expect(workerBRunAttemptCount).toBe(1);

    workerB.emitMessage({
      type: 'result',
      runId: deferredWorkerBRunId,
      result: null,
    });

    const result = await buildPromise;

    expect(result?.input.types).toEqual(['DEX']);
    expect(result?.input.selectedClasses).toEqual(['Fighter']);
    expect(workerA.terminated).toBe(true);
    expect(workerB.terminated).toBe(true);
  });

  it('skips earlier pooled fallback results that miss requested coverage', async () => {
    const repository = {
      getAutoBuilderCandidates: vi.fn().mockResolvedValue(createSingleTypeRecords()),
      getShips: vi.fn().mockResolvedValue([]),
    };
    const service = new AutoTeamBuilderService(repository as never);
    const workerA = new PooledFakeWorker((request) => {
      if (request.type === 'init') {
        workerA.emitMessage({ type: 'ready' });
        return;
      }

      if (request.type !== 'runAttempt') {
        return;
      }

      if (request.input.types.length === 2 && request.input.selectedClasses.length === 1) {
        workerA.emitMessage({
          type: 'result',
          runId: request.runId,
          result: null,
        });
        return;
      }

      if (request.input.types.length === 2 && request.input.selectedClasses.length === 0) {
        workerA.emitMessage({
          type: 'result',
          runId: request.runId,
          result: buildWorkerResult(createInput(['DEX', 'INT'], []), {
            coveredSelectedClasses: [],
            coversAllSelectedClasses: false,
            selectedClassMatches: 0,
          }),
        });
        return;
      }

      if (request.input.types.length === 1 && request.input.selectedClasses.length === 1) {
        workerA.emitMessage({
          type: 'result',
          runId: request.runId,
          result: buildWorkerResult(createInput(['DEX'], ['Fighter'])),
        });
      }
    });
    const workerB = new PooledFakeWorker((request) => {
      if (request.type === 'init') {
        workerB.emitMessage({ type: 'ready' });
        return;
      }

      if (
        request.type === 'runAttempt' &&
        request.input.types.length === 2 &&
        request.input.selectedClasses.length === 0
      ) {
        workerB.emitMessage({
          type: 'result',
          runId: request.runId,
          result: buildWorkerResult(createInput(['DEX', 'INT'], []), {
            coveredSelectedClasses: [],
            coversAllSelectedClasses: false,
            selectedClassMatches: 0,
          }),
        });
        return;
      }

      if (
        request.type === 'runAttempt' &&
        request.input.types.length === 1 &&
        request.input.selectedClasses.length === 1
      ) {
        workerB.emitMessage({
          type: 'result',
          runId: request.runId,
          result: buildWorkerResult(createInput(['DEX'], ['Fighter'])),
        });
      }
    });
    const createWorkerSpy = vi.spyOn(
      service as AutoTeamBuilderServiceWithWorkerFactory,
      'createWorker',
    );
    createWorkerSpy.mockReturnValueOnce(workerA as never).mockReturnValueOnce(workerB as never);

    const result = await service.buildTeam(
      ['Fighter'],
      ['DEX', 'INT'],
      { requireLeaderSuperSpecialCriteria: false },
      { workerCount: 2 },
    );

    expect(result?.input.types).toEqual(['DEX']);
    expect(result?.input.selectedClasses).toEqual(['Fighter']);
    expect(result?.coverage.coversAllSelectedClasses).toBe(true);
  });

  it('skips earlier pooled fallback results that miss required ability coverage', async () => {
    const repository = {
      getAutoBuilderCandidates: vi.fn().mockResolvedValue(createSingleTypeRecords()),
      getShips: vi.fn().mockResolvedValue([]),
    };
    const service = new AutoTeamBuilderService(repository as never);
    const workerA = new PooledFakeWorker((request) => {
      if (request.type === 'init') {
        workerA.emitMessage({ type: 'ready' });
        return;
      }

      if (request.type !== 'runAttempt') {
        return;
      }

      if (request.input.types.length === 2 && request.input.selectedClasses.length === 1) {
        workerA.emitMessage({
          type: 'result',
          runId: request.runId,
          result: null,
        });
        return;
      }

      if (request.input.types.length === 2 && request.input.selectedClasses.length === 0) {
        workerA.emitMessage({
          type: 'result',
          runId: request.runId,
          result: buildWorkerResult(createInput(['DEX', 'INT'], []), {
            coveredSelectedClasses: ['Fighter'],
            coversAllSelectedClasses: true,
            selectedClassMatches: 1,
            abilityRequirements: {
              matched: [],
              missing: [
                {
                  abilityKey: 'remove_bind',
                  minTurns: null,
                  slotTokens: [],
                  requiredCharacterCount: 1,
                },
              ],
              matchesAll: false,
            },
          }),
        });
        return;
      }

      if (request.input.types.length === 1 && request.input.selectedClasses.length === 1) {
        workerA.emitMessage({
          type: 'result',
          runId: request.runId,
          result: buildWorkerResult(createInput(['DEX'], ['Fighter'])),
        });
      }
    });
    const workerB = new PooledFakeWorker((request) => {
      if (request.type === 'init') {
        workerB.emitMessage({ type: 'ready' });
        return;
      }

      if (
        request.type === 'runAttempt' &&
        request.input.types.length === 2 &&
        request.input.selectedClasses.length === 0
      ) {
        workerB.emitMessage({
          type: 'result',
          runId: request.runId,
          result: buildWorkerResult(createInput(['DEX', 'INT'], []), {
            coveredSelectedClasses: ['Fighter'],
            coversAllSelectedClasses: true,
            selectedClassMatches: 1,
            abilityRequirements: {
              matched: [],
              missing: [
                {
                  abilityKey: 'remove_bind',
                  minTurns: null,
                  slotTokens: [],
                  requiredCharacterCount: 1,
                },
              ],
              matchesAll: false,
            },
          }),
        });
        return;
      }

      if (
        request.type === 'runAttempt' &&
        request.input.types.length === 1 &&
        request.input.selectedClasses.length === 1
      ) {
        workerB.emitMessage({
          type: 'result',
          runId: request.runId,
          result: buildWorkerResult(createInput(['DEX'], ['Fighter'])),
        });
      }
    });
    const createWorkerSpy = vi.spyOn(
      service as AutoTeamBuilderServiceWithWorkerFactory,
      'createWorker',
    );
    createWorkerSpy.mockReturnValueOnce(workerA as never).mockReturnValueOnce(workerB as never);

    const result = await service.buildTeam(
      ['Fighter'],
      ['DEX', 'INT'],
      { requireLeaderSuperSpecialCriteria: false },
      { workerCount: 2 },
    );

    expect(result?.input.types).toEqual(['DEX']);
    expect(result?.input.selectedClasses).toEqual(['Fighter']);
    expect(result?.coverage.abilityRequirements.matchesAll).toBe(true);
  });

  it('returns null when pooled fallback results never satisfy requested coverage', async () => {
    const repository = {
      getAutoBuilderCandidates: vi.fn().mockResolvedValue(createSingleTypeRecords()),
      getShips: vi.fn().mockResolvedValue([]),
    };
    const service = new AutoTeamBuilderService(repository as never);
    const workerA = new PooledFakeWorker((request) => {
      if (request.type === 'init') {
        workerA.emitMessage({ type: 'ready' });
        return;
      }

      if (request.type !== 'runAttempt') {
        return;
      }

      if (request.input.types.length === 2 && request.input.selectedClasses.length === 1) {
        workerA.emitMessage({
          type: 'result',
          runId: request.runId,
          result: null,
        });
        return;
      }

      if (request.input.selectedClasses.length === 0) {
        workerA.emitMessage({
          type: 'result',
          runId: request.runId,
          result: buildWorkerResult(createInput(request.input.types, []), {
            coveredSelectedClasses: [],
            coversAllSelectedClasses: false,
            selectedClassMatches: 0,
          }),
        });
        return;
      }

      workerA.emitMessage({
        type: 'result',
        runId: request.runId,
        result: null,
      });
    });
    const workerB = new PooledFakeWorker((request) => {
      if (request.type === 'init') {
        workerB.emitMessage({ type: 'ready' });
        return;
      }

      if (request.type !== 'runAttempt') {
        return;
      }

      if (request.input.types.length === 1 && request.input.selectedClasses.length === 1) {
        workerB.emitMessage({
          type: 'result',
          runId: request.runId,
          result: buildWorkerResult(createInput(request.input.types, ['Fighter']), {
            abilityRequirements: {
              matched: [],
              missing: [
                {
                  abilityKey: 'remove_bind',
                  minTurns: null,
                  slotTokens: [],
                  requiredCharacterCount: 1,
                },
              ],
              matchesAll: false,
            },
          }),
        });
        return;
      }

      workerB.emitMessage({
        type: 'result',
        runId: request.runId,
        result: null,
      });
    });
    const createWorkerSpy = vi.spyOn(
      service as AutoTeamBuilderServiceWithWorkerFactory,
      'createWorker',
    );
    createWorkerSpy.mockReturnValueOnce(workerA as never).mockReturnValueOnce(workerB as never);

    const result = await service.buildTeam(['Fighter'], ['DEX', 'INT'], {}, { workerCount: 2 });

    expect(result).toBeNull();
    expect(workerA.terminated).toBe(true);
    expect(workerB.terminated).toBe(true);
  });

  it('reports pooled fallback progress beyond the legacy 1024-attempt ceiling', async () => {
    const repository = {
      getAutoBuilderCandidates: vi.fn().mockResolvedValue(createSingleTypeRecords()),
      getShips: vi.fn().mockResolvedValue([]),
    };
    const service = new AutoTeamBuilderService(repository as never);
    const progressSnapshots: AutoBuildProgressSnapshot[] = [];
    const successfulWorkerResult = buildAutoTeamResult(
      createStrictMixedTeamRecords(),
      createInput(['DEX'], ['Fighter', 'Slasher']),
    );
    let runAttemptCount = 0;

    expect(successfulWorkerResult).not.toBeNull();

    const workerA = new PooledFakeWorker((request) => {
      if (request.type === 'init') {
        workerA.emitMessage({ type: 'ready' });
        return;
      }

      if (request.type === 'runAttempt') {
        runAttemptCount += 1;
        workerA.emitMessage({
          type: 'result',
          runId: request.runId,
          result: runAttemptCount === 1 ? null : successfulWorkerResult,
        });
      }
    });
    const workerB = new PooledFakeWorker((request) => {
      if (request.type === 'init') {
        workerB.emitMessage({ type: 'ready' });
        return;
      }

      if (request.type === 'runAttempt') {
        runAttemptCount += 1;
        workerB.emitMessage({
          type: 'result',
          runId: request.runId,
          result: runAttemptCount === 1 ? null : successfulWorkerResult,
        });
      }
    });
    const createWorkerSpy = vi.spyOn(
      service as AutoTeamBuilderServiceWithWorkerFactory,
      'createWorker',
    );
    createWorkerSpy.mockReturnValueOnce(workerA as never).mockReturnValueOnce(workerB as never);

    const result = await service.buildTeam(
      createSyntheticClasses(10),
      ['DEX', 'STR', 'QCK', 'PSY', 'INT'],
      {
        requireLeaderSuperSpecialCriteria: true,
      },
      {
        workerCount: 2,
        onProgress: (snapshot) => progressSnapshots.push(snapshot),
      },
    );

    expect(result).not.toBeNull();
    expect(runAttemptCount).toBeGreaterThanOrEqual(2);
    expect(
      progressSnapshots.find((snapshot) => snapshot.stage === 'exactAttempt')?.totalAttempts,
    ).toBe(31_744);
    expect(
      progressSnapshots.find(
        (snapshot) => snapshot.stage === 'fallbackAttempt' && snapshot.totalAttempts === 31_744,
      ),
    ).toBeDefined();
    expect(progressSnapshots.at(-1)?.totalAttempts).toBe(31_744);
    expect(progressSnapshots.at(-1)?.attemptCountFinal).toBe(true);
    expect(progressSnapshots.at(-1)?.totalAttempts).toBeGreaterThan(1024);
  });

  it('falls back to the main-thread engine when pooled worker initialization fails', async () => {
    const repository = {
      getAutoBuilderCandidates: vi.fn().mockResolvedValue(createSingleTypeRecords()),
      getShips: vi.fn().mockResolvedValue([]),
    };
    const service = new AutoTeamBuilderService(repository as never);
    const workerA = new PooledFakeWorker((request) => {
      if (request.type === 'init') {
        workerA.emitMessage({ type: 'ready' });
      }
    });
    const workerB = new PooledFakeWorker((request) => {
      if (request.type === 'init') {
        workerB.emitMessage({
          type: 'error',
          errorMessage: 'init failed',
        });
      }
    });
    const createWorkerSpy = vi.spyOn(
      service as AutoTeamBuilderServiceWithWorkerFactory,
      'createWorker',
    );
    createWorkerSpy.mockReturnValueOnce(workerA as never).mockReturnValueOnce(workerB as never);

    const result = await service.buildTeam(['Fighter'], ['DEX', 'INT'], {}, { workerCount: 2 });

    expect(result).not.toBeNull();
    expect(result?.input.types).toEqual(['DEX']);
    expect(workerA.terminated).toBe(true);
    expect(workerB.terminated).toBe(true);
  });

  it('fails strict class mode when a forced leader does not match all selected classes', () => {
    const result = buildAutoTeamResult(
      [
        createCaptainRecord(),
        createCharacterRecord({
          id: 5931,
          type: 'DEX',
          primaryClass: 'Fighter',
          secondaryClass: 'Slasher',
          detail: {
            specialText: 'Boosts ATK of Fighter and Slasher characters by 2.25x for 1 turn.',
          },
        }),
        createCharacterRecord({
          id: 5932,
          type: 'DEX',
          primaryClass: 'Fighter',
          secondaryClass: 'Slasher',
          detail: {
            specialText: 'Boosts color affinity of DEX characters by 2x for 1 turn.',
          },
        }),
        createCharacterRecord({
          id: 5933,
          type: 'DEX',
          primaryClass: 'Fighter',
          secondaryClass: 'Slasher',
          detail: {
            specialText:
              'Reduces Bind and Despair duration by 5 turns and reduces Threshold Damage Reduction duration by 5 turns.',
          },
        }),
        createCharacterRecord({
          id: 5934,
          type: 'DEX',
          primaryClass: 'Fighter',
          secondaryClass: 'Slasher',
          detail: {
            specialText:
              'Changes crew orbs into Matching Orbs and reduces Special Cooldown by 1 turn.',
          },
        }),
      ],
      createInput(['DEX'], ['Fighter', 'Slasher'], {
        requireAllSelectedClassesPerCharacter: true,
        lockedCharacterIds: [5900],
        captainCharacterId: 5900,
        friendCaptainCharacterId: 5900,
      }),
    );

    expect(result).toBeNull();
  });
});

it('builds ranked teams from a locked-leader roster pool', async () => {
  const repository = {
    getAutoBuilderCandidates: vi.fn().mockResolvedValue(createCrewForgeRosterRecords()),
  };
  const service = new AutoTeamBuilderService(repository as never);

  const result = await service.buildRankedTeamsFromRoster({
    rosterCharacterIds: [5900, 5905, 5880, 5870, 5860, 8301, 8302],
    captainCharacterId: 5900,
    friendCaptainCharacterId: 5905,
    resultLimit: 10,
    requireUniqueBaseCharacterNames: true,
  });

  expect(result.results.length).toBeGreaterThan(0);
  expect(result.results.every((team) => team.slots[0]?.character.id === 5900)).toBe(true);
  expect(result.results.every((team) => team.slots[1]?.character.id === 5905)).toBe(true);
  expect(repository.getAutoBuilderCandidates).toHaveBeenCalledWith(
    ['DEX', 'STR', 'QCK', 'PSY', 'INT'],
    null,
    {
      allowedCharacterIds: [5900, 5905, 5880, 5870, 5860, 8301, 8302],
      lockedCharacterIds: [5900, 5905],
      excludedCharacterIds: [],
    },
  );
});

it('dedupes leader-swapped and sub-order-equivalent ranked teams', async () => {
  const repository = {
    getAutoBuilderCandidates: vi.fn().mockResolvedValue(createCrewForgeRosterRecords()),
  };
  const service = new AutoTeamBuilderService(repository as never);

  const result = await service.buildRankedTeamsFromRoster({
    rosterCharacterIds: [5900, 5905, 5880, 5870, 5860, 8301],
    resultLimit: 50,
  });
  const teamKeys = result.results.map((team) => team.teamKey);

  expect(teamKeys).toEqual([...new Set(teamKeys)]);
});

it('ranks teams by distinct ability count before secondary coverage metrics', async () => {
  const repository = {
    getAutoBuilderCandidates: vi.fn().mockResolvedValue(createCrewForgeRosterRecords()),
  };
  const service = new AutoTeamBuilderService(repository as never);

  const result = await service.buildRankedTeamsFromRoster({
    rosterCharacterIds: [5900, 5905, 5880, 5870, 5860, 8301, 8302],
    captainCharacterId: 5900,
    friendCaptainCharacterId: 5905,
    resultLimit: 10,
  });

  expect(result.results[0]?.ranking.distinctAbilityCount).toBeGreaterThanOrEqual(
    result.results[1]?.ranking.distinctAbilityCount ?? -1,
  );
  expect(result.results[0]?.abilityBreakdown.duplicateAbilities).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        key: 'remove_paralysis',
        count: 2,
      }),
    ]),
  );
});

it('blocks ranked teams that violate party conflict rules', async () => {
  const repository = {
    getAutoBuilderCandidates: vi.fn().mockResolvedValue([
      createCharacterRecord({
        id: 8201,
        name: 'Monkey D. Luffy',
        type: 'DEX',
        primaryClass: 'Fighter',
        detail: {
          captainAbility: 'Boosts ATK of DEX and Fighter characters by 5.5x.',
        },
      }),
      createCharacterRecord({
        id: 8202,
        name: 'Monkey D. Luffy - Gear 2',
        type: 'DEX',
        primaryClass: 'Fighter',
        detail: {
          captainAbility: 'Boosts ATK of DEX and Fighter characters by 5.25x.',
        },
      }),
      createAtkSubRecord(),
      createAffinitySubRecord(),
      createUtilitySubRecord(),
      createConsistencySubRecord(),
    ]),
  };
  const service = new AutoTeamBuilderService(repository as never);

  const result = await service.buildRankedTeamsFromRoster({
    rosterCharacterIds: [8201, 8202, 5880, 5870, 5860, 5850],
    resultLimit: 10,
    requireUniqueBaseCharacterNames: true,
  });

  expect(
    result.results.some((team) => {
      const slotIds = team.slots.map((slot) => slot.character.id);

      return slotIds.includes(8201) && slotIds.includes(8202);
    }),
  ).toBe(false);
});

function createInput(
  types: AutoTeamBuilderType[] = [AUTO_TEAM_BUILDER_DEFAULT_TYPE],
  selectedClasses: string[] = ['Fighter'],
  overrides: Partial<
    Pick<
      AutoBuildInput,
      | 'requireAllSelectedTypesInTeam'
      | 'requireAllSelectedClassesPerCharacter'
      | 'requireAllSlotsInLeaderSuperEffectScope'
      | 'minimumLeaderSuperEffectMatchingSlots'
      | 'requireLeaderSuperSpecialCriteria'
      | 'requireUniqueBaseCharacterNames'
      | 'favoritesOnly'
      | 'favoriteShipsOnly'
      | 'favoriteShipIds'
      | 'manualSlots'
      | 'lockedCharacterIds'
      | 'excludedCharacterIds'
      | 'captainCharacterId'
      | 'friendCaptainCharacterId'
      | 'excludedShipIds'
    >
  > = {
    requireAllSelectedTypesInTeam: false,
    requireAllSelectedClassesPerCharacter: false,
    requireAllSlotsInLeaderSuperEffectScope: false,
    requireLeaderSuperSpecialCriteria: false,
    requireUniqueBaseCharacterNames: false,
    favoritesOnly: false,
    favoriteShipsOnly: false,
    favoriteShipIds: [],
    lockedCharacterIds: [],
    excludedCharacterIds: [],
    captainCharacterId: null,
    friendCaptainCharacterId: null,
    excludedShipIds: [],
  },
): AutoBuildInput {
  const lockedCharacterIds = overrides.lockedCharacterIds ?? [];
  const excludedCharacterIds = overrides.excludedCharacterIds ?? [];
  const captainCharacterId = overrides.captainCharacterId ?? null;
  const friendCaptainCharacterId = overrides.friendCaptainCharacterId ?? null;

  return {
    types,
    selectedClasses,
    requiredAbilities: [],
    enemyMechanics: [],
    requireAllSelectedTypesInTeam: overrides.requireAllSelectedTypesInTeam ?? false,
    requireAllSelectedClassesPerCharacter: overrides.requireAllSelectedClassesPerCharacter ?? false,
    requireAllSlotsInLeaderSuperEffectScope:
      overrides.requireAllSlotsInLeaderSuperEffectScope ?? false,
    minimumLeaderSuperEffectMatchingSlots: overrides.requireAllSlotsInLeaderSuperEffectScope
      ? (overrides.minimumLeaderSuperEffectMatchingSlots ?? 6)
      : null,
    requireLeaderSuperSpecialCriteria: overrides.requireLeaderSuperSpecialCriteria ?? false,
    requireUniqueBaseCharacterNames: overrides.requireUniqueBaseCharacterNames ?? false,
    favoritesOnly: overrides.favoritesOnly ?? false,
    favoriteShipsOnly: overrides.favoriteShipsOnly ?? false,
    favoriteShipIds: overrides.favoriteShipIds ?? [],
    manualSlots:
      overrides.manualSlots ??
      createManualSlotsFromLegacySelection(
        lockedCharacterIds,
        captainCharacterId,
        friendCaptainCharacterId,
      ),
    lockedCharacterIds,
    excludedCharacterIds,
    captainCharacterId,
    friendCaptainCharacterId,
    manualShipId: null,
    excludedShipIds: overrides.excludedShipIds ?? [],
    candidateLimit: AUTO_TEAM_CANDIDATE_LIMIT,
  };
}

function createManualSlots(
  overrides: Partial<Record<AutoBuildManualSlotSelection['role'], number[]>> = {},
): AutoBuildManualSlotSelection[] {
  return createEmptyAutoBuildManualSlots().map((slot) => ({
    role: slot.role,
    characterIds: [...(overrides[slot.role] ?? [])],
  }));
}

function createManualSlotsFromLegacySelection(
  lockedCharacterIds: number[],
  captainCharacterId: number | null,
  friendCaptainCharacterId: number | null,
): AutoBuildManualSlotSelection[] {
  const selectedLeaderIds = [captainCharacterId, friendCaptainCharacterId].filter(
    (characterId): characterId is number => characterId !== null,
  );

  return createManualSlots({
    captain: captainCharacterId ? [captainCharacterId] : [],
    friendCaptain: friendCaptainCharacterId ? [friendCaptainCharacterId] : [],
    sub1: lockedCharacterIds
      .filter((characterId) => !selectedLeaderIds.includes(characterId))
      .slice(0, 1),
    sub2: lockedCharacterIds
      .filter((characterId) => !selectedLeaderIds.includes(characterId))
      .slice(1, 2),
    sub3: lockedCharacterIds
      .filter((characterId) => !selectedLeaderIds.includes(characterId))
      .slice(2, 3),
    sub4: lockedCharacterIds
      .filter((characterId) => !selectedLeaderIds.includes(characterId))
      .slice(3, 4),
  });
}

function createCaptainRecord(): CharacterDetailRecord {
  return createCharacterRecord({
    id: 5900,
    primaryClass: 'Fighter',
    secondaryClass: 'Free Spirit',
    detail: {
      captainAbility:
        'Boosts ATK of DEX and Fighter characters by 5.25x and HP by 1.3x, reduces Special Cooldown of crew by 1 turn.',
      specialText:
        'Boosts orb effects of DEX and Fighter characters by 2.25x for 1 turn and changes orbs into Matching Orbs.',
    },
  });
}

function createPowerFirstCaptainRecord({
  id,
  name,
  cost,
  atkMultiplier,
  universal = false,
}: {
  id: number;
  name: string;
  cost: number;
  atkMultiplier: number;
  universal?: boolean;
}): CharacterDetailRecord {
  return createCharacterRecord({
    id,
    name,
    cost,
    primaryClass: 'Fighter',
    secondaryClass: 'Free Spirit',
    detail: {
      captainAbility: universal
        ? `Boosts ATK of all characters by ${atkMultiplier}x and HP by 1.3x.`
        : `Boosts ATK of DEX and Fighter characters by ${atkMultiplier}x and HP by 1.3x.`,
      specialText: 'Changes crew orbs into Matching Orbs and reduces Special Cooldown by 1 turn.',
    },
  });
}

function createStrictMixedCaptainRecord(): CharacterDetailRecord {
  return createCharacterRecord({
    id: 5907,
    type: 'DEX',
    primaryClass: 'Fighter',
    secondaryClass: 'Slasher',
    detail: {
      captainAbility:
        'Boosts ATK of DEX, QCK, Fighter and Slasher characters by 5.25x and HP by 1.3x, reduces Special Cooldown of crew by 1 turn.',
      specialText:
        'Boosts orb effects of DEX and QCK characters by 2.25x for 1 turn and changes orbs into Matching Orbs.',
    },
  });
}

function createUniversalCaptainRecord(): CharacterDetailRecord {
  return createCharacterRecord({
    id: 5905,
    type: 'PSY',
    primaryClass: 'Fighter',
    detail: {
      captainAbility:
        'Boosts ATK of all characters by 5x and HP by 1.4x, reduces Special Cooldown of crew by 1 turn.',
      specialText:
        'Boosts orb effects of all characters by 2x for 1 turn and changes orbs into Matching Orbs.',
    },
  });
}

function createGuaranteedExtraDropLeaderRecord(
  id: number,
  name: string,
  type: AutoTeamBuilderType,
): CharacterDetailRecord {
  return createCharacterRecord({
    id,
    name,
    type,
    primaryClass: 'Fighter',
    secondaryClass: 'Free Spirit',
    cost: 40,
    detail: {
      captainAbility:
        'Boosts ATK of all characters by 3x, boosts HP by 1.2x and guarantees duplicating a drop upon completion of the island.',
      specialText:
        'Boosts ATK of all characters by 2x for 1 turn and changes crew orbs into Matching Orbs.',
      builderAbilities: [
        {
          key: 'extra_drop_any',
          label: 'Any Extra Drop',
          minTurns: null,
          isCompleteRemoval: false,
          slotTokens: [],
          source: 'captainAbility',
        },
        {
          key: 'extra_drop_guaranteed',
          label: 'Guaranteed Extra Drop',
          minTurns: null,
          isCompleteRemoval: false,
          slotTokens: [],
          source: 'captainAbility',
        },
      ],
    },
  });
}

function createPartialMultiTypeCaptainRecord(): CharacterDetailRecord {
  return createCharacterRecord({
    id: 5906,
    type: 'DEX',
    primaryClass: 'Fighter',
    detail: {
      captainAbility: 'Boosts ATK of DEX and Fighter characters by 5.25x and HP by 1.3x.',
      specialText: 'Boosts color affinity of DEX characters by 2x for 1 turn.',
    },
  });
}

function createAtkSubRecord(): CharacterDetailRecord {
  return createCharacterRecord({
    id: 5890,
    primaryClass: 'Fighter',
    detail: {
      specialText: 'Boosts ATK of Fighter characters by 2.5x for 1 turn.',
    },
  });
}

function createSlasherQckAtkSubRecord(): CharacterDetailRecord {
  return createCharacterRecord({
    id: 5891,
    type: 'QCK',
    primaryClass: 'Slasher',
    detail: {
      specialText: 'Boosts ATK of Slasher characters by 2.5x for 1 turn.',
    },
  });
}

function createAffinitySubRecord(): CharacterDetailRecord {
  return createCharacterRecord({
    id: 5880,
    primaryClass: 'Fighter',
    detail: {
      specialText: 'Boosts color affinity of DEX characters by 2x for 1 turn.',
    },
  });
}

function createUtilitySubRecord(): CharacterDetailRecord {
  return createCharacterRecord({
    id: 5870,
    primaryClass: 'Fighter',
    detail: {
      specialText:
        'Reduces Bind and Despair duration by 5 turns and reduces Threshold Damage Reduction duration by 5 turns.',
    },
  });
}

function createConsistencySubRecord(): CharacterDetailRecord {
  return createCharacterRecord({
    id: 5860,
    primaryClass: 'Fighter',
    detail: {
      specialText: 'Changes crew orbs into Matching Orbs and reduces Special Cooldown by 1 turn.',
    },
  });
}

function createOffClassRedundantSubRecord(): CharacterDetailRecord {
  return createCharacterRecord({
    id: 5850,
    primaryClass: 'Slasher',
    detail: {
      specialText: 'Boosts ATK of DEX characters by 2.5x for 1 turn.',
    },
  });
}

function createSingleTypeRecords(): CharacterDetailRecord[] {
  return [
    createCaptainRecord(),
    createAtkSubRecord(),
    createAffinitySubRecord(),
    createUtilitySubRecord(),
    createConsistencySubRecord(),
  ];
}

function createExtraDropLeaderSelectionRecords(): CharacterDetailRecord[] {
  return [
    createCharacterRecord({
      id: 1588,
      name: 'Sanji - Prince, Kingdom of Germa',
      type: 'INT',
      primaryClass: 'Fighter',
      secondaryClass: 'Powerhouse',
      detail: {
        captainAbility:
          'Boosts ATK of Fighter and Powerhouse characters by 4.5x and HP by 1.3x, reduces Special Cooldown of crew by 1 turn.',
        specialText:
          'Boosts orb effects of Fighter characters by 2x for 1 turn and changes crew orbs into Matching Orbs.',
      },
    }),
    createGuaranteedExtraDropLeaderRecord(2035, 'Buggy the Genius Jester', 'INT'),
    createGuaranteedExtraDropLeaderRecord(1391, 'Captain Buggy', 'DEX'),
    createAtkSubRecord(),
    createAffinitySubRecord(),
    createUtilitySubRecord(),
    createConsistencySubRecord(),
    createOffClassRedundantSubRecord(),
  ];
}

function createSubOnlyExtraDropTeamRecords(): CharacterDetailRecord[] {
  return [
    createCharacterRecord({
      id: 1588,
      name: 'Sanji - Prince, Kingdom of Germa',
      type: 'INT',
      primaryClass: 'Fighter',
      secondaryClass: 'Powerhouse',
      detail: {
        captainAbility:
          'Boosts ATK of Fighter and Powerhouse characters by 4.5x and HP by 1.3x, reduces Special Cooldown of crew by 1 turn.',
        specialText:
          'Boosts orb effects of Fighter characters by 2x for 1 turn and changes crew orbs into Matching Orbs.',
      },
    }),
    createGuaranteedExtraDropLeaderRecord(2035, 'Buggy the Genius Jester', 'INT'),
    createAtkSubRecord(),
    createAffinitySubRecord(),
    createUtilitySubRecord(),
    createConsistencySubRecord(),
    createOffClassRedundantSubRecord(),
  ];
}

function createSyntheticClasses(count: number): string[] {
  return Array.from({ length: count }, (_, index) => `Synthetic Class ${index + 1}`);
}

class FakeWorker extends EventTarget {
  public terminated = false;
  public readonly requests: Array<
    | {
        type: 'run';
        runId: string;
        records: CharacterDetailRecord[];
        requestedInput: AutoBuildInput;
      }
    | {
        type: 'init';
        records: CharacterDetailRecord[];
      }
    | {
        type: 'runAttempt';
        runId: string;
        input: AutoBuildInput;
        requestedInput: AutoBuildInput;
      }
  > = [];

  public constructor(
    private readonly onPostMessage?: (
      request:
        | {
            type: 'run';
            runId: string;
            records: CharacterDetailRecord[];
            requestedInput: AutoBuildInput;
          }
        | {
            type: 'init';
            records: CharacterDetailRecord[];
          }
        | {
            type: 'runAttempt';
            runId: string;
            input: AutoBuildInput;
            requestedInput: AutoBuildInput;
          },
    ) => void,
  ) {
    super();
  }

  public postMessage(
    request:
      | {
          type: 'run';
          runId: string;
          records: CharacterDetailRecord[];
          requestedInput: AutoBuildInput;
        }
      | {
          type: 'init';
          records: CharacterDetailRecord[];
        }
      | {
          type: 'runAttempt';
          runId: string;
          input: AutoBuildInput;
          requestedInput: AutoBuildInput;
        },
  ): void {
    this.requests.push(request);
    this.onPostMessage?.(request);
  }

  public terminate(): void {
    this.terminated = true;
  }

  public emitMessage(data: unknown): void {
    this.dispatchEvent(new MessageEvent('message', { data }));
  }
}

class PooledFakeWorker extends FakeWorker {}

async function flushMicrotasks(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

function buildWorkerResult(
  input: AutoBuildInput,
  overrides: {
    requestedInput?: AutoBuildInput;
    coveredSelectedClasses?: string[];
    coveredSelectedTypes?: AutoTeamBuilderType[];
    coversAllSelectedClasses?: boolean;
    coversAllSelectedTypes?: boolean;
    selectedClassMatches?: number;
    selectedTypeMatches?: number;
    abilityRequirements?: Partial<AutoBuildResult['coverage']['abilityRequirements']>;
  } = {},
): AutoBuildResult {
  const abilityRequirements = {
    requested: [] as AutoBuildResult['coverage']['abilityRequirements']['requested'],
    matched: [] as AutoBuildResult['coverage']['abilityRequirements']['matched'],
    missing: [] as AutoBuildResult['coverage']['abilityRequirements']['missing'],
    matchesAll: true,
    ...overrides.abilityRequirements,
  };

  return {
    input,
    requestedInput: overrides.requestedInput ?? input,
    candidateCount: 6,
    slots: [],
    coverage: {
      leaderCriteria: {
        source: 'captainAbility',
        captainLeaderId: null,
        friendCaptainLeaderId: null,
        leaderIds: [],
        leaderNames: [],
        dualLeaderMode: 'single',
        derivedAllowedClasses: [],
        derivedAllowedTypes: [],
        hasCostRestriction: false,
        maxAllowedCost: null,
        hasClassRestriction: false,
        hasTypeRestriction: false,
        matchingSlots: 0,
        totalSlots: 0,
        allSlotsMatch: true,
      },
      abilityRequirements: {
        ...abilityRequirements,
      },
      burst: [],
      consistency: [],
      utility: [],
      coveredSelectedClasses: overrides.coveredSelectedClasses ?? [...input.selectedClasses],
      coveredSelectedTypes: overrides.coveredSelectedTypes ?? [...input.types],
      coversAllSelectedClasses: overrides.coversAllSelectedClasses ?? true,
      coversAllSelectedTypes: overrides.coversAllSelectedTypes ?? true,
      selectedClassMatches: overrides.selectedClassMatches ?? input.selectedClasses.length,
      selectedTypeMatches: overrides.selectedTypeMatches ?? input.types.length,
    },
    relaxation: {
      usedFallback: true,
      droppedTypes: ['INT'],
      droppedClasses: [],
      minimumLeaderSuperEffectMatchingSlots: null,
      allowedLeadersWithSuperEffects: false,
      ignoredLeaderSuperEffectScope: false,
      ignoredLeaderSuperSpecialCriteria: false,
    },
    shipSelection: null,
  };
}

function createAllClassStrictTeamRecords(): CharacterDetailRecord[] {
  return [
    createCharacterRecord({
      id: 5930,
      type: 'DEX',
      primaryClass: 'Fighter',
      secondaryClass: 'Slasher',
      detail: {
        captainAbility:
          'Boosts ATK of DEX, Fighter and Slasher characters by 5.1x and HP by 1.35x, reduces Special Cooldown of crew by 1 turn.',
        specialText:
          'Boosts orb effects of DEX characters by 2x for 1 turn and changes orbs into Matching Orbs.',
      },
    }),
    createCharacterRecord({
      id: 5931,
      type: 'DEX',
      primaryClass: 'Fighter',
      secondaryClass: 'Slasher',
      detail: {
        specialText: 'Boosts ATK of Fighter and Slasher characters by 2.25x for 1 turn.',
      },
    }),
    createCharacterRecord({
      id: 5932,
      type: 'DEX',
      primaryClass: 'Fighter',
      secondaryClass: 'Slasher',
      detail: {
        specialText: 'Boosts color affinity of DEX characters by 2x for 1 turn.',
      },
    }),
    createCharacterRecord({
      id: 5933,
      type: 'DEX',
      primaryClass: 'Fighter',
      secondaryClass: 'Slasher',
      detail: {
        specialText:
          'Reduces Bind and Despair duration by 5 turns and reduces Threshold Damage Reduction duration by 5 turns.',
      },
    }),
    createCharacterRecord({
      id: 5934,
      type: 'DEX',
      primaryClass: 'Fighter',
      secondaryClass: 'Slasher',
      detail: {
        specialText: 'Changes crew orbs into Matching Orbs and reduces Special Cooldown by 1 turn.',
      },
    }),
  ];
}

function createInsufficientStrictClassTeamRecords(): CharacterDetailRecord[] {
  return [
    ...createAllClassStrictTeamRecords().slice(0, 4),
    createCharacterRecord({
      id: 5935,
      type: 'DEX',
      primaryClass: 'Fighter',
      detail: {
        specialText: 'Boosts ATK of Fighter characters by 2x for 1 turn.',
      },
    }),
  ];
}

function createStrictMixedTeamRecords(): CharacterDetailRecord[] {
  return [
    createCharacterRecord({
      id: 5925,
      type: 'DEX',
      primaryClass: 'Fighter',
      secondaryClass: 'Slasher',
      detail: {
        captainAbility:
          'Boosts ATK of DEX, PSY, Fighter and Slasher characters by 5.1x and HP by 1.35x, reduces Special Cooldown of crew by 1 turn.',
        specialText:
          'Boosts orb effects of DEX and PSY characters by 2x for 1 turn and changes orbs into Matching Orbs.',
      },
    }),
    createCharacterRecord({
      id: 5926,
      type: 'PSY',
      primaryClass: 'Slasher',
      detail: {
        specialText: 'Boosts ATK of Slasher characters by 2.25x for 1 turn.',
      },
    }),
    createAffinitySubRecord(),
    createUtilitySubRecord(),
    createConsistencySubRecord(),
  ];
}

function createCrewForgeRosterRecords(): CharacterDetailRecord[] {
  return [
    createCaptainRecord(),
    createUniversalCaptainRecord(),
    createAffinitySubRecord(),
    createUtilitySubRecord(),
    createConsistencySubRecord(),
    createCharacterRecord({
      id: 8301,
      name: 'Forge Utility One',
      primaryClass: 'Fighter',
      detail: {
        specialText: 'Reduces Bind duration by 5 turns and reduces Paralysis duration by 5 turns.',
        builderAbilities: [
          {
            key: 'remove_bind',
            label: 'Remove Bind',
            minTurns: 5,
            isCompleteRemoval: false,
            slotTokens: [],
            source: 'specialText',
          },
          {
            key: 'remove_paralysis',
            label: 'Remove Paralysis',
            minTurns: 5,
            isCompleteRemoval: false,
            slotTokens: [],
            source: 'specialText',
          },
        ],
      },
    }),
    createCharacterRecord({
      id: 8302,
      name: 'Forge Utility Two',
      primaryClass: 'Fighter',
      detail: {
        specialText:
          'Reduces Despair duration by 5 turns and reduces Paralysis duration by 5 turns.',
        builderAbilities: [
          {
            key: 'remove_despair',
            label: 'Remove Despair',
            minTurns: 5,
            isCompleteRemoval: false,
            slotTokens: [],
            source: 'specialText',
          },
          {
            key: 'remove_paralysis',
            label: 'Remove Paralysis',
            minTurns: 5,
            isCompleteRemoval: false,
            slotTokens: [],
            source: 'specialText',
          },
        ],
      },
    }),
  ];
}

function createDualLeaderMixedTeamRecords(): CharacterDetailRecord[] {
  return [
    ...createStrictMixedTeamRecords(),
    createCharacterRecord({
      id: 5927,
      type: 'PSY',
      primaryClass: 'Fighter',
      secondaryClass: 'Slasher',
      detail: {
        captainAbility:
          'Boosts ATK of DEX, PSY, Fighter and Slasher characters by 4.8x and HP by 1.25x.',
        specialText:
          'Boosts color affinity of DEX and PSY characters by 2x for 1 turn and changes adjacent orbs into Matching Orbs.',
      },
    }),
  ];
}

function createKaidoLeaderTeamRecords(): CharacterDetailRecord[] {
  return [
    createCharacterRecord({
      id: 2700,
      name: 'Kaido - The Strongest Creature Alive',
      type: 'DEX',
      primaryClass: 'Powerhouse',
      secondaryClass: 'Striker',
      detail: {
        captainAbility:
          "Reduces Special Cooldown of Striker and Powerhouse characters by 2 turns at the start of the fight boosts ATK of Striker and Powerhouse characters by 4x, their HP by 1.25x, and deals 400x character's ATK in [DEX] damage to all enemies at the end of each turn. At the start of the fight, this character activates their own special.",
        specialText:
          "Deals 20% of enemies' current HP in damage to all enemies and deals 400x character's ATK in [DEX] damage to all enemies at the end of each turn for 99+ turns.",
      },
    }),
    createCharacterRecord({
      id: 2701,
      type: 'STR',
      primaryClass: 'Powerhouse',
      detail: {
        specialText: 'Boosts ATK of Powerhouse characters by 2.5x for 1 turn.',
      },
    }),
    createCharacterRecord({
      id: 2702,
      type: 'QCK',
      primaryClass: 'Striker',
      detail: {
        specialText: 'Boosts color affinity of Striker characters by 2x for 1 turn.',
      },
    }),
    createCharacterRecord({
      id: 2703,
      type: 'PSY',
      primaryClass: 'Shooter',
      secondaryClass: 'Powerhouse',
      detail: {
        specialText: 'Reduces Bind and Despair duration by 5 turns.',
      },
    }),
    createCharacterRecord({
      id: 2704,
      type: 'INT',
      primaryClass: 'Striker',
      secondaryClass: 'Cerebral',
      detail: {
        specialText: 'Changes crew orbs into Matching Orbs and reduces Special Cooldown by 1 turn.',
      },
    }),
    createCharacterRecord({
      id: 2705,
      type: 'DEX',
      primaryClass: 'Cerebral',
      secondaryClass: 'Driven',
      detail: {
        specialText:
          'Boosts ATK of Cerebral and Driven characters by 2.5x for 1 turn and boosts orb effects by 2.25x.',
      },
    }),
  ];
}

function createIntersectedLeaderTeamRecords(): CharacterDetailRecord[] {
  return [
    createCharacterRecord({
      id: 2710,
      type: 'DEX',
      primaryClass: 'Powerhouse',
      secondaryClass: 'Striker',
      detail: {
        captainAbility:
          'Boosts ATK of DEX, PSY, Powerhouse and Striker characters by 5x and HP by 1.3x.',
        specialText: 'Boosts orb effects of Powerhouse characters by 2x for 1 turn.',
      },
    }),
    createCharacterRecord({
      id: 2711,
      type: 'PSY',
      primaryClass: 'Powerhouse',
      secondaryClass: 'Cerebral',
      detail: {
        captainAbility:
          'Boosts ATK of DEX, PSY, Powerhouse and Cerebral characters by 4.8x and HP by 1.25x.',
        specialText: 'Boosts color affinity of Powerhouse characters by 2x for 1 turn.',
      },
    }),
    createCharacterRecord({
      id: 2712,
      type: 'DEX',
      primaryClass: 'Powerhouse',
      secondaryClass: 'Fighter',
      detail: {
        specialText: 'Boosts ATK of Powerhouse characters by 2.25x for 1 turn.',
      },
    }),
    createCharacterRecord({
      id: 2713,
      type: 'PSY',
      primaryClass: 'Driven',
      secondaryClass: 'Powerhouse',
      detail: {
        specialText: 'Reduces Bind and Despair duration by 5 turns.',
      },
    }),
    createCharacterRecord({
      id: 2714,
      type: 'DEX',
      primaryClass: 'Powerhouse',
      secondaryClass: 'Slasher',
      detail: {
        specialText: 'Changes crew orbs into Matching Orbs and reduces Special Cooldown by 1 turn.',
      },
    }),
    createCharacterRecord({
      id: 2715,
      type: 'PSY',
      primaryClass: 'Powerhouse',
      secondaryClass: 'Shooter',
      detail: {
        specialText: 'Boosts color affinity of DEX and PSY characters by 2x for 1 turn.',
      },
    }),
    createCharacterRecord({
      id: 2716,
      type: 'PSY',
      primaryClass: 'Striker',
      secondaryClass: 'Cerebral',
      detail: {
        specialText:
          'Boosts ATK of Striker and Cerebral characters by 2.75x for 1 turn and boosts orb effects by 2.5x.',
      },
    }),
  ];
}

function createScopeFreeLeaderTeamRecords(): CharacterDetailRecord[] {
  return [
    createCharacterRecord({
      id: 2720,
      type: 'DEX',
      primaryClass: 'Fighter',
      detail: {
        captainAbility: 'Boosts ATK by 5x and HP by 1.3x and reduces Special Cooldown by 1 turn.',
        specialText: 'Boosts orb effects by 2x for 1 turn.',
      },
    }),
    createCharacterRecord({
      id: 2721,
      type: 'PSY',
      primaryClass: 'Fighter',
      detail: {
        specialText: 'Boosts ATK of Fighter characters by 2.25x for 1 turn.',
      },
    }),
    createCharacterRecord({
      id: 2722,
      type: 'DEX',
      primaryClass: 'Shooter',
      detail: {
        specialText: 'Boosts color affinity of DEX characters by 2x for 1 turn.',
      },
    }),
    createCharacterRecord({
      id: 2723,
      type: 'PSY',
      primaryClass: 'Cerebral',
      detail: {
        specialText: 'Reduces Bind and Despair duration by 5 turns.',
      },
    }),
    createCharacterRecord({
      id: 2724,
      type: 'DEX',
      primaryClass: 'Driven',
      detail: {
        specialText: 'Changes crew orbs into Matching Orbs and reduces Special Cooldown by 1 turn.',
      },
    }),
  ];
}

function createBuggyLeaderTeamRecords(): CharacterDetailRecord[] {
  return [
    createCharacterRecord({
      id: 2035,
      name: 'Buggy the Genius Jester',
      type: 'INT',
      cost: 40,
      primaryClass: 'Driven',
      secondaryClass: 'Shooter',
      detail: {
        captainAbility:
          'Boosts ATK of Cost 40 or less characters by 1.75x and reduces ATK and HP of Cost 41 or higher characters by 50%. Guarantees duplicating a drop upon completion of the island.',
        specialText:
          'Boosts ATK of Cost 40 or less characters by 2x for 2 turns. Changes orbs of Cost 40 or lower characters into Matching Orbs.',
      },
    }),
    createCharacterRecord({
      id: 2534,
      name: 'Luffy & Law - Miracle-Making Generation',
      type: 'DEX',
      cost: 55,
      primaryClass: 'Fighter',
      secondaryClass: 'Free Spirit',
      detail: {
        specialText:
          'Boosts ATK of all characters by 2.5x for 1 turn, boosts color affinity of all characters by 2x for 1 turn and changes crew orbs into Matching Orbs.',
      },
    }),
    createCharacterRecord({
      id: 2577,
      name: 'Dogstorm & Cat Viper - Antagonistic Kings of Day and Night',
      type: 'PSY',
      cost: 55,
      primaryClass: 'Fighter',
      secondaryClass: 'Slasher',
      detail: {
        specialText:
          'Boosts orb effects of all characters by 2.5x for 1 turn and reduces Bind and Despair duration by 5 turns.',
      },
    }),
    createCharacterRecord({
      id: 3872,
      name: 'Black Maria - Entrapping Flammable Threads',
      type: 'QCK',
      cost: 30,
      primaryClass: 'Driven',
      secondaryClass: 'Cerebral',
      detail: {
        specialText:
          'Boosts orb effects of all characters by 2.25x for 1 turn and changes crew orbs into Matching Orbs.',
      },
    }),
    createCharacterRecord({
      id: 3577,
      name: 'Robin - Emperor-Felling Flower',
      type: 'PSY',
      cost: 30,
      primaryClass: 'Cerebral',
      secondaryClass: 'Free Spirit',
      detail: {
        specialText:
          'Boosts color affinity of all characters by 2x for 1 turn and reduces Paralysis duration by 5 turns.',
      },
    }),
    createCharacterRecord({
      id: 3601,
      type: 'STR',
      cost: 40,
      primaryClass: 'Powerhouse',
      secondaryClass: 'Striker',
      detail: {
        specialText: 'Boosts ATK of all characters by 2.25x for 1 turn.',
      },
    }),
    createCharacterRecord({
      id: 3602,
      type: 'DEX',
      cost: 35,
      primaryClass: 'Shooter',
      secondaryClass: 'Driven',
      detail: {
        specialText: 'Reduces Bind and Despair duration by 5 turns.',
      },
    }),
  ];
}

function createTeamwideSpecialScopedRecords(): CharacterDetailRecord[] {
  return [
    createCharacterRecord({
      id: 5940,
      type: 'DEX',
      primaryClass: 'Fighter',
      secondaryClass: 'Slasher',
      detail: {
        captainAbility:
          'Boosts ATK of DEX, PSY, Fighter and Slasher characters by 5x and HP by 1.3x.',
        specialText:
          'Boosts orb effects of Fighter and Slasher characters by 2.25x for 1 turn and boosts the chain multiplier of Fighter and Slasher characters by +1.1 for 1 turn.',
      },
    }),
    createCharacterRecord({
      id: 5941,
      type: 'PSY',
      primaryClass: 'Fighter',
      secondaryClass: 'Slasher',
      detail: {
        specialText: 'Boosts ATK of Fighter and Slasher characters by 2.5x for 1 turn.',
      },
    }),
    createCharacterRecord({
      id: 5942,
      type: 'DEX',
      primaryClass: 'Fighter',
      secondaryClass: 'Slasher',
      detail: {
        specialText: 'Boosts color affinity of Fighter and Slasher characters by 2x for 1 turn.',
      },
    }),
    createCharacterRecord({
      id: 5943,
      type: 'PSY',
      primaryClass: 'Fighter',
      secondaryClass: 'Slasher',
      detail: {
        specialText:
          'Boosts the chain multiplier of Fighter and Slasher characters by +1.3 for 1 turn.',
      },
    }),
    createCharacterRecord({
      id: 5944,
      type: 'DEX',
      primaryClass: 'Fighter',
      secondaryClass: 'Slasher',
      detail: {
        specialText: 'Changes crew orbs into Matching Orbs.',
      },
    }),
  ];
}

function createCharacterRecord(
  overrides: Omit<Partial<CharacterDetailRecord>, 'detail' | 'id' | 'primaryClass'> & {
    id: number;
    detail?: Partial<CharacterDetailRecord['detail']>;
    primaryClass: string;
  },
): CharacterDetailRecord {
  const secondaryClass = overrides.secondaryClass ?? null;
  const classes = [overrides.primaryClass, secondaryClass].filter((value): value is string =>
    Boolean(value),
  );

  return {
    id: overrides.id,
    name: overrides.name ?? `Unit ${overrides.id}`,
    type: overrides.type ?? AUTO_TEAM_BUILDER_DEFAULT_TYPE,
    classes,
    primaryClass: overrides.primaryClass,
    secondaryClass,
    stars: overrides.stars ?? 6,
    cost: overrides.cost ?? 55,
    combo: overrides.combo ?? 4,
    stats: overrides.stats ?? {
      min: { hp: 1000, atk: 400, rcv: 120 },
      max: { hp: 3900, atk: 1900, rcv: 340 },
      growth: 3,
    },
    regionAvailability: overrides.regionAvailability ?? {
      exactLocal: true,
      thumbnailGlobal: true,
      thumbnailJapan: false,
      fullTransparent: false,
    },
    assets: overrides.assets ?? {
      exactLocal: null,
      thumbnailGlobal: null,
      thumbnailJapan: null,
      fullTransparent: null,
    },
    imageUrl: overrides.imageUrl ?? 'assets/placeholders/character-card.svg',
    detailImageUrl: overrides.detailImageUrl ?? 'assets/placeholders/character-card.svg',
    detail: {
      characterId: overrides.id,
      captainAbility: overrides.detail?.captainAbility ?? null,
      specialName: overrides.detail?.specialName ?? null,
      specialText: overrides.detail?.specialText ?? null,
      specialNotes: overrides.detail?.specialNotes ?? null,
      superSpecialText: overrides.detail?.superSpecialText ?? null,
      superSpecialCriteriaText: overrides.detail?.superSpecialCriteriaText ?? null,
      superSpecialNotes: overrides.detail?.superSpecialNotes ?? null,
      superSpecialCriteria: overrides.detail?.superSpecialCriteria ?? null,
      partyConflictKeys: overrides.detail?.partyConflictKeys ?? [],
      builderAbilities: overrides.detail?.builderAbilities ?? [],
      sailorAbilities: overrides.detail?.sailorAbilities ?? [],
      sailorNotes: overrides.detail?.sailorNotes ?? null,
      limitBreak: overrides.detail?.limitBreak ?? [],
      potentialAbilities: overrides.detail?.potentialAbilities ?? [],
      supportData: overrides.detail?.supportData ?? [],
      swapData: overrides.detail?.swapData ?? null,
      vsSpecial: overrides.detail?.vsSpecial ?? null,
      superType: overrides.detail?.superType ?? null,
      superClass: overrides.detail?.superClass ?? null,
      rumbleData: overrides.detail?.rumbleData ?? null,
    },
  };
}

function createLeaderWithSuperCriteriaRecord(
  id: number,
  name: string,
  superSpecialCriteria: NonNullable<CharacterDetailRecord['detail']['superSpecialCriteria']>,
): CharacterDetailRecord {
  return createCharacterRecord({
    id,
    name,
    primaryClass: 'Fighter',
    secondaryClass: 'Free Spirit',
    detail: {
      captainAbility:
        'Boosts ATK of DEX and Fighter characters by 5.25x and HP by 1.3x, reduces Special Cooldown of crew by 1 turn.',
      specialText:
        'Boosts orb effects of DEX and Fighter characters by 2.25x for 1 turn and changes orbs into Matching Orbs.',
      superSpecialText: 'Transforms Fighter characters into a Super class.',
      superSpecialCriteriaText: superSpecialCriteria.rawText,
      superSpecialCriteria,
    },
  });
}

function createLeaderWithSuperEffectScopeRecord(
  id: number,
  {
    type = 'DEX',
    primaryClass = 'Fighter',
    secondaryClass = 'Free Spirit',
    superTypeEffect = null,
    superClassEffect = null,
  }: {
    type?: string;
    primaryClass?: string;
    secondaryClass?: string | null;
    superTypeEffect?: string | null;
    superClassEffect?: string | null;
  } = {},
): CharacterDetailRecord {
  return createCharacterRecord({
    id,
    name: `Leader ${id}`,
    type,
    primaryClass,
    secondaryClass,
    detail: {
      captainAbility: 'Boosts ATK of all characters by 5x and HP by 1.3x.',
      specialText: 'Boosts orb effects of all characters by 2x for 1 turn.',
      superType: superTypeEffect ? { specialEffect: superTypeEffect } : null,
      superClass: superClassEffect ? { specialEffect: superClassEffect } : null,
    },
  });
}

function createSuperEffectScopeSubRecord(
  id: number,
  {
    type = 'DEX',
    primaryClass = 'Fighter',
    secondaryClass = null,
  }: {
    type?: string;
    primaryClass?: string;
    secondaryClass?: string | null;
  } = {},
): CharacterDetailRecord {
  return createCharacterRecord({
    id,
    name: `Scoped Sub ${id}`,
    type,
    primaryClass,
    secondaryClass,
    detail: {
      specialText: 'Boosts ATK by 2x for 1 turn.',
    },
  });
}

function createRosterSuperCriteria(
  requiredCount: number,
  labels: string[],
): NonNullable<CharacterDetailRecord['detail']['superSpecialCriteria']> {
  return {
    rawText: `This character must be captain and your crew must consist of any ${requiredCount} of the following: ${labels.join(', ')}.`,
    requiresCaptain: true,
    hasNonRosterBranches: false,
    parserStatus: 'roster_only',
    rosterBranches: [
      {
        branchType: 'character_count_any',
        requiredCount,
        options: labels.map((label) => ({
          label,
          acceptedKeys: [label.toLowerCase()],
        })),
      },
    ],
  };
}

function createMixedRosterSuperCriteria(
  requiredCount: number,
  labels: string[],
): NonNullable<CharacterDetailRecord['detail']['superSpecialCriteria']> {
  return {
    ...createRosterSuperCriteria(requiredCount, labels),
    rawText: `This character must be captain and 5 turns must pass or your crew must consist of any ${requiredCount} of the following: ${labels.join(', ')}.`,
    hasNonRosterBranches: true,
    parserStatus: 'mixed',
  };
}

function createNonRosterSuperCriteria(): NonNullable<
  CharacterDetailRecord['detail']['superSpecialCriteria']
> {
  return {
    rawText: 'This character must be captain and HP must be below 30%.',
    requiresCaptain: true,
    hasNonRosterBranches: true,
    parserStatus: 'non_roster_only',
    rosterBranches: [],
  };
}

function createShipRecord(id: number, name: string, description: string): ShipRecord {
  return {
    id,
    name,
    thumb: null,
    thumbUrl: null,
    description,
  };
}
