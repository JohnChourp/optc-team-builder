import { describe, expect, it, vi } from 'vitest';

import {
  AUTO_TEAM_CANDIDATE_LIMIT,
  AUTO_TEAM_BUILDER_DEFAULT_TYPE,
  type AutoBuildInput,
  type AutoTeamBuilderType,
} from '../models/auto-team-builder.models';
import { type CharacterDetailRecord } from '../models/optc.models';
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

  it('requests combined candidates from the repository service when multiple types are selected', async () => {
    const repository = {
      getAutoBuilderCandidates: vi.fn().mockResolvedValue(createStrictMixedTeamRecords()),
    };
    const service = new AutoTeamBuilderService(repository as never);

    await service.buildTeam(['Fighter', 'Slasher'], ['DEX', 'PSY']);

    expect(repository.getAutoBuilderCandidates).toHaveBeenCalledWith(
      ['DEX', 'PSY'],
      AUTO_TEAM_CANDIDATE_LIMIT,
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
    );
    expect(result?.input.selectedClasses).toEqual(['Fighter', 'Slasher']);
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
  });

  it('returns null in favorites mode when no favorite candidate ids match', async () => {
    const repository = {
      getAutoBuilderCandidates: vi.fn().mockResolvedValue(createStrictMixedTeamRecords()),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(['Fighter', 'Slasher'], ['DEX', 'PSY'], {
      favoritesOnly: true,
      favoriteCharacterIds: [999_999],
    });

    expect(result).toBeNull();
  });

  it('normalizes omitted constraints to false', async () => {
    const repository = {
      getAutoBuilderCandidates: vi.fn().mockResolvedValue(createSingleTypeRecords()),
    };
    const service = new AutoTeamBuilderService(repository as never);

    const result = await service.buildTeam(['Fighter'], ['DEX']);

    expect(result?.input.requireAllSelectedTypesInTeam).toBe(false);
    expect(result?.input.requireAllSelectedClassesPerCharacter).toBe(false);
    expect(result?.input.favoritesOnly).toBe(false);
    expect(result?.input.lockedCharacterIds).toEqual([]);
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
});

function createInput(
  types: AutoTeamBuilderType[] = [AUTO_TEAM_BUILDER_DEFAULT_TYPE],
  selectedClasses: string[] = ['Fighter'],
  overrides: Partial<
    Pick<
      AutoBuildInput,
      | 'requireAllSelectedTypesInTeam'
      | 'requireAllSelectedClassesPerCharacter'
      | 'favoritesOnly'
      | 'lockedCharacterIds'
    >
  > = {
    requireAllSelectedTypesInTeam: false,
    requireAllSelectedClassesPerCharacter: false,
    favoritesOnly: false,
    lockedCharacterIds: [],
  },
): AutoBuildInput {
  return {
    types,
    selectedClasses,
    requireAllSelectedTypesInTeam: overrides.requireAllSelectedTypesInTeam ?? false,
    requireAllSelectedClassesPerCharacter: overrides.requireAllSelectedClassesPerCharacter ?? false,
    favoritesOnly: overrides.favoritesOnly ?? false,
    lockedCharacterIds: overrides.lockedCharacterIds ?? [],
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
