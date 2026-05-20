import { describe, expect, it } from 'vitest';

import {
  buildCaptainAbilityCoverage,
  extractCoverageTiers,
  resolveCaptainAbilityScope,
  summarizeCaptainAbilityCoverageText,
} from './captain-ability-coverage.mjs';

describe('captain ability coverage scope metadata', () => {
  it('classifies crew-wide, subset, captain-only, and empty scope text', () => {
    expect(resolveCaptainAbilityScope('Boosts ATK of all characters by 5x.')).toBe(
      'crew-wide',
    );
    expect(resolveCaptainAbilityScope('Boosts ATK of [STR] and Fighter characters by 5x.')).toBe(
      'subset',
    );
    expect(resolveCaptainAbilityScope('Boosts ATK of this character by 12x.')).toBe(
      'captain-only',
    );
    expect(resolveCaptainAbilityScope('Reduces cooldown by 1 turn.')).toBe('none');
  });

  it('separates default and conditional scope categories', () => {
    expect(
      summarizeCaptainAbilityCoverageText(
        'Boosts ATK of this character by 5x. If your crew has 4+ [Straw Hat Pirates] characters, boosts ATK of all characters by 5.5x instead.',
      ),
    ).toMatchObject({
      firstCoverageScope: 'captain-only',
      secondCoverageScope: 'crew-wide',
      firstCoverageClauses: [],
      secondCoverageClauses: expect.arrayContaining([
        expect.stringContaining('boosts ATK of all characters by 5.5x'),
      ]),
    });
  });

  it('keeps both halves of a shared-multiplier ATK/HP captain clause in coverage', () => {
    const summary = summarizeCaptainAbilityCoverageText(
      'Boosts ATK of Slasher and Striker characters and boosts HP of Slasher and Striker characters by 1.2x',
    );

    expect(summary.firstCoverageScope).toBe('subset');
    expect(summary.firstCoverageClauses).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/boosts ATK of Slasher and Striker characters by 1\.2x/i),
        expect.stringMatching(/boosts HP of Slasher and Striker characters by 1\.2x/i),
      ]),
    );
  });

  it('splits tiered ATK boosts so first shows the fallback and second shows the subset top tier', () => {
    const summary = summarizeCaptainAbilityCoverageText(
      'Boosts ATK of Cost 70 or more characters by 6x, boosts ATK of all other characters by 4x, boosts HP of all characters by 1.5x. If this character is your Captain and performs EXCELLENT with their Action Special, for 3 turns boosts ATK of Cost 70 or more characters by 6.5x instead.',
    );

    expect(summary.firstCoverageScope).toBe('crew-wide');
    expect(summary.firstCoverageClauses).toEqual([
      expect.stringMatching(/boosts ATK of all other characters by 4x/i),
      expect.stringMatching(/boosts HP of all characters by 1\.5x/i),
    ]);
    expect(summary.secondCoverageScope).toBe('crew-wide');
    expect(summary.secondCoverageClauses).toEqual([
      expect.stringMatching(/boosts ATK of Cost 70 or more characters by 6x/i),
      expect.stringMatching(/boosts HP of all characters by 1\.5x/i),
    ]);
  });

  it('keeps non-tiered single-layer captain boosts identical in first and second', () => {
    const summary = summarizeCaptainAbilityCoverageText(
      'Boosts ATK of [DEX] characters by 5x and boosts HP of [DEX] characters by 1.2x.',
    );

    expect(summary.firstCoverageScope).toBe('subset');
    expect(summary.secondCoverageScope).toBe('subset');
    expect(summary.firstCoverageClauses).toEqual(summary.secondCoverageClauses);
  });

  it('adds scope fields to each generated captain coverage entry', () => {
    const result = buildCaptainAbilityCoverage([
      {
        key: 'base',
        label: 'Base Captain Ability',
        text: 'Boosts ATK of [DEX] characters by 5x.',
      },
    ]);
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0]).toMatchObject({
      key: 'base',
      label: 'Base Captain Ability',
      firstCoverageScope: 'subset',
      secondCoverageScope: 'subset',
      firstCoverageClauses: ['Boosts ATK of [DEX] characters by 5x'],
      secondCoverageClauses: ['Boosts ATK of [DEX] characters by 5x'],
    });
    expect(result.entries[0].tiers).toHaveLength(1);
    expect(result.entries[0].tiers[0]).toMatchObject({
      tier: 1,
      kind: 'baseline',
      scope: 'subset',
      characterConditions: expect.objectContaining({
        types: ['DEX'],
      }),
      atkBoost: 5,
    });
  });
});

describe('extractCoverageTiers', () => {
  it('returns single tier for simple single-layer captains', () => {
    const tiers = extractCoverageTiers('Boosts ATK of all characters by 1.5x');
    expect(tiers).toHaveLength(1);
    expect(tiers[0]).toMatchObject({
      tier: 1,
      kind: 'baseline',
      scope: 'crew-wide',
      characterConditions: expect.objectContaining({ universal: true }),
      atkBoost: 1.5,
    });
    expect(tiers[0].teamConditions).toEqual([]);
    expect(tiers[0].fieldConditions).toEqual([]);
    expect(tiers[0].triggerConditions).toEqual([]);
  });

  it('produces 3 tiers for Imu-style captain ability', () => {
    const tiers = extractCoverageTiers(
      'Boosts ATK of Cost 70 or more characters by 6x, boosts ATK of all other characters by 4x, boosts HP of all characters by 1.5x. If this character is your Captain and performs EXCELLENT with their Action Special, for 3 turns boosts ATK of Cost 70 or more characters by 6.5x instead.',
    );

    expect(tiers).toHaveLength(3);

    expect(tiers[0]).toMatchObject({
      tier: 1,
      kind: 'baseline',
      atkBoost: 4,
      hpBoost: 1.5,
      characterConditions: expect.objectContaining({ fallbackOther: true, universal: true }),
    });

    expect(tiers[1]).toMatchObject({
      tier: 2,
      kind: 'unconditional-top',
      atkBoost: 6,
      hpBoost: 1.5,
      characterConditions: expect.objectContaining({
        costRange: { min: 70 },
      }),
    });

    expect(tiers[2]).toMatchObject({
      tier: 3,
      kind: 'conditional',
      atkBoost: 6.5,
      characterConditions: expect.objectContaining({
        costRange: { min: 70 },
      }),
      triggerConditions: expect.arrayContaining([
        expect.objectContaining({ kind: 'action-special-excellent', durationTurns: 3 }),
      ]),
      teamConditions: expect.arrayContaining([
        expect.objectContaining({ kind: 'requires-captain' }),
      ]),
    });
  });

  it('captures team composition conditions on conditional tiers', () => {
    const tiers = extractCoverageTiers(
      'Boosts ATK of all characters by 1.5x. If your crew has 4+ Free Spirit characters, boosts ATK of Free Spirit characters by 3x instead.',
    );

    expect(tiers).toHaveLength(2);
    expect(tiers[1]).toMatchObject({
      tier: 2,
      kind: 'conditional',
      teamConditions: expect.arrayContaining([
        expect.objectContaining({
          kind: 'crew-composition',
          minCount: 4,
          classes: ['Free Spirit'],
        }),
      ]),
    });
  });

  it('captures field/territory conditions on conditional tiers', () => {
    const tiers = extractCoverageTiers(
      'Boosts ATK of all characters by 1.5x. If field has Territory: [QCK], boosts ATK of Free Spirit characters by 7x instead.',
    );

    const territoryTier = tiers.find((tier) => tier.fieldConditions.length > 0);
    expect(territoryTier).toBeDefined();
    expect(territoryTier?.fieldConditions[0]).toMatchObject({
      kind: 'territory',
      territories: ['QCK'],
    });
  });

  it('captures HP threshold triggers', () => {
    const tiers = extractCoverageTiers(
      'Boosts ATK of [STR] characters by 5x. If HP is below 50% at the start of the turn, boosts ATK of [STR] characters by 6x instead.',
    );

    expect(tiers).toHaveLength(2);
    expect(tiers[1]).toMatchObject({
      tier: 2,
      kind: 'conditional',
      atkBoost: 6,
      triggerConditions: expect.arrayContaining([
        expect.objectContaining({ kind: 'hp-below', hpPercent: 50 }),
      ]),
    });
  });

  it('renumbers tiers sequentially when default tier is absent', () => {
    const tiers = extractCoverageTiers(
      "If there's a [STR], [DEX], [QCK], [PSY] and [INT] character in your crew, boosts ATK of all characters by 2.25x and their HP by 1.5x.",
    );

    expect(tiers).toHaveLength(1);
    expect(tiers[0]).toMatchObject({
      tier: 1,
      kind: 'conditional',
      atkBoost: 2.25,
      hpBoost: 1.5,
    });
  });

  it('returns empty tiers for empty captain text', () => {
    expect(extractCoverageTiers('')).toEqual([]);
    expect(extractCoverageTiers(null)).toEqual([]);
    expect(extractCoverageTiers(undefined)).toEqual([]);
  });
});
