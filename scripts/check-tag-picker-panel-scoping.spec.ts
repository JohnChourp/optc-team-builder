import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  ABILITY_MODAL_CLASS,
  CHARACTER_MODAL_CLASS,
  EXTRA_SHARED_STYLESHEETS,
  STYLE_PANELS_COMPONENT,
  findUnpairedSelectors,
  resolveSharedPanelStylesheets,
  selectorsOf,
  stripScssComments,
  twinOf,
} from './check-tag-picker-panel-scoping.mjs';

function read(relativePath: string): string {
  return readFileSync(resolve(process.cwd(), relativePath), 'utf8');
}

const SHARED_PANEL_STYLESHEETS = resolveSharedPanelStylesheets(process.cwd());

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

  /*
   * Every real selector in the shipped panels sits inside a media query or not -
   * both must be read.
   *
   * The modal-class half is conditional on the file naming a modal class at
   * all. It used to be unconditional, which held only because the list was the
   * three panels that happen to scope everything; the shell panel styles
   * `.ability-tag-set-head h2` with no modal class anywhere, so an
   * unconditional assertion fails on it for a reason that has nothing to do
   * with the reader. What must hold for every file is that the reader returns
   * real selectors and never an at-rule prelude.
   */
  it('finds the real selectors in each shipped panel, not just its at-rules', () => {
    for (const relativePath of SHARED_PANEL_STYLESHEETS) {
      const source = read(relativePath);
      const selectors = selectorsOf(source);

      expect(
        selectors.filter((selector) => selector.startsWith('@')),
        `${relativePath}: at-rule preludes must never be treated as selectors`,
      ).toEqual([]);
      expect(
        selectors.length,
        `${relativePath}: no selector was read at all`,
      ).toBeGreaterThan(0);

      const namesAModal =
        source.includes(ABILITY_MODAL_CLASS) || source.includes(CHARACTER_MODAL_CLASS);

      if (namesAModal) {
        expect(
          selectors.some(
            (selector) =>
              selector.includes(ABILITY_MODAL_CLASS) || selector.includes(CHARACTER_MODAL_CLASS),
          ),
          `${relativePath}: names a modal class but the reader surfaced no selector for it`,
        ).toBe(true);
      }
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
      if (EXTRA_SHARED_STYLESHEETS.includes(relativePath)) {
        continue;
      }

      const fileName = relativePath.split('/').pop() ?? '';
      const componentName = fileName.replace('.component.scss', '');

      expect(stylePanels, `${componentName} is no longer in the shared style panels`).toContain(
        componentName,
      );
    }
  });

  /*
   * The list used to be three hardcoded paths against a component that composes
   * eight panels, so a single-class rule in shell, formula, set, operator or
   * footer was never handed to the checker at all. Deriving it is only a fix if
   * the derivation is itself asserted: a regex that silently stops matching
   * would hand back an empty list, and a guard that reads no file passes
   * everything.
   */
  it('derives one stylesheet per styleUrl in the style-panels component', () => {
    const stylePanels = read(STYLE_PANELS_COMPONENT);
    const declared = [...stylePanels.matchAll(/styleUrl:\s*'([^']+)'/gu)].map((match) => match[1]);

    expect(declared.length).toBeGreaterThanOrEqual(8);
    expect(SHARED_PANEL_STYLESHEETS).toHaveLength(declared.length + EXTRA_SHARED_STYLESHEETS.length);

    for (const styleUrl of declared) {
      const fileName = styleUrl.split('/').pop() ?? '';

      expect(
        SHARED_PANEL_STYLESHEETS.some((entry) => entry.endsWith(fileName)),
        `${fileName} is declared by the style-panels component but never checked`,
      ).toBe(true);
    }

    for (const extra of EXTRA_SHARED_STYLESHEETS) {
      expect(SHARED_PANEL_STYLESHEETS).toContain(extra);
    }
  });

  it('refuses to run when the derivation finds nothing', () => {
    expect(() => resolveSharedPanelStylesheets('/nonexistent/project/root')).toThrow();
  });
});

describe('shared panel class names stay unique to the pickers', () => {
  /*
   * The audit flagged `.ability-tag-set-head h2` in the shell panel as an
   * unscoped rule. Measured, that is NOT the defect the scoping guard exists
   * for: the shell panel has 23 selectors and NONE names a modal class, which
   * makes it symmetric by construction - both pickers render the panel, so an
   * unscoped rule reaching both is the intent, not an asymmetry.
   *
   * The real risk with `ViewEncapsulation.None` is different: these rules are
   * global, so a class name reused anywhere else in the app is restyled
   * silently. Today the panel's class names appear only in the two picker
   * templates. This is what keeps that true.
   */
  it('uses class names that no other template borrows', () => {
    const panelDir = 'src/app/shared/ability-tag-set-picker';
    const owners = [
      'src/app/shared/ability-tag-set-picker/ability-tag-set-picker.component.html',
      'src/app/shared/character-tag-set-picker/character-tag-set-picker.component.html',
    ];

    const classNames = new Set<string>();

    for (const file of readdirSync(panelDir)) {
      if (!file.endsWith('.component.scss')) {
        continue;
      }

      for (const [, name] of readFileSync(`${panelDir}/${file}`, 'utf8').matchAll(
        /\.(ability-tag-set[a-z0-9-]*)/gu,
      )) {
        if (name) {
          classNames.add(name);
        }
      }
    }

    expect(classNames.size).toBeGreaterThan(5);

    const templates: string[] = [];
    const walk = (dir: string): void => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = `${dir}/${entry.name}`;

        if (entry.isDirectory()) {
          walk(full);
        } else if (entry.name.endsWith('.html')) {
          templates.push(full);
        }
      }
    };
    walk('src/app');

    const strangers: string[] = [];

    for (const template of templates) {
      if (owners.includes(template)) {
        continue;
      }

      const markup = readFileSync(template, 'utf8');

      for (const name of classNames) {
        if (new RegExp(`class="[^"]*\\b${name}\\b`, 'u').test(markup)) {
          strangers.push(`${template} uses .${name}`);
        }
      }
    }

    expect(
      strangers,
      'these templates borrow a shared-panel class, so unscoped ViewEncapsulation.None rules reach them too',
    ).toEqual([]);
  });
});
