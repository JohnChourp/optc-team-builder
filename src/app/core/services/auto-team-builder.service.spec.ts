import { describe, expect, it, vi } from 'vitest';

import {
  AUTO_TEAM_CANDIDATE_LIMIT,
  AUTO_TEAM_BUILDER_DEFAULT_TYPE,
  type AutoBuildInput,
  type AutoBuildProgressSnapshot,
  type AutoTeamBuilderType,
} from '../models/auto-team-builder.models';
import { type CharacterDetailRecord } from '../models/optc.models';
import { AutoTeamBuildCancelledError } from './auto-team-builder.engine';
import { AutoTeamBuilderService } from './auto-team-builder.service';
import {
  buildAutoBuildCandidate,
  buildAutoTeamResult,
  hasReadableEffectText,
} from './auto-team-builder.utils';

const INPUT = createInput();

describe('Auto team builder', () => {
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
          { abilityKey: 'remove_bind', minTurns: 5, slotTokens: [] },
          { abilityKey: 'remove_despair', minTurns: 5, slotTokens: [] },
        ],
      },
    );

    expect(result).not.toBeNull();
    expect(result?.coverage.abilityRequirements.matchesAll).toBe(true);
    expect(result?.coverage.abilityRequirements.matched).toEqual([
      { abilityKey: 'remove_bind', minTurns: 5, slotTokens: [] },
      { abilityKey: 'remove_despair', minTurns: 5, slotTokens: [] },
    ]);
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
          { abilityKey: 'remove_slot_barrier', minTurns: 3, slotTokens: ['DEX'] },
        ],
      },
    );

    expect(result).not.toBeNull();
    expect(result?.coverage.abilityRequirements.matchesAll).toBe(true);
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
        requiredAbilities: [{ abilityKey: 'ignore_normal_attack_only', minTurns: null, slotTokens: [] }],
      },
    );

    expect(result).not.toBeNull();
    expect(result?.coverage.abilityRequirements.matchesAll).toBe(true);
    expect(result?.coverage.abilityRequirements.matched).toEqual([
      { abilityKey: 'ignore_normal_attack_only', minTurns: null, slotTokens: [] },
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
          { abilityKey: 'remove_slot_barrier', minTurns: 3, slotTokens: ['QCK'] },
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
    expect(result?.coverage.leaderCriteria.hasClassRestriction).toBe(false);
    expect(result?.coverage.leaderCriteria.hasTypeRestriction).toBe(false);
    expect(result?.coverage.leaderCriteria.allSlotsMatch).toBe(true);
    expect(result?.slots.some((slot) => slot.character.id === 2724)).toBe(true);
  });

  it('keeps the existing selection behavior when the special-support toggle is off', () => {
    const result = buildAutoTeamResult(
      createStrictMixedTeamRecords(),
      createInput(['DEX', 'PSY'], ['Fighter', 'Slasher']),
    );

    expect(result).not.toBeNull();
    expect(result?.coverage.specialSupport.enabled).toBe(false);
    expect(result?.coverage.specialSupport.allSlotsMatch).toBe(false);
  });

  it('accepts restricted specials when they cover the full final team', () => {
    const result = buildAutoTeamResult(createTeamwideSpecialScopedRecords(), {
      ...createInput(['DEX', 'PSY'], ['Fighter', 'Slasher'], {
        requireAllSpecialsSupportTeam: true,
      }),
    });

    expect(result).not.toBeNull();
    expect(result?.coverage.specialSupport.enabled).toBe(true);
    expect(result?.coverage.specialSupport.allSlotsMatch).toBe(true);
    expect(result?.slots.every((slot) => slot.reasonChips.includes('Teamwide special'))).toBe(true);
  });

  it('rejects teams when even one slot lacks teamwide special support', () => {
    const result = buildAutoTeamResult(createStrictMixedTeamRecords(), {
      ...createInput(['DEX', 'PSY'], ['Fighter', 'Slasher'], {
        requireAllSpecialsSupportTeam: true,
      }),
    });

    expect(result).toBeNull();
  });

  it('fails when selected dual leaders are not mutually special-compatible', () => {
    const result = buildAutoTeamResult(createDualLeaderSpecialMismatchRecords(), {
      ...createInput(['DEX', 'PSY'], ['Fighter'], {
        lockedCharacterIds: [5940, 5941],
        captainCharacterId: 5940,
        friendCaptainCharacterId: 5941,
        requireAllSpecialsSupportTeam: true,
      }),
    });

    expect(result).toBeNull();
  });

  it('fails when a locked sub special does not support the full final team', () => {
    const result = buildAutoTeamResult(createLockedSpecialMismatchRecords(), {
      ...createInput(['DEX', 'PSY'], ['Fighter', 'Slasher'], {
        lockedCharacterIds: [5940, 5946],
        captainCharacterId: 5940,
        friendCaptainCharacterId: 5940,
        requireAllSpecialsSupportTeam: true,
      }),
    });

    expect(result).toBeNull();
  });

  it('prefers universal captains over partial multi-type captains', () => {
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
    expect(result?.slots[0]?.character.id).toBe(5905);
    expect(result?.slots[0]?.reasonChips).toContain('Universal captain');
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
    expect(
      result?.slots.some(
        (slot) => slot.character.id === 5926 && slot.reasonChips.includes('Manual lock'),
      ),
    ).toBe(true);
  });

  it('returns null when more than five locked characters are provided', () => {
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

    expect(result).toBeNull();
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
        allowedCharacterIds: undefined,
        lockedCharacterIds: [],
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
        allowedCharacterIds: undefined,
        lockedCharacterIds: [],
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
        allowedCharacterIds: undefined,
        lockedCharacterIds: [],
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
        allowedCharacterIds: favoriteCharacterIds,
        lockedCharacterIds: [],
      },
    );
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
        allowedCharacterIds: [999_999],
        lockedCharacterIds: [],
      },
    );
  });

  it('normalizes omitted constraints to false', async () => {
    const repository = {
      getAutoBuilderCandidates: vi.fn().mockResolvedValue(createSingleTypeRecords()),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(['Fighter'], ['DEX']);

    expect(result?.input.requireAllSelectedTypesInTeam).toBe(false);
    expect(result?.input.requireAllSelectedClassesPerCharacter).toBe(false);
    expect(result?.input.requireAllSpecialsSupportTeam).toBe(false);
    expect(result?.input.favoritesOnly).toBe(false);
    expect(result?.input.lockedCharacterIds).toEqual([]);
    expect(result?.requestedInput.lockedCharacterIds).toEqual([]);
    expect(result?.input.captainCharacterId).toBeNull();
    expect(result?.input.friendCaptainCharacterId).toBeNull();
  });

  it('returns null in favorites mode when locked ids are outside the favorites pool', async () => {
    const repository = {
      getAutoBuilderCandidates: vi.fn().mockResolvedValue(createStrictMixedTeamRecords()),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(['Fighter', 'Slasher'], ['DEX', 'PSY'], {
      favoritesOnly: true,
      favoriteCharacterIds: [5925, 5926, 5880, 5870, 5860],
      lockedCharacterIds: [5900],
    });

    expect(result).toBeNull();
    expect(repository.getAutoBuilderCandidates).not.toHaveBeenCalled();
  });

  it('normalizes and deduplicates locked ids before building', async () => {
    const repository = {
      getAutoBuilderCandidates: vi.fn().mockResolvedValue(createStrictMixedTeamRecords()),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(['Fighter', 'Slasher'], ['DEX', 'PSY'], {
      lockedCharacterIds: [5925, 5925, 5926, 0, -1],
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

  it('returns null in favorites mode when a selected leader is outside the favorites pool', async () => {
    const repository = {
      getAutoBuilderCandidates: vi.fn().mockResolvedValue(createStrictMixedTeamRecords()),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(['Fighter', 'Slasher'], ['DEX', 'PSY'], {
      favoritesOnly: true,
      favoriteCharacterIds: [5926, 5880, 5870, 5860],
      lockedCharacterIds: [5925],
      captainCharacterId: 5925,
      friendCaptainCharacterId: 5925,
    });

    expect(result).toBeNull();
    expect(repository.getAutoBuilderCandidates).not.toHaveBeenCalled();
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
    });
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
    });
  });

  it('relaxes class coverage without dropping the special-support requirement', async () => {
    const repository = {
      getAutoBuilderCandidates: vi.fn().mockResolvedValue(createTeamwideSpecialScopedRecords()),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(['Fighter', 'Shooter'], ['DEX', 'PSY'], {
      requireAllSpecialsSupportTeam: true,
    });

    expect(result).not.toBeNull();
    expect(result?.requestedInput.selectedClasses).toEqual(['Fighter', 'Shooter']);
    expect(result?.input.selectedClasses).toEqual(['Fighter']);
    expect(result?.input.requireAllSpecialsSupportTeam).toBe(true);
    expect(result?.coverage.specialSupport.enabled).toBe(true);
    expect(result?.coverage.specialSupport.allSlotsMatch).toBe(true);
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
          currentDroppedTypes: [],
          currentDroppedClasses: [],
          message: 'Exact attempt 1 / 1',
        },
      });
      worker.emitMessage({
        type: 'result',
        runId: request.runId,
        result: null,
      });
    });
    const progressSnapshots: AutoBuildProgressSnapshot[] = [];

    vi.spyOn(service as never, 'createWorker').mockReturnValue(worker as never);

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
        }),
        expect.objectContaining({
          stage: 'exactAttempt',
          message: 'Exact attempt 1 / 1',
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

    vi.spyOn(service as never, 'createWorker').mockReturnValue(worker as never);

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
    const createWorkerSpy = vi.spyOn(service as never, 'createWorker').mockReturnValue(null);

    const result = await service.buildTeam(['Fighter', 'Slasher'], ['DEX', 'PSY']);

    expect(createWorkerSpy).toHaveBeenCalledOnce();
    expect(result).not.toBeNull();
    expect(result?.relaxation.usedFallback).toBe(false);
    expect(result?.coverage.coversAllSelectedClasses).toBe(true);
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

function createInput(
  types: AutoTeamBuilderType[] = [AUTO_TEAM_BUILDER_DEFAULT_TYPE],
  selectedClasses: string[] = ['Fighter'],
  overrides: Partial<
    Pick<
      AutoBuildInput,
      | 'requireAllSelectedTypesInTeam'
      | 'requireAllSelectedClassesPerCharacter'
      | 'requireAllSpecialsSupportTeam'
      | 'favoritesOnly'
      | 'lockedCharacterIds'
      | 'captainCharacterId'
      | 'friendCaptainCharacterId'
    >
  > = {
    requireAllSelectedTypesInTeam: false,
    requireAllSelectedClassesPerCharacter: false,
    requireAllSpecialsSupportTeam: false,
    favoritesOnly: false,
    lockedCharacterIds: [],
    captainCharacterId: null,
    friendCaptainCharacterId: null,
  },
): AutoBuildInput {
  return {
    types,
    selectedClasses,
    requiredAbilities: [],
    requireAllSelectedTypesInTeam: overrides.requireAllSelectedTypesInTeam ?? false,
    requireAllSelectedClassesPerCharacter: overrides.requireAllSelectedClassesPerCharacter ?? false,
    requireAllSpecialsSupportTeam: overrides.requireAllSpecialsSupportTeam ?? false,
    favoritesOnly: overrides.favoritesOnly ?? false,
    lockedCharacterIds: overrides.lockedCharacterIds ?? [],
    captainCharacterId: overrides.captainCharacterId ?? null,
    friendCaptainCharacterId: overrides.friendCaptainCharacterId ?? null,
    candidateLimit: AUTO_TEAM_CANDIDATE_LIMIT,
  };
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

class FakeWorker extends EventTarget {
  public terminated = false;

  public constructor(
    private readonly onPostMessage?: (request: {
      type: 'run';
      runId: string;
      records: CharacterDetailRecord[];
      requestedInput: AutoBuildInput;
    }) => void,
  ) {
    super();
  }

  public postMessage(request: {
    type: 'run';
    runId: string;
    records: CharacterDetailRecord[];
    requestedInput: AutoBuildInput;
  }): void {
    this.onPostMessage?.(request);
  }

  public terminate(): void {
    this.terminated = true;
  }

  public emitMessage(data: unknown): void {
    this.dispatchEvent(new MessageEvent('message', { data }));
  }
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

function createDualLeaderSpecialMismatchRecords(): CharacterDetailRecord[] {
  return [
    createCharacterRecord({
      id: 5940,
      type: 'DEX',
      primaryClass: 'Fighter',
      secondaryClass: 'Slasher',
      detail: {
        captainAbility:
          'Boosts ATK of DEX, PSY and Fighter characters by 5x and HP by 1.3x, reduces Special Cooldown of crew by 1 turn.',
        specialText: 'Boosts ATK of Fighter characters by 2.5x for 1 turn.',
      },
    }),
    createCharacterRecord({
      id: 5941,
      type: 'PSY',
      primaryClass: 'Fighter',
      secondaryClass: 'Cerebral',
      detail: {
        captainAbility:
          'Boosts ATK of DEX, PSY and Fighter characters by 4.8x and HP by 1.25x, reduces Special Cooldown of crew by 1 turn.',
        specialText: 'Boosts color affinity of Shooter characters by 2x for 1 turn.',
      },
    }),
    createCharacterRecord({
      id: 5942,
      type: 'DEX',
      primaryClass: 'Fighter',
      detail: {
        specialText: 'Boosts orb effects of Fighter characters by 2x for 1 turn.',
      },
    }),
    createCharacterRecord({
      id: 5943,
      type: 'PSY',
      primaryClass: 'Fighter',
      detail: {
        specialText: 'Boosts the chain multiplier of Fighter characters by +1.1 for 1 turn.',
      },
    }),
    createCharacterRecord({
      id: 5944,
      type: 'DEX',
      primaryClass: 'Fighter',
      detail: {
        specialText: 'Changes crew orbs into Matching Orbs.',
      },
    }),
    createCharacterRecord({
      id: 5945,
      type: 'PSY',
      primaryClass: 'Fighter',
      detail: {
        specialText: 'Boosts ATK of Fighter characters by 2.25x for 1 turn.',
      },
    }),
  ];
}

function createLockedSpecialMismatchRecords(): CharacterDetailRecord[] {
  return [
    ...createTeamwideSpecialScopedRecords(),
    createCharacterRecord({
      id: 5946,
      type: 'DEX',
      primaryClass: 'Fighter',
      secondaryClass: 'Slasher',
      detail: {
        specialText: 'Boosts ATK of Shooter characters by 2.5x for 1 turn.',
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
    maxLevel: overrides.maxLevel ?? 99,
    maxExperience: overrides.maxExperience ?? 1_000_000,
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
