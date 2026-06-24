import { describe, expect, it } from 'vitest';

import { type CharacterDetailRecord } from '../models/optc.models';
import {
  resolveCaptainBoostScope,
  resolveCaptainCoverageBranchDisplay,
  resolveCaptainCoverage,
} from './captain-coverage.utils';

describe('resolveCaptainCoverage', () => {
  const kidAimedDamnedPunkCaptainAbility =
    'Reduces Special Cooldown of all characters by 1 turn and reduces Special Cooldown of this character by 4 turns at the start of the fight, boosts ATK of [STR], Striker and Driven characters by 5x, boosts HP of [STR], Striker and Driven characters by 1.3x, and makes [STR] and [INT] orbs beneficial for all characters. If HP is below 50% at the start of the turn, boosts ATK of [STR], Striker and Driven characters by 6x instead, and reduces damage received by 25%. If your crew has 4+ [Kid Pirates], [Worst Generation] or [Land of Wano Arc] characters or your crew has 6 [Kid Pirates], [Worst Generation] or [Egghead Arc] characters, reduces Despair duration by 10 turns, and boosts base ATK of [Paramythia-type] characters by 500.';
  const zoroVsLucciCharacter1CaptainAbility =
    "Reduces Switch Effect of all characters by 3 and reduces VS Gauge of all characters by 6 at the start of the fight, changes all orbs into [TND] orbs at the start of the fight, boosts ATK of [INT], Slasher and Free Spirit characters by 5.5x, by 6x instead after the 3rd PERFECTs in a row, boosts ATK of all other characters by 3.5x, boosts HP of [INT], Slasher and Free Spirit characters by 1.35x, and makes [INT] and [TND] orbs beneficial for all characters. If crew uses a special to reduce enemies' Increased Defense, reduces the duration by 2 additional turns.";
  const zoroVsLucciCharacter2CaptainAbility =
    "Reduces Switch Effect of all characters by 3 and reduces VS Gauge of all characters by 6 at the start of the fight, changes all orbs into [RCV] orbs at the start of the fight, boosts ATK of [STR], Driven and Cerebral characters by 5.5x, by 6x instead after the 3rd PERFECTs in a row, boosts ATK of all other characters by 3.5x, boosts HP of [STR], Driven and Cerebral characters by 1.35x, and makes [STR] and [RCV] orbs beneficial for all characters. If crew uses a special to reduce enemies' Threshold Damage Reduction, reduces the duration by 2 additional turns.";
  const blackbeardEmperorCaptainAbility =
    'Launches the following effect at start of fight: reduces Special Cooldown of [Blackbeard Pirates], [Four Emperors] and [Worst Generation] characters by 5 turns, reduces Special Cooldown of [QCK] and Free Spirit characters by 2 turns. Boosts ATK of [QCK] and Free Spirit characters by 6x, boosts HP of [QCK] and Free Spirit characters by 1.3x. If your crew has 6+ Free Spirit characters and field has Territory: [QCK], boosts ATK of Free Spirit characters by 7x instead.';

  it('treats all-character captain clauses as universal coverage', () => {
    const captain = createCharacter({
      id: 1001,
      captainAbility: 'Boosts ATK of all characters by 5x and boosts HP of crew by 1.3x.',
    });
    const target = createCharacter({ id: 2001, type: 'INT', classes: ['Shooter', 'Driven'] });

    const coverage = resolveCaptainCoverage(captain, target);

    expect(coverage.matches).toBe(true);
    expect(coverage.boosts).toEqual({
      hp: 1.3,
      atk: 5,
    });
    expect(coverage.chips).toEqual([]);
  });

  it('matches type and class scoped captain boost clauses without cost coverage', () => {
    const captain = createCharacter({
      id: 1002,
      captainAbility:
        'Boosts ATK of [DEX] characters by 5x, boosts HP of Fighter characters by 1.4x and makes orbs beneficial for Cost 40 or less characters.',
    });
    const target = createCharacter({
      id: 2002,
      type: 'DEX',
      classes: ['Fighter', 'Powerhouse'],
      cost: 30,
    });

    const coverage = resolveCaptainCoverage(captain, target);

    expect(coverage.matches).toBe(true);
    expect(coverage.boosts).toEqual({
      hp: 1.4,
      atk: 5,
    });
    expect(coverage.chips).toEqual(
      expect.arrayContaining([
        {
          kind: 'type',
          label: 'DEX',
        },
        {
          kind: 'class',
          label: 'Fighter',
        },
      ]),
    );
  });

  it('requires every target type token to fit a type-only captain boost scope', () => {
    const captain = createCharacter({
      id: 4306,
      captainAbility:
        'Boosts ATK of [STR] and [DEX] characters by 5x, boosts HP of [STR] and [DEX] characters by 2x.',
    });

    const dexCoverage = resolveCaptainCoverage(captain, createCharacter({ id: 4307, type: 'DEX' }));
    const strCoverage = resolveCaptainCoverage(captain, createCharacter({ id: 4308, type: 'STR' }));
    const strDexCoverage = resolveCaptainCoverage(
      captain,
      createCharacter({ id: 4309, type: 'STR,DEX' }),
    );
    const dexQckCoverage = resolveCaptainCoverage(
      captain,
      createCharacter({ id: 4310, type: 'DEX,QCK' }),
    );
    const qckDexCoverage = resolveCaptainCoverage(
      captain,
      createCharacter({ id: 4311, type: 'QCK,DEX' }),
    );
    const psyDexCoverage = resolveCaptainCoverage(
      captain,
      createCharacter({ id: 4312, type: 'PSY,DEX' }),
    );

    expect(dexCoverage.matches).toBe(true);
    expect(strCoverage.matches).toBe(true);
    expect(strDexCoverage.matches).toBe(true);
    expect(dexQckCoverage.matches).toBe(false);
    expect(qckDexCoverage.matches).toBe(false);
    expect(psyDexCoverage.matches).toBe(false);
    expect(dexQckCoverage.boosts).toEqual({ hp: 0, atk: 0 });
  });

  it('allows simple boost scope targets to match one sibling scoped boost clause', () => {
    const captain = createCharacter({
      id: 4316,
      captainAbility:
        'Boosts ATK of [PSY] characters by 2.75x and boosts ATK of [DEX] characters by 2x.',
    });
    const psyCoverage = resolveCaptainCoverage(
      captain,
      createCharacter({ id: 4317, type: 'PSY' }),
      {
        coverageMode: 'simpleBoostScope',
      },
    );
    const dexCoverage = resolveCaptainCoverage(
      captain,
      createCharacter({ id: 4318, type: 'DEX' }),
      {
        coverageMode: 'simpleBoostScope',
      },
    );
    const qckCoverage = resolveCaptainCoverage(
      captain,
      createCharacter({ id: 4319, type: 'QCK' }),
      {
        coverageMode: 'simpleBoostScope',
      },
    );

    expect(psyCoverage.matches).toBe(true);
    expect(dexCoverage.matches).toBe(true);
    expect(qckCoverage.matches).toBe(false);
  });

  it('allows simple boost scope fallback-other targets to match all-other clauses', () => {
    const captain = createCharacter({
      id: 4320,
      captainAbility:
        'Boosts ATK of Fighter characters by 2.5x. If you defeated an enemy in the last turn, boosts ATK of Fighter characters by 3x instead and boosts ATK of all other characters by 1.2x.',
    });
    const fighterCoverage = resolveCaptainCoverage(
      captain,
      createCharacter({ id: 4321, type: 'INT', classes: ['Fighter'] }),
      { coverageMode: 'simpleBoostScope' },
    );
    const boosterCoverage = resolveCaptainCoverage(
      captain,
      createCharacter({ id: 4322, type: 'INT', classes: ['Booster'] }),
      { coverageMode: 'simpleBoostScope' },
    );

    expect(fighterCoverage.matches).toBe(true);
    expect(boosterCoverage.matches).toBe(true);
  });

  it('allows simple boost scope targets to match one non-VS dual ATK-only branch', () => {
    const character1Text = 'Boosts ATK of [PSY] characters by 2x.';
    const character2Text = 'Boosts ATK of [QCK] characters by 2x.';
    const captain = createCharacter({
      id: 4323,
      captainAbility: character1Text,
      captainAbilityVariants: [
        { key: 'character1', label: 'Captain Ability (Character 1)', text: character1Text },
        { key: 'character2', label: 'Captain Ability (Character 2)', text: character2Text },
        {
          key: 'combined',
          label: 'Captain Ability (Combined)',
          text: 'Boosts ATK of [QCK], [PSY] and [INT] characters by 2.5x.',
        },
      ],
    });
    const psyTarget = createCharacter({ id: 4324, type: 'PSY' });
    const qckTarget = createCharacter({ id: 4325, type: 'QCK' });
    const dexTarget = createCharacter({ id: 4326, type: 'DEX' });

    expect(resolveCaptainCoverage(captain, psyTarget).matches).toBe(false);
    expect(
      resolveCaptainCoverage(captain, psyTarget, { coverageMode: 'simpleBoostScope' }).matches,
    ).toBe(true);
    expect(
      resolveCaptainCoverage(captain, qckTarget, { coverageMode: 'simpleBoostScope' }).matches,
    ).toBe(true);
    expect(
      resolveCaptainCoverage(captain, dexTarget, { coverageMode: 'simpleBoostScope' }).matches,
    ).toBe(false);
  });

  it('uses a restricted combined non-VS dual branch for simple boost scope coverage', () => {
    const character1Text = 'Boosts ATK of [PSY] characters by 2.75x and HP by 1.25x.';
    const character2Text = 'Boosts ATK of [INT] characters by 2.75x and HP by 1.25x.';
    const combinedText = 'Boosts ATK of [PSY] and [INT] characters by 3.75x and HP by 1.25x.';
    const captain = createCharacter({
      id: 4327,
      captainAbility: character1Text,
      captainAbilityVariants: [
        { key: 'character1', label: 'Captain Ability (Character 1)', text: character1Text },
        { key: 'character2', label: 'Captain Ability (Character 2)', text: character2Text },
        { key: 'combined', label: 'Captain Ability (Combined)', text: combinedText },
      ],
    });
    const psyTarget = createCharacter({ id: 4328, type: 'PSY' });
    const intTarget = createCharacter({ id: 4329, type: 'INT' });
    const dexTarget = createCharacter({ id: 4330, type: 'DEX' });

    expect(resolveCaptainCoverage(captain, psyTarget).matches).toBe(false);
    expect(
      resolveCaptainCoverage(captain, psyTarget, { coverageMode: 'simpleBoostScope' }).matches,
    ).toBe(true);
    expect(
      resolveCaptainCoverage(captain, intTarget, { coverageMode: 'simpleBoostScope' }).matches,
    ).toBe(true);
    expect(
      resolveCaptainCoverage(captain, dexTarget, { coverageMode: 'simpleBoostScope' }).matches,
    ).toBe(false);
    expect(
      resolveCaptainCoverage(captain, intTarget, { coverageMode: 'simpleBoostScope' }).captainText,
    ).toBe(combinedText);
  });

  it('allows class coverage to cover a mixed-type target independently of strict type scope', () => {
    const captain = createCharacter({
      id: 4313,
      captainAbility:
        'Boosts ATK of [DEX], Fighter and Powerhouse characters by 5x and boosts HP of [DEX], Fighter and Powerhouse characters by 1.3x.',
    });
    const mixedFighter = createCharacter({
      id: 4314,
      type: 'DEX,QCK',
      classes: ['Fighter', 'Cerebral'],
    });
    const mixedShooter = createCharacter({
      id: 4315,
      type: 'DEX,QCK',
      classes: ['Shooter', 'Cerebral'],
    });

    const fighterCoverage = resolveCaptainCoverage(captain, mixedFighter);
    const shooterCoverage = resolveCaptainCoverage(captain, mixedShooter);

    expect(fighterCoverage.matches).toBe(true);
    expect(fighterCoverage.chips).toEqual([{ kind: 'class', label: 'Fighter' }]);
    expect(shooterCoverage.matches).toBe(false);
  });

  it('matches direct character tag boost targets', () => {
    const captain = createCharacter({
      id: 1009,
      captainAbility:
        'Boosts ATK of [Straw Hat Pirates] and [Egghead Arc] characters by 5x and HP by 1.3x.',
    });
    const taggedTarget = createCharacter({
      id: 2009,
      type: 'QCK',
      classes: ['Shooter', 'Driven'],
      characterTags: ['Egghead Arc'],
    });
    const untaggedTarget = createCharacter({
      id: 2010,
      type: 'QCK',
      classes: ['Shooter', 'Driven'],
      characterTags: ['Kid Pirates'],
    });

    const taggedCoverage = resolveCaptainCoverage(captain, taggedTarget);
    const untaggedCoverage = resolveCaptainCoverage(captain, untaggedTarget);

    expect(resolveCaptainBoostScope(captain.detail.captainAbility).allowedCharacterTags).toEqual([
      'Straw Hat Pirates',
      'Egghead Arc',
    ]);
    expect(taggedCoverage.matches).toBe(true);
    expect(taggedCoverage.chips).toEqual([{ kind: 'tag', label: 'Egghead Arc' }]);
    expect(untaggedCoverage.matches).toBe(false);
  });

  it('keeps scoped captain boosts at zero when the target does not match', () => {
    const captain = createCharacter({
      id: 1006,
      captainAbility: 'Boosts ATK of [DEX] characters by 5x and HP by 1.2x.',
    });
    const target = createCharacter({ id: 2006, type: 'STR', classes: ['Shooter', 'Driven'] });

    const coverage = resolveCaptainCoverage(captain, target);

    expect(coverage.matches).toBe(false);
    expect(coverage.boosts).toEqual({
      hp: 0,
      atk: 0,
    });
  });

  it('extracts ATK and HP from a combined matching boost clause', () => {
    const captain = createCharacter({
      id: 1007,
      captainAbility: 'Boosts ATK of DEX, Fighter and Slasher characters by 5.25x and HP by 1.4x.',
    });
    const target = createCharacter({
      id: 2007,
      type: 'DEX',
      classes: ['Shooter', 'Free Spirit'],
    });

    const coverage = resolveCaptainCoverage(captain, target);

    expect(coverage.matches).toBe(true);
    expect(coverage.boosts).toEqual({
      hp: 1.4,
      atk: 5.25,
    });
  });

  it('uses default captain branches instead of powered-up or conditional boost values', () => {
    const captain = createCharacter({
      id: 1008,
      captainAbility:
        'Always Active: Boosts HP of [DEX] characters by 1.3x. Standard Captain: Boosts ATK of [DEX] characters by 3.5x. Powered Up Captain: Boosts ATK of [DEX] characters by 6x and HP by 1.5x. If HP is below 50%, boosts ATK of [DEX] characters by 7x instead.',
    });
    const target = createCharacter({ id: 2008, type: 'DEX', classes: ['Shooter', 'Driven'] });

    const coverage = resolveCaptainCoverage(captain, target);

    expect(coverage.matches).toBe(true);
    expect(coverage.boosts).toEqual({
      hp: 1.3,
      atk: 3.5,
    });
  });

  it('keeps comma-less conditional boost clauses in full coverage', () => {
    const captainAbility =
      'Boosts ATK of all characters by 3x. If you use "Yasakani no Magatama" in this turn boosts ATK of all characters by 5x instead.';
    const captain = createCharacter({ id: 1018, captainAbility });
    const target = createCharacter({ id: 2018, type: 'INT', classes: ['Shooter', 'Driven'] });

    expect(resolveCaptainBoostScope(captainAbility, 'fullAbilityCoverage')).toMatchObject({
      clauses: [
        'Boosts ATK of all characters by 3x',
        'boosts ATK of all characters by 5x',
      ],
    });
    expect(
      resolveCaptainCoverage(captain, target, { coverageMode: 'fullAbilityCoverage' }),
    ).toEqual(
      expect.objectContaining({
        matches: true,
        coveredClauses: [
          'Boosts ATK of all characters by 3x',
          'boosts ATK of all characters by 5x',
        ],
        targetableClauseCount: 2,
      }),
    );
  });

  it('keeps trailing comma-less boost alternatives in conditional full coverage', () => {
    const captainAbility =
      "Boosts ATK of all characters by 3.25x. If you use 'Gomu Gomu no King Cobra' for 3 turns, on this Luffy boosts ATK of all characters by 4x at the start of the chain, by 4.25x after 3 PERFECTs in a row.";
    const captain = createCharacter({ id: 2363, captainAbility });
    const target = createCharacter({ id: 2364, type: 'INT', classes: ['Fighter', 'Free Spirit'] });

    expect(resolveCaptainBoostScope(captainAbility, 'fullAbilityCoverage').clauses).toEqual(
      expect.arrayContaining([
        'boosts ATK of all characters by 4x at the start of the chain',
        'boosts ATK of all characters by 4.25x after 3 PERFECTs in a row',
      ]),
    );
    expect(
      resolveCaptainCoverage(captain, target, { coverageMode: 'fullAbilityCoverage' }),
    ).toEqual(
      expect.objectContaining({
        matches: true,
        coveredClauses: expect.arrayContaining([
          'boosts ATK of all characters by 4.25x after 3 PERFECTs in a row',
        ]),
      }),
    );
  });

  it('keeps non-conditional captain boost alternatives before stripping instead riders', () => {
    const captainAbility =
      'Boosts ATK of Free Spirit and Fighter characters by 5x, by 5.5x instead if they have a beneficial orb, boosts HP of Fighter and Free Spirit characters by 1.3x.';
    const captain = createCharacter({ id: 4537, captainAbility });
    const target = createCharacter({
      id: 4538,
      type: 'DEX',
      classes: ['Fighter', 'Free Spirit'],
    });

    expect(resolveCaptainBoostScope(captainAbility, 'fullAbilityCoverage').clauses).toEqual(
      expect.arrayContaining([
        'Boosts ATK of Free Spirit and Fighter characters by 5x',
        'Boosts ATK of Free Spirit and Fighter characters by 5.5x if they have a beneficial orb',
        'boosts HP of Fighter and Free Spirit characters by 1.3x',
      ]),
    );
    expect(resolveCaptainCoverage(captain, target).boosts).toEqual({
      hp: 1.3,
      atk: 5.5,
    });
  });

  it('keeps conditional instead alternatives before stripping riders in runtime coverage', () => {
    const captainAbility =
      'Boosts HP of all characters by 1.25x. If there is a [STR], [DEX], [QCK], [PSY] and [INT] character in your crew, boosts ATK of all characters by 2.25x, by 3.9375x instead if they have a beneficial orb.';

    expect(resolveCaptainBoostScope(captainAbility, 'fullAbilityCoverage').clauses).toEqual(
      expect.arrayContaining([
        'boosts ATK of all characters by 2.25x',
        'boosts ATK of all characters by 3.9375x if they have a beneficial orb',
      ]),
    );
  });

  it('does not treat possessive Captain Ability removal text as a branch label', () => {
    const captainAbility =
      "Boosts ATK of Driven and Powerhouse characters by 4.5x, boosts HP of Driven and Powerhouse characters by 1.75x, increases damage received by 1.5x. If total Damage Taken is 50,000 or more, boosts ATK of Driven and Powerhouse characters by 5.25x instead, recovers 2,000 HP at the end of each turn, reduces damage received by 10% and removes the following effect from this character's Captain Ability: increases damage received by 1.5x.";
    const captain = createCharacter({
      id: 3751,
      captainAbility,
      type: 'QCK',
      classes: ['Driven', 'Powerhouse'],
    });
    const target = createCharacter({
      id: 5003,
      type: 'STR',
      classes: ['Driven', 'Shooter'],
    });

    expect(resolveCaptainBoostScope(captainAbility, 'simpleBoostScope')).toMatchObject({
      clauses: [
        'Boosts ATK of Driven and Powerhouse characters by 4.5x',
        'boosts HP of Driven and Powerhouse characters by 1.75x',
      ],
      allowedClasses: ['Driven', 'Powerhouse'],
    });
    expect(resolveCaptainCoverage(captain, target, { coverageMode: 'simpleBoostScope' })).toEqual(
      expect.objectContaining({
        matches: true,
        boosts: {
          hp: 1.75,
          atk: 4.5,
        },
      }),
    );
  });

  it('keeps additionally-labeled Action Special boosts out of default captain coverage', () => {
    const captainAbility =
      'Launches the following effect at start of fight: reduces Special Cooldown of all characters by 3 turns. Boosts ATK of [INT], Free Spirit and Cerebral characters by 6x, boosts HP of [INT], Free Spirit and Cerebral characters by 1.2x, and makes [INT] and [RCV] orbs beneficial for all characters. If your crew has 4+ [Straw Hat Pirates] or [Egghead Arc] characters, boosts ATK of [Bonney Pirates], [Revolutionary Army], [Straw Hat Pirates], [Scientist] and [Egghead Arc] characters by 1.1x, boosts ATK of [INT], Free Spirit and Cerebral characters by 6.6x instead if they have the applicable tag, and allows effects that inflict Increase Damage Taken and Weaken to ignore Debuff Protection; additionally, if this character is your Captain and performs EXCELLENT with their Action Special, for 3 turns boosts ATK of [Bonney Pirates], [Revolutionary Army], [Straw Hat Pirates], [Scientist] and [Egghead Arc] characters by 1.4x instead, and boosts ATK of [INT], Free Spirit and Cerebral characters by 8.4x instead if they have the applicable tag.';
    const captain = createCharacter({
      id: 4490,
      captainAbility,
      type: 'INT',
      classes: ['Free Spirit', 'Cerebral'],
    });
    const target = createCharacter({
      id: 5001,
      type: 'INT',
      classes: ['Shooter', 'Driven'],
      characterTags: ['Straw Hat Pirates'],
    });

    expect(
      resolveCaptainCoverage(captain, target, { coverageMode: 'simpleBoostScope' }).boosts,
    ).toEqual({
      hp: 1.2,
      atk: 6,
    });
  });

  it('requires Blackbeard tier coverage targets to be Free Spirit and tag-covered', () => {
    const captain = createCharacter({
      id: 4561,
      captainAbility: blackbeardEmperorCaptainAbility,
      type: 'QCK',
      classes: ['Free Spirit', 'Driven'],
      characterTags: ['Blackbeard Pirates', 'Four Emperors'],
    });
    const freeSpiritTaggedTarget = createCharacter({
      id: 456101,
      type: 'DEX',
      classes: ['Free Spirit', 'Striker'],
      characterTags: ['Worst Generation'],
    });
    const freeSpiritUntaggedTarget = createCharacter({
      id: 456102,
      type: 'DEX',
      classes: ['Free Spirit', 'Striker'],
      characterTags: [],
    });
    const qckTaggedNonFreeSpiritTarget = createCharacter({
      id: 456103,
      type: 'QCK',
      classes: ['Driven', 'Powerhouse'],
      characterTags: ['Blackbeard Pirates'],
    });

    expect(
      resolveCaptainCoverage(captain, qckTaggedNonFreeSpiritTarget, {
        coverageMode: 'simpleBoostScope',
      }).matches,
    ).toBe(true);

    expect(resolveCaptainCoverage(captain, freeSpiritTaggedTarget).matches).toBe(true);
    expect(resolveCaptainCoverage(captain, freeSpiritUntaggedTarget).uncoveredClauses).toEqual([
      'reduces Special Cooldown of [Blackbeard Pirates], [Four Emperors] and [Worst Generation] characters by 5 turns',
    ]);
    expect(resolveCaptainCoverage(captain, qckTaggedNonFreeSpiritTarget).uncoveredClauses).toEqual([
      'boosts ATK of Free Spirit characters by 7x',
    ]);
  });

  it('ignores non-boost captain target clauses for coverage', () => {
    const captain = createCharacter({
      id: 1003,
      captainAbility:
        'Boosts ATK of [DEX] characters by 5x and makes [STR] orbs beneficial for [STR] characters.',
    });
    const target = createCharacter({ id: 2003, type: 'DEX', classes: ['Fighter', 'Slasher'] });

    const coverage = resolveCaptainCoverage(captain, target);

    expect(coverage.matches).toBe(true);
    expect(coverage.coveredClauses).toHaveLength(1);
    expect(coverage.uncoveredClauses).toEqual([]);
  });

  it('matches either branch for VS dual-character captain coverage', () => {
    const captain = createCharacter({
      id: 4469,
      name: 'Zoro VS Lucci - Battling Swords and Hand Pistols',
      captainAbility: zoroVsLucciCharacter1CaptainAbility,
      captainAbilityVariants: [
        {
          key: 'character1',
          label: 'Captain Ability (Character 1)',
          text: zoroVsLucciCharacter1CaptainAbility,
        },
        {
          key: 'character2',
          label: 'Captain Ability (Character 2)',
          text: zoroVsLucciCharacter2CaptainAbility,
        },
      ],
    });
    const character1Target = createCharacter({
      id: 4470,
      type: 'INT',
      classes: ['Shooter', 'Powerhouse'],
    });
    const character2Target = createCharacter({
      id: 4471,
      type: 'STR',
      classes: ['Shooter', 'Powerhouse'],
    });
    const fallbackOnlyTarget = createCharacter({
      id: 4472,
      type: 'QCK',
      classes: ['Shooter', 'Powerhouse'],
    });

    const character1Coverage = resolveCaptainCoverage(captain, character1Target);
    const character2Coverage = resolveCaptainCoverage(captain, character2Target);
    const fallbackOnlyCoverage = resolveCaptainCoverage(captain, fallbackOnlyTarget);

    expect(character1Coverage.matches).toBe(true);
    expect(character1Coverage.boosts).toEqual({ hp: 1.35, atk: 6 });
    expect(character1Coverage.coveredClauses).toEqual([
      'boosts ATK of [INT], Slasher and Free Spirit characters by 5.5x',
      'boosts ATK of [INT], Slasher and Free Spirit characters by 6x after the 3rd PERFECTs in a row',
      'boosts HP of [INT], Slasher and Free Spirit characters by 1.35x',
    ]);
    expect(character1Coverage.uncoveredClauses).toEqual([]);
    expect(character2Coverage.matches).toBe(true);
    expect(character2Coverage.boosts).toEqual({ hp: 1.35, atk: 6 });
    expect(fallbackOnlyCoverage.matches).toBe(false);
    expect(fallbackOnlyCoverage.uncoveredClauses).toEqual(
      expect.arrayContaining([
        'boosts ATK of [INT], Slasher and Free Spirit characters by 5.5x',
        'boosts ATK of [STR], Driven and Cerebral characters by 5.5x',
      ]),
    );
  });

  it('honors forced VS captain branch coverage and display names', () => {
    const captain = createCharacter({
      id: 4469,
      name: 'Zoro VS Lucci - Battling Swords and Hand Pistols',
      captainAbility: zoroVsLucciCharacter1CaptainAbility,
      captainAbilityVariants: [
        {
          key: 'character1',
          label: 'Captain Ability (Character 1)',
          text: zoroVsLucciCharacter1CaptainAbility,
        },
        {
          key: 'character2',
          label: 'Captain Ability (Character 2)',
          text: zoroVsLucciCharacter2CaptainAbility,
        },
      ],
    });
    const intTarget = createCharacter({
      id: 4470,
      type: 'INT',
      classes: ['Shooter', 'Powerhouse'],
    });
    const strTarget = createCharacter({
      id: 4471,
      type: 'STR',
      classes: ['Shooter', 'Powerhouse'],
    });

    expect(resolveCaptainCoverage(captain, intTarget, { branchMode: 'character1' }).matches).toBe(
      true,
    );
    expect(resolveCaptainCoverage(captain, strTarget, { branchMode: 'character1' }).matches).toBe(
      false,
    );
    expect(resolveCaptainCoverage(captain, strTarget, { branchMode: 'character2' }).matches).toBe(
      true,
    );
    expect(resolveCaptainCoverageBranchDisplay(captain, 'character1').displayName).toBe('Zoro');
    expect(resolveCaptainCoverageBranchDisplay(captain, 'character2').displayName).toBe('Lucci');
  });

  it('treats the selected VS branch as the active side when covering the same card', () => {
    const captain = createCharacter({
      id: 4469,
      name: 'Zoro VS Lucci - Battling Swords and Hand Pistols',
      type: 'INT,STR',
      classes: [],
      captainAbility: zoroVsLucciCharacter1CaptainAbility,
      captainAbilityVariants: [
        {
          key: 'character1',
          label: 'Captain Ability (Character 1)',
          text: zoroVsLucciCharacter1CaptainAbility,
        },
        {
          key: 'character2',
          label: 'Captain Ability (Character 2)',
          text: zoroVsLucciCharacter2CaptainAbility,
        },
      ],
    });
    const unrelatedFallbackTarget = createCharacter({
      id: 4471,
      type: 'STR',
      classes: ['Shooter', 'Powerhouse'],
    });

    const zoroSelfCoverage = resolveCaptainCoverage(captain, captain, {
      branchMode: 'character1',
    });
    const lucciSelfCoverage = resolveCaptainCoverage(captain, captain, {
      branchMode: 'character2',
    });
    const automaticVsSelfCoverage = resolveCaptainCoverage(captain, captain);
    const fallbackTargetCoverage = resolveCaptainCoverage(captain, unrelatedFallbackTarget, {
      branchMode: 'character1',
    });

    expect(zoroSelfCoverage.matches).toBe(true);
    expect(zoroSelfCoverage.boosts).toEqual({ hp: 1.35, atk: 6 });
    expect(lucciSelfCoverage.matches).toBe(true);
    expect(lucciSelfCoverage.boosts).toEqual({ hp: 1.35, atk: 6 });
    expect(automaticVsSelfCoverage.matches).toBe(true);
    expect(fallbackTargetCoverage.matches).toBe(false);
    expect(fallbackTargetCoverage.uncoveredClauses).toEqual(
      expect.arrayContaining([
        'boosts ATK of [INT], Slasher and Free Spirit characters by 5.5x',
        'boosts HP of [INT], Slasher and Free Spirit characters by 1.35x',
      ]),
    );
    expect(fallbackTargetCoverage.clauses.map((clause) => clause.text)).not.toContain(
      'boosts ATK of all other characters by 3.5x',
    );
  });

  it('requires both non-combined dual captain branches for coverage', () => {
    const character1Text =
      'Boosts ATK of [QCK], Fighter and Powerhouse characters by 4.75x, boosts ATK of all other characters by 3.5x, and boosts HP of [QCK], Fighter and Powerhouse characters by 1.35x.';
    const character2Text =
      'Boosts ATK of [DEX], Fighter and Powerhouse characters by 4.75x, boosts ATK of all other characters by 3.5x, and boosts HP of [DEX], Fighter and Powerhouse characters by 1.35x.';
    const captain = createCharacter({
      id: 4521,
      captainAbility: character1Text,
      captainAbilityVariants: [
        {
          key: 'character1',
          label: 'Captain Ability (Character 1)',
          text: character1Text,
        },
        {
          key: 'character2',
          label: 'Captain Ability (Character 2)',
          text: character2Text,
        },
        {
          key: 'combined',
          label: 'Captain Ability (Combined)',
          text: 'Boosts ATK and HP of all characters by 5.75x.',
        },
      ],
    });

    const fighterCoverage = resolveCaptainCoverage(
      captain,
      createCharacter({ id: 4522, type: 'PSY', classes: ['Fighter', 'Cerebral'] }),
    );
    const dexOnlyCoverage = resolveCaptainCoverage(
      captain,
      createCharacter({ id: 4523, type: 'DEX', classes: ['Shooter', 'Cerebral'] }),
    );
    const qckOnlyCoverage = resolveCaptainCoverage(
      captain,
      createCharacter({ id: 4524, type: 'QCK', classes: ['Shooter', 'Cerebral'] }),
    );
    const combinedOnlyCoverage = resolveCaptainCoverage(
      captain,
      createCharacter({ id: 4525, type: 'STR', classes: ['Shooter', 'Cerebral'] }),
    );

    expect(fighterCoverage.matches).toBe(true);
    expect(fighterCoverage.boosts).toEqual({ hp: 1.35, atk: 4.75 });
    expect(
      resolveCaptainCoverage(captain, createCharacter({ id: 4526, type: 'PSY' }), {
        coverageMode: 'simpleBoostScope',
      }).matches,
    ).toBe(true);
    expect(dexOnlyCoverage.matches).toBe(false);
    expect(
      resolveCaptainCoverage(
        captain,
        createCharacter({ id: 4527, type: 'DEX', classes: ['Shooter', 'Cerebral'] }),
        { coverageMode: 'simpleBoostScope' },
      ).matches,
    ).toBe(false);
    expect(dexOnlyCoverage.uncoveredClauses).toEqual(
      expect.arrayContaining([expect.stringContaining('HP of [QCK]')]),
    );
    expect(qckOnlyCoverage.matches).toBe(false);
    expect(qckOnlyCoverage.uncoveredClauses).toEqual(
      expect.arrayContaining([expect.stringContaining('HP of [DEX]')]),
    );
    expect(combinedOnlyCoverage.matches).toBe(false);
    expect(combinedOnlyCoverage.captainText).not.toContain('5.75x');
  });

  it('allows a forced non-VS dual branch to cover only that branch', () => {
    const character1Text =
      'Boosts ATK of [QCK], Fighter and Powerhouse characters by 4.75x, boosts HP of [QCK], Fighter and Powerhouse characters by 1.35x.';
    const character2Text =
      'Boosts ATK of [DEX], Cerebral and Slasher characters by 4.75x, boosts HP of [DEX], Cerebral and Slasher characters by 1.35x.';
    const captain = createCharacter({
      id: 4521,
      name: 'Garp & Coby - Combined Fists',
      captainAbility: character1Text,
      captainAbilityVariants: [
        { key: 'character1', label: 'Captain Ability (Character 1)', text: character1Text },
        { key: 'character2', label: 'Captain Ability (Character 2)', text: character2Text },
      ],
    });
    const fighterTarget = createCharacter({
      id: 4522,
      type: 'PSY',
      classes: ['Fighter', 'Shooter'],
    });
    const cerebralTarget = createCharacter({
      id: 4523,
      type: 'INT',
      classes: ['Cerebral', 'Shooter'],
    });

    expect(
      resolveCaptainCoverage(captain, fighterTarget, { branchMode: 'character1' }).matches,
    ).toBe(true);
    expect(
      resolveCaptainCoverage(captain, cerebralTarget, { branchMode: 'character1' }).matches,
    ).toBe(false);
    expect(
      resolveCaptainCoverage(captain, cerebralTarget, { branchMode: 'character2' }).matches,
    ).toBe(true);
    expect(resolveCaptainCoverage(captain, fighterTarget, { branchMode: 'both' }).matches).toBe(
      false,
    );

    const combinedSelfTargetCaptain = createCharacter({
      id: 4521,
      name: 'Garp & Coby - Combined Fists',
      type: 'QCK,DEX',
      classes: [],
      captainAbility: character1Text,
      captainAbilityVariants: [
        { key: 'character1', label: 'Captain Ability (Character 1)', text: character1Text },
        { key: 'character2', label: 'Captain Ability (Character 2)', text: character2Text },
      ],
    });

    expect(
      resolveCaptainCoverage(combinedSelfTargetCaptain, combinedSelfTargetCaptain, {
        branchMode: 'both',
      }).matches,
    ).toBe(true);
  });

  it('ignores self-only boost clauses', () => {
    const captain = createCharacter({
      id: 1004,
      captainAbility: 'Boosts ATK of this character by 6x.',
    });

    expect(resolveCaptainCoverage(captain, createCharacter({ id: 1004 })).matches).toBe(false);
    expect(resolveCaptainCoverage(captain, createCharacter({ id: 2004 })).matches).toBe(false);
  });

  it('keeps targetable boost coverage when a later rider only boosts this character', () => {
    const captain = createCharacter({
      id: 1122,
      captainAbility:
        'Boosts ATK of [STR], [DEX] and [QCK] characters by 2.5x, but boosts ATK of this character by 4x.',
    });

    const dexCoverage = resolveCaptainCoverage(
      captain,
      createCharacter({ id: 3007, type: 'DEX' }),
      { coverageMode: 'simpleBoostScope' },
    );
    const intCoverage = resolveCaptainCoverage(
      captain,
      createCharacter({ id: 3008, type: 'INT' }),
      { coverageMode: 'simpleBoostScope' },
    );

    expect(resolveCaptainBoostScope(captain.detail.captainAbility, 'simpleBoostScope')).toEqual(
      expect.objectContaining({
        clauses: ['Boosts ATK of [STR], [DEX] and [QCK] characters by 2.5x'],
        allowedTypes: ['DEX', 'STR', 'QCK'],
      }),
    );
    expect(dexCoverage.matches).toBe(true);
    expect(dexCoverage.boosts).toEqual({ hp: 0, atk: 2.5 });
    expect(intCoverage.matches).toBe(false);
  });

  it('keeps targetable boost coverage when a later rider only activates this character special', () => {
    const captainAbility =
      'Reduces Special Cooldown of [PSY], Fighter and Free Spirit characters by 2 turns at the start of the fight, boosts ATK of [PSY], Fighter and Free Spirit characters by 5x, their HP by 1.3x and at the start of the fight, this character activates their own special.';
    const captain = createCharacter({
      id: 3363,
      captainAbility,
      type: 'PSY',
      classes: ['Fighter', 'Free Spirit'],
    });
    const fighterCoverage = resolveCaptainCoverage(
      captain,
      createCharacter({ id: 5001, type: 'PSY', classes: ['Fighter', 'Shooter'] }),
      { coverageMode: 'simpleBoostScope' },
    );
    const drivenCoverage = resolveCaptainCoverage(
      captain,
      createCharacter({ id: 5002, type: 'DEX', classes: ['Driven', 'Shooter'] }),
      { coverageMode: 'simpleBoostScope' },
    );

    expect(resolveCaptainBoostScope(captainAbility, 'simpleBoostScope')).toMatchObject({
      clauses: [
        'boosts ATK of [PSY], Fighter and Free Spirit characters by 5x, their HP by 1.3x',
      ],
      allowedTypes: ['PSY'],
      allowedClasses: ['Fighter', 'Free Spirit'],
    });
    expect(fighterCoverage.matches).toBe(true);
    expect(fighterCoverage.boosts).toEqual({ hp: 1.3, atk: 5 });
    expect(drivenCoverage.matches).toBe(false);
  });

  it('uses conditional base ATK target tags without treating team-count tags as targets', () => {
    const captain = createCharacter({
      id: 4549,
      captainAbility: kidAimedDamnedPunkCaptainAbility,
      type: 'STR',
      classes: ['Striker', 'Driven'],
    });
    const matchingTarget = createCharacter({
      id: 3001,
      type: 'STR',
      classes: ['Shooter', 'Free Spirit'],
      characterTags: ['Worst Generation', 'Paramythia-type'],
    });
    const untaggedBoostedTarget = createCharacter({
      id: 3003,
      type: 'STR',
      classes: ['Shooter', 'Free Spirit'],
      characterTags: ['Paramythia-type'],
    });
    const taggedUnboostedTarget = createCharacter({
      id: 3004,
      type: 'QCK',
      classes: ['Shooter', 'Free Spirit'],
      characterTags: ['Kid Pirates', 'Paramythia-type'],
    });
    const nonMatchingTarget = createCharacter({
      id: 3002,
      type: 'QCK',
      classes: ['Shooter', 'Free Spirit'],
    });

    const matchingCoverage = resolveCaptainCoverage(captain, matchingTarget);
    const untaggedBoostedCoverage = resolveCaptainCoverage(captain, untaggedBoostedTarget);
    const taggedUnboostedCoverage = resolveCaptainCoverage(captain, taggedUnboostedTarget);
    const nonMatchingCoverage = resolveCaptainCoverage(captain, nonMatchingTarget);

    expect(matchingCoverage.matches).toBe(true);
    expect(matchingCoverage.boosts).toEqual({
      hp: 1.3,
      atk: 5,
    });
    expect(matchingCoverage.chips).toEqual([
      { kind: 'type', label: 'STR' },
      { kind: 'tag', label: 'Paramythia-type' },
    ]);
    expect(matchingCoverage.neutralNotes).toEqual([]);
    expect(untaggedBoostedCoverage.matches).toBe(true);
    expect(taggedUnboostedCoverage.matches).toBe(false);
    expect(nonMatchingCoverage.matches).toBe(false);
    expect(nonMatchingCoverage.uncoveredClauses).toEqual(
      expect.arrayContaining([
        'boosts ATK of [STR], Striker and Driven characters by 5x',
        'boosts HP of [STR], Striker and Driven characters by 1.3x',
      ]),
    );
  });

  it('can require full coverage candidates to match crew tag conditions', () => {
    const captain = createCharacter({
      id: 4549,
      captainAbility: kidAimedDamnedPunkCaptainAbility,
      type: 'STR',
      classes: ['Striker', 'Driven'],
    });
    const taggedBoostedTarget = createCharacter({
      id: 3005,
      type: 'STR',
      classes: ['Shooter', 'Free Spirit'],
      characterTags: ['Land of Wano Arc', 'Paramythia-type'],
    });
    const untaggedBoostedTarget = createCharacter({
      id: 3006,
      type: 'STR',
      classes: ['Shooter', 'Free Spirit'],
      characterTags: ['Paramythia-type'],
    });

    const taggedCoverage = resolveCaptainCoverage(captain, taggedBoostedTarget, {
      includeTeamTagClauses: true,
    });
    const untaggedCoverage = resolveCaptainCoverage(captain, untaggedBoostedTarget, {
      includeTeamTagClauses: true,
    });

    expect(taggedCoverage.matches).toBe(true);
    expect(taggedCoverage.coveredClauses).toContain(
      'crew tag condition: [Kid Pirates] / [Worst Generation] / [Land of Wano Arc] / [Egghead Arc] characters',
    );
    expect(untaggedCoverage.matches).toBe(false);
    expect(untaggedCoverage.uncoveredClauses).toEqual(
      expect.arrayContaining([
        'crew tag condition: [Kid Pirates] / [Worst Generation] / [Land of Wano Arc] / [Egghead Arc] characters',
      ]),
    );
  });

  it('keeps neutral captain notes from excluding an otherwise covered captain', () => {
    const captain = createCharacter({
      id: 1005,
      captainAbility:
        'Boosts ATK of [QCK] characters by 5x, reduces damage received by 20% and guarantees duplicating a drop upon completion of the island.',
    });
    const target = createCharacter({ id: 2005, type: 'QCK', classes: ['Free Spirit', 'Striker'] });

    const coverage = resolveCaptainCoverage(captain, target);

    expect(coverage.matches).toBe(true);
    expect(coverage.neutralNotes).toEqual([]);
  });
});

function createCharacter(
  overrides: Partial<CharacterDetailRecord> & {
    captainAbility?: string;
    captainAbilityVariants?: CharacterDetailRecord['detail']['captainAbilityVariants'];
    characterTags?: string[];
    classes?: string[];
    cost?: number;
    id: number;
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
      captainAbilityVariants: overrides.captainAbilityVariants ?? [],
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
      superClass: null,
      captainShiftData: null,
      rumbleData: null,
    },
  } satisfies CharacterDetailRecord;
}
