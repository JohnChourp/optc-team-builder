import { describe, expect, it } from 'vitest';

import {
  type AutoBuildAbilityRequirement,
  type NormalizedBuilderAbility,
} from '../models/auto-team-builder-ability.models';
import { type CharacterDetailRecord } from '../models/optc.models';
import {
  createCaptainCoverageFilterState,
  hasCaptainCoverageSuperTandemData,
  hasCaptainCoverageSuperTypesClassesData,
  matchesCaptainCoverageRequiredAbilityFilters,
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
