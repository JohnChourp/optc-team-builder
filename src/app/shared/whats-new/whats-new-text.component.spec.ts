import '@angular/compiler';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { WhatsNewTextComponent } from './whats-new-text.component';

/**
 * 869f13gam. The tokenizer has its own spec; this covers the two things that live in
 * the component rather than in it.
 *
 * The template assertions matter more than they look. This component exists because
 * `[innerHTML]` would silently swallow the `<class>` placeholder four live release
 * entries contain, and the only thing standing between here and that outcome is that
 * the template renders elements STRUCTURALLY. A future edit that "simplifies" it to
 * an `[innerHTML]` binding would reopen the hole, so the absence of one is asserted.
 */

/*
 * Read from disk, like the toolbar-back-button spec reads its `.html`.
 *
 * The first version of this asked Angular for the compiled metadata and stringified
 * it, which produced `"[object Object]"` - fifteen characters that can never contain
 * the word it was checking for. It passed, over nothing. The length assertion below
 * is there so that can never silently happen again.
 */
function componentSource(): string {
  const raw = readFileSync(
    resolve(process.cwd(), 'src/app/shared/whats-new/whats-new-text.component.ts'),
    'utf8',
  );

  /*
   * Comments stripped, as `check-locale-formatting.mjs` does for the same reason: the
   * component's own doc block EXPLAINS why it avoids `[innerHTML]`, so an unstripped
   * search finds the word in prose and the guard fails on a correct file. Caught by
   * the mutation run below, which stayed red after the mutation was reverted.
   */
  return raw.replace(/\/\*[\s\S]*?\*\//gu, '').replace(/^\s*\/\/.*$/gmu, '');
}

describe('WhatsNewTextComponent', () => {
  it('tokenises in the input setter, so nothing is recomputed per change-detection cycle', () => {
    const component = new WhatsNewTextComponent();

    component.value = 'The **Settings** screen';

    expect(component.tokens).toEqual([
      { text: 'The ', bold: false, code: false },
      { text: 'Settings', bold: true, code: false },
      { text: ' screen', bold: false, code: false },
    ]);
  });

  it('re-tokenises when the input changes rather than appending', () => {
    const component = new WhatsNewTextComponent();

    component.value = 'first **one**';
    component.value = 'second **two**';

    expect(component.tokens.map((token) => token.text).join('')).toBe('second two');
  });

  /*
   * A release entry can legitimately carry an empty bullet half while it is being
   * written, and the modal renders whatever it is handed. Throwing here would take
   * the whole pop-up down for a missing string.
   */
  it('survives an empty, null or undefined value', () => {
    const component = new WhatsNewTextComponent();

    for (const value of ['', null, undefined] as unknown as string[]) {
      component.value = value;
      expect(component.tokens).toEqual([]);
    }
  });

  it('starts empty rather than undefined, so the template can loop before any input', () => {
    expect(new WhatsNewTextComponent().tokens).toEqual([]);
  });

  /*
   * The injection guard, asserted rather than trusted to review: this component must
   * never grow an [innerHTML] binding.
   */
  it('binds no innerHTML anywhere, and reads enough source to mean it', () => {
    const source = componentSource();

    /* Prove the subject is non-empty before asserting an absence in it. */
    expect(source.length).toBeGreaterThan(500);
    expect(source).toContain('<strong>');
    expect(source).toContain('<code>');

    expect(source).not.toContain('innerHTML');
    expect(source).not.toContain('bypassSecurityTrust');
  });
});
