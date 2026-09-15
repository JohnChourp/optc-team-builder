import { describe, expect, it } from 'vitest';

import {
  ABILITY_TAG_DRIFT_ABSOLUTE_FLOOR,
  ABILITY_TAG_DRIFT_RELATIVE,
  buildAbilityTagCatalogue,
  findAbilityTagDrift,
  parseAbilityMatcherPatterns,
  parseStructuredTurnAliases,
} from './lib/ability-tag-catalogue.mjs';
import { readAbilityTagCatalogue } from './generate-ability-tag-catalogue.mjs';

/**
 * 869f1328p. The parser declares matchers in three shapes. Reading only the first found 51 of 86
 * keys and reported the other 35 as having no phrasing at all - a quietly-wrong record of exactly
 * the kind this artifact exists to prevent, so each shape is pinned.
 */
describe('parseAbilityMatcherPatterns', () => {
  it('reads the inline tuple shape', () => {
    const patterns = parseAbilityMatcherPatterns("  ['special_damage', [/\\bdeals?\\b/i]],");

    expect(patterns.get('special_damage')).toEqual(['\\bdeals?\\b']);
  });

  it('reads the object shape the crewmate matchers use', () => {
    const patterns = parseAbilityMatcherPatterns(
      ["  {", "    key: 'crewmate_recover_burn',", '    patterns: [/\\bremoves?\\b/i],', '  },'].join('\n'),
    );

    expect(patterns.get('crewmate_recover_burn')).toEqual(['\\bremoves?\\b']);
  });

  it('resolves a tuple that references a named pattern constant', () => {
    const patterns = parseAbilityMatcherPatterns(
      ['const TERRITORY_PROVIDER_PATTERNS = [', '  /\\bapplies\\b/i,', '];', "  ['territory', TERRITORY_PROVIDER_PATTERNS],"].join('\n'),
    );

    expect(patterns.get('territory')).toEqual(['\\bapplies\\b']);
  });
});

describe('parseStructuredTurnAliases', () => {
  it('reads the tag-to-tag table, which is not a phrasing', () => {
    const aliases = parseStructuredTurnAliases(
      [
        'const STRUCTURED_TURN_SOURCE_ALIASES = new Map([',
        "  ['support_status_effect_recovery_burn', ['remove_burn']],",
        ']);',
      ].join('\n'),
    );

    expect(aliases.get('support_status_effect_recovery_burn')).toEqual(['remove_burn']);
  });
});

describe('buildAbilityTagCatalogue', () => {
  const parserSource = [
    "  ['special_damage', [/\\bdeals?\\b/i]],",
    'const STRUCTURED_TURN_SOURCE_ALIASES = new Map([',
    "  ['support_recover', ['remove_burn']],",
    ']);',
  ].join('\n');

  it('tells the three derivations apart instead of blurring them into one', () => {
    const catalogue = buildAbilityTagCatalogue({
      abilityCatalogue: {
        abilities: [
          { key: 'special_damage', label: 'Damage', category: 'special', matchCount: 10 },
          { key: 'support_recover', label: 'Recover', category: 'support', matchCount: 5 },
          { key: 'from_upstream', label: 'Upstream', category: 'potential', matchCount: 3 },
        ],
      },
      parserSource,
      generatedAt: 'fixed',
    });
    const byKey = new Map(catalogue.tags.map((tag) => [tag.key, tag]));

    expect(byKey.get('special_damage')?.derivation).toBe('ability-prose-matcher');
    expect(byKey.get('support_recover')?.derivation).toBe('structured-turns-from-another-tag');
    expect(byKey.get('from_upstream')?.derivation).toBe('structured-upstream-field');
  });
});

describe('findAbilityTagDrift', () => {
  const measured = (matchCount: number) => ({ tags: [{ key: 't', matchCount }] }) as never;

  it('allows the small movement a routine data release produces', () => {
    expect(findAbilityTagDrift({ tags: [{ key: 't', matchCount: 1000 }] } as never, measured(1005))).toEqual(
      [],
    );
  });

  it('fails a movement large enough to mean the parser or the wording changed', () => {
    const drift = findAbilityTagDrift(
      { tags: [{ key: 't', matchCount: 1000 }] } as never,
      measured(500),
    );

    expect(drift.join(' ')).toContain('1000 -> 500');
  });

  /**
   * A small tag moving by a handful is noise, not signal, so the floor protects it from a relative
   * threshold that would be a single-digit number.
   */
  it('uses the absolute floor for a tag too small for a relative threshold to mean anything', () => {
    expect(
      findAbilityTagDrift({ tags: [{ key: 't', matchCount: 4 }] } as never, measured(20)),
    ).toEqual([]);
    expect(
      findAbilityTagDrift({ tags: [{ key: 't', matchCount: 4 }] } as never, measured(40)).join(' '),
    ).toContain('4 -> 40');
  });

  it('fails when a tag the filter bar offered disappears entirely', () => {
    const drift = findAbilityTagDrift(
      { tags: [{ key: 'gone', matchCount: 10 }] } as never,
      { tags: [] } as never,
    );

    expect(drift.join(' ')).toContain('has disappeared');
  });

  it('reports nothing on a first run, which has nothing to drift from', () => {
    expect(findAbilityTagDrift(null as never, measured(10))).toEqual([]);
  });

  it('keeps the thresholds at values a data release cannot trip', () => {
    expect(ABILITY_TAG_DRIFT_RELATIVE).toBeGreaterThanOrEqual(0.05);
    expect(ABILITY_TAG_DRIFT_ABSOLUTE_FLOOR).toBeGreaterThanOrEqual(10);
  });
});

describe('the shipped catalogue', () => {
  it('resolves every tag the filter bar offers to a derivation', () => {
    const catalogue = readAbilityTagCatalogue({ generatedAt: 'fixed' });

    expect(catalogue.tagCount).toBeGreaterThan(200);
    expect(catalogue.tags.filter((tag) => !tag.derivation)).toEqual([]);
  });

  it('finds the matchers in all three shapes, not only the inline tuple', () => {
    const catalogue = readAbilityTagCatalogue({ generatedAt: 'fixed' });

    // 51 was what reading only the inline tuple form produced.
    expect(catalogue.proseMatchedTagCount).toBeGreaterThan(51);
    expect(catalogue.structuredTurnAliasTagCount).toBeGreaterThan(0);
  });

  it('carries the phrasing and the near-miss for the tag the parser explains at most length', () => {
    const catalogue = readAbilityTagCatalogue({ generatedAt: 'fixed' });
    const damage = catalogue.tags.find((tag) => tag.key === 'special_damage');

    expect(damage?.sourcePhrasings?.[0]).toContain('deals?');
    expect(damage?.knownNearMiss).toContain('less damage to the crew');
  });
});
