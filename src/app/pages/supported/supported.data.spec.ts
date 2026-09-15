import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { SUPPORTED_SECTIONS } from './supported.data';

/**
 * 869f17h3g. Every declared key exists, non-empty, in BOTH locale files.
 *
 * The same failure the FAQ guards against: a section added in English with the
 * Greek half missing renders a translation key to a Greek reader, and a template
 * test cannot see it because the template is correct.
 */

const locales = ['en', 'el'] as const;

function load(locale: (typeof locales)[number]): Record<string, unknown> {
  return JSON.parse(readFileSync(`public/i18n/supported/${locale}.json`, 'utf8')).supported;
}

function read(tree: Record<string, unknown>, dotted: string): unknown {
  return dotted.split('.').reduce<unknown>((node, key) => {
    return node && typeof node === 'object' ? (node as Record<string, unknown>)[key] : undefined;
  }, tree);
}

describe('supported screen copy', () => {
  for (const locale of locales) {
    describe(locale, () => {
      const tree = load(locale);

      it('has the page-level copy', () => {
        for (const key of ['eyebrow', 'title', 'summary']) {
          expect(read(tree, key), `${locale}: ${key}`).toBeTruthy();
        }
      });

      for (const section of SUPPORTED_SECTIONS) {
        it(`has every key for the ${section.id} section`, () => {
          expect(read(tree, `sections.${section.id}.title`), `${locale}: ${section.id}`).toBeTruthy();

          for (const row of section.rows) {
            const value = read(tree, `sections.${section.id}.rows.${row}`);

            expect(value, `${locale}: ${section.id}.${row}`).toBeTruthy();
            expect(String(value).trim().length, `${locale}: ${section.id}.${row} is empty`).toBeGreaterThan(0);
          }
        });
      }
    });
  }

  /*
   * A row present in one language and not the other is the failure that ships;
   * comparing the whole key set catches an orphan in either direction, including
   * one nobody declared in SUPPORTED_SECTIONS.
   */
  it('has identical key sets in both languages', () => {
    const flatten = (node: unknown, prefix = ''): string[] =>
      node && typeof node === 'object'
        ? Object.entries(node as Record<string, unknown>).flatMap(([key, value]) =>
            flatten(value, prefix ? `${prefix}.${key}` : key),
          )
        : [prefix];

    expect(flatten(load('el')).sort()).toEqual(flatten(load('en')).sort());
  });
});
