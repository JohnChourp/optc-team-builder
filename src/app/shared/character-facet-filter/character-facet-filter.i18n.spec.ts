import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * `transloco-validator` checks key parity and never meaning, so it cannot see a
 * Greek string that was left in English, a `capacity` line that says the opposite
 * of what the control did, or a mode label that reads the same in both modes.
 * These assertions cover the gap for the scope the whole AND/OR story depends on.
 */
const LEAF_KEYS = [
  'kind.type.label',
  'kind.type.placeholder',
  'kind.class.label',
  'kind.class.placeholder',
  'mode.any',
  'mode.all',
  'mode.toggleAria',
  'mode.capacity.type',
  'mode.capacity.class',
  'mode.disjoint.type',
  'mode.disjoint.class',
  'removeValue',
  'selectedCount',
  'matchCount',
  'support.empty',
  'support.any',
  'support.all',
  'a11y.applied',
  'a11y.cleared',
] as const;

/**
 * Keys the Greek copy deliberately keeps in English. Verified against all five
 * shipped scopes that already label these facets — `characters.filters.type.label`,
 * `character-boxes.filters.typeLabel`, `captain-coverage.filters.type.label`,
 * `character-image-picker.filters.type` and `manual-team-builder.picker.filters.type`
 * are every one of them `"Type"` in `el`. The app treats `type` and `class` as
 * in-game domain terms, not as words to translate.
 */
const SHARED_TERM_KEYS = new Set<string>(['kind.type.label', 'kind.class.label']);

/** The type codes and class names the dataset stores. None of them may appear in a locale file. */
const FACET_VALUES = [
  'STR',
  'DEX',
  'QCK',
  'PSY',
  'INT',
  'Booster',
  'Cerebral',
  'Driven',
  'Evolver',
  'Fighter',
  'Free Spirit',
  'Powerhouse',
  'Shooter',
  'Slasher',
  'Striker',
];

const en = readLocale('en');
const el = readLocale('el');

describe('character-facet-filter i18n', () => {
  it('ships exactly the documented leaf set in both locales', () => {
    expect(collectLeafKeys(en).sort()).toEqual([...LEAF_KEYS].sort());
    expect(collectLeafKeys(el).sort()).toEqual([...LEAF_KEYS].sort());
  });

  for (const key of LEAF_KEYS) {
    it(`defines a non-empty ${key} in both locales`, () => {
      const english = readLeaf(en, key);
      const greek = readLeaf(el, key);

      expect(typeof english).toBe('string');
      expect(typeof greek).toBe('string');
      expect((english as string).trim().length).toBeGreaterThan(0);
      expect((greek as string).trim().length).toBeGreaterThan(0);
    });

    it(`keeps identical placeholders for ${key}`, () => {
      expect(readPlaceholders(readLeaf(el, key) as string)).toEqual(
        readPlaceholders(readLeaf(en, key) as string),
      );
    });

    it(`translates ${key} rather than leaving the English copy`, () => {
      const english = (readLeaf(en, key) as string).trim().toLowerCase();
      const greek = (readLeaf(el, key) as string).trim().toLowerCase();

      if (SHARED_TERM_KEYS.has(key)) {
        expect(greek).toBe(english);
        return;
      }

      expect(greek).not.toBe(english);
    });
  }

  it('keeps the two mode labels distinct in both locales so the active mode is readable', () => {
    for (const locale of [en, el]) {
      expect(readLeaf(locale, 'mode.any')).not.toBe(readLeaf(locale, 'mode.all'));
    }
  });

  it('gives the capacity and disjoint lines different copy per facet', () => {
    for (const locale of [en, el]) {
      expect(readLeaf(locale, 'mode.capacity.type')).not.toBe(
        readLeaf(locale, 'mode.capacity.class'),
      );
      expect(readLeaf(locale, 'mode.disjoint.type')).not.toBe(
        readLeaf(locale, 'mode.disjoint.class'),
      );
      expect(readLeaf(locale, 'mode.capacity.type')).not.toBe(
        readLeaf(locale, 'mode.disjoint.type'),
      );
    }
  });

  it('carries both the max and the count placeholders on every capacity line', () => {
    for (const locale of [en, el]) {
      for (const key of ['mode.capacity.type', 'mode.capacity.class']) {
        expect(readPlaceholders(readLeaf(locale, key) as string)).toEqual(['count', 'max']);
      }
    }
  });

  /**
   * Facet values are in-game identifiers compared verbatim against the dataset by
   * every predicate and every SQL `LIKE` param. A translated `Free Spirit` would
   * silently stop matching in `el`, so no locale file may contain one.
   */
  it('never puts a raw type code or class name in either locale', () => {
    for (const locale of [en, el]) {
      const serialized = JSON.stringify(locale);

      for (const value of FACET_VALUES) {
        expect(serialized).not.toContain(`"${value}"`);
        expect(serialized).not.toContain(` ${value} `);
      }
    }
  });
});

function readLocale(locale: string): Record<string, unknown> {
  return JSON.parse(
    readFileSync(
      resolve(process.cwd(), `public/i18n/character-facet-filter/${locale}.json`),
      'utf8',
    ),
  ) as Record<string, unknown>;
}

function readLeaf(tree: Record<string, unknown>, key: string): unknown {
  return key.split('.').reduce<unknown>((node, segment) => {
    return node && typeof node === 'object'
      ? (node as Record<string, unknown>)[segment]
      : undefined;
  }, tree);
}

function collectLeafKeys(tree: Record<string, unknown>, prefix = ''): string[] {
  return Object.entries(tree).flatMap(([key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key;

    return value && typeof value === 'object'
      ? collectLeafKeys(value as Record<string, unknown>, path)
      : [path];
  });
}

function readPlaceholders(value: string): string[] {
  return [...value.matchAll(/\{\{\s*([^}\s]+)\s*\}\}/g)].map((match) => match[1]).sort();
}
