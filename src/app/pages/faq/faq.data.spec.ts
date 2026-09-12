import '@angular/compiler';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { routes } from '../../app.routes';
import { FAQ_SECTIONS, listFaqTranslationKeys, type FaqSection } from './faq.data';

const LOCALES = ['en', 'el'] as const;

function readLocale(locale: (typeof LOCALES)[number]): Record<string, unknown> {
  return JSON.parse(
    readFileSync(resolve(process.cwd(), `public/i18n/faq/${locale}.json`), 'utf8'),
  ) as Record<string, unknown>;
}

function readKey(tree: Record<string, unknown>, key: string): unknown {
  return key
    .split('.')
    .reduce<unknown>(
      (node, segment) =>
        node && typeof node === 'object' ? (node as Record<string, unknown>)[segment] : undefined,
      tree,
    );
}

/** Every route the tabs shell can reach, as '/tabs/<path>'. */
function tabsRoutePaths(): Set<string> {
  const tabsRoute = routes
    .find((route) => route.path === '')
    ?.children?.find((route) => route.path === 'tabs');

  expect(tabsRoute, 'app.routes.ts no longer declares a tabs shell').toBeDefined();

  return new Set(
    (tabsRoute?.children ?? [])
      .map((route) => route.path)
      .filter((path): path is string => typeof path === 'string' && path !== '')
      .map((path) => `/tabs/${path}`),
  );
}

describe('FAQ data', () => {
  it('gives every entry a unique id across every section', () => {
    const ids = FAQ_SECTIONS.flatMap((section) => section.entries).map((entry) => entry.id);

    expect(ids).toEqual([...new Set(ids)]);
    expect(ids.length).toBeGreaterThan(0);
  });

  it('gives every section a unique id and at least one entry', () => {
    const sectionIds = FAQ_SECTIONS.map((section) => section.id);

    expect(sectionIds).toEqual([...new Set(sectionIds)]);

    for (const section of FAQ_SECTIONS) {
      expect(
        section.entries.length,
        `section "${section.id}" renders an empty card`,
      ).toBeGreaterThan(0);
    }
  });

  it.each(LOCALES)('translates every declared question, bullet and link in %s', (locale) => {
    const tree = readLocale(locale);
    const missing: string[] = [];

    for (const key of listFaqTranslationKeys()) {
      const value = readKey(tree, key);

      if (typeof value !== 'string' || !value.trim()) {
        missing.push(key);
      }
    }

    expect(missing, `public/i18n/faq/${locale}.json is missing these`).toEqual([]);
  });

  it.each(LOCALES)('carries no translation key the page never asks for in %s', (locale) => {
    const declared = new Set(listFaqTranslationKeys());
    const present: string[] = [];

    const walk = (node: unknown, path: string): void => {
      if (node && typeof node === 'object' && !Array.isArray(node)) {
        for (const [key, value] of Object.entries(node)) {
          walk(value, path ? `${path}.${key}` : key);
        }

        return;
      }

      present.push(path);
    };

    walk(readLocale(locale), '');

    expect(present.filter((key) => !declared.has(key))).toEqual([]);
  });

  it('keeps English and Greek on exactly the same keys', () => {
    expect(JSON.stringify(Object.keys(readLocale('en')))).toEqual(
      JSON.stringify(Object.keys(readLocale('el'))),
    );
  });

  it('only links to routes the tabs shell actually registers', () => {
    const known = tabsRoutePaths();
    const unknown = FAQ_SECTIONS.flatMap((section) => section.entries)
      .flatMap((entry) => entry.links)
      .map((link) => link.route)
      .filter((route) => !known.has(route));

    expect(unknown, 'these FAQ links would land on the wildcard redirect').toEqual([]);
  });

  it('rejects a section declared with no entries', () => {
    const empty: readonly FaqSection[] = [{ id: 'empty', entries: [] }];

    expect(listFaqTranslationKeys(empty)).toEqual([
      'eyebrow',
      'title',
      'summary',
      'sections.empty.title',
    ]);
  });
});
