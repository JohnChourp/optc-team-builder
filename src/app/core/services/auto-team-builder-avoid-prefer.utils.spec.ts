import { describe, expect, it } from 'vitest';

import {
  createEmptyAvoidPreferRules,
  hasAvoidPreferRules,
  hasAvoidRules,
  normalizeAvoidPreferRules,
  toSparseAvoidPreferFields,
} from './auto-team-builder-avoid-prefer.utils';

/**
 * 869f63gma. The one reader and writer of a Saved Enemy's avoid and prefer rules. Storage, both
 * transfer files, the preset and the search input all go through it, so what it keeps and what it
 * leaves out is what every one of them keeps and leaves out.
 */
describe('normalizeAvoidPreferRules (869f63gma)', () => {
  it('reads nothing as no rule, and never throws on junk', () => {
    for (const value of [undefined, null, 'Driven', 7, [], { avoidedTypes: 'QCK' }]) {
      expect(normalizeAvoidPreferRules(value)).toEqual(createEmptyAvoidPreferRules());
    }
  });

  it('keeps the five types only, upper-cased and de-duplicated in the order given', () => {
    expect(
      normalizeAvoidPreferRules({ avoidedTypes: ['qck', ' QCK ', 'INT', 'XYZ', 4, ''] }).avoidedTypes,
    ).toEqual(['QCK', 'INT']);
  });

  it('keeps a class in the case it was written, de-duplicated case-insensitively', () => {
    expect(
      normalizeAvoidPreferRules({ preferredClasses: ['Free  Spirit', 'free spirit', ' Driven '] })
        .preferredClasses,
    ).toEqual(['Free Spirit', 'Driven']);
  });

  it('reads any mode that is not soft as hard - the default the owner chose', () => {
    expect(normalizeAvoidPreferRules({ avoidMode: 'soft' }).avoidMode).toBe('soft');
    expect(normalizeAvoidPreferRules({ avoidMode: 'hard' }).avoidMode).toBe('hard');
    expect(normalizeAvoidPreferRules({ avoidMode: 'SOFT' }).avoidMode).toBe('hard');
    expect(normalizeAvoidPreferRules({}).avoidMode).toBe('hard');
  });

  it('tells an avoid rule from a prefer-only one', () => {
    const preferOnly = normalizeAvoidPreferRules({ preferredTypes: ['DEX'] });
    const avoidOnly = normalizeAvoidPreferRules({ avoidedClasses: ['Driven'] });

    expect(hasAvoidRules(preferOnly)).toBe(false);
    expect(hasAvoidPreferRules(preferOnly)).toBe(true);
    expect(hasAvoidRules(avoidOnly)).toBe(true);
    expect(hasAvoidPreferRules(createEmptyAvoidPreferRules())).toBe(false);
  });
});

describe('toSparseAvoidPreferFields (869f63gma)', () => {
  it('writes nothing at all for no rule, so an old enemy stays byte-identical', () => {
    expect(toSparseAvoidPreferFields(createEmptyAvoidPreferRules())).toEqual({});
    expect(Object.keys(toSparseAvoidPreferFields(createEmptyAvoidPreferRules()))).toEqual([]);
  });

  it('writes the mode only beside an avoided value, and copies every list', () => {
    const rules = normalizeAvoidPreferRules({
      avoidedClasses: ['Driven'],
      avoidMode: 'soft',
      preferredTypes: ['QCK'],
    });
    const sparse = toSparseAvoidPreferFields(rules);

    expect(sparse).toEqual({ avoidedClasses: ['Driven'], avoidMode: 'soft', preferredTypes: ['QCK'] });
    expect(sparse.avoidedClasses).not.toBe(rules.avoidedClasses);
    // A soft mode with nothing to avoid means nothing, and is not written.
    expect(toSparseAvoidPreferFields({ ...rules, avoidedClasses: [] })).toEqual({
      preferredTypes: ['QCK'],
    });
  });

  it('writes a hard mode out loud beside an avoided value, so a file says what it means', () => {
    expect(toSparseAvoidPreferFields(normalizeAvoidPreferRules({ avoidedTypes: ['INT'] }))).toEqual({
      avoidedTypes: ['INT'],
      avoidMode: 'hard',
    });
  });
});
