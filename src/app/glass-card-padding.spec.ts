import {
  parseTemplate,
  TmplAstBoundText,
  TmplAstElement,
  TmplAstText,
  type TmplAstNode,
} from '@angular/compiler';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Every `glass-card` gets its padding from a stylesheet its own component can see.
 *
 * 869f6td0f. `.glass-card` in `src/styles.scss` has no padding on purpose - every card brings
 * its own. Home's "This install is empty" card and Settings' "Game version" card shipped
 * without, text flush on the border on the device, and a scan found 25 cards in the same state.
 * That was the second occurrence of the class, which is what earns a guard.
 *
 * WHAT "ITS OWN COMPONENT CAN SEE" MEANS, because the first scan got it wrong. Angular scopes a
 * component's stylesheet to that component's own template: Settings' `.intro-card` padding pads
 * nothing on Character Edit, whose card carries the same class. A card can rely on:
 *
 *   - its component's own `styleUrl`s;
 *   - the global stylesheet, `src/styles.scss` and the local partials it `@use`s;
 *   - the `ViewEncapsulation.None` style panels declared in its component's own directory - the
 *     page's own panels (docs/style-panel-pattern.md), which load with the page.
 *
 * A panel from ANOTHER page is not on that list. It is a global stylesheet once it loads, so a
 * card padded only by it is padded only when the reader happened to open that page first - how
 * Character Edit's loading card and Character Detail's transfer feedback were padded until now.
 *
 * A card counts as padded when rules outside any at-rule, whose selector's SUBJECT is the card by
 * its tag and static classes, pad it on all four sides; or when all of its content sits in ONE
 * in-flow child that is padded that way (the character cards' `__link` wrappers).
 */

const ROOT = process.cwd();
const SRC = join(ROOT, 'src');

type Side = 'top' | 'right' | 'bottom' | 'left';

interface SheetRule {
  readonly sheet: string;
  readonly selectors: readonly string[];
  readonly declarations: string;
  /** Inside `@media`, `@supports` or `@container`: true on some screens, not on all. */
  readonly conditional: boolean;
}

type RuleFrame =
  | { readonly atRule: true }
  | {
      readonly atRule: false;
      readonly selectors: string[];
      declarations: string;
      readonly conditional: boolean;
    };

/** Every rule in a stylesheet, nesting and `&` resolved, each marked if an at-rule encloses it. */
function readRules(source: string, sheet: string): SheetRule[] {
  const css = source.replace(/\/\*[\s\S]*?\*\//gu, '').replace(/(^|[^:])\/\/[^\n]*/gu, '$1');
  const rules: SheetRule[] = [];
  const stack: RuleFrame[] = [];
  let buffer = '';

  for (const char of css) {
    if (char === '{') {
      const prelude = buffer.trim().replace(/\s+/gu, ' ');

      buffer = '';

      if (prelude.startsWith('@')) {
        stack.push({ atRule: true });
        continue;
      }

      const parent = [...stack].reverse().find((frame) => !frame.atRule);
      const outer = parent && !parent.atRule ? parent.selectors : [''];
      const selectors = prelude
        .split(',')
        .map((part) => part.trim())
        .filter(Boolean)
        .flatMap((own) =>
          outer.map((scope) =>
            (own.includes('&') ? own.split('&').join(scope) : `${scope} ${own}`).trim(),
          ),
        );

      stack.push({
        atRule: false,
        selectors,
        declarations: '',
        conditional: stack.some((frame) => frame.atRule),
      });
    } else if (char === '}') {
      const frame = stack.pop();

      if (frame && !frame.atRule) {
        rules.push({
          sheet,
          selectors: frame.selectors,
          declarations: `${frame.declarations}${buffer}`,
          conditional: frame.conditional,
        });
      }

      buffer = '';
    } else if (char === ';') {
      const frame = stack[stack.length - 1];

      if (frame && !frame.atRule) {
        frame.declarations += `${buffer};`;
      }

      buffer = '';
    } else {
      buffer += char;
    }
  }

  return rules;
}

/** The compound a selector styles: what follows its last combinator, outside any brackets. */
function subjectOf(selector: string): string {
  let depth = 0;
  let start = 0;

  for (let index = 0; index < selector.length; index += 1) {
    const char = selector.charAt(index);

    if (char === '(' || char === '[') {
      depth += 1;
    } else if (char === ')' || char === ']') {
      depth -= 1;
    } else if (depth === 0 && /[\s>+~]/u.test(char)) {
      start = index + 1;
    }
  }

  return selector.slice(start).trim();
}

interface ElementShape {
  readonly name: string;
  readonly classes: readonly string[];
}

/**
 * Whether a selector's SUBJECT is this element, judged by its tag and static classes alone.
 *
 * An ancestor's name never counts, nor does a longer class that starts with the same letters, nor
 * a modifier class the element does not carry. A subject with an attribute, a pseudo-class or a
 * pseudo-element holds only sometimes - on hover, for `:not(...)`, for `::before` - and counts for
 * nothing. The ancestors a selector names are trusted, not checked against the template.
 */
function subjectIs(selector: string, element: ElementShape): boolean {
  const match = /^([a-z][\w-]*)?((?:\.[\w-]+)+)$/iu.exec(subjectOf(selector));

  if (!match) {
    return false;
  }

  const [, tag, classList = ''] = match;

  return (
    (!tag || tag.toLowerCase() === element.name.toLowerCase()) &&
    classList
      .split('.')
      .filter(Boolean)
      .every((className) => element.classes.includes(className))
  );
}

/** Whitespace-separated values, with `calc(8px + 2px)` kept whole. */
function splitValues(value: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = '';

  for (const char of value.trim()) {
    if (char === '(') {
      depth += 1;
    } else if (char === ')') {
      depth -= 1;
    }

    if (depth === 0 && /\s/u.test(char)) {
      if (current) {
        parts.push(current);
      }

      current = '';
    } else {
      current += char;
    }
  }

  return current ? [...parts, current] : parts;
}

function isZero(value: string): boolean {
  return /^[+-]?0*\.?0+(?:[a-z%]+)?$/iu.test(value);
}

/** The sides one padding declaration insets by more than nothing. Inline-start is left here. */
function paddedSides(property: string, rawValue: string): Side[] {
  const values = splitValues(rawValue.replace(/!important/giu, ''));
  const side = (name: Side, value: string | undefined): Side[] =>
    value !== undefined && !isZero(value) ? [name] : [];

  switch (property) {
    case 'padding': {
      const [top, right = top, bottom = top, left = right] = values;

      return [
        ...side('top', top),
        ...side('right', right),
        ...side('bottom', bottom),
        ...side('left', left),
      ];
    }
    case 'padding-block': {
      const [start, end = start] = values;

      return [...side('top', start), ...side('bottom', end)];
    }
    case 'padding-inline': {
      const [start, end = start] = values;

      return [...side('left', start), ...side('right', end)];
    }
    case 'padding-top':
    case 'padding-block-start':
      return side('top', values[0]);
    case 'padding-bottom':
    case 'padding-block-end':
      return side('bottom', values[0]);
    case 'padding-left':
    case 'padding-inline-start':
      return side('left', values[0]);
    case 'padding-right':
    case 'padding-inline-end':
      return side('right', values[0]);
    default:
      return [];
  }
}

/** The first sheet of those that together pad the element on all four sides, or null. */
function sheetPadding(rules: readonly SheetRule[], element: ElementShape): string | null {
  const sides = new Set<Side>();
  let sheet: string | null = null;

  for (const rule of rules) {
    if (rule.conditional || !rule.selectors.some((selector) => subjectIs(selector, element))) {
      continue;
    }

    for (const declaration of rule.declarations.split(';')) {
      const colon = declaration.indexOf(':');

      if (colon === -1) {
        continue;
      }

      for (const padded of paddedSides(
        declaration.slice(0, colon).trim().toLowerCase(),
        declaration.slice(colon + 1),
      )) {
        sides.add(padded);
        sheet ??= rule.sheet;
      }
    }
  }

  return sides.size === 4 ? sheet : null;
}

const POSITIONED_OUT = /(?:^|;)\s*position\s*:\s*(?:absolute|fixed)\b/u;

function isPositionedOut(rules: readonly SheetRule[], element: ElementShape): boolean {
  return rules.some(
    (rule) =>
      !rule.conditional &&
      POSITIONED_OUT.test(rule.declarations) &&
      rule.selectors.some((selector) => subjectIs(selector, element)),
  );
}

function staticClasses(element: TmplAstElement): string[] {
  const value = element.attributes.find((attribute) => attribute.name === 'class')?.value ?? '';

  return value.split(/\s+/u).filter(Boolean);
}

/** Only the classes that are always there: a `[class.x]` binding is a state, not the card. */
function shapeOf(element: TmplAstElement): ElementShape {
  return { name: element.name, classes: staticClasses(element) };
}

/** A node's children, through `@if` branches, `@switch` groups, `@for`'s `@empty` and `@defer`. */
function structuralChildren(node: TmplAstNode): TmplAstNode[] {
  const parts = node as unknown as Partial<
    Record<'children' | 'branches' | 'groups', TmplAstNode[]> &
      Record<'empty' | 'placeholder' | 'loading' | 'error', TmplAstNode | null>
  >;

  return [
    ...(parts.children ?? []),
    ...(parts.branches ?? []),
    ...(parts.groups ?? []),
    ...[parts.empty, parts.placeholder, parts.loading, parts.error].filter(
      (part): part is TmplAstNode => part !== undefined && part !== null,
    ),
  ];
}

/** What sits directly inside an element in the DOM: control flow and `<ng-container>` dissolve. */
function domChildren(node: TmplAstNode): TmplAstNode[] {
  return structuralChildren(node).flatMap((child) =>
    (child instanceof TmplAstElement && child.name !== 'ng-container') ||
    child instanceof TmplAstText ||
    child instanceof TmplAstBoundText
      ? [child]
      : domChildren(child),
  );
}

interface Padding {
  readonly route: 'the card' | 'its one in-flow child';
  readonly sheet: string;
}

/** Where a card's padding comes from, given the rules its component can see. */
function paddingOf(card: TmplAstElement, rules: readonly SheetRule[]): Padding | null {
  const own = sheetPadding(rules, shapeOf(card));

  if (own) {
    return { route: 'the card', sheet: own };
  }

  const children = domChildren(card);
  const hasLooseText = children.some((child) =>
    child instanceof TmplAstText ? child.value.trim() !== '' : child instanceof TmplAstBoundText,
  );
  const inFlow = children.filter(
    (child): child is TmplAstElement =>
      child instanceof TmplAstElement && !isPositionedOut(rules, shapeOf(child)),
  );
  const [wrapper] = inFlow;
  const wrapperSheet =
    wrapper && !hasLooseText && inFlow.length === 1 ? sheetPadding(rules, shapeOf(wrapper)) : null;

  return wrapperSheet ? { route: 'its one in-flow child', sheet: wrapperSheet } : null;
}

function parse(source: string, url: string): TmplAstNode[] {
  const parsed = parseTemplate(source, url, { preserveWhitespaces: false });

  expect(
    (parsed.errors ?? []).map((error) => error.toString()),
    `${url} does not parse`,
  ).toEqual([]);

  return parsed.nodes;
}

function glassCardsIn(nodes: readonly TmplAstNode[]): TmplAstElement[] {
  return nodes.flatMap((node) => [
    ...(node instanceof TmplAstElement && staticClasses(node).includes('glass-card') ? [node] : []),
    ...glassCardsIn(structuralChildren(node)),
  ]);
}

interface ComponentFiles {
  readonly directory: string;
  readonly template: string | null;
  readonly stylesheets: readonly string[];
  readonly unencapsulated: boolean;
}

const sourceFiles = readdirSync(SRC, { recursive: true, encoding: 'utf8' }).map((entry) =>
  join(SRC, entry),
);

function readComponents(): ComponentFiles[] {
  return sourceFiles
    .filter((file) => file.endsWith('.ts') && !file.endsWith('.spec.ts'))
    .flatMap((file) =>
      readFileSync(file, 'utf8')
        .split('@Component(')
        .slice(1)
        .map((block) => {
          const end = block.indexOf('export class');
          const metadata = end === -1 ? block : block.slice(0, end);
          const stylesheets = [
            ...metadata.matchAll(/styleUrls?\s*:\s*(\[[^\]]*\]|'[^']+'|"[^"]+")/gu),
          ].flatMap(([, list]) =>
            [...list.matchAll(/['"]([^'"]+)['"]/gu)].map(([, url]) => resolve(dirname(file), url)),
          );
          const templateUrl = /templateUrl\s*:\s*['"]([^'"]+)['"]/u.exec(metadata)?.[1];

          return {
            directory: dirname(file),
            template: templateUrl ? resolve(dirname(file), templateUrl) : null,
            stylesheets,
            unencapsulated: /ViewEncapsulation\.None/u.test(metadata),
          };
        }),
    );
}

/** `src/styles.scss` and the local partials it pulls in. */
function globalStylesheets(): string[] {
  const entry = join(SRC, 'styles.scss');
  const partials = [
    ...readFileSync(entry, 'utf8').matchAll(/@(?:use|import)\s+['"](\.[^'"]+)['"]/gu),
  ].flatMap(([, target]) => {
    const base = resolve(dirname(entry), target);

    return [`${base}.scss`, join(dirname(base), `_${basename(base)}.scss`)].filter((file) =>
      existsSync(file),
    );
  });

  return [entry, ...partials];
}

interface GlassCard {
  readonly at: string;
  readonly classes: readonly string[];
  readonly padding: Padding | null;
}

function collectGlassCards(): GlassCard[] {
  const components = readComponents();
  const globalRules = globalStylesheets().flatMap((file) =>
    readRules(readFileSync(file, 'utf8'), relative(ROOT, file)),
  );
  const rulesOf = (files: readonly string[]) =>
    files.flatMap((file) => readRules(readFileSync(file, 'utf8'), relative(ROOT, file)));

  return components.flatMap((component) => {
    if (!component.template) {
      return [];
    }

    const ownPanels = components
      .filter((other) => other.unencapsulated && other.directory === component.directory)
      .flatMap((other) => other.stylesheets);
    const rules = [...rulesOf(component.stylesheets), ...globalRules, ...rulesOf(ownPanels)];
    const url = relative(ROOT, component.template);

    return glassCardsIn(parse(readFileSync(component.template, 'utf8'), url)).map((card) => ({
      at: `${url}:${card.sourceSpan.start.line + 1}`,
      classes: staticClasses(card),
      padding: paddingOf(card, rules),
    }));
  });
}

/** The rules a synthetic sheet declares, for the cases below. */
function sheet(source: string): SheetRule[] {
  return readRules(source, 'case.scss');
}

/** A `<section>` carrying these classes, the way the templates declare their cards. */
function section(...classes: string[]): ElementShape {
  return { name: 'section', classes };
}

function firstCard(template: string): TmplAstElement {
  const [card] = glassCardsIn(parse(template, 'case.html'));

  if (!card) {
    throw new Error('the case template has no glass card');
  }

  return card;
}

describe('glass-card padding (869f6td0f)', () => {
  it('pads every glass card from a stylesheet its own component can see', () => {
    const cards = collectGlassCards();

    // 152 when this was written; the floor stops a broken template walk passing as an empty loop.
    expect(
      cards.length,
      'the template walk found fewer glass cards than exist',
    ).toBeGreaterThanOrEqual(150);

    const unpadded = cards
      .filter((card) => card.padding === null)
      .map((card) => `${card.at} [${card.classes.join(' ')}]`);

    expect(
      unpadded,
      "these glass cards have no padding their own component can see. Give one of the card's classes " +
        "`padding` in its component's stylesheet, in its page's own style panels, or in src/styles.scss - " +
        "never rely on another page's panel, which is only loaded once that page has been opened",
    ).toEqual([]);
  });

  it('reaches all three kinds of stylesheet, and the wrapper route, on the real tree', () => {
    const cards = collectGlassCards();
    const find = (template: string, className: string) =>
      cards.find((card) => card.at.startsWith(`${template}:`) && card.classes.includes(className))
        ?.padding;

    expect(find('src/app/pages/settings/settings.page.html', 'intro-card')).toEqual({
      route: 'the card',
      sheet: 'src/app/pages/settings/settings.page.scss',
    });
    expect(
      find('src/app/pages/auto-team-builder/auto-team-builder.page.html', 'builder-intro-card'),
    ).toEqual({
      route: 'the card',
      sheet: 'src/styles.scss',
    });
    expect(find('src/app/pages/home/home.page.html', 'first-run-transfer')).toEqual({
      route: 'the card',
      sheet: 'src/app/pages/home/home-layout-panel.component.scss',
    });
    expect(find('src/app/pages/characters/characters.page.html', 'character-card')).toEqual({
      route: 'its one in-flow child',
      sheet: 'src/app/pages/characters/characters-catalog-list-panel.component.scss',
    });
  });

  it('sees every template that carries a glass card', () => {
    const owned = new Set(
      readComponents().flatMap((component) => (component.template ? [component.template] : [])),
    );
    const carriers = sourceFiles.filter(
      (file) =>
        /\.(?:html|ts)$/u.test(file) &&
        !file.endsWith('.spec.ts') &&
        readFileSync(file, 'utf8').includes('glass-card'),
    );

    // An inline `template:` or an orphan .html would be skipped silently by the walk above.
    expect(carriers.filter((file) => !owned.has(file)).map((file) => relative(ROOT, file))).toEqual(
      [],
    );
  });

  it('credits the subject of a selector, never an ancestor, a longer name or a missing modifier', () => {
    const card = section('glass-card', 'game-version-card');
    const cases: Record<string, string | null> = {
      // Each of these pads something INSIDE the card, and names the card only as an ancestor.
      '.game-version-card .section-head { padding: 12px; }': null,
      '.game-version-card > p { padding: 12px; }': null,
      '.game-version-card { .section-head { padding: 12px; } }': null,
      // A longer class starting with the same letters, and a class named only to exclude it.
      '.game-version-card-note { padding: 12px; }': null,
      '.card:not(.game-version-card) { padding: 12px; }': null,
      // A modifier the card does not carry, and a tag it is not.
      '.game-version-card.game-version-card--wide { padding: 12px; }': null,
      'article.game-version-card { padding: 12px; }': null,
      // The card itself, however the selector reaches it.
      '.game-version-card { padding: 18px; }': 'case.scss',
      '.settings-shell .game-version-card { padding: 18px; }': 'case.scss',
      '.intro-card, .game-version-card { padding: 18px; }': 'case.scss',
      'section.game-version-card { padding: 18px; }': 'case.scss',
      '.settings-shell { .game-version-card { padding: 18px; } }': 'case.scss',
    };

    for (const [source, expected] of Object.entries(cases)) {
      expect(sheetPadding(sheet(source), card), source).toBe(expected);
    }

    // The first rule above does pad the element it is really about.
    expect(
      sheetPadding(sheet('.game-version-card .section-head { padding: 12px; }'), {
        name: 'div',
        classes: ['section-head'],
      }),
    ).toBe('case.scss');
  });

  it('does not credit padding that holds only on some screens, some sides or some states', () => {
    const card = section('glass-card', 'card');
    const cases: Record<string, string | null> = {
      '@media (max-width: 679px) { .card { padding: 14px; } }': null,
      '.card { padding: 0 18px; }': null,
      '.card { padding-top: 8px; }': null,
      '.card { padding: 0; }': null,
      '.card::before { padding: 8px; }': null,
      '.card:hover { padding: 8px; }': null,
      '.card { padding: 18px; }': 'case.scss',
      '.card { padding: 12px 14px 16px; }': 'case.scss',
      '.card { padding-block: 8px; padding-inline: calc(4px + 1vw); }': 'case.scss',
      '.card { padding-block: 8px; } .card { padding-inline: 12px; }': 'case.scss',
    };

    for (const [source, expected] of Object.entries(cases)) {
      expect(sheetPadding(sheet(source), card), source).toBe(expected);
    }
  });

  it('credits an inner wrapper only when all of the content is in it', () => {
    const rules = sheet(`
      .card__link { padding: 14px; }
      .section-label { padding: 8px 12px; }
      .card__favorite { position: absolute; }
    `);
    const wrapped = (template: string) => paddingOf(firstCard(template), rules)?.route ?? null;

    // The character cards: one padded link holds everything.
    expect(wrapped('<article class="glass-card card"><a class="card__link">x</a></article>')).toBe(
      'its one in-flow child',
    );
    // The Rumble character cards: a favourite button positioned out of the flow does not count.
    expect(
      wrapped(
        '<article class="glass-card card"><button class="card__favorite"></button><a class="card__link">x</a></article>',
      ),
    ).toBe('its one in-flow child');
    // Control flow and ng-container render no element of their own.
    expect(
      wrapped(
        '<section class="glass-card card">@if (a) { <ng-container><a class="card__link">x</a></ng-container> }</section>',
      ),
    ).toBe('its one in-flow child');
    // Character Edit's editor cards: the first child is a padded pill, the form beside it is not.
    expect(
      wrapped(
        '<section class="glass-card card"><div class="section-label">x</div><div class="form-grid"></div></section>',
      ),
    ).toBeNull();
    // Character Edit's feedback card: the message is loose text on the card itself.
    expect(
      wrapped(
        '<section class="glass-card card"><a class="card__link">x</a>{{ message }}</section>',
      ),
    ).toBeNull();
  });
});
