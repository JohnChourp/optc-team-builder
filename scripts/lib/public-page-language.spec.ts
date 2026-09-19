import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  SITE_LANGUAGE,
  findUnmaintainedRuntimeAlternates,
  hreflangLinks,
  languageOf,
  validateLanguageDeclarations,
} from './public-page-language.mjs';
import { loadPublicRoutes, parsePublicRoutes } from './public-routes.mjs';

const projectRoot = path.resolve(import.meta.dirname, '..', '..');
const absoluteUrl = (pagePath: string) => `https://optcteambuilder.com/${pagePath ? `${pagePath}/` : ''}`;

/*
 * 869f13c6b. Every public page is English and names no alternate today, and the owner decided not
 * to publish the Greek translation as a public channel (869f17hbm). These pin both halves: today's
 * honest declaration, and the mechanism that makes the first page in another language discoverable
 * on the day it ships - proven on a fixture Greek page, never on the real registry.
 */
const englishFaq = { routePath: 'tabs/faq', canonicalPath: 'faq', title: 'FAQ', description: 'd', aliases: [] };
const pairedEnglishFaq = { ...englishFaq, alternates: { el: 'el/faq' } };
const greekFaq = {
  routePath: 'el/faq',
  canonicalPath: 'el/faq',
  title: 'Συχνές ερωτήσεις',
  description: 'd',
  aliases: [],
  language: 'el',
  alternates: { en: 'faq' },
};

describe('public page language', () => {
  it('declares every real public page English, with no alternates and nothing to emit', () => {
    const records = loadPublicRoutes(projectRoot);

    expect(records.length).toBeGreaterThan(15);
    expect(records.every((record) => languageOf(record) === SITE_LANGUAGE)).toBe(true);
    expect(records.flatMap((record) => hreflangLinks(record, absoluteUrl))).toEqual([]);
    expect(validateLanguageDeclarations(records)).toEqual([]);
  });

  it('pairs a fixture Greek page with its English page, both ways, with x-default on English', () => {
    const records = [pairedEnglishFaq, greekFaq];

    expect(validateLanguageDeclarations(records)).toEqual([]);
    expect(hreflangLinks(greekFaq, absoluteUrl)).toEqual([
      { hreflang: 'el', href: 'https://optcteambuilder.com/el/faq/' },
      { hreflang: 'en', href: 'https://optcteambuilder.com/faq/' },
      { hreflang: 'x-default', href: 'https://optcteambuilder.com/faq/' },
    ]);
    expect(hreflangLinks(pairedEnglishFaq, absoluteUrl)).toEqual(hreflangLinks(greekFaq, absoluteUrl));
  });

  it('fails a language-scoped route with no alternate annotation', () => {
    const { alternates: _dropped, ...unpaired } = greekFaq;

    expect(validateLanguageDeclarations([englishFaq, unpaired]).join('\n')).toMatch(
      /"el\/faq" is a language-scoped route with no alternate annotation/,
    );
  });

  it('fails a page in another language even when its path carries no language prefix', () => {
    const greekAtRoot = { ...englishFaq, canonicalPath: 'odigos', routePath: 'odigos', language: 'el' };

    expect(validateLanguageDeclarations([greekAtRoot]).join('\n')).toMatch(/no alternate annotation/);
  });

  it('fails alternates that are not reciprocal', () => {
    expect(validateLanguageDeclarations([englishFaq, greekFaq]).join('\n')).toMatch(
      /"faq" does not name "el\/faq" back as its el alternate/,
    );
  });

  it('fails an alternate the registry does not carry', () => {
    expect(validateLanguageDeclarations([pairedEnglishFaq]).join('\n')).toMatch(
      /names a el alternate, "el\/faq", that the registry does not carry/,
    );
  });

  it('fails a declared language that disagrees with the path or with the pair', () => {
    const mislabelled = { ...greekFaq, language: 'fr', alternates: { en: 'faq' } };
    const errors = validateLanguageDeclarations([pairedEnglishFaq, mislabelled]).join('\n');

    expect(errors).toMatch(/sits under "el\/" but declares language "fr"/);
    expect(errors).toMatch(/names "el\/faq" as its el alternate, but that page declares "fr"/);
  });

  it('reads language and alternates from the registry source', () => {
    const source = `
      export const PUBLIC_ROUTES: readonly PublicRouteRecord[] = [
        { routePath: 'tabs/faq', canonicalPath: 'faq', title: 'FAQ page', description: 'Answers to questions', alternates: { el: 'el/faq' } },
        { routePath: 'el/faq', canonicalPath: 'el/faq', title: 'Ερωτήσεις', description: 'Απαντήσεις σε ερωτήσεις', language: 'el', alternates: { en: 'faq' } },
      ];`;
    const records = parsePublicRoutes(source);

    expect(records.map((record) => [record.canonicalPath, languageOf(record), record.alternates])).toEqual([
      ['faq', 'en', { el: 'el/faq' }],
      ['el/faq', 'el', { en: 'faq' }],
    ]);
    expect(validateLanguageDeclarations(records)).toEqual([]);
  });

  it('refuses the first alternate while the running app would leave stale alternate links', () => {
    const appComponent = readFileSync(path.join(projectRoot, 'src', 'app', 'app.component.ts'), 'utf8');

    expect(findUnmaintainedRuntimeAlternates(loadPublicRoutes(projectRoot), appComponent)).toEqual([]);
    expect(findUnmaintainedRuntimeAlternates([pairedEnglishFaq, greekFaq], appComponent).join('\n')).toMatch(
      /never touches hreflang links/,
    );
    expect(
      findUnmaintainedRuntimeAlternates([pairedEnglishFaq, greekFaq], `${appComponent}\n// link[hreflang]`),
    ).toEqual([]);
  });
});
