import { describe, expect, it } from 'vitest';

import {
  AUTO_TEAM_CANDIDATE_LIMIT,
  AUTO_TEAM_BUILDER_DEFAULT_TYPE,
  createEmptyAutoBuildManualSlots,
  type AutoBuildInput,
  type AutoBuildProgressSnapshot,
  type AutoBuildResult,
  type AutoTeamBuilderType,
} from '../models/auto-team-builder.models';
import { type CharacterDetailRecord } from '../models/optc.models';
import { AutoTeamBuildCancelledError, runAutoTeamBuildSearch } from './auto-team-builder.engine';
import { buildAutoTeamResult, resolveCharacterTypeTokens } from './auto-team-builder.utils';

describe('runAutoTeamBuildSearch', () => {
  it('emits deterministic progress stages for exact and fallback attempts', () => {
    const snapshots: AutoBuildProgressSnapshot[] = [];

    const result = runAutoTeamBuildSearch(
      createSingleTypeRecords(),
      createInput(['DEX', 'INT'], ['Fighter']),
      {
        onProgress: (snapshot) => snapshots.push(snapshot),
      },
    );

    expect(result).not.toBeNull();
    expect(snapshots.map((snapshot) => snapshot.stage)).toEqual([
      'preparingSearch',
      'exactAttempt',
      'fallbackAttempt',
      'fallbackAttempt',
      'completed',
    ]);
    expect(snapshots[1]).toMatchObject({
      completedAttempts: 0,
      totalAttempts: 6,
      elapsedMs: expect.any(Number),
      estimatedRemainingMs: null,
      averageFallbackAttemptMs: null,
      completedFallbackAttempts: 0,
      currentDroppedTypes: [],
      currentDroppedClasses: [],
      currentIgnoredLeaderSuperSpecialCriteria: false,
    });
    expect(snapshots[2]).toMatchObject({
      completedAttempts: 1,
      totalAttempts: 6,
      elapsedMs: expect.any(Number),
      estimatedRemainingMs: null,
      averageFallbackAttemptMs: null,
      completedFallbackAttempts: 0,
      currentDroppedTypes: [],
      currentDroppedClasses: ['Fighter'],
      currentIgnoredLeaderSuperSpecialCriteria: false,
    });
    expect(snapshots[3]).toMatchObject({
      completedAttempts: 2,
      totalAttempts: 6,
      elapsedMs: expect.any(Number),
      estimatedRemainingMs: expect.any(Number),
      averageFallbackAttemptMs: expect.any(Number),
      completedFallbackAttempts: 1,
      currentDroppedTypes: ['INT'],
      currentDroppedClasses: [],
      currentIgnoredLeaderSuperSpecialCriteria: false,
    });
  });

  it('keeps eta null until a fallback attempt finishes, then derives a decreasing estimate', () => {
    const snapshots: AutoBuildProgressSnapshot[] = [];

    runAutoTeamBuildSearch(
      createSingleTypeRecords(),
      {
        ...createInput(['DEX', 'INT'], ['Fighter']),
        requiredAbilities: [
          {
            abilityKey: 'remove_slot_barrier',
            minTurns: 3,
            slotTokens: ['DEX'],
            requiredCharacterCount: 1,
          },
        ],
      },
      {
        onProgress: (snapshot) => snapshots.push(snapshot),
        now: createClock([
          0,
          5,
          10,
          15,
          20,
          60,
          65,
          70,
          100,
          105,
          110,
          140,
          145,
          150,
          180,
          185,
          190,
          220,
          225,
        ]),
      },
    );

    const fallbackSnapshots = snapshots.filter((snapshot) => snapshot.stage === 'fallbackAttempt');

    expect(fallbackSnapshots[0]).toMatchObject({
      estimatedRemainingMs: null,
      averageFallbackAttemptMs: null,
      completedFallbackAttempts: 0,
    });
    expect(fallbackSnapshots[1]).toMatchObject({
      estimatedRemainingMs: 120,
      averageFallbackAttemptMs: 40,
      completedFallbackAttempts: 1,
    });
    expect(fallbackSnapshots[2]).toMatchObject({
      estimatedRemainingMs: 70,
      averageFallbackAttemptMs: 35,
      completedFallbackAttempts: 2,
    });
  });

  it('returns the first relaxed result that restores requested class and type coverage', () => {
    const records = createSingleTypeRecords();
    const requestedInput = createInput(['DEX', 'INT'], ['Fighter']);
    const result = runAutoTeamBuildSearch(records, requestedInput);

    expect(result).not.toBeNull();
    expect(result?.requestedInput.types).toEqual(['DEX', 'INT']);
    expect(result?.input.types).toEqual(['DEX']);
    expect(result?.relaxation).toEqual({
      usedFallback: true,
      droppedTypes: ['INT'],
      droppedClasses: [],
      ignoredLeaderSuperSpecialCriteria: false,
    });
  });

  it('throws cancellation before starting the next attempt', () => {
    let cancelled = false;
    const snapshots: AutoBuildProgressSnapshot[] = [];

    expect(() =>
      runAutoTeamBuildSearch(createSingleTypeRecords(), createInput(['DEX', 'INT'], ['Fighter']), {
        onProgress: (snapshot) => {
          snapshots.push(snapshot);

          if (snapshot.stage === 'exactAttempt') {
            cancelled = true;
          }
        },
        isCancelled: () => cancelled,
      }),
    ).toThrowError(AutoTeamBuildCancelledError);
    expect(snapshots.map((snapshot) => snapshot.stage)).toEqual([
      'preparingSearch',
      'exactAttempt',
    ]);
  });

  it('does not relax required abilities during fallback attempts', () => {
    const result = runAutoTeamBuildSearch(createSingleTypeRecords(), {
      ...createInput(['DEX', 'INT'], ['Fighter']),
      requiredAbilities: [
        {
          abilityKey: 'remove_slot_barrier',
          minTurns: 3,
          slotTokens: ['DEX'],
          requiredCharacterCount: 1,
        },
      ],
    });

    expect(result).toBeNull();
  });
});

function runLegacySearch(
  records: CharacterDetailRecord[],
  requestedInput: AutoBuildInput,
): AutoBuildResult | null {
  const exactResult = buildLegacyAttempt(records, requestedInput, requestedInput);

  if (hasStrictConstraints(requestedInput)) {
    return exactResult;
  }

  if (satisfiesRequestedCoverage(exactResult)) {
    return exactResult;
  }

  for (const relaxedInput of buildLegacyRelaxedInputs(requestedInput, records)) {
    const relaxedResult = buildLegacyAttempt(records, relaxedInput, requestedInput);

    if (satisfiesRequestedCoverage(relaxedResult)) {
      return relaxedResult;
    }
  }

  return null;
}

function buildLegacyAttempt(
  records: CharacterDetailRecord[],
  input: AutoBuildInput,
  requestedInput: AutoBuildInput,
): AutoBuildResult | null {
  const attempt = buildAutoTeamResult(records, input);

  if (!attempt) {
    return null;
  }

  return {
    ...attempt,
    input: {
      ...attempt.input,
      requireLeaderSuperSpecialCriteria: input.requireLeaderSuperSpecialCriteria ?? false,
    },
    requestedInput,
    relaxation: {
      usedFallback:
        !sameOrderedValues(requestedInput.types, input.types) ||
        !sameOrderedValues(requestedInput.selectedClasses, input.selectedClasses) ||
        requestedInput.requireLeaderSuperSpecialCriteria !== input.requireLeaderSuperSpecialCriteria,
      droppedTypes: requestedInput.types.filter((type) => !input.types.includes(type)),
      droppedClasses: requestedInput.selectedClasses.filter(
        (selectedClass) => !input.selectedClasses.includes(selectedClass),
      ),
      ignoredLeaderSuperSpecialCriteria:
        requestedInput.requireLeaderSuperSpecialCriteria && !input.requireLeaderSuperSpecialCriteria,
    },
    shipSelection: null,
  };
}

function buildLegacyRelaxedInputs(
  requestedInput: AutoBuildInput,
  records: CharacterDetailRecord[],
): AutoBuildInput[] {
  const nextInputs: Array<{
    input: AutoBuildInput;
    droppedCount: number;
    droppedSupport: number;
    droppedTypes: string;
    droppedClasses: string;
  }> = [];
  const baseInput = requestedInput.requireLeaderSuperSpecialCriteria
    ? {
        ...requestedInput,
        requireLeaderSuperSpecialCriteria: false,
      }
    : requestedInput;

  if (requestedInput.requireLeaderSuperSpecialCriteria) {
    nextInputs.push({
      input: baseInput,
      droppedCount: 0,
      droppedSupport: 0,
      droppedTypes: '',
      droppedClasses: '',
    });
  }

  if (hasStrictConstraints(requestedInput)) {
    return nextInputs;
  }

  const classSupport = new Map(
    requestedInput.selectedClasses.map((selectedClass) => [
      selectedClass,
      resolveClassSupport(records, selectedClass),
    ]),
  );
  const typeSupport = new Map(
    requestedInput.types.map((type) => [type, resolveTypeSupport(records, type)]),
  );
  const typeSubsets = buildSubsets(baseInput.types, 1);
  const classSubsets = buildSubsets(baseInput.selectedClasses, 0);
  nextInputs.push(
    ...typeSubsets.flatMap((types) =>
    classSubsets
      .filter(
        (selectedClasses) =>
          !sameOrderedValues(types, baseInput.types) ||
          !sameOrderedValues(selectedClasses, baseInput.selectedClasses),
      )
      .map((selectedClasses) => {
        const droppedTypes = requestedInput.types.filter((type) => !types.includes(type));
        const droppedClasses = requestedInput.selectedClasses.filter(
          (selectedClass) => !selectedClasses.includes(selectedClass),
        );

        return {
          input: {
            ...requestedInput,
            types,
            selectedClasses,
            requireLeaderSuperSpecialCriteria: baseInput.requireLeaderSuperSpecialCriteria,
          },
          droppedCount: droppedTypes.length + droppedClasses.length,
          droppedSupport:
            droppedTypes.reduce((sum, type) => sum + (typeSupport.get(type) ?? 0), 0) +
            droppedClasses.reduce(
              (sum, selectedClass) => sum + (classSupport.get(selectedClass) ?? 0),
              0,
            ),
          droppedTypes: droppedTypes.join('|'),
          droppedClasses: droppedClasses.join('|'),
        };
      }),
  ));

  nextInputs.sort((left, right) => {
    if (left.droppedCount !== right.droppedCount) {
      return left.droppedCount - right.droppedCount;
    }

    if (left.input.types.length !== right.input.types.length) {
      return right.input.types.length - left.input.types.length;
    }

    if (left.input.selectedClasses.length !== right.input.selectedClasses.length) {
      return right.input.selectedClasses.length - left.input.selectedClasses.length;
    }

    if (left.droppedSupport !== right.droppedSupport) {
      return left.droppedSupport - right.droppedSupport;
    }

    if (left.droppedTypes !== right.droppedTypes) {
      return left.droppedTypes.localeCompare(right.droppedTypes);
    }

    return left.droppedClasses.localeCompare(right.droppedClasses);
  });

  return nextInputs.map((entry) => entry.input);
}

function buildSubsets<T>(values: T[], minLength: number): T[][] {
  const subsets: T[][] = [];

  for (let mask = 0; mask < 1 << values.length; mask += 1) {
    const subset = values.filter((_, index) => (mask & (1 << index)) !== 0);

    if (subset.length >= minLength) {
      subsets.push(subset);
    }
  }

  return subsets;
}

function hasStrictConstraints(input: AutoBuildInput): boolean {
  return Boolean(
    input.requireAllSelectedTypesInTeam || input.requireAllSelectedClassesPerCharacter,
  );
}

function satisfiesRequestedCoverage(result: AutoBuildResult | null): result is AutoBuildResult {
  return Boolean(
    result &&
    result.coverage.coversAllSelectedClasses &&
    result.coverage.coversAllSelectedTypes &&
    result.coverage.abilityRequirements.matchesAll,
  );
}

function sameOrderedValues<T>(left: T[], right: T[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function resolveClassSupport(records: CharacterDetailRecord[], selectedClass: string): number {
  const normalizedSelectedClass = selectedClass.toLowerCase();

  return records.filter((record) =>
    record.classes.some((recordClass) => recordClass.toLowerCase() === normalizedSelectedClass),
  ).length;
}

function resolveTypeSupport(
  records: CharacterDetailRecord[],
  selectedType: AutoTeamBuilderType,
): number {
  return records.filter((record) => resolveCharacterTypeTokens(record.type).includes(selectedType))
    .length;
}

function createInput(
  types: AutoTeamBuilderType[] = [AUTO_TEAM_BUILDER_DEFAULT_TYPE],
  selectedClasses: string[] = ['Fighter'],
): AutoBuildInput {
  return {
    types,
    selectedClasses,
    requiredAbilities: [],
    enemyMechanics: [],
    requireAllSelectedTypesInTeam: false,
    requireAllSelectedClassesPerCharacter: false,
    requireUniqueBaseCharacterNames: false,
    favoritesOnly: false,
    favoriteShipsOnly: false,
    favoriteShipIds: [],
    manualSlots: createEmptyAutoBuildManualSlots(),
    lockedCharacterIds: [],
    excludedCharacterIds: [],
    captainCharacterId: null,
    friendCaptainCharacterId: null,
    manualShipId: null,
    excludedShipIds: [],
    candidateLimit: AUTO_TEAM_CANDIDATE_LIMIT,
  };
}

function createClock(values: number[]): () => number {
  let index = 0;
  const lastValue = values.at(-1) ?? 0;

  return () => {
    const nextValue = values[index] ?? lastValue;

    index += 1;
    return nextValue;
  };
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

function createAtkSubRecord(): CharacterDetailRecord {
  return createCharacterRecord({
    id: 5890,
    primaryClass: 'Fighter',
    detail: {
      specialText: 'Boosts ATK of Fighter characters by 2.5x for 1 turn.',
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

function createCharacterRecord(
  overrides: Omit<Partial<CharacterDetailRecord>, 'detail'> & {
    id: number;
    detail?: Partial<CharacterDetailRecord['detail']>;
  },
): CharacterDetailRecord {
  const id = overrides.id;
  const primaryClass = overrides.primaryClass ?? 'Fighter';
  const secondaryClass = overrides.secondaryClass ?? 'Slasher';

  return {
    id,
    name: overrides.name ?? `Character ${id}`,
    type: overrides.type ?? 'DEX',
    classes: overrides.classes ?? ([primaryClass, secondaryClass].filter(Boolean) as string[]),
    primaryClass,
    secondaryClass,
    stars: overrides.stars ?? 6,
    cost: overrides.cost ?? 55,
    combo: overrides.combo ?? 4,
    maxLevel: overrides.maxLevel ?? 99,
    maxExperience: overrides.maxExperience ?? 5_000_000,
    stats: overrides.stats ?? {
      min: { hp: 1000, atk: 500, rcv: 100 },
      max: { hp: 4200, atk: 1800, rcv: 320 },
      growth: 2.4,
    },
    regionAvailability: overrides.regionAvailability ?? {
      exactLocal: true,
      thumbnailGlobal: true,
      thumbnailJapan: false,
      fullTransparent: true,
    },
    assets: overrides.assets ?? {
      exactLocal: `assets/characters/${id}.png`,
      thumbnailGlobal: `assets/characters/${id}-thumb.png`,
      thumbnailJapan: null,
      fullTransparent: `assets/characters/${id}-full.png`,
    },
    imageUrl: overrides.imageUrl ?? `assets/characters/${id}-thumb.png`,
    detailImageUrl: overrides.detailImageUrl ?? `assets/characters/${id}-full.png`,
    detail: {
      characterId: id,
      captainAbility: overrides.detail?.captainAbility ?? null,
      specialName: overrides.detail?.specialName ?? `Special ${id}`,
      specialText: overrides.detail?.specialText ?? null,
      specialNotes: overrides.detail?.specialNotes ?? null,
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
