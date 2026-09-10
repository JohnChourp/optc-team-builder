import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('CharacterEditPage template', () => {
  it('renders the structured editor sections and advanced json editor', () => {
    const template = readFileSync(
      resolve(process.cwd(), 'src/app/pages/character-edit/character-edit.page.html'),
      'utf8',
    );

    expect(template).toContain('<app-toolbar-back-button></app-toolbar-back-button>');
    expect(template).toContain("t('sections.core')");
    expect(template).toContain("t('sections.stats')");
    expect(template).toContain("t('sections.images')");
    expect(template).toContain("t('sections.builderAbilities')");
    expect(template).toContain("t('sections.advancedJson')");
    expect(template).toContain('<app-ability-filter-rail');
    expect(template).toContain('openBuilderAbilityPicker($event)');
    expect(template).toContain('clearBuilderAbilityCategory($event)');
    expect(template).toContain('<app-special-ability-picker');
    expect(template).toContain("saveBuilderAbilityPicker('special', $event)");
    expect(template).toContain('onThumbnailFileSelected');
    expect(template).toContain('onDetailFileSelected');
    expect(template).toContain('applyAdvancedJson()');
    expect(template).not.toContain('ion-back-button');
  });
});

describe('CharacterEditPage reader-facing text', () => {
  const source = readFileSync(resolve(process.cwd(), 'src/app/pages/character-edit/character-edit.page.ts'), 'utf8');
  const en = JSON.parse(readFileSync(resolve(process.cwd(), 'public/i18n/character-edit/en.json'), 'utf8'));
  const el = JSON.parse(readFileSync(resolve(process.cwd(), 'public/i18n/character-edit/el.json'), 'utf8'));

  /*
   * Every `transfer.*` key literal in the file, whatever call shape holds it:
   * `this.text('...')`, a thrown keyed error, or the ternary FALLBACK the
   * reader sees on an unexpected error. An earlier version of this guard
   * matched only the first two shapes and so never checked the fallbacks -
   * which are precisely the strings shown when something goes wrong.
   */
  function keysUsedBySource(): string[] {
    return [...new Set([...source.matchAll(/'(transfer\.[A-Za-z.]+)'/gu)].map((m) => m[1]!))];
  }

  function leaf(bundle: unknown, key: string): unknown {
    return key.split('.').reduce<unknown>((node, part) => {
      return node && typeof node === 'object' ? (node as Record<string, unknown>)[part] : undefined;
    }, bundle);
  }

  /*
   * This screen is fully bilingual everywhere else, and these were the last
   * English literals on it: feedback banners, and a `confirm()` whose text is
   * the browser's own dialog. A Greek reader pressed a Greek button and got an
   * English question.
   */
  it('never puts an English literal in front of the reader', () => {
    expect(source).not.toMatch(/message: '[A-Z]/u);
    expect(source).not.toMatch(/globalThis\.confirm\('[A-Z]/u);
    expect(source).not.toMatch(/throw new Error\('[A-Z]/u);
  });

  /*
   * The catch used to render `error.message`, so `JSON.parse`'s own English
   * wording - "Unexpected token } in JSON at position 42" - reached the banner
   * verbatim. Errors carry a translation key now, and only that is shown.
   */
  it('never renders an error object\'s own message', () => {
    expect(source).not.toMatch(/message:\s*\n?\s*error instanceof Error/u);
    expect(source).not.toMatch(/\?\s*error\.message/u);
  });

  it('resolves every key it asks for, in both languages', () => {
    const used = keysUsedBySource();

    expect(used.length).toBeGreaterThanOrEqual(4);

    for (const key of used) {
      expect(leaf(en, key), `${key} missing from en.json`).toBeTypeOf('string');
      expect(leaf(el, key), `${key} missing from el.json`).toBeTypeOf('string');
    }
  });

  /*
   * Key parity is not enough: `scripts/audit-i18n.mjs` compares key SETS and
   * says so in its own docblock, so a Greek value copied from English passes it.
   * These are plain sentences with no game terms in them, so every one must
   * actually be Greek.
   */
  it('actually translates them, rather than copying the English', () => {
    for (const key of keysUsedBySource()) {
      const english = leaf(en, key) as string;
      const greek = leaf(el, key) as string;

      expect(greek, `${key} is still the English string`).not.toBe(english);
      expect(greek, `${key} contains no Greek`).toMatch(/[\u0370-\u03ff\u1f00-\u1fff]/u);
    }
  });
});
