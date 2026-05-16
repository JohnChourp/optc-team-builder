import { describe, expect, it } from 'vitest';

import {
  buildCaptainAbilityCoverage,
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

  it('adds scope fields to each generated captain coverage entry', () => {
    expect(
      buildCaptainAbilityCoverage([
        {
          key: 'base',
          label: 'Base Captain Ability',
          text: 'Boosts ATK of [DEX] characters by 5x.',
        },
      ]),
    ).toEqual({
      entries: [
        {
          key: 'base',
          label: 'Base Captain Ability',
          firstCoverageScope: 'subset',
          secondCoverageScope: 'subset',
          firstCoverageClauses: ['Boosts ATK of [DEX] characters by 5x'],
          secondCoverageClauses: ['Boosts ATK of [DEX] characters by 5x'],
        },
      ],
    });
  });
});
