#!/usr/bin/env node
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

/**
 * Ionic overlay contrast guard.
 *
 * This app is dark-only: `--ion-background-color` is #070b17. Ionic writes every
 * non-primary overlay colour as
 *
 *   color: var(--ion-color-step-N, var(--ion-text-color-step-M, <light literal>))
 *
 * so a theme that sets the two anchor tokens but not the step ramps gets the
 * hard-coded LIGHT literal on a near-black surface. That is not a hypothetical:
 * `.alert-radio-label` shipped at #262626 on #070b17 - a contrast ratio of
 * 1.30:1, effectively invisible - while `.alert-title` looked correct, because
 * the title is the one alert part wired to a token the theme did set. The bug
 * was then "fixed" twice by scoping a colour to one alert's cssClass, which left
 * that same alert's `.alert-message` at 4.14:1 and did nothing at all for the
 * next alert somebody added.
 *
 * So this guard checks the mechanism, not the symptom:
 *
 *   A. every step token Ionic dereferences for a contract overlay part is
 *      actually declared by the theme, so no chain reaches a light literal;
 *   B. the resolved colour of each contract part clears WCAG AA against the
 *      resolved overlay surface - 4.5:1 for text, 3:1 for borders and icons;
 *   C. no app stylesheet darkens an overlay surface without also colouring
 *      every text part of that overlay;
 *   D. no app stylesheet patches overlay text colour behind a cssClass, which
 *      is the idiom that let this recur.
 *
 * Run: npm run theme:overlay-contrast
 */

/** WCAG AA for normal-size body text. Both broken parts were 1rem, normal weight. */
export const TEXT_CONTRAST_THRESHOLD = 4.5;
/** WCAG AA for borders, icons and other non-text boundaries. */
export const NON_TEXT_CONTRAST_THRESHOLD = 3;

/**
 * The overlays this repo is allowed to render, and every part of each whose
 * colour has to be accounted for.
 *
 * `ion-popover` and `ion-modal` are here as a regression net, not because they
 * are broken: both take surface AND text from the two anchor tokens, which is
 * exactly why this app's modals looked right while its alerts did not. Keeping
 * them listed stops anyone concluding "our modals are fine, so overlays are
 * fine."
 */
export const OVERLAY_CONTRACT = {
  'ion-alert': {
    files: ['alert/alert.md.css', 'alert/alert.ios.css'],
    text: [
      '.alert-title',
      '.alert-sub-title',
      '.alert-message',
      '.alert-input-group',
      '.alert-input',
      '.alert-radio-label',
      '.alert-checkbox-label',
      '.alert-button',
      '.alert-tappable',
    ],
    nonText: ['.alert-radio-icon', '.alert-checkbox-icon'],
  },
  'ion-action-sheet': {
    files: ['action-sheet/action-sheet.md.css', 'action-sheet/action-sheet.ios.css'],
    text: ['.action-sheet-title', '.action-sheet-sub-title', '.action-sheet-button'],
    nonText: [],
  },
  'ion-toast': {
    files: ['toast/toast.md.css', 'toast/toast.ios.css'],
    text: ['.toast-header', '.toast-message', '.toast-button'],
    nonText: [],
  },
  'ion-loading': {
    files: ['loading/loading.md.css', 'loading/loading.ios.css'],
    text: ['.loading-content'],
    nonText: [],
  },
  'ion-popover': {
    files: ['popover/popover.md.css', 'popover/popover.ios.css'],
    text: [],
    nonText: [],
  },
  'ion-modal': {
    files: ['modal/modal.md.css', 'modal/modal.ios.css'],
    text: [],
    nonText: [],
  },
};

/**
 * Selectors that name an overlay surface an app stylesheet might darken, each
 * paired with the overlay host it belongs to.
 *
 * The host is declared rather than derived. It used to be computed as
 * `` `ion-${surface.split('-')[1]}` ``, which reads the SECOND segment: that
 * turns `.alert-wrapper` into `ion-wrapper` and `.action-sheet-group` into
 * `ion-sheet`, neither of which is a key of `OVERLAY_CONTRACT`. `contract` came
 * back undefined, `missing` was always empty, and assertion C was dead for five
 * of its nine selectors - every class-based one, which is to say every selector
 * an app stylesheet actually writes.
 */
const OVERLAY_SURFACE_SELECTORS = [
  { selector: 'ion-alert', host: 'ion-alert' },
  { selector: '.alert-wrapper', host: 'ion-alert' },
  { selector: 'ion-action-sheet', host: 'ion-action-sheet' },
  { selector: '.action-sheet-wrapper', host: 'ion-action-sheet' },
  { selector: '.action-sheet-group', host: 'ion-action-sheet' },
  { selector: 'ion-toast', host: 'ion-toast' },
  { selector: '.toast-wrapper', host: 'ion-toast' },
  { selector: 'ion-loading', host: 'ion-loading' },
  { selector: '.loading-wrapper', host: 'ion-loading' },
];

/**
 * The token families this theme owns and must therefore define completely.
 *
 * `--ion-color-step-*` is deliberately NOT here: Ionic's own dark palette leaves
 * that legacy family undefined and lets the chain fall to
 * `--ion-text-color-step-*`, so a missing `--ion-color-step-550` is the design,
 * not a defect. Component API properties (`--color`, `--button-color`,
 * `--spinner-color`) are set by Ionic on `:host`, not by a theme, so they are
 * not theme tokens either.
 */
const THEME_OWNED_TOKEN = /^--ion-(?:text|background)-color-step-\d+$/u;

/** `ion-alert.some-class ... { color: ... }` - the idiom that let this recur. */
const CSS_CLASS_SCOPED_OVERLAY = /ion-(?:alert|action-sheet|toast|loading|picker)\.[a-z0-9-]+/iu;

export function normalizePath(value) {
  return String(value ?? '')
    .replace(/\\/gu, '/')
    .replace(/^\.\/+/u, '')
    .trim();
}

/** Every `--token: value;` declared in a bare `:root { }` block. */
export function parseRootTokens(css) {
  const tokens = new Map();
  const text = String(css ?? '');
  const blockPattern = /(^|\})\s*:root\s*\{([^}]*)\}/gu;
  let block = blockPattern.exec(text);

  while (block) {
    const declarationPattern = /(--[\w-]+)\s*:\s*([^;]+);/gu;
    let declaration = declarationPattern.exec(block[2]);

    while (declaration) {
      tokens.set(declaration[1], declaration[2].trim());
      declaration = declarationPattern.exec(block[2]);
    }

    block = blockPattern.exec(text);
  }

  return tokens;
}

/**
 * Resolve a CSS value through the token map.
 *
 * Returns `{ value, missing }`: `missing` names the first `var()` whose token is
 * undefined AND whose fallback chain therefore decided the colour, which is the
 * exact shape of the bug this guard exists for.
 */
export function resolveValue(rawValue, tokens, depth = 0) {
  const value = String(rawValue ?? '').trim();

  if (depth > 8 || !value.includes('var(')) {
    return { value, missing: [] };
  }

  const open = value.indexOf('var(');
  let cursor = open + 4;
  let nesting = 1;

  while (cursor < value.length && nesting > 0) {
    if (value[cursor] === '(') {
      nesting += 1;
    } else if (value[cursor] === ')') {
      nesting -= 1;
    }
    cursor += 1;
  }

  const inner = value.slice(open + 4, cursor - 1);
  const comma = splitTopLevel(inner);
  const name = comma[0].trim();
  const fallback = comma.slice(1).join(',').trim();
  const missing = [];
  let replacement;

  if (tokens.has(name)) {
    replacement = tokens.get(name);
  } else {
    missing.push(name);
    replacement = fallback;
  }

  const resolvedInner = resolveValue(replacement, tokens, depth + 1);
  const rebuilt = value.slice(0, open) + resolvedInner.value + value.slice(cursor);
  const rest = resolveValue(rebuilt, tokens, depth + 1);

  return { value: rest.value, missing: [...missing, ...resolvedInner.missing, ...rest.missing] };
}

function splitTopLevel(value) {
  const parts = [];
  let depth = 0;
  let current = '';

  for (const character of value) {
    if (character === '(') {
      depth += 1;
    } else if (character === ')') {
      depth -= 1;
    }

    if (character === ',' && depth === 0) {
      parts.push(current);
      current = '';
      continue;
    }

    current += character;
  }

  parts.push(current);

  return parts;
}

export function parseColor(value) {
  const text = String(value ?? '').trim();
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/iu.exec(text);

  if (hex) {
    const digits = hex[1].length === 3 ? [...hex[1]].map((c) => c + c).join('') : hex[1];

    return [0, 2, 4].map((offset) => Number.parseInt(digits.slice(offset, offset + 2), 16));
  }

  const rgb = /^rgba?\(([^)]+)\)$/iu.exec(text);

  if (rgb) {
    const channels = rgb[1]
      .split(/[,/\s]+/u)
      .filter(Boolean)
      .slice(0, 3)
      .map((channel) => Number.parseFloat(channel));

    return channels.length === 3 && channels.every((channel) => Number.isFinite(channel))
      ? channels
      : null;
  }

  return null;
}

export function relativeLuminance([red, green, blue]) {
  const channels = [red, green, blue].map((channel) => {
    const normalized = channel / 255;

    return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
  });

  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

export function contrastRatio(foreground, background) {
  const first = relativeLuminance(foreground);
  const second = relativeLuminance(background);
  const lighter = Math.max(first, second);
  const darker = Math.min(first, second);

  return Math.round(((lighter + 0.05) / (darker + 0.05)) * 100) / 100;
}

/** `.alert-radio-label { ... color: X; ... }` from an Ionic component stylesheet. */
export function findPartColor(css, part) {
  const escaped = part.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
  const rulePattern = new RegExp(`(^|[},])([^{}]*${escaped}[^{}]*)\\{([^}]*)\\}`, 'gu');
  let rule = rulePattern.exec(css);

  while (rule) {
    const selector = rule[2].trim();
    const declarations = rule[3];
    const owns = selector
      .split(',')
      .some((entry) => entry.trim().endsWith(part) || entry.trim() === part);

    if (owns) {
      const color = /(?:^|[;{\s])color\s*:\s*([^;]+);/u.exec(declarations);

      if (color) {
        return { value: color[1].trim(), selector };
      }
    }

    rule = rulePattern.exec(css);
  }

  return null;
}

function listScssFiles(root) {
  const files = [];

  const walk = (directory) => {
    if (!existsSync(directory)) {
      return;
    }

    for (const entry of readdirSync(directory)) {
      const full = path.join(directory, entry);

      if (statSync(full).isDirectory()) {
        walk(full);
      } else if (entry.endsWith('.scss')) {
        files.push(full);
      }
    }
  };

  walk(root);

  return files.sort();
}

/** Strips comments so a selector named in prose is never read as a rule. */
export function stripScssComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//gu, '').replace(/(^|[^:])\/\/.*$/gmu, '$1');
}

/**
 * Every declaration block in a stylesheet, at every nesting depth, with its
 * selector resolved against its ancestors.
 *
 * This replaces a single flat regex, `/(^|[};])\s*([^{};@]+)\{([^}]*)\}/gu`,
 * which was wrong three ways at once and made assertions C and D bypassable by
 * anyone who put a patch somewhere other than an odd-numbered top-level slot:
 *
 *   1. STRIDE 2. The leading `(^|[};])` group CONSUMED the `}` closing the
 *      previous rule, so the next rule had no anchor left to match against.
 *      Measured on a file of eight sibling rules: it matched 1, 3, 5, 7.
 *   2. `@media` BLINDNESS. `[^{};@]+` cannot span an `@`, so the first rule
 *      inside any at-rule block was never matched at all.
 *   3. `&` NESTING. `[^}]*` swallowed a nested block whole, so a rule written
 *      as `ion-alert { &.optc-choice .alert-message { color: ... } }` was
 *      tested as the selector `ion-alert` - which `CSS_CLASS_SCOPED_OVERLAY`
 *      does not match, so assertion D never fired on it.
 *
 * Each returned block carries only its OWN declarations: a nested child's
 * declarations belong to the child, not to its parent, or a colour set three
 * levels down would be attributed to the outermost selector.
 */
export function readCssRules(source) {
  const css = stripScssComments(source);
  const rules = [];
  const stack = [];
  let prelude = '';
  let declarations = '';
  let preludeStart = 0;

  const lineAt = (index) => css.slice(0, index).split('\n').length;

  const resolve = (selector) => {
    const parents = stack.filter((entry) => !entry.atRule).map((entry) => entry.selector);
    let resolved = selector.trim().replace(/\s+/gu, ' ');

    for (let index = parents.length - 1; index >= 0; index -= 1) {
      resolved = resolved.includes('&')
        ? resolved.split('&').join(parents[index])
        : `${parents[index]} ${resolved}`;
    }

    return resolved.trim().replace(/\s+/gu, ' ');
  };

  for (let index = 0; index < css.length; index += 1) {
    const char = css[index];

    if (char === '{') {
      const trimmed = prelude.trim().replace(/\s+/gu, ' ');
      const atRule = trimmed.startsWith('@');

      if (atRule) {
        stack.push({ atRule: true, selector: '' });
      } else {
        // A prelude may list several selectors; each is its own rule, and each
        // has to be resolved separately so `a, b { }` nested under `c` yields
        // `c a` and `c b` rather than one comma-joined string.
        const selectors = trimmed
          .split(',')
          .map((part) => part.trim())
          .filter(Boolean);

        stack.push({
          atRule: false,
          selector: selectors.length === 1 ? resolve(selectors[0]) : trimmed,
          selectors: selectors.map((part) => resolve(part)),
          line: lineAt(preludeStart),
          declarations: '',
        });
      }

      prelude = '';
      declarations = '';
      continue;
    }

    if (char === '}') {
      const frame = stack.pop();

      if (frame && !frame.atRule) {
        const own = `${frame.declarations}${declarations}`;

        for (const selector of frame.selectors) {
          rules.push({ selector, declarations: own, line: frame.line });
        }
      }

      prelude = '';
      declarations = '';
      continue;
    }

    if (stack.length && !stack[stack.length - 1].atRule) {
      // Text between blocks belongs to the enclosing rule. Park it on the frame
      // so a child block opening mid-rule does not discard what came before it.
      if (char === ';') {
        stack[stack.length - 1].declarations += `${declarations};`;
        declarations = '';
        prelude = '';
        continue;
      }
    }

    if (prelude === '') {
      preludeStart = index;
    }

    prelude += char;
    declarations += char;
  }

  return rules;
}

/** Assertions C and D: what the app's own stylesheets do to overlays. */
export function inspectAppStylesheets(appRoot) {
  const findings = [];
  const files = listScssFiles(path.join(appRoot, 'src'));

  for (const file of files) {
    const css = readFileSync(file, 'utf8');
    const relative = normalizePath(path.relative(appRoot, file));

    for (const rule of readCssRules(css)) {
      const { selector, declarations, line } = rule;
      const setsColor = /(?:^|[;{\s])(?:color|--color|--button-color)\s*:/u.test(declarations);
      const setsBackground = /(?:^|[;{\s])(?:background|background-color|--background)\s*:/u.test(
        declarations,
      );

      if (CSS_CLASS_SCOPED_OVERLAY.test(selector) && setsColor) {
        findings.push({
          kind: 'css-class-scoped-overlay-text',
          file: relative,
          line,
          selector,
          detail:
            'Overlay text colour scoped to a cssClass. Style the overlay part unscoped instead, or the next overlay ships the same defect.',
        });
      }

      const surface = OVERLAY_SURFACE_SELECTORS.find((entry) =>
        selector.includes(entry.selector),
      );

      if (surface && setsBackground && !setsColor) {
        const contract = OVERLAY_CONTRACT[surface.host];
        const missing = (contract?.text ?? []).filter((part) => !css.includes(part));

        if (missing.length) {
          findings.push({
            kind: 'darkened-surface-without-text-parts',
            file: relative,
            line,
            selector,
            missing,
            detail: `${selector} sets a background but this stylesheet never colours ${missing.join(', ')}.`,
          });
        }
      }
    }
  }

  return { findings, checkedFiles: files.length };
}

export function inspectOverlayContrast({
  appRoot = process.cwd(),
  ionicRoot,
  textThreshold = TEXT_CONTRAST_THRESHOLD,
  nonTextThreshold = NON_TEXT_CONTRAST_THRESHOLD,
} = {}) {
  const componentsRoot =
    ionicRoot ?? path.join(appRoot, 'node_modules/@ionic/core/dist/collection/components');
  const tokens = new Map();

  for (const stylesheet of ['src/theme/variables.scss', 'src/styles.scss']) {
    const full = path.join(appRoot, stylesheet);

    if (existsSync(full)) {
      for (const [name, value] of parseRootTokens(readFileSync(full, 'utf8'))) {
        tokens.set(name, value);
      }
    }
  }

  const surfaceRaw = tokens.get('--ion-overlay-background-color') ?? tokens.get('--ion-background-color');
  const surfaceResolved = resolveValue(surfaceRaw ?? '', tokens);
  const surface = parseColor(surfaceResolved.value);
  const findings = [];
  let checkedDeclarations = 0;
  const checkedComponents = [];

  if (!existsSync(componentsRoot)) {
    /*
     * Every contract file used to be skipped with a bare `continue`, so with
     * this directory absent the run produced zero findings and printed
     * "passed" having read nothing at all. Ionic 9 deleting
     * `@ionic/angular/standalone` and moving ~30 symbols across ~100 subpaths
     * is exactly that shape of change, so this is a real path: the guard would
     * have gone green on the defect it was written for.
     */
    findings.push({
      kind: 'missing-overlay-stylesheet-root',
      detail: `${normalizePath(componentsRoot)} does not exist, so no Ionic overlay stylesheet could be read. Install @ionic/core, or repoint this check if Ionic has moved its compiled CSS.`,
    });
  }

  if (!surface) {
    findings.push({
      kind: 'unresolvable-surface',
      detail:
        'Neither --ion-overlay-background-color nor --ion-background-color resolves to a colour, so no overlay contrast can be judged.',
    });
  }

  for (const [component, contract] of Object.entries(OVERLAY_CONTRACT)) {
    for (const relativeFile of contract.files) {
      const full = path.join(componentsRoot, relativeFile);

      if (!existsSync(full)) {
        // A component may legitimately ship only one of its two platform
        // stylesheets. What must not happen is the run ending with nothing
        // checked at all, which the two guards below cover.
        continue;
      }

      const css = readFileSync(full, 'utf8');
      checkedComponents.push(`${component} (${relativeFile})`);

      const parts = [
        ...contract.text.map((part) => ({ part, threshold: textThreshold, kindOfPart: 'text' })),
        ...contract.nonText.map((part) => ({
          part,
          threshold: nonTextThreshold,
          kindOfPart: 'non-text',
        })),
      ];

      for (const { part, threshold, kindOfPart } of parts) {
        const declaration = findPartColor(css, part);

        if (!declaration) {
          continue;
        }

        checkedDeclarations += 1;
        const resolved = resolveValue(declaration.value, tokens);

        const undefinedThemeTokens = resolved.missing.filter((name) => THEME_OWNED_TOKEN.test(name));

        if (undefinedThemeTokens.length) {
          findings.push({
            kind: 'undefined-step-token',
            component,
            file: relativeFile,
            part,
            missing: undefinedThemeTokens,
            literal: resolved.value,
            detail: `${part} falls through ${undefinedThemeTokens.join(' -> ')} to Ionic's light-theme literal ${resolved.value}.`,
          });
          continue;
        }

        const color = parseColor(resolved.value);

        if (!color || !surface) {
          continue;
        }

        const ratio = contrastRatio(color, surface);

        if (ratio < threshold) {
          findings.push({
            kind: 'low-contrast',
            component,
            file: relativeFile,
            part,
            kindOfPart,
            color: resolved.value,
            ratio,
            threshold,
            detail: `${part} resolves to ${resolved.value} on the overlay surface - ${ratio}:1, below the ${threshold}:1 floor.`,
          });
        }
      }
    }
  }

  const stylesheets = inspectAppStylesheets(appRoot);
  findings.push(...stylesheets.findings);

  if (checkedDeclarations === 0) {
    /*
     * Belt to the braces above: even with every contract file present, a parser
     * change that stops matching declarations would leave this at zero while
     * reporting a clean run. The guard has to prove it did work, not just that
     * it found nothing wrong.
     */
    findings.push({
      kind: 'nothing-checked',
      detail:
        'No overlay colour declaration was read, so a clean result proves nothing. Check that the Ionic component CSS is installed and that findPartColor still matches it.',
    });
  }

  return {
    ok: findings.length === 0,
    findings,
    checkedDeclarations,
    checkedComponents,
    checkedStylesheets: stylesheets.checkedFiles,
    surface: surfaceResolved.value,
  };
}

export function formatOverlayContrastResult(result) {
  const lines = ['# Ionic overlay contrast check', ''];

  lines.push(
    `Checked ${result.checkedComponents.length} overlay stylesheet(s), ${result.checkedDeclarations} colour declaration(s), ${result.checkedStylesheets} app stylesheet(s).`,
  );
  lines.push(`Overlay surface resolves to ${result.surface || 'unknown'}.`);
  lines.push('');

  if (result.ok) {
    lines.push('Status: passed - every overlay part resolves to a theme token and clears WCAG AA.');
    lines.push('');

    return lines.join('\n');
  }

  lines.push(`Status: failed - ${result.findings.length} finding(s).`);
  lines.push('');

  for (const finding of result.findings) {
    const where = finding.file ? `${finding.file}${finding.line ? `:${finding.line}` : ''}` : finding.component ?? '';
    lines.push(`- [${finding.kind}] ${where} ${finding.part ?? finding.selector ?? ''}`.trimEnd());
    lines.push(`  ${finding.detail}`);
  }

  lines.push('');

  return lines.join('\n');
}

function parseArgs(argv) {
  const args = { appRoot: process.cwd(), json: false };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === '--app-root') {
      index += 1;
      args.appRoot = argv[index];
    } else if (arg.startsWith('--app-root=')) {
      args.appRoot = arg.slice('--app-root='.length);
    } else if (arg === '--json') {
      args.json = true;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return args;
}

function main() {
  try {
    const args = parseArgs(process.argv.slice(2));
    const result = inspectOverlayContrast({ appRoot: args.appRoot });

    if (args.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      process.stdout.write(formatOverlayContrastResult(result));
    }

    if (!result.ok) {
      process.exitCode = 1;
    }
  } catch (error) {
    console.error(`[overlay-contrast] ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main();
}
