import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/*
 * 869f13c59. Captain abilities, specials, notes and effects come from the community database in
 * English, whatever language the app is in. With Greek selected the page is <html lang="el">, so a
 * paragraph that prints one of them verbatim declares lang="en" - otherwise a screen reader reads
 * English sentences with a Greek voice. A paragraph of translated copy must not, or the reverse
 * happens.
 *
 * The lists and rows on this page are deliberately left alone: they mix dataset words with numbers
 * formatted in the chosen language, and a Greek `1.234` read by an English voice is another number.
 * See docs/locale-behaviour.md.
 */
describe('character detail: English game text is marked English', () => {
  const template = readFileSync(
    resolve(process.cwd(), 'src/app/pages/character-detail/character-detail.page.html'),
    'utf8',
  );
  const paragraphs = [...template.matchAll(/<p\b([^>]*)>([\s\S]*?)<\/p>/gu)].map(
    ([, attributes = '', body = '']) => ({
      attributes,
      body: body.replace(/\s+/gu, ' ').trim(),
    }),
  );
  const isTranslated = (body: string) => /\bt\(|\|\s*transloco\b/u.test(body);

  it('marks every paragraph of verbatim dataset text lang="en"', () => {
    const datasetParagraphs = paragraphs.filter((paragraph) => !isTranslated(paragraph.body));

    // A new untranslated paragraph changes this list, so whoever adds it decides its language.
    expect(datasetParagraphs.map((paragraph) => paragraph.body)).toEqual([
      '{{ entry.text }}',
      '{{ captainSummary.captainNotes }}',
      '{{ text.value }}',
      '{{ text.value }}',
    ]);

    for (const paragraph of datasetParagraphs) {
      expect(paragraph.attributes).toMatch(/(?:^|\s)lang="en"/u);
    }
  });

  it('leaves paragraphs of translated copy in the page language', () => {
    const translatedParagraphs = paragraphs.filter((paragraph) => isTranslated(paragraph.body));

    expect(translatedParagraphs.length).toBeGreaterThan(0);

    for (const paragraph of translatedParagraphs) {
      expect(paragraph.attributes).not.toMatch(/\blang=/u);
    }
  });
});
