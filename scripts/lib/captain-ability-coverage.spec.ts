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
