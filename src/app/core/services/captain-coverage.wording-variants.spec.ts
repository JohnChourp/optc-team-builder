import { describe, expect, it } from 'vitest';

import {
  type CharacterCaptainAbilityCoverageTier,
  type CharacterDetailRecord,
} from '../models/optc.models';
import { captainValueInRange } from '../grammar/captain-boost-grammar';
import { matchesCaptainCoverageTier } from './captain-coverage-filter.utils';
import { buildCaptainCoverageTierView } from './captain-coverage-tier-view.utils';
import { resolveCaptainCoverage } from './captain-coverage.utils';
import { normalizeCaptainAbilityCoverage } from './optc-repository.service';

/*
 * 1amndjnqk7g. The app reads a Captain's coverage from its text with the same wording rewrite the
 * build applies before it writes the tiers, so Captain Coverage now finds who these Captains
 * boost. The texts are the shipped ones (dataset v36).
 */
const ZORO_2096 =
  "Boosts Slasher and Driven character's ATK by 2.25x, by 2.5x after 2 consecutive PERFECTs, by 2.75x after 5 consecutive PERFECTs.";
const SUKIYAKI_4044 =
  'Boosts ATK of [QCK], Slasher, and Free Spirit characters 3.25x and reduces Bind duration by 1 turn.';
const VEGAPUNK_4261 =
  'Changes all orbs into [BOMB] orbs at the start of the fight, reduces Special Cooldown of all characters by 1 turn at the start of the fight, boosts ATK of all character by 4x, boosts HP of all character by 1.25x, makes [BOMB] and [S. BOMB] orbs beneficial for all characters, and restores Special Cooldown of all characters by 2 turns when they are rewinded.';
const NAMI_1366 =
  'Boosts RCV of Cerebral characters by 1.5x and their ATK by 1.5x, by 2.75x instead if they have a beneficial orb';
const SENGOKU_459 =
  'Reduces Special Cooldown of all characters by 2 turns at the start of the fight, boosts ATK of Cost 54 or 20 or less characters by 3x.';

describe('Captain Coverage reads the wording variants of a Captain boost', () => {
  it('finds the class a "character\'s ATK" Captain boosts (#2096)', () => {
    expect(matches(ZORO_2096, { classes: ['Slasher', 'Fighter'] })).toBe(true);
    expect(matches(ZORO_2096, { classes: ['Shooter', 'Cerebral'] })).toBe(false);
  });

  it('finds who a boost with no "by" covers (#4044)', () => {
    expect(matches(SUKIYAKI_4044, { type: 'QCK', classes: ['Shooter', 'Cerebral'] })).toBe(true);
    expect(matches(SUKIYAKI_4044, { type: 'STR', classes: ['Free Spirit', 'Cerebral'] })).toBe(true);
    expect(matches(SUKIYAKI_4044, { type: 'STR', classes: ['Shooter', 'Cerebral'] })).toBe(false);
  });

  it('reads "all character" as everyone (#4261)', () => {
    expect(matches(VEGAPUNK_4261, { type: 'INT', classes: ['Shooter', 'Cerebral'] })).toBe(true);
  });

  it('finds the class an ATK-after-RCV Captain boosts (#1366)', () => {
    expect(matches(NAMI_1366, { classes: ['Cerebral', 'Striker'] })).toBe(true);
    expect(matches(NAMI_1366, { classes: ['Shooter', 'Fighter'] })).toBe(false);
  });

  it('boosts cost 54 and cost 20 or less, not the costs between (#459)', () => {
    expect(matches(SENGOKU_459, { cost: 54 })).toBe(true);
    expect(matches(SENGOKU_459, { cost: 20 })).toBe(true);
    expect(matches(SENGOKU_459, { cost: 21 })).toBe(false);
    expect(matches(SENGOKU_459, { cost: 53 })).toBe(false);
    expect(matches(SENGOKU_459, { cost: 55 })).toBe(false);
  });
});

describe('a tier scoped to "Cost 54 or 20 or less"', () => {
  const tier = loadedTier({ max: 20, orValues: [54] });

  it('keeps the exact cost when the dataset is read', () => {
    expect(tier.characterConditions.costRange).toEqual({ max: 20, orValues: [54] });
  });

  it('admits cost 54 and cost 20 or less', () => {
    expect(matchesCaptainCoverageTier(tier, target({ cost: 54 }), [tier])).toBe(true);
    expect(matchesCaptainCoverageTier(tier, target({ cost: 20 }), [tier])).toBe(true);
    expect(matchesCaptainCoverageTier(tier, target({ cost: 21 }), [tier])).toBe(false);
  });

  it('names both in its scope label', () => {
    const view = buildCaptainCoverageTierView(tier);
    expect(view.scopeLabel).toBe('Cost ≤ 20 · or Cost 54');
    expect(view.scopeLabelTokens).toEqual([
      { key: 'captainTiers.scope.costMax', params: { max: 20 } },
      { key: 'captainTiers.scope.costOrValues', params: { values: '54' } },
    ]);
  });

  it('leaves a plain range as it was', () => {
    expect(captainValueInRange(54, { max: 20 })).toBe(false);
    expect(captainValueInRange(54, { max: 20, orValues: [54] })).toBe(true);
    expect(loadedTier({ max: 20 }).characterConditions.costRange).toEqual({ max: 20 });
  });
});

interface TargetShape {
  captainAbility?: string;
  classes?: string[];
  cost?: number;
  type?: string;
}

function matches(captainAbility: string, shape: TargetShape): boolean {
  return resolveCaptainCoverage(target({ captainAbility }, 1), target(shape, 2), {
    coverageMode: 'simpleBoostScope',
  }).matches;
}

function loadedTier(costRange: Record<string, unknown>): CharacterCaptainAbilityCoverageTier {
  const coverage = normalizeCaptainAbilityCoverage({
    entries: [
      {
        key: 'captain',
        label: 'Captain Ability',
        tiers: [
          {
            tier: 1,
            kind: 'baseline',
            scope: 'subset',
            characterConditions: {
              universal: false,
              fallbackOther: false,
              selfOnly: false,
              types: [],
              classes: [],
              characterTags: [],
              costRange,
            },
            teamConditions: [],
            fieldConditions: [],
            triggerConditions: [],
            clauses: ['boosts ATK of Cost 54 or 20 or less characters by 3x'],
            atkBoost: 3,
          },
        ],
      },
    ],
  });
  const loaded = coverage?.entries[0]?.tiers[0];
  if (!loaded) {
    throw new Error('the tier did not load');
  }
  return loaded;
}

function target(shape: TargetShape, id = 2): CharacterDetailRecord {
  const classes = shape.classes ?? ['Shooter', 'Cerebral'];

  return {
    id,
    name: `Character ${id}`,
    searchText: '',
    isIncomplete: false,
    type: shape.type ?? 'QCK',
    classes,
    primaryClass: classes[0] ?? 'Shooter',
    secondaryClass: classes[1] ?? null,
    stars: 5,
    cost: shape.cost ?? 30,
    combo: 4,
    captainHpBoost: 0,
    captainAtkBoost: 0,
    captainAverageBoost: 0,
    stats: {
      min: { hp: null, atk: null, rcv: null },
      max: { hp: null, atk: null, rcv: null },
      growth: null,
    },
    regionArtwork: { exactLocal: false, thumbnailGlobal: false, thumbnailJapan: false },
    regionRelease: { availableOnGlobal: null },
    assets: { exactLocal: null, thumbnailGlobal: null, thumbnailJapan: null },
    imageUrl: 'assets/placeholders/character-card.svg',
    detailImageUrl: 'assets/placeholders/character-card.svg',
    detail: {
      characterId: id,
      captainAbility: shape.captainAbility ?? null,
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
      potentialAbilities: [],
      supportData: [],
      swapData: null,
      vsSpecial: null,
      superType: null,
      superClass: null,
      rumbleData: null,
    },
  } satisfies CharacterDetailRecord;
}
