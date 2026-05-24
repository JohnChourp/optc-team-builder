import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  type CharacterCaptainAbilityCoverage,
  type CharacterCaptainAbilityCoverageTier,
  type CharacterDetailRecord,
} from '../models/optc.models';
import { resolveTeamCoverageSummary } from './team-coverage-summary.utils';

describe('resolveTeamCoverageSummary', () => {
  it('returns isComplete=false when the team has fewer than 6 members', () => {
    const captain = createCharacter({ id: 4571, captainAbilityCoverage: buildImuCoverage() });
    const summary = resolveTeamCoverageSummary({
      captain,
      friendCaptain: captain,
      members: [createCharacter({ id: 9001, cost: 70 })],
    });
    expect(summary.isComplete).toBe(false);
    expect(summary.tiers.every((tier) => tier.captureSource === 'none')).toBe(true);
  });

  it('marks Tier 2 as covered by both captains when all 6 team members are Cost 70+', () => {
    const captain = createCharacter({ id: 4571, captainAbilityCoverage: buildImuCoverage() });
    const friend = createCharacter({ id: 4572, captainAbilityCoverage: buildImuCoverage() });
    const team = Array.from({ length: 6 }, (_, index) =>
      createCharacter({ id: 9001 + index, cost: 70 }),
    );

    const summary = resolveTeamCoverageSummary({ captain, friendCaptain: friend, members: team });

    expect(summary.isComplete).toBe(true);
    const tier1 = summary.tiers.find((tier) => tier.tier === 1);
    const tier2 = summary.tiers.find((tier) => tier.tier === 2);
    const tier3 = summary.tiers.find((tier) => tier.tier === 3);

    // Tier 1 is the "all other" fallback — when every member qualifies for Tier 2, no one matches
    // the fallback, so Tier 1 is not covered.
    expect(tier1?.captureSource).toBe('none');
    expect(tier2?.captureSource).toBe('both');
    // Tier 3 has the same character conditions as Tier 2 (Cost 70+); the trigger is in-fight only
    // and not blocking from a team-composition perspective.
    expect(tier3?.captureSource).toBe('both');
  });

  it('marks Tier 1 as covered when all 6 members fall in the fallback-other tier', () => {
    const captain = createCharacter({ id: 4571, captainAbilityCoverage: buildImuCoverage() });
    const team = Array.from({ length: 6 }, (_, index) =>
      createCharacter({ id: 9001 + index, cost: 30 }),
    );
    const summary = resolveTeamCoverageSummary({
      captain,
      friendCaptain: captain,
      members: team,
    });

    const tier1 = summary.tiers.find((tier) => tier.tier === 1);
    const tier2 = summary.tiers.find((tier) => tier.tier === 2);

    expect(tier1?.captureSource).toBe('both');
    expect(tier2?.captureSource).toBe('none');
  });

  it('returns captain-only when friend captain has no tier data', () => {
    const captain = createCharacter({ id: 4571, captainAbilityCoverage: buildImuCoverage() });
    const friendWithoutCoverage = createCharacter({ id: 1 });
    const team = Array.from({ length: 6 }, (_, index) =>
      createCharacter({ id: 9001 + index, cost: 70 }),
    );
    const summary = resolveTeamCoverageSummary({
      captain,
      friendCaptain: friendWithoutCoverage,
      members: team,
    });
    expect(summary.tiers.find((tier) => tier.tier === 2)?.captureSource).toBe('captain-only');
  });

  it('respects crew-composition team conditions when checking a tier', () => {
    const captain = createCharacter({
      id: 9999,
      captainAbilityCoverage: {
        entries: [
          {
            key: 'captain',
            label: 'Captain Ability',
            tiers: [
              {
                tier: 1,
                kind: 'baseline',
                scope: 'crew-wide',
                characterConditions: {
                  universal: true,
                  fallbackOther: false,
                  selfOnly: false,
                  types: [],
                  classes: [],
                  characterTags: [],
                },
                teamConditions: [],
                fieldConditions: [],
                triggerConditions: [],
                clauses: ['boosts ATK of all characters by 1.5x'],
                atkBoost: 1.5,
              },
              {
                tier: 2,
                kind: 'conditional',
                scope: 'subset',
                characterConditions: {
                  universal: false,
                  fallbackOther: false,
                  selfOnly: false,
                  types: [],
                  classes: ['Free Spirit'],
                  characterTags: [],
                },
                teamConditions: [
                  {
                    kind: 'crew-composition',
                    minCount: 4,
                    classes: ['Free Spirit'],
                    rawClause: 'crew has 4+ Free Spirit characters',
                  },
                ],
                fieldConditions: [],
                triggerConditions: [],
                clauses: ['boosts ATK of Free Spirit characters by 3x'],
                atkBoost: 3,
              },
            ],
          },
        ],
      },
    });
    const team4FreeSpirit = [
      ...Array.from({ length: 4 }, (_, i) =>
        createCharacter({ id: 8000 + i, classes: ['Free Spirit'] }),
      ),
      createCharacter({ id: 8004, classes: ['Fighter'] }),
      createCharacter({ id: 8005, classes: ['Fighter'] }),
    ];
    const summary = resolveTeamCoverageSummary({
      captain,
      friendCaptain: captain,
      members: team4FreeSpirit,
    });
    // Tier 2 character condition is "Free Spirit class" — only 4 of 6 members satisfy it.
    // Even though team composition (4+ FS) holds, not every member qualifies → tier 2 = none.
    const tier2 = summary.tiers.find((tier) => tier.tier === 2);
    expect(tier2?.captureSource).toBe('none');

    const team6FreeSpirit = Array.from({ length: 6 }, (_, i) =>
      createCharacter({ id: 8100 + i, classes: ['Free Spirit'] }),
    );
    const summary2 = resolveTeamCoverageSummary({
      captain,
      friendCaptain: captain,
      members: team6FreeSpirit,
    });
    const tier2Full = summary2.tiers.find((tier) => tier.tier === 2);
    expect(tier2Full?.captureSource).toBe('both');
  });

  it('covers team-only conditional tiers when their crew condition is satisfied', () => {
    const captain = createCharacter({
      id: 4561,
      captainAbilityCoverage: buildTeamOnlyFreeSpiritCoverage(),
    });
    const fullFreeSpiritTeam = Array.from({ length: 6 }, (_, i) =>
      createCharacter({ id: 8400 + i, classes: ['Free Spirit'] }),
    );
    const partialFreeSpiritTeam = [
      ...Array.from({ length: 3 }, (_, i) =>
        createCharacter({ id: 8500 + i, classes: ['Free Spirit'] }),
      ),
      ...Array.from({ length: 3 }, (_, i) =>
        createCharacter({ id: 8510 + i, classes: ['Fighter'] }),
      ),
    ];

    const coveredSummary = resolveTeamCoverageSummary({
      captain,
      friendCaptain: captain,
      members: fullFreeSpiritTeam,
    });
    const coveredTier = coveredSummary.tiers.find((tier) => tier.tier === 2);

    expect(coveredTier).toMatchObject({
      kind: 'conditional',
      scopeLabel: 'Tier 2',
      conditionLines: ['Team: crew has 4+ Free Spirit characters'],
      effectsSummary: ['reduces Special Use Limit duration by 10 turns'],
      captureSource: 'both',
    });

    const uncoveredTier = resolveTeamCoverageSummary({
      captain,
      friendCaptain: captain,
      members: partialFreeSpiritTeam,
    }).tiers.find((tier) => tier.tier === 2);

    expect(uncoveredTier?.captureSource).toBe('none');
  });

  it('requires all slots to share one type for Dominant Type target coverage', () => {
    const captain = createCharacter({
      id: 4574,
      type: 'INT',
      captainAbilityCoverage: {
        entries: [
          {
            key: 'captain',
            label: 'Captain Ability',
            tiers: [
              {
                tier: 1,
                kind: 'conditional',
                scope: 'crew-wide',
                characterConditions: {
                  universal: true,
                  fallbackOther: false,
                  selfOnly: false,
                  dominantType: true,
                  types: [],
                  classes: [],
                  characterTags: [],
                },
                teamConditions: [
                  {
                    kind: 'crew-composition',
                    minCount: 4,
                    sameType: true,
                    rawClause: 'your crew has 4+ characters of the same Type',
                  },
                ],
                fieldConditions: [],
                triggerConditions: [],
                clauses: [
                  'boosts ATK of the Dominant Type characters by 4.5x',
                  'Boosts HP of all characters by 1.25x',
                ],
                atkBoost: 4.5,
                hpBoost: 1.25,
              },
            ],
          },
        ],
      },
    });
    const mixedDominantTeam = [
      ...Array.from({ length: 4 }, (_, index) =>
        createCharacter({ id: 8200 + index, type: 'INT' }),
      ),
      createCharacter({ id: 8204, type: 'DEX' }),
      createCharacter({ id: 8205, type: 'DEX' }),
    ];
    const fullDominantTeam = Array.from({ length: 6 }, (_, index) =>
      createCharacter({ id: 8300 + index, type: 'INT' }),
    );

    expect(
      resolveTeamCoverageSummary({
        captain,
        friendCaptain: captain,
        members: mixedDominantTeam,
      }).tiers[0]?.captureSource,
    ).toBe('none');
    expect(
      resolveTeamCoverageSummary({
        captain,
        friendCaptain: captain,
        members: fullDominantTeam,
      }).tiers[0]?.captureSource,
    ).toBe('both');
  });

  it('renders tier kind and tier condition lines in the shared summary panel', () => {
    const template = readFileSync(
      resolve(process.cwd(), 'src/app/shared/team-coverage-summary/team-coverage-summary.component.html'),
      'utf8',
    );
    const englishTranslations = JSON.parse(
      readFileSync(resolve(process.cwd(), 'public/i18n/team-coverage-summary/en.json'), 'utf8'),
    ) as { tierKinds?: Record<string, string> };
    const greekTranslations = JSON.parse(
      readFileSync(resolve(process.cwd(), 'public/i18n/team-coverage-summary/el.json'), 'utf8'),
    ) as { tierKinds?: Record<string, string> };

    expect(template).toContain("t('tierKinds.' + kind)");
    expect(template).toContain('tier.conditionLines');
    expect(template).toContain('team-coverage-summary__conditions');
    expect(englishTranslations.tierKinds?.['conditional']).toBe('Conditional');
    expect(greekTranslations.tierKinds?.['conditional']).toBe('Υπό συνθήκη');
  });
});

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

function buildTeamOnlyFreeSpiritCoverage(): CharacterCaptainAbilityCoverage {
  const tiers: CharacterCaptainAbilityCoverageTier[] = [
    {
      tier: 1,
      kind: 'baseline',
      scope: 'subset',
      characterConditions: {
        universal: false,
        fallbackOther: false,
        selfOnly: false,
        types: ['QCK'],
        classes: ['Free Spirit'],
        characterTags: [],
      },
      teamConditions: [],
      fieldConditions: [],
      triggerConditions: [],
      clauses: ['Boosts ATK of [QCK] and Free Spirit characters by 6x'],
      atkBoost: 6,
    },
    {
      tier: 2,
      kind: 'conditional',
      scope: 'none',
      characterConditions: {
        universal: false,
        fallbackOther: false,
        selfOnly: false,
        types: [],
        classes: [],
        characterTags: [],
      },
      teamConditions: [
        {
          kind: 'crew-composition',
          minCount: 4,
          classes: ['Free Spirit'],
          rawClause: 'crew has 4+ Free Spirit characters',
        },
      ],
      fieldConditions: [],
      triggerConditions: [],
      clauses: ['reduces Special Use Limit duration by 10 turns'],
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

function createCharacter(
  overrides: Partial<CharacterDetailRecord> & {
    captainAbilityCoverage?: CharacterCaptainAbilityCoverage;
    characterTags?: string[];
    classes?: string[];
    id: number;
    type?: string;
  },
): CharacterDetailRecord {
  const classes = overrides.classes ?? ['Fighter'];
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
      captainAbility: null,
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
      builderAbilities: [],
      sailorAbilities: [],
      sailorNotes: null,
      potentialAbilities: [],
      supportData: [],
      swapData: null,
      vsSpecial: null,
      superType: null,
      superTandemData: null,
      superClass: null,
      captainShiftData: null,
      rumbleData: null,
    },
  } satisfies CharacterDetailRecord;
}
