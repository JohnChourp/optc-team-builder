import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * `transloco-validator` checks key parity and never meaning, so it cannot see a
 * Greek string that was left in English or a joiner that says the opposite of
 * the operator it labels. These assertions cover the gap for the one scope the
 * whole AND/OR story depends on.
 */
const LEAF_KEYS = [
  'label',
  'title',
  'trigger.empty',
  'trigger.active',
  'trigger.loading',
  'joiners.any',
  'joiners.all',
  'removeGroup',
  'support.empty',
  'support.all',
  'support.any',
  'support.unavailable',
  'a11y.applied',
  'a11y.cleared',
] as const;

/**
 * Keys the Greek copy deliberately keeps in English, exactly as the shipped
 * `captain-coverage.filters.characterTags.label` already does: the app treats
 * "Character Tags" as a domain term rather than translating it.
 */
const SHARED_TERM_KEYS = new Set<string>(['label']);

const en = readLocale('en');
const el = readLocale('el');

describe('character-tag-filter i18n', () => {
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

  it('leaves the joiner words unpadded so the code owns the spacing', () => {
    for (const locale of [en, el]) {
      for (const key of ['joiners.any', 'joiners.all']) {
        const value = readLeaf(locale, key) as string;

        expect(value).toBe(value.trim());
        expect(value.length).toBeGreaterThan(0);
      }
    }
  });

  it('uses distinct Greek joiners so the running operator stays readable', () => {
    expect(readLeaf(el, 'joiners.any')).toBe('ή');
    expect(readLeaf(el, 'joiners.all')).toBe('και');
    expect(readLeaf(el, 'joiners.any')).not.toBe(readLeaf(el, 'joiners.all'));
  });
});

function readLocale(locale: string): Record<string, unknown> {
  return JSON.parse(
    readFileSync(resolve(process.cwd(), `public/i18n/character-tag-filter/${locale}.json`), 'utf8'),
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
