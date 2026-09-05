import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  ABILITY_MODAL_CLASS,
  CHARACTER_MODAL_CLASS,
  SHARED_PANEL_STYLESHEETS,
  findUnpairedSelectors,
  selectorsOf,
  stripScssComments,
  twinOf,
} from './check-tag-picker-panel-scoping.mjs';

function read(relativePath: string): string {
  return readFileSync(resolve(process.cwd(), relativePath), 'utf8');
}

describe('tag-set picker panel scoping guard', () => {
  it('passes on the shipped panels', () => {
    for (const relativePath of SHARED_PANEL_STYLESHEETS) {
      expect(findUnpairedSelectors(relativePath, read(relativePath))).toEqual([]);
    }
  });

  /*
   * The measured defect: after 869etpmp3 promoted these rules to the ability
   * picker's modal class, the character picker rendered the same panels inside
   * `character-tag-set-picker-modal` and got none of them - 16 of 128 tile
   * titles still clipped at 844x390. This is that state, and the guard must
   * reject it.
   */
  it('rejects a rule that names only one of the two modal classes', () => {
    const findings = findUnpairedSelectors(
      'panel.scss',
      `.${ABILITY_MODAL_CLASS} .ability-tag-set-tile__copy strong { white-space: normal; }`,
    );

    expect(findings).toHaveLength(1);
    expect(findings[0]?.missing).toBe(
      `.${CHARACTER_MODAL_CLASS} .ability-tag-set-tile__copy strong`,
    );
  });

  it('rejects the asymmetry in the other direction too', () => {
    const findings = findUnpairedSelectors(
      'panel.scss',
      `.${CHARACTER_MODAL_CLASS} .ability-tag-set-footer { padding-block: 8px; }`,
    );

    expect(findings).toHaveLength(1);
    expect(findings[0]?.missing).toBe(`.${ABILITY_MODAL_CLASS} .ability-tag-set-footer`);
  });

  it('accepts a paired rule, whitespace and line breaks included', () => {
    expect(
      findUnpairedSelectors(
        'panel.scss',
        `.${ABILITY_MODAL_CLASS}   .ability-tag-set-tile,\n  .${CHARACTER_MODAL_CLASS} .ability-tag-set-tile {\n  align-items: start;\n}`,
      ),
    ).toEqual([]);
  });

  it('ignores rules that name neither class', () => {
    expect(
      findUnpairedSelectors('panel.scss', '.ability-tag-set-shell { display: grid; }'),
    ).toEqual([]);
  });

  /*
   * A class named in prose is not a selector. The panels carry long comments
   * that name both classes while explaining why they must be paired, so a
   * comment-blind reader would report findings that do not exist.
   */
  it('does not read class names out of comments', () => {
    const source = `/* .${ABILITY_MODAL_CLASS} is why this exists */\n.ability-tag-set-shell { gap: 8px; }`;

    expect(stripScssComments(source)).not.toContain(ABILITY_MODAL_CLASS);
    expect(findUnpairedSelectors('panel.scss', source)).toEqual([]);
  });

  /*
   * Only the prelude is a selector. A class name inside a declaration block -
   * in a `:is()` value, a comment, or a nested string - must not be counted.
   */
  it('reads selectors from the prelude only', () => {
    expect(
      selectorsOf(`.ability-tag-set-shell { content: '.${ABILITY_MODAL_CLASS}'; }`),
    ).toEqual(['.ability-tag-set-shell']);
  });

  /*
   * The hole this guard nearly shipped with. Both short-viewport rules live
   * inside `@media` blocks, and so does the motion panel's only rule - a reader
   * that collects selectors at the top level alone finds three at-rule preludes
   * and zero real selectors in the responsive panel, then reports "OK" for a
   * file it never read. That file is where half the measured defect lived.
   */
  it('reads selectors inside at-rules, and never pairs the at-rule itself', () => {
    expect(
      selectorsOf(`@media (max-height: 600px) { .${ABILITY_MODAL_CLASS} .ability-tag-set-footer { padding-block: 8px; } }`),
    ).toEqual([`.${ABILITY_MODAL_CLASS} .ability-tag-set-footer`]);

    const findings = findUnpairedSelectors(
      'panel.scss',
      `@media (max-height: 600px) { .${ABILITY_MODAL_CLASS}::part(content) { height: 100vh; } }`,
    );

    expect(findings).toHaveLength(1);
    expect(findings[0]?.missing).toBe(`.${CHARACTER_MODAL_CLASS}::part(content)`);
  });

  /* Every real selector in the shipped panels sits inside a media query or not - both must be read. */
  it('finds the real selectors in each shipped panel, not just its at-rules', () => {
    for (const relativePath of SHARED_PANEL_STYLESHEETS) {
      const selectors = selectorsOf(read(relativePath));

      expect(
        selectors.filter((selector) => selector.startsWith('@')),
        `${relativePath}: at-rule preludes must never be treated as selectors`,
      ).toEqual([]);
      expect(
        selectors.some(
          (selector) =>
            selector.includes(ABILITY_MODAL_CLASS) || selector.includes(CHARACTER_MODAL_CLASS),
        ),
        `${relativePath}: no modal-class selector was read at all`,
      ).toBe(true);
    }
  });

  it('builds the twin by swapping the class, keeping the rest of the selector', () => {
    expect(twinOf(`.${ABILITY_MODAL_CLASS}::part(content)`)).toBe(
      `.${CHARACTER_MODAL_CLASS}::part(content)`,
    );
  });

  /*
   * The guard is only meaningful while both pickers really do render these
   * panels. If that stops being true, the guard is enforcing nothing.
   */
  it('still guards files that both pickers render', () => {
    const characterPicker = read(
      'src/app/shared/character-tag-set-picker/character-tag-set-picker.component.html',
    );

    expect(characterPicker).toContain('<app-ability-tag-set-picker-style-panels>');

    const stylePanels = read(
      'src/app/shared/ability-tag-set-picker/ability-tag-set-picker-style-panels.component.ts',
    );

    for (const relativePath of SHARED_PANEL_STYLESHEETS) {
      const fileName = relativePath.split('/').pop() ?? '';
      const componentName = fileName.replace('.component.scss', '');

      expect(stylePanels, `${componentName} is no longer in the shared style panels`).toContain(
        componentName,
      );
    }
  });
});
