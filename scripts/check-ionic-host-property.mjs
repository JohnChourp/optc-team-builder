#!/usr/bin/env node
/**
 * 869f127db. The trap: an Ionic custom property NEVER reaches the host element.
 *
 * `--border-radius` and friends are consumed inside the component's shadow DOM, on parts like
 * `.button-native`. After
 *
 *     ion-button.something { --border-radius: 999px; }
 *
 * the button LOOKS round while `getComputedStyle(host).borderRadius` is still `0px`. Anything on
 * the host that reads the real property therefore sees a square: a `border-radius: inherit`
 * pseudo-element renders square with its corners hanging outside the visible shape, `overflow:
 * hidden` clips to a square so it cannot catch the overhang, and `clip-path` and masks have the
 * same problem.
 *
 * That is exactly how the Captain Coverage crown shipped in v0.2.0 - a round button with four
 * translucent triangles at its corners. The rule was written into `CLAUDE.md` and guarded by
 * nothing: `theme:overlay-contrast` covers the overlay COLOUR family and says nothing about this.
 *
 * The check: a host selector that sets a shape-defining Ionic custom property without the matching
 * plain property, while that same host carries something that reads the real property - a
 * pseudo-element, a clipping `overflow`, a `clip-path`, or a mask.
 *
 * Reuses `readCssRules` from the overlay-contrast guard rather than parsing SCSS a second time.
 * A reader that only saw depth-0 rules once passed the very tree it existed to reject, and one
 * shared reader is one place for that to be got right.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import { readCssRules, stripScssComments } from './check-ionic-overlay-contrast.mjs';
import { pathToFileURL } from 'node:url';

/**
 * The Ionic custom properties that define a SHAPE the host can be asked to reproduce. Colour and
 * spacing properties are deliberately absent: nothing on the host inherits them in a way that can
 * render wrong, which is what this guard is about.
 */
export const SHAPE_CUSTOM_PROPERTIES = Object.freeze({
  '--border-radius': 'border-radius',
});

/** Values that define no shape, so a host has nothing to mirror. */
const EMPTY_VALUES = new Set(['', 'initial', 'inherit', 'unset', 'revert', 'none', '0', '0px']);

/** `overflow` values that clip. `visible` does not, and neither does an unset property. */
const CLIPPING_OVERFLOW = new Set(['hidden', 'clip', 'auto', 'scroll']);

export function listScssFiles(root) {
  const files = [];

  const walk = (dir) => {
    let entries;

    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }

    for (const entry of entries) {
      const full = path.join(dir, entry);
      let info;

      try {
        info = statSync(full);
      } catch {
        continue;
      }

      if (info.isDirectory()) {
        walk(full);
      } else if (entry.endsWith('.scss')) {
        files.push(full);
      }
    }
  };

  walk(root);

  return files.sort();
}

export function parseDeclarations(block = '') {
  const declarations = new Map();

  for (const piece of stripScssComments(block).split(';')) {
    const separator = piece.indexOf(':');

    if (separator === -1) {
      continue;
    }

    const property = piece.slice(0, separator).trim().toLowerCase();
    const value = piece.slice(separator + 1).trim();

    if (property && !property.startsWith('@')) {
      declarations.set(property, value);
    }
  }

  return declarations;
}

/**
 * The host a selector belongs to: the same selector with any trailing pseudo-element or
 * pseudo-class removed, so `.crown::after`, `.crown:hover` and `.crown` all resolve to `.crown`.
 */
export function resolveHostSelector(selector) {
  return selector
    .split(',')
    .map((part) => part.trim().replace(/:{1,2}[a-z-]+(\([^)]*\))?/giu, '').trim())
    .filter(Boolean)
    .join(', ');
}

export function hasPseudoElement(selector) {
  return /::(before|after)\b/iu.test(selector);
}

function isMeaningfulShape(value) {
  return !EMPTY_VALUES.has(String(value ?? '').trim().toLowerCase());
}

/**
 * Every host that sets a shape custom property, with what it declared and what its own pseudo
 * elements and clipping declarations do. Built across ALL rules first, because the host rule and
 * the `::after` that exposes the bug are usually two separate top-level blocks.
 */
export function collectHostShapeUsage(rules) {
  const hosts = new Map();

  const hostFor = (selector, line) => {
    const key = resolveHostSelector(selector);

    if (!hosts.has(key)) {
      hosts.set(key, {
        selector: key,
        line,
        customProperties: new Map(),
        plainProperties: new Map(),
        clips: [],
        pseudoElements: [],
      });
    }

    const host = hosts.get(key);

    if (line < host.line) {
      host.line = line;
    }

    return host;
  };

  for (const rule of rules) {
    const declarations = parseDeclarations(rule.declarations);
    const host = hostFor(rule.selector, rule.line);

    if (hasPseudoElement(rule.selector)) {
      host.pseudoElements.push({ selector: rule.selector, line: rule.line });
      continue;
    }

    for (const [property, value] of declarations) {
      if (property in SHAPE_CUSTOM_PROPERTIES && isMeaningfulShape(value)) {
        host.customProperties.set(property, { value, line: rule.line });
      }

      if (Object.values(SHAPE_CUSTOM_PROPERTIES).includes(property) && isMeaningfulShape(value)) {
        host.plainProperties.set(property, { value, line: rule.line });
      }

      if (property === 'overflow' || property === 'overflow-x' || property === 'overflow-y') {
        if (value.split(/\s+/u).some((part) => CLIPPING_OVERFLOW.has(part.toLowerCase()))) {
          host.clips.push({ reason: `${property}: ${value}`, line: rule.line });
        }
      }

      if (property === 'clip-path' && isMeaningfulShape(value)) {
        host.clips.push({ reason: `clip-path: ${value}`, line: rule.line });
      }

      if ((property === 'mask' || property === 'mask-image' || property === '-webkit-mask-image') && isMeaningfulShape(value)) {
        host.clips.push({ reason: `${property}: ${value}`, line: rule.line });
      }
    }
  }

  return hosts;
}

export function inspectHostShapeUsage(rules, { relativePath = '' } = {}) {
  const findings = [];

  for (const host of collectHostShapeUsage(rules).values()) {
    for (const [customProperty, declaration] of host.customProperties) {
      const plainProperty = SHAPE_CUSTOM_PROPERTIES[customProperty];

      if (host.plainProperties.has(plainProperty)) {
        continue;
      }

      // The custom property alone is not a defect. It becomes one the moment something on the host
      // reads the REAL property - which is what these two are.
      const exposures = [
        ...host.pseudoElements.map((pseudo) => `pseudo-element ${pseudo.selector}`),
        ...host.clips.map((clip) => clip.reason),
      ];

      if (exposures.length === 0) {
        continue;
      }

      findings.push({
        file: relativePath,
        selector: host.selector,
        line: declaration.line,
        customProperty,
        plainProperty,
        value: declaration.value,
        exposures,
      });
    }
  }

  return findings;
}

export function inspectIonicHostProperties({ appRoot = process.cwd(), sourceRoot = 'src' } = {}) {
  const root = path.join(appRoot, sourceRoot);
  const files = listScssFiles(root);
  const findings = [];

  for (const file of files) {
    const relativePath = path.relative(appRoot, file).split(path.sep).join('/');
    const rules = readCssRules(readFileSync(file, 'utf8'));

    findings.push(...inspectHostShapeUsage(rules, { relativePath }));
  }

  return { checkedFiles: files.length, findings, ok: findings.length === 0 };
}

export function formatIonicHostPropertyResult(result) {
  if (result.ok) {
    return `[ionic:host-property] checked ${result.checkedFiles} stylesheet(s); every shape custom property that the host can be asked to reproduce is mirrored.`;
  }

  const lines = [
    `[ionic:host-property] found ${result.findings.length} host selector(s) whose shape never reaches the host:`,
  ];

  for (const finding of result.findings) {
    lines.push(`- ${finding.file}:${finding.line} ${finding.selector}`);
    lines.push(`  sets ${finding.customProperty}: ${finding.value} and no ${finding.plainProperty}`);
    lines.push(`  read by: ${finding.exposures.join(', ')}`);
    lines.push(
      `  An Ionic custom property is consumed inside the shadow DOM, so the host's own ${finding.plainProperty} stays 0.`,
    );
    lines.push(`  Add \`${finding.plainProperty}: ${finding.value};\` next to it, and keep the two adjacent.`);
  }

  return lines.join('\n');
}

function parseArgs(argv) {
  const options = { appRoot: process.cwd(), sourceRoot: 'src' };

  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--app-root') {
      options.appRoot = argv[index + 1] ?? options.appRoot;
      index += 1;
    } else if (argv[index] === '--source-root') {
      options.sourceRoot = argv[index + 1] ?? options.sourceRoot;
      index += 1;
    }
  }

  return options;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const result = inspectIonicHostProperties(parseArgs(process.argv.slice(2)));

  console.log(formatIonicHostPropertyResult(result));

  if (!result.ok) {
    process.exit(1);
  }
}
