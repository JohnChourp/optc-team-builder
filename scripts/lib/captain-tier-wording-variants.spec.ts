import { describe, expect, it } from 'vitest';

import { normalizeCaptainBoostWordingVariants } from '../../src/app/core/grammar/captain-boost-grammar.ts';
import { buildCaptainAbilityCoverage } from './captain-ability-coverage.mjs';

/*
 * 1amndjnqk7g. Captains whose ATK boost is written a way the tier reader did not know got no
 * captain tier at all, so Captain Coverage and the Auto Team Builder never offered them. The texts
 * below are the shipped ones (dataset v36, upstream 54dcb6a5).
 */
const LAW_2001 =
  "Boosts Slasher and Free Spirit character's ATK by 2.5x, by 3.5x after 3 consecutive PERFECTs, by 4x after 5 consecutive PERFECTs. Recovers 1,000 HP at the end of each turn.";
const ZORO_2096 =
  "Boosts Slasher and Driven character's ATK by 2.25x, by 2.5x after 2 consecutive PERFECTs, by 2.75x after 5 consecutive PERFECTs.";
const ZORO_2097 =
  "Boosts Slasher and Driven character's ATK by 2.75x and their HP by 1.2x, by 3x after 2 consecutive PERFECTs, by 3.3x after 5 consecutive PERFECTs.";
const SUKIYAKI_4044 =
  'Boosts ATK of [QCK], Slasher, and Free Spirit characters 3.25x and reduces Bind duration by 1 turn.';
const VEGAPUNK_4261 =
  'Changes all orbs into [BOMB] orbs at the start of the fight, reduces Special Cooldown of all characters by 1 turn at the start of the fight, boosts ATK of all character by 4x, boosts HP of all character by 1.25x, makes [BOMB] and [S. BOMB] orbs beneficial for all characters, and restores Special Cooldown of all characters by 2 turns when they are rewinded.';
const NAMI_1366 =
  'Boosts RCV of Cerebral characters by 1.5x and their ATK by 1.5x, by 2.75x instead if they have a beneficial orb';
const SENGOKU_459 =
  'Reduces Special Cooldown of all characters by 2 turns at the start of the fight, boosts ATK of Cost 54 or 20 or less characters by 3x.';
const BUGGY_DELIVERY_3399 =
  'Reduces Special Cooldown of all characters by 1 turn at the start of the fight, boosts ATK of Cost 50 or 30 or less characters by 3x, boosts their HP by 1.2x and gives chance of duplicating a drop upon completion of the island.';

function tiersOf(text: string) {
  return buildCaptainAbilityCoverage([{ key: 'captain', label: 'Captain Ability', text }]).entries.flatMap(
    (entry) => entry.tiers,
  );
}

function summary(text: string) {
  return tiersOf(text).map((tier) => ({
    atk: tier.atkBoost,
    hp: tier.hpBoost,
    types: tier.characterConditions.types,
    classes: tier.characterConditions.classes,
    universal: tier.characterConditions.universal,
    costRange: tier.characterConditions.costRange,
  }));
}

describe('captain tiers read the wording variants of a Captain boost', () => {
  it('reads "X character\'s ATK" as a class boost (#2001, #2096)', () => {
    expect(summary(LAW_2001)).toEqual([
      { atk: 4, hp: undefined, types: [], classes: ['Free Spirit', 'Slasher'], universal: false, costRange: undefined },
    ]);
    expect(summary(ZORO_2096)).toEqual([
      { atk: 2.75, hp: undefined, types: [], classes: ['Driven', 'Slasher'], universal: false, costRange: undefined },
    ]);
  });

  it('gives the PERFECT alternatives to ATK, not to the HP rider before them (#2097)', () => {
    expect(summary(ZORO_2097)).toEqual([
      { atk: 3.3, hp: 1.2, types: [], classes: ['Driven', 'Slasher'], universal: false, costRange: undefined },
    ]);
  });

  it('reads a boost with no "by" before its multiplier (#4044)', () => {
    expect(summary(SUKIYAKI_4044)).toEqual([
      { atk: 3.25, hp: undefined, types: ['QCK'], classes: ['Free Spirit', 'Slasher'], universal: false, costRange: undefined },
    ]);
  });

  it('reads "all character" as all characters (#4261)', () => {
    expect(summary(VEGAPUNK_4261)).toEqual([
      { atk: 4, hp: 1.25, types: [], classes: [], universal: true, costRange: undefined },
    ]);
  });

  it('reads an ATK boost written after an RCV boost, orb alternative included (#1366)', () => {
    expect(summary(NAMI_1366).map(({ atk, classes }) => ({ atk, classes }))).toEqual([
      { atk: 1.5, classes: ['Cerebral'] },
      { atk: 2.75, classes: ['Cerebral'] },
    ]);
  });

  it('reads "Cost 54 or 20 or less" as cost 54 besides cost 20 or less (#459, #3399)', () => {
    expect(summary(SENGOKU_459)).toEqual([
      { atk: 3, hp: undefined, types: [], classes: [], universal: false, costRange: { max: 20, orValues: [54] } },
    ]);
    expect(summary(BUGGY_DELIVERY_3399).map(({ atk, costRange }) => ({ atk, costRange }))).toEqual([
      { atk: 3, costRange: { max: 30, orValues: [50] } },
    ]);
  });
});

describe('normalizeCaptainBoostWordingVariants', () => {
  it('leaves a self-only "this character\'s ATK" boost self-only', () => {
    const text = "Boosts this character's ATK by 2x";
    expect(normalizeCaptainBoostWordingVariants(text)).toBe(text);
  });

  it('leaves damage dealt from a character\'s ATK alone (#841 has no boost tier)', () => {
    const text =
      "Recovers 3x character's RCV in HP at the end of each turn, deals 3x character's ATK in [PSY] damage to all enemies at the end of each turn";
    expect(normalizeCaptainBoostWordingVariants(text)).toBe(text);
    expect(tiersOf(text)).toEqual([]);
  });

  it('leaves the start-of-chain HP rider shape to the reader that already handles it (#2248)', () => {
    const text =
      'Boosts ATK of Slasher and Powerhouse characters by 2.5x at the start of the chain and their HP by 1.25x, by 2.85x after scoring 3 PERFECTs in a row.';
    expect(normalizeCaptainBoostWordingVariants(text)).toBe(text);
  });

  it('is idempotent', () => {
    for (const text of [LAW_2001, ZORO_2096, ZORO_2097, SUKIYAKI_4044, VEGAPUNK_4261, NAMI_1366]) {
      const once = normalizeCaptainBoostWordingVariants(text);
      expect(normalizeCaptainBoostWordingVariants(once)).toBe(once);
    }
  });
});
