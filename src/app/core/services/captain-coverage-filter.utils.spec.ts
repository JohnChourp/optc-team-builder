import { describe, expect, it } from 'vitest';

import {
  type AutoBuildAbilityRequirement,
  type NormalizedBuilderAbility,
} from '../models/auto-team-builder-ability.models';
import {
  type CharacterCaptainAbilityCoverage,
  type CharacterCaptainAbilityCoverageTier,
  type CharacterDetailRecord,
} from '../models/optc.models';
import {
  createCaptainCoverageFilterState,
  getCaptainCoverageAvailableTierNumbers,
  hasCaptainCoverageSuperTandemData,
  hasCaptainCoverageSuperTypesClassesData,
  matchesCaptainCoverageRequiredAbilityFilters,
  matchesCaptainCoverageRequiredTiers,
  resolveCaptainCoverageFilterResult,
} from './captain-coverage-filter.utils';

describe('captain coverage filter model', () => {
  const blackbeardEmperorCaptainAbility =
    'Launches the following effect at start of fight: reduces Special Cooldown of [Blackbeard Pirates], [Four Emperors] and [Worst Generation] characters by 5 turns, reduces Special Cooldown of [QCK] and Free Spirit characters by 2 turns. Boosts ATK of [QCK] and Free Spirit characters by 6x, boosts HP of [QCK] and Free Spirit characters by 1.3x. If your crew has 6+ Free Spirit characters and field has Territory: [QCK], boosts ATK of Free Spirit characters by 7x instead.';

  it('uses Captain Coverage by default while optional data filters pass missing values', () => {
    const captain = createCharacter({
      id: 1001,
      captainAbility: 'Boosts ATK of [DEX] characters by 5x.',
    });
    const coveredTarget = createCharacter({ id: 2001, type: 'DEX' });
    const uncoveredTarget = createCharacter({ id: 2002, type: 'QCK' });

    const coveredResult = resolveCaptainCoverageFilterResult(captain, {
      character: coveredTarget,
      detail: coveredTarget,
    });
    const uncoveredResult = resolveCaptainCoverageFilterResult(captain, {
      character: uncoveredTarget,
      detail: uncoveredTarget,
    });

    expect(coveredResult.coverageMode).toBe('simpleBoostScope');
    expect(coveredResult.matches).toBe(true);
    expect(coveredResult.matchesSuperTandem).toBe(true);
    expect(coveredResult.matchesSuperTypesClasses).toBe(true);
    expect(uncoveredResult.matches).toBe(false);
    expect(uncoveredResult.matchesCaptainCoverage).toBe(false);
  });

  it('can bypass Captain Coverage matching without disabling coverage resolution', () => {
    const captain = createCharacter({
      id: 1001,
      captainAbility: 'Boosts ATK of [DEX] characters by 5x.',
    });
    const uncoveredTarget = createCharacter({ id: 2001, type: 'QCK' });

    const result = resolveCaptainCoverageFilterResult(
      captain,
      {
        character: uncoveredTarget,
        detail: uncoveredTarget,
      },
      createCaptainCoverageFilterState({ requireCaptainCoverage: false }),
    );

    expect(result.coverage.matches).toBe(false);
    expect(result.matchesCaptainCoverage).toBe(true);
    expect(result.matches).toBe(true);
  });

  it('matches Required filters only against Captain Ability-derived abilities', () => {
    const requirement = createRequirement('remove_bind');
    const specialOnlyAbilities = [
      createBuilderAbility('remove_bind', 'Remove Bind', 'specialText'),
    ];
    const captainAbilityAbilities = [
      createBuilderAbility('remove_bind', 'Remove Bind', 'captainAbility'),
    ];

    expect(
      matchesCaptainCoverageRequiredAbilityFilters(specialOnlyAbilities, [requirement]),
    ).toBe(false);
    expect(
      matchesCaptainCoverageRequiredAbilityFilters(captainAbilityAbilities, [requirement]),
    ).toBe(true);
    expect(matchesCaptainCoverageRequiredAbilityFilters([], [])).toBe(true);
  });

  it('requires structured Super Tandem data only when the Super Tandem filter is enabled', () => {
    const captain = createCharacter({
      id: 1001,
      captainAbility: 'Boosts ATK of all characters by 5x.',
    });
    const noSuperTandem = createCharacter({ id: 2001 });
    const withSuperTandem = createCharacter({
      id: 2002,
      superTandemData: {
        requirement: 'On the last stage',
        levels: [{ level: 5, effect: 'Boosts Tandem ATK by 2.5x.' }],
        criteria: null,
      },
    });
    const state = createCaptainCoverageFilterState({ requireSuperTandem: true });

    expect(hasCaptainCoverageSuperTandemData(noSuperTandem)).toBe(false);
    expect(hasCaptainCoverageSuperTandemData(withSuperTandem)).toBe(true);
    expect(
      resolveCaptainCoverageFilterResult(captain, {
        character: noSuperTandem,
        detail: noSuperTandem,
      }, state).matches,
    ).toBe(false);
    expect(
      resolveCaptainCoverageFilterResult(captain, {
        character: withSuperTandem,
        detail: withSuperTandem,
      }, state).matches,
    ).toBe(true);
  });

  it('requires Super Type or Super Class data when the Super Types/Classes filter is enabled', () => {
    const captain = createCharacter({
      id: 1001,
      captainAbility: 'Boosts ATK of all characters by 5x.',
    });
    const noSuperTypesClasses = createCharacter({ id: 2001 });
    const withSuperType = createCharacter({
      id: 2002,
      superType: { specialEffect: 'Changes DEX characters to Super DEX.' },
    });
    const withSuperClass = createCharacter({
      id: 2003,
      superClass: { specialEffect: 'Transforms Fighter characters into Super Fighter characters.' },
    });
    const state = createCaptainCoverageFilterState({ requireSuperTypesClasses: true });

    expect(hasCaptainCoverageSuperTypesClassesData(noSuperTypesClasses)).toBe(false);
    expect(hasCaptainCoverageSuperTypesClassesData(withSuperType)).toBe(true);
    expect(hasCaptainCoverageSuperTypesClassesData(withSuperClass)).toBe(true);
    expect(
      resolveCaptainCoverageFilterResult(captain, {
        character: noSuperTypesClasses,
        detail: noSuperTypesClasses,
      }, state).matches,
    ).toBe(false);
    expect(
      resolveCaptainCoverageFilterResult(captain, {
        character: withSuperType,
        detail: withSuperType,
      }, state).matches,
    ).toBe(true);
    expect(
      resolveCaptainCoverageFilterResult(captain, {
        character: withSuperClass,
        detail: withSuperClass,
      }, state).matches,
    ).toBe(true);
  });

  it('reads available tier numbers from captain coverage entries', () => {
    const captain = createCharacter({
      id: 4571,
      captainAbilityCoverage: buildImuCoverage(),
    });
    expect(getCaptainCoverageAvailableTierNumbers(captain)).toEqual([1, 2, 3]);
  });

  it('returns no tiers for a captain without coverage data', () => {
    const captain = createCharacter({ id: 7000 });
    expect(getCaptainCoverageAvailableTierNumbers(captain)).toEqual([]);
  });

  it('passes any target when requiredTiers is empty (default permissive behaviour)', () => {
    const captain = createCharacter({
      id: 4571,
      captainAbilityCoverage: buildImuCoverage(),
    });
    const anyTarget = createCharacter({ id: 9001, cost: 30 });
    expect(matchesCaptainCoverageRequiredTiers(captain, anyTarget, [])).toBe(true);
  });

  it('requires the target to match at least one of the requested tiers', () => {
    const captain = createCharacter({
      id: 4571,
      captainAbilityCoverage: buildImuCoverage(),
    });
    const cost70Target = createCharacter({ id: 9001, cost: 70 });
    const cost30Target = createCharacter({ id: 9002, cost: 30 });

    // Tier 2 = Cost 70+
    expect(matchesCaptainCoverageRequiredTiers(captain, cost70Target, [2])).toBe(true);
    expect(matchesCaptainCoverageRequiredTiers(captain, cost30Target, [2])).toBe(false);

    // Tier 1 = baseline (fallback-other): matches anyone NOT in subset tier
    expect(matchesCaptainCoverageRequiredTiers(captain, cost70Target, [1])).toBe(false);
    expect(matchesCaptainCoverageRequiredTiers(captain, cost30Target, [1])).toBe(true);

    // Selecting both tiers passes both targets
    expect(matchesCaptainCoverageRequiredTiers(captain, cost70Target, [1, 2])).toBe(true);
    expect(matchesCaptainCoverageRequiredTiers(captain, cost30Target, [1, 2])).toBe(true);
  });

  it('integrates requiredTiers filter into the overall match result', () => {
    const captain = createCharacter({
      id: 4571,
      captainAbilityCoverage: buildImuCoverage(),
      captainAbility:
        'Boosts ATK of Cost 70 or more characters by 6x, boosts ATK of all other characters by 4x, boosts HP of all characters by 1.5x.',
    });
    const cost70Target = createCharacter({ id: 9001, cost: 70 });
    const cost30Target = createCharacter({ id: 9002, cost: 30 });

    const stateRequireTier2 = createCaptainCoverageFilterState({
      requireCaptainCoverage: false,
      requiredTiers: [2],
    });

    const cost70Result = resolveCaptainCoverageFilterResult(
      captain,
      { character: cost70Target, detail: cost70Target },
      stateRequireTier2,
    );
    const cost30Result = resolveCaptainCoverageFilterResult(
      captain,
      { character: cost30Target, detail: cost30Target },
      stateRequireTier2,
    );

    expect(cost70Result.matchesRequiredTiers).toBe(true);
    expect(cost70Result.matches).toBe(true);
    expect(cost30Result.matchesRequiredTiers).toBe(false);
    expect(cost30Result.matches).toBe(false);
  });

  it('switches Full Coverage to the stricter Captain Ability coverage mode', () => {
    const captain = createCharacter({
      id: 4561,
      captainAbility: blackbeardEmperorCaptainAbility,
      type: 'QCK',
      classes: ['Free Spirit', 'Driven'],
      characterTags: ['Blackbeard Pirates', 'Four Emperors'],
    });
    const qckTaggedNonFreeSpiritTarget = createCharacter({
      id: 456103,
      type: 'QCK',
      classes: ['Driven', 'Powerhouse'],
      characterTags: ['Blackbeard Pirates'],
    });

    const simpleResult = resolveCaptainCoverageFilterResult(captain, {
      character: qckTaggedNonFreeSpiritTarget,
      detail: qckTaggedNonFreeSpiritTarget,
    });
    const fullResult = resolveCaptainCoverageFilterResult(
      captain,
      {
        character: qckTaggedNonFreeSpiritTarget,
        detail: qckTaggedNonFreeSpiritTarget,
      },
      createCaptainCoverageFilterState({ requireFullCoverage: true }),
    );

    expect(simpleResult.coverageMode).toBe('simpleBoostScope');
    expect(simpleResult.matches).toBe(true);
    expect(fullResult.coverageMode).toBe('fullAbilityCoverage');
    expect(fullResult.matches).toBe(false);
    expect(fullResult.matchesCaptainCoverage).toBe(false);
  });
});

function createCharacter(
  overrides: Partial<CharacterDetailRecord> & {
    builderAbilities?: NormalizedBuilderAbility[];
    captainAbility?: string;
    captainAbilityCoverage?: CharacterCaptainAbilityCoverage;
    characterTags?: string[];
    classes?: string[];
    id: number;
    superClass?: CharacterDetailRecord['detail']['superClass'];
    superTandemData?: CharacterDetailRecord['detail']['superTandemData'];
    superType?: CharacterDetailRecord['detail']['superType'];
    type?: string;
  },
): CharacterDetailRecord {
  const classes = overrides.classes ?? ['Fighter', 'Slasher'];
  const type = overrides.type ?? 'DEX';

  return {
    id: overrides.id,
    name: overrides.name ?? `Character ${overrides.id}`,
    searchText: '',
    isIncomplete: false,
    type,
    classes,
    primaryClass: classes[0] ?? 'Fighter',
    secondaryClass: classes[1] ?? null,
    stars: 5,
    cost: overrides.cost ?? 55,
    combo: 4,
    captainHpBoost: 0,
    captainAtkBoost: 0,
    captainAverageBoost: 0,
    stats: {
      min: { hp: null, atk: null, rcv: null },
      max: { hp: null, atk: null, rcv: null },
      growth: null,
    },
    regionAvailability: {
      exactLocal: false,
      thumbnailGlobal: false,
      thumbnailJapan: false,
    },
    assets: {
      exactLocal: null,
      thumbnailGlobal: null,
      thumbnailJapan: null,
    },
    imageUrl: 'assets/placeholders/character-card.svg',
    detailImageUrl: 'assets/placeholders/character-card.svg',
    detail: {
      characterId: overrides.id,
      captainAbility: overrides.captainAbility ?? null,
      captainAbilityVariants: [],
      captainAbilityCoverage: overrides.captainAbilityCoverage,
      captainNotes: null,
      specialName: null,
      specialText: null,
      specialNotes: null,
      superSpecialText: null,
      superSpecialCriteriaText: null,
      superSpecialNotes: null,
      superSpecialCriteria: null,
      partyConflictKeys: [],
      characterTags: overrides.characterTags ?? [],
      builderAbilities: overrides.builderAbilities ?? [],
      sailorAbilities: [],
      sailorNotes: null,
      potentialAbilities: [],
      supportData: [],
      swapData: null,
      vsSpecial: null,
      superType: overrides.superType ?? null,
      superTandemData: overrides.superTandemData ?? null,
      superClass: overrides.superClass ?? null,
      captainShiftData: null,
      rumbleData: null,
    },
  } satisfies CharacterDetailRecord;
}

function buildImuCoverage(): CharacterCaptainAbilityCoverage {
  const tiers: CharacterCaptainAbilityCoverageTier[] = [
    {
      tier: 1,
      kind: 'baseline',
      scope: 'crew-wide',
      characterConditions: {
        universal: true,
        fallbackOther: true,
        selfOnly: false,
        types: [],
        classes: [],
        characterTags: [],
      },
      teamConditions: [],
      fieldConditions: [],
      triggerConditions: [],
      clauses: ['boosts ATK of all other characters by 4x', 'boosts HP of all characters by 1.5x'],
      atkBoost: 4,
      hpBoost: 1.5,
    },
    {
      tier: 2,
      kind: 'unconditional-top',
      scope: 'crew-wide',
      characterConditions: {
        universal: true,
        fallbackOther: false,
        selfOnly: false,
        types: [],
        classes: [],
        characterTags: [],
        costRange: { min: 70 },
      },
      teamConditions: [],
      fieldConditions: [],
      triggerConditions: [],
      clauses: ['Boosts ATK of Cost 70 or more characters by 6x', 'boosts HP of all characters by 1.5x'],
      atkBoost: 6,
      hpBoost: 1.5,
    },
    {
      tier: 3,
      kind: 'conditional',
      scope: 'subset',
      characterConditions: {
        universal: false,
        fallbackOther: false,
        selfOnly: false,
        types: [],
        classes: [],
        characterTags: [],
        costRange: { min: 70 },
      },
      teamConditions: [{ kind: 'requires-captain', rawClause: 'this character is your Captain' }],
      fieldConditions: [],
      triggerConditions: [
        {
          kind: 'action-special-excellent',
          durationTurns: 3,
          rawClause: 'performs EXCELLENT with their Action Special',
        },
      ],
      clauses: ['boosts ATK of Cost 70 or more characters by 6.5x'],
      atkBoost: 6.5,
    },
  ];
  return {
    entries: [
      {
        key: 'captain',
        label: 'Captain Ability',
        tiers,
      },
    ],
  };
}

function createRequirement(abilityKey: string): AutoBuildAbilityRequirement {
  return {
    abilityKey,
    minTurns: null,
    slotTokens: [],
    requiredCharacterCount: 1,
    slotScope: 'leader',
    sourceScope: 'captainAbility',
  };
}

function createBuilderAbility(
  key: string,
  label: string,
  source: NormalizedBuilderAbility['source'],
): NormalizedBuilderAbility {
  return {
    key,
    label,
    minTurns: null,
    isCompleteRemoval: false,
    slotTokens: [],
    source,
  };
}
