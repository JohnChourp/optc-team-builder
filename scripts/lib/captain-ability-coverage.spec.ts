import { describe, expect, it } from 'vitest';

import {
  buildCaptainAbilityCoverage,
  extractCoverageTiers,
} from './captain-ability-coverage.mjs';

describe('buildCaptainAbilityCoverage', () => {
  it('emits tier-only entries for each provided captain variant', () => {
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
    });
    expect(result.entries[0]).not.toHaveProperty('firstCoverageScope');
    expect(result.entries[0]).not.toHaveProperty('secondCoverageScope');
    expect(result.entries[0]).not.toHaveProperty('firstCoverageClauses');
    expect(result.entries[0]).not.toHaveProperty('secondCoverageClauses');
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
  it('strips "but boosts ATK of this character" self-override rider so the crew clause surfaces', () => {
    const tiers = extractCoverageTiers(
      'Boosts ATK of [STR], [DEX] and [QCK] characters by 2.5x, but boosts ATK of this character by 4x',
    );
    expect(tiers).toHaveLength(1);
    expect(tiers[0]).toMatchObject({
      tier: 1,
      kind: 'baseline',
      scope: 'subset',
      atkBoost: 2.5,
      characterConditions: expect.objectContaining({
        types: expect.arrayContaining(['STR', 'DEX', 'QCK']),
      }),
    });
    expect(tiers[0].clauses[0]).not.toMatch(/this character/i);
  });

  it('matches plural class names in coverage clause ("Strikers characters")', () => {
    const tiers = extractCoverageTiers(
      'Boosts ATK of Strikers characters by 2.5x if HP is below 30% at the start of the turn',
    );
    expect(tiers.length).toBeGreaterThanOrEqual(1);
    const allClasses = tiers.flatMap((t) => t.characterConditions.classes);
    expect(allClasses).toContain('Striker');
  });

  it('captures exact-cost subset (Cost N characters, no qualifier)', () => {
    const tiers = extractCoverageTiers('Boosts ATK of Cost 40 characters by 2.5x');
    expect(tiers).toHaveLength(1);
    expect(tiers[0]).toMatchObject({
      tier: 1,
      kind: 'baseline',
      scope: 'subset',
      atkBoost: 2.5,
      characterConditions: expect.objectContaining({
        costRange: { min: 40, max: 40 },
      }),
    });
  });

  it('captures cost minimum with "or higher" phrasing', () => {
    const tiers = extractCoverageTiers(
      'Boosts ATK of Cost 50 or higher characters by 3x and their HP and RCV by 1.1x',
    );
    expect(tiers).toHaveLength(1);
    expect(tiers[0].characterConditions.costRange).toEqual({ min: 50 });
    expect(tiers[0].atkBoost).toBe(3);
  });

  it('splits tiered-rarity captains into one tier per rarity level', () => {
    const tiers = extractCoverageTiers(
      'Boosts ATK of Rarity 4 or 4+ characters by 1.75x, boosts ATK of Rarity 5 or 5+ characters by 2x and boosts ATK of Rarity 6 or 6+ characters by 2.25x',
    );
    expect(tiers).toHaveLength(3);
    const byRarity = new Map(
      tiers.map((t) => [t.characterConditions.rarityRange?.min, t]),
    );
    expect(byRarity.get(4)?.atkBoost).toBe(1.75);
    expect(byRarity.get(5)?.atkBoost).toBe(2);
    expect(byRarity.get(6)?.atkBoost).toBe(2.25);
    expect(byRarity.get(4)?.characterConditions.rarityRange).toEqual({ min: 4, max: 4 });
    expect(byRarity.get(5)?.characterConditions.rarityRange).toEqual({ min: 5, max: 5 });
    expect(byRarity.get(6)?.characterConditions.rarityRange).toEqual({ min: 6, max: 6 });
  });

  it('captures orb-chance bias ("Boosts chances of getting [X] orbs") as a tier effect', () => {
    const tiers = extractCoverageTiers('Boosts chances of getting [RCV] orbs');
    expect(tiers).toHaveLength(1);
    expect(tiers[0]).toMatchObject({
      tier: 1,
      kind: 'baseline',
    });
    expect(tiers[0].clauses).toEqual(
      expect.arrayContaining([expect.stringMatching(/chances of getting/i)]),
    );
  });

  it('captures defeat-protection ("Protects from defeat as long as HP is above N%") as a tier effect', () => {
    const tiers = extractCoverageTiers('Protects from defeat as long as HP is above 50%');
    expect(tiers).toHaveLength(1);
    expect(tiers[0]).toMatchObject({
      tier: 1,
      kind: 'baseline',
    });
    expect(tiers[0].clauses).toEqual(
      expect.arrayContaining([expect.stringMatching(/Protects from defeat/i)]),
    );
  });

  it('captures Chain Multiplier Growth Rate as a baseline tier effect', () => {
    const tiers = extractCoverageTiers('Boosts Chain Multiplier Growth Rate by 4x');
    expect(tiers).toHaveLength(1);
    expect(tiers[0]).toMatchObject({
      tier: 1,
      kind: 'baseline',
    });
    expect(tiers[0].clauses).toEqual(
      expect.arrayContaining([expect.stringMatching(/Chain\s+Multiplier\s+Growth\s+Rate/i)]),
    );
  });

  it('captures rarity-max subset scope (Rarity N or less characters)', () => {
    const tiers = extractCoverageTiers('Boosts ATK of Rarity 2 or less characters by 2.5x');
    expect(tiers).toHaveLength(1);
    expect(tiers[0]).toMatchObject({
      tier: 1,
      kind: 'baseline',
      scope: 'subset',
      atkBoost: 2.5,
      characterConditions: expect.objectContaining({
        rarityRange: { max: 2 },
      }),
    });
  });

  it('captures cost-range subset scope (Cost A-B characters)', () => {
    const tiers = extractCoverageTiers('Boosts ATK of Cost 50-55 characters by 2x');
    expect(tiers).toHaveLength(1);
    expect(tiers[0]).toMatchObject({
      tier: 1,
      kind: 'baseline',
      scope: 'subset',
      atkBoost: 2,
      characterConditions: expect.objectContaining({
        costRange: { min: 50, max: 55 },
      }),
    });
  });

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

  it('routes default non-boost extras per tier scope (Imu-style fallback + subset)', () => {
    const tiers = extractCoverageTiers(
      'Launches the following effect at start of fight: reduces Special Cooldown of Cost 70 or more characters by 34% of Max Cooldown (rounded down), reduces VS Gauge of all characters by 3. Boosts ATK of Cost 70 or more characters by 6x, boosts ATK of all other characters by 4x, boosts HP of all characters by 1.5x.',
    );

    expect(tiers).toHaveLength(2);

    // Tier 1 (baseline, "all other") should NOT include the SCD Cost 70+ extra — those targets
    // don't receive that effect.
    expect(tiers[0]?.clauses.some((c) => /Special Cooldown of Cost 70/i.test(c))).toBe(false);
    // The crew-wide VS Gauge clause does attach.
    expect(tiers[0]?.clauses.some((c) => /VS Gauge of all characters/i.test(c))).toBe(true);

    // Tier 2 (subset Cost 70+) DOES include the SCD Cost 70+ extra (scope overlap).
    expect(tiers[1]?.clauses.some((c) => /Special Cooldown of Cost 70/i.test(c))).toBe(true);
    expect(tiers[1]?.clauses.some((c) => /VS Gauge of all characters/i.test(c))).toBe(true);
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

  it('drops HP-dependent variable damage reduction clauses from the tier (Coby #5055)', () => {
    const tiers = extractCoverageTiers(
      "Boosts ATK of Fighter characters by 2x, reduces damage received by 0%-30% depending on the crew's current HP",
    );

    expect(tiers).toHaveLength(1);
    expect(tiers[0]).toMatchObject({
      tier: 1,
      kind: 'baseline',
      atkBoost: 2,
      characterConditions: expect.objectContaining({
        classes: ['Fighter'],
      }),
    });
    expect(tiers[0]?.clauses).toEqual(['Boosts ATK of Fighter characters by 2x']);
    expect(
      tiers[0]?.clauses.some((clause) => /depending on the crew/i.test(clause)),
    ).toBe(false);
  });

  it('keeps flat damage reduction clauses (no HP dependency) on the tier', () => {
    const tiers = extractCoverageTiers(
      'Boosts ATK of [STR] characters by 2x and reduces damage received by 20%',
    );

    expect(tiers).toHaveLength(1);
    expect(tiers[0]?.clauses).toEqual(
      expect.arrayContaining([expect.stringMatching(/reduces damage received by 20%/i)]),
    );
  });

  it('produces a tier for utility-only captains (SCD/Super Tandem in default branch, no ATK/HP)', () => {
    const tiers = extractCoverageTiers(
      'Reduces Special Cooldown of [Blackbeard Pirates], [Four Emperors] and [Worst Generation] characters by 5 turns, reduces Special Cooldown of [QCK] and Free Spirit characters by 2 turns, and reduces VS Gauge and Switch Effect of [QCK] and Free Spirit characters by 2.',
    );
    expect(tiers).toHaveLength(1);
    expect(tiers[0]).toMatchObject({
      tier: 1,
      kind: 'baseline',
      characterConditions: expect.objectContaining({
        types: expect.arrayContaining(['QCK']),
        classes: expect.arrayContaining(['Free Spirit']),
        characterTags: expect.arrayContaining([
          'Blackbeard Pirates',
          'Four Emperors',
          'Worst Generation',
        ]),
      }),
    });
    expect(tiers[0].clauses).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/reduces Special Cooldown of \[Blackbeard Pirates\]/i),
        expect.stringMatching(/reduces Special Cooldown of \[QCK\] and Free Spirit/i),
      ]),
    );
  });

  it('produces branch-state tiers for "Powered Up Captain:" / "Gear N Captain:" labels', () => {
    const tiers = extractCoverageTiers(
      'Always Active: Boosts HP of [STR], [DEX] and [QCK] characters by 1.2x. Standard Captain: Boosts ATK of [STR], [DEX] and [QCK] characters by 3.5x. Powered Up Captain: Boosts ATK of [STR], [DEX] and [QCK] characters by 4x and reduces damage received by 15%. Rampage Captain: Boosts ATK of this character by 10x.',
    );

    // Tier 1 = default Always Active + Standard Captain
    expect(tiers[0]).toMatchObject({ tier: 1, kind: 'baseline', atkBoost: 3.5, hpBoost: 1.2 });

    // Powered Up Captain emerges as a branch-state tier
    const poweredUp = tiers.find((tier) =>
      tier.triggerConditions.some(
        (trigger) => trigger.kind === 'captain-branch-state' && /Powered Up/i.test(trigger.branchLabel ?? ''),
      ),
    );
    expect(poweredUp).toBeDefined();
    expect(poweredUp).toMatchObject({
      atkBoost: 4,
      characterConditions: expect.objectContaining({
        types: expect.arrayContaining(['STR', 'DEX', 'QCK']),
      }),
    });

    // Rampage Captain is self-only with no scoped boost → no tier emitted
    expect(
      tiers.some((tier) =>
        tier.triggerConditions.some(
          (trigger) => trigger.kind === 'captain-branch-state' && /Rampage/i.test(trigger.branchLabel ?? ''),
        ),
      ),
    ).toBe(false);
  });

  it('captures consecutive-PERFECTs trigger from "Gear 3 Captain:" branch', () => {
    const tiers = extractCoverageTiers(
      'Always Active: Boosts HP of all characters by 1.25x. Gear 2 Captain: Boosts ATK of all characters by 3x. Gear 3 Captain: Boosts ATK of all characters by 3.5x after 2 consecutive PERFECTs.',
    );
    const gear3 = tiers.find((tier) =>
      tier.triggerConditions.some(
        (trigger) => trigger.kind === 'captain-branch-state' && /Gear 3/i.test(trigger.branchLabel ?? ''),
      ),
    );
    expect(gear3).toBeDefined();
    expect(gear3?.triggerConditions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'captain-branch-state' }),
        expect.objectContaining({ kind: 'consecutive-perfects', perfectStreak: 2 }),
      ]),
    );
    expect(gear3?.atkBoost).toBe(3.5);
  });

  it('captures conditional non-boost tier (e.g. "If crew has 4+ FS, reduces Special Use Limit -10")', () => {
    const tiers = extractCoverageTiers(
      'Boosts ATK of all characters by 1.5x. If your crew has 4+ Free Spirit characters, reduces Special Use Limit duration by 10 turns.',
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
    expect(tiers[1].clauses[0]).toMatch(/reduces Special Use Limit duration by 10 turns/i);
  });

  it('captures negative crew presence ("there are no [X] or [Y]") team conditions', () => {
    const tiers = extractCoverageTiers(
      'Boosts ATK of [STR] characters by 3x. If there are no [PSY] or [INT] characters on your crew, boosts ATK of [STR] characters by 4x instead.',
    );
    expect(tiers).toHaveLength(2);
    expect(tiers[1]).toMatchObject({
      tier: 2,
      kind: 'conditional',
      atkBoost: 4,
      teamConditions: expect.arrayContaining([
        expect.objectContaining({
          kind: 'crew-exclusion',
          types: expect.arrayContaining(['PSY', 'INT']),
        }),
      ]),
    });
  });

  it('captures rainbow ("there is a [STR], [DEX]...") team conditions on conditional tiers', () => {
    const tiers = extractCoverageTiers(
      "If there's a [STR], [DEX], [QCK], [PSY] and [INT] character in your crew, boosts ATK of all characters by 2.25x and their HP by 1.5x",
    );
    expect(tiers).toHaveLength(1);
    expect(tiers[0]?.teamConditions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'crew-composition',
          minCount: 5,
          types: ['DEX', 'STR', 'QCK', 'PSY', 'INT'],
        }),
      ]),
    );
  });

  it('captures alt-phrasing ("you have N or more X") crew counts', () => {
    const tiers = extractCoverageTiers(
      'If you have 5 or more Slasher characters in your crew, boosts ATK of Slasher characters by 2.5x and their HP by 1.5x',
    );
    expect(tiers).toHaveLength(1);
    expect(tiers[0]?.teamConditions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'crew-composition',
          minCount: 5,
          classes: ['Slasher'],
        }),
      ]),
    );
  });

  it('merges default universal HP into the universal-scope conditional ATK tier as baseline-and-conditional (Roger #4573)', () => {
    const captainAbility =
      'Boosts HP of all characters by 1.25x, and makes badly matching orbs beneficial for all characters. If you have 6 [PSY] characters or there is a [STR], [DEX], [QCK], [PSY] and [INT] character in your crew, boosts ATK of all characters by 5.25x, and reduces Bind duration by 6 turns.';
    const tiers = extractCoverageTiers(captainAbility);

    expect(tiers).toHaveLength(1);
    expect(tiers[0]).toMatchObject({
      tier: 1,
      kind: 'baseline-and-conditional',
      scope: 'crew-wide',
      atkBoost: 5.25,
      hpBoost: 1.25,
      characterConditions: expect.objectContaining({
        universal: true,
        fallbackOther: false,
      }),
      teamConditions: expect.arrayContaining([
        expect.objectContaining({
          kind: 'crew-composition',
          minCount: 5,
          types: ['DEX', 'STR', 'QCK', 'PSY', 'INT'],
        }),
      ]),
      baselineClauses: [
        'Boosts HP of all characters by 1.25x',
        'and makes badly matching orbs beneficial for all characters',
      ],
      conditionalClauses: [
        'boosts ATK of all characters by 5.25x',
        'and reduces Bind duration by 6 turns',
      ],
    });
  });

  it('models Dominant Type ATK as a same-type team coverage and keeps shared HP in that tier', () => {
    const captainAbility =
      'Boosts HP of all characters by 1.25x, makes badly matching orbs beneficial for all characters, and reduces Despair duration by 6 turns. If your crew has 4+ characters of the same Type, boosts ATK of the Dominant Type characters by 4.5x.';
    const tiers = extractCoverageTiers(captainAbility);

    expect(tiers).toHaveLength(1);
    expect(tiers[0]).toMatchObject({
      tier: 1,
      kind: 'conditional',
      atkBoost: 4.5,
      hpBoost: 1.25,
      characterConditions: expect.objectContaining({
        dominantType: true,
      }),
      teamConditions: [
        expect.objectContaining({
          kind: 'crew-composition',
          minCount: 4,
          sameType: true,
        }),
      ],
      clauses: [
        'boosts ATK of the Dominant Type characters by 4.5x',
        'Boosts HP of all characters by 1.25x',
      ],
    });
  });

  it('keeps same-type all-character boosts as team-gated crew-wide coverage', () => {
    const tiers = extractCoverageTiers(
      'If your crew has 4 or more characters of the same Type, boosts ATK of all characters by 3.5x, by 2.75x otherwise and boosts HP of all characters by 1.3x.',
    );

    expect(tiers).toHaveLength(1);
    expect(tiers[0]).toMatchObject({
      tier: 1,
      scope: 'crew-wide',
      characterConditions: expect.objectContaining({
        universal: true,
      }),
      teamConditions: [
        expect.objectContaining({
          minCount: 4,
          sameType: true,
        }),
      ],
    });
    expect(tiers[0]?.characterConditions.dominantType).not.toBe(true);
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

  it('drops trigger-only tiers gated solely by "defeated an enemy last turn"', () => {
    const tiers = extractCoverageTiers(
      'If you have 5 or more Slashers characters in your crew, boosts ATK of Slasher characters by 2.5x and their HP by 1.5x. If you defeated an enemy last turn, boosts ATK of Slasher characters by 3x instead and boosts ATK of all other characters by 1.2x',
    );

    expect(tiers).toHaveLength(1);
    expect(tiers[0]).toMatchObject({
      tier: 1,
      kind: 'conditional',
      teamConditions: expect.arrayContaining([
        expect.objectContaining({
          kind: 'crew-composition',
          minCount: 5,
          classes: ['Slasher'],
        }),
      ]),
    });
    expect(tiers[0].triggerConditions).toEqual([]);
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
