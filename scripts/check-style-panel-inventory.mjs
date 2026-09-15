#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

/**
 * The style-panel inventory, derived from source rather than written by hand.
 *
 * 869f17h1t / 869f17h36. 247 of this application's ~300 `@Component` declarations
 * are styling wrappers: 18 `*-style-panels.component.ts` files, each declaring a
 * chain of `app-*-panel` components with `ViewEncapsulation.None`,
 * `display: contents`, a single `<ng-content>` and one `styleUrl`.
 *
 * That is 82% of the component count, and nothing described it. A hand-written
 * table would be wrong within a release, so `docs/style-panel-pattern.md` carries
 * a GENERATED table between markers and this check fails when it drifts.
 *
 * Three things are enforced:
 *
 *   A. the table in the doc matches what the source actually declares;
 *   B. every panel selector is rendered somewhere - a wrapper nobody renders is
 *      the one case where this pattern really would be dead weight, and at the
 *      time of writing there are zero;
 *   C. a panel component still looks like one - `ViewEncapsulation.None` and a
 *      `styleUrl` - because the whole justification is that it is a lazily
 *      loaded stylesheet, and a wrapper without a stylesheet is just nesting.
 *
 * Run: npm run styles:panel-inventory
 */

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const DOC_PATH = 'docs/style-panel-pattern.md';
export const TABLE_START = '<!-- style-panel-inventory:start -->';
export const TABLE_END = '<!-- style-panel-inventory:end -->';

const HOST_SUFFIX = '-style-panels.component.ts';
const SELECTOR = /selector: '(app-[a-z0-9-]+)'/gu;
const TEMPLATE_LITERAL = /= `([\s\S]*?)`;/gu;
const PANEL_TAG = /<app-[a-z0-9-]+>/gu;

export function listFiles(root = projectRoot) {
  return execFileSync('git', ['ls-files', 'src'], { cwd: root, encoding: 'utf8', maxBuffer: 1e8 })
    .split('\n')
    .filter(Boolean);
}

export function readAll(files, root = projectRoot) {
  const sources = new Map();

  for (const file of files) {
    try {
      sources.set(file, readFileSync(path.join(root, file), 'utf8'));
    } catch {
      /* unreadable files cannot declare or render a panel */
    }
  }

  return sources;
}

/**
 * The deepest chain a file declares, counted as nested panel tags inside one
 * template literal. This is the number that appears in the DOM, so it is the one
 * worth recording.
 */
function deepestChain(source) {
  let deepest = 0;

  for (const [, body] of source.matchAll(TEMPLATE_LITERAL)) {
    const tags = body.match(PANEL_TAG)?.length ?? 0;

    if (tags > deepest) {
      deepest = tags;
    }
  }

  return deepest;
}

export function buildInventory(sources) {
  const hosts = [...sources.keys()].filter((file) => file.endsWith(HOST_SUFFIX)).sort();
  const rows = [];
  const unrendered = [];
  const malformed = [];

  for (const file of hosts) {
    const source = sources.get(file);
    const selectors = [...source.matchAll(SELECTOR)].map((match) => match[1]);

    for (const selector of selectors) {
      const tag = `<${selector}`;
      const renderedIn = [...sources.entries()].filter(
        ([other, contents]) => contents.includes(tag) && (other !== file || source.includes(tag)),
      );

      if (!renderedIn.length) {
        unrendered.push(`${file} :: ${selector}`);
      }
    }

    /*
     * C. A leaf wrapper that carries no stylesheet is nesting for its own sake.
     *
     * The COMPOSING component - the one whose selector ends in `-style-panels` -
     * is exempt and must be: it owns no stylesheet, only the `imports` and the
     * template that nests the leaves. Requiring a `styleUrl` of it flagged 15 of
     * the 18 hosts on the first run of this check. The remaining three files
     * declare no composer at all; their panels are imported directly by the page.
     *
     * 262 declarations - 15 composers = the 247 the component count is famous for.
     */
    const declarations = source.split('@Component').slice(1);

    for (const declaration of declarations) {
      const selector = declaration.match(/selector: '(app-[a-z0-9-]+)'/u)?.[1];

      if (!selector || selector.endsWith('-style-panels')) {
        continue;
      }

      if (!declaration.includes('ViewEncapsulation.None') || !declaration.includes('styleUrl')) {
        malformed.push(`${file} :: ${selector}`);
      }
    }

    const templates = [...sources.entries()].filter(
      ([other, contents]) =>
        other.endsWith('.html') && selectors.some((selector) => contents.includes(`<${selector}`)),
    );

    rows.push({
      host: path.basename(file).replace(HOST_SUFFIX, ''),
      panels: selectors.length,
      composers: selectors.filter((selector) => selector.endsWith('-style-panels')).length,
      depth: deepestChain(source),
      templates: templates.length,
    });
  }

  rows.sort((left, right) => right.panels - left.panels || left.host.localeCompare(right.host));

  const total = rows.reduce((sum, row) => sum + row.panels, 0);
  const composers = rows.reduce((sum, row) => sum + row.composers, 0);

  return { rows, unrendered, malformed, total, composers, leaves: total - composers };
}

export function renderTable({ rows, total }) {
  const lines = [
    '| Host | Panel components | Deepest chain | Templates that render it |',
    '| --- | ---: | ---: | ---: |',
    ...rows.map(
      (row) => `| \`${row.host}\` | ${row.panels} | ${row.depth} | ${row.templates} |`,
    ),
    `| **Total** | **${total}** | | |`,
  ];

  return lines.join('\n');
}

export function checkStylePanelInventory({ sources, doc }) {
  const errors = [];
  const inventory = buildInventory(sources);

  /* B. */
  for (const entry of inventory.unrendered) {
    errors.push(`${entry} is declared and rendered by nothing.`);
  }

  /* C. */
  for (const entry of inventory.malformed) {
    errors.push(
      `${entry} is not a style panel: it needs ViewEncapsulation.None and a styleUrl, which is the whole reason the wrapper exists.`,
    );
  }

  /* A. */
  const start = doc.indexOf(TABLE_START);
  const end = doc.indexOf(TABLE_END);

  if (start === -1 || end === -1) {
    errors.push(`${DOC_PATH} is missing the generated-table markers.`);

    return { errors, inventory };
  }

  const current = doc.slice(start + TABLE_START.length, end).trim();
  const expected = renderTable(inventory);

  if (current !== expected) {
    errors.push(
      `${DOC_PATH}'s inventory table is out of date. Regenerate it with \`npm run styles:panel-inventory -- --write\`.`,
    );
  }

  return { errors, inventory };
}

function main() {
  const sources = readAll(listFiles());
  const docPath = path.join(projectRoot, DOC_PATH);
  const doc = readFileSync(docPath, 'utf8');

  if (process.argv.includes('--write')) {
    const inventory = buildInventory(sources);
    const start = doc.indexOf(TABLE_START);
    const end = doc.indexOf(TABLE_END);
    const next = `${doc.slice(0, start + TABLE_START.length)}\n${renderTable(inventory)}\n${doc.slice(end)}`;

    writeFileSync(docPath, next);
    console.log(`[style-panels] wrote ${inventory.rows.length} rows to ${DOC_PATH}.`);

    return;
  }

  const { errors, inventory } = checkStylePanelInventory({ sources, doc });

  if (errors.length) {
    console.error('style-panel inventory check failed:\n');
    for (const error of errors) {
      console.error(`  - ${error}`);
    }
    process.exit(1);
  }

  console.log(
    `[style-panels] ${inventory.total} declarations across ${inventory.rows.length} hosts - ${inventory.leaves} leaf panels and ${inventory.composers} composers; inventory matches ${DOC_PATH}.`,
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
