#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

/**
 * The components that actually render something, derived from source.
 *
 * 869f17h7q. If 247 of ~300 component declarations are styling wrappers, the rest
 * is the real user interface of this application - a small, comprehensible list
 * that nothing enumerated. Every other structural question becomes tractable once
 * it exists: which components are shared, which have specs, which carry a
 * style-panel chain.
 *
 * The number is 39, not the 53 the task assumed. 53 is 300 minus the 247 leaf
 * panels, which silently counts the 15 COMPOSING hosts as real - and a composer
 * renders nothing either. 247 leaves + 15 composers + 39 rendering components is
 * the whole set.
 *
 * Reach is the part worth getting right. 22 of the 39 appear in no template at
 * all, because they are routed pages the router reaches through `loadComponent`.
 * A check that only looked for `<app-thing>` tags would report them as dead, which
 * is precisely the mistake this project has recorded four times.
 *
 * Three things are enforced:
 *
 *   A. the table in the doc matches what the source declares;
 *   B. every rendering component is reachable - by a route or by a template. One
 *      that is neither is the real finding this lane exists for;
 *   C. a component is a wrapper, or it is listed. A new one that is neither fails.
 *
 * Run: npm run components:inventory
 */

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const DOC_PATH = 'docs/component-inventory.md';
export const ROUTES_PATH = 'src/app/app.routes.ts';
export const TABLE_START = '<!-- component-inventory:start -->';
export const TABLE_END = '<!-- component-inventory:end -->';

const PANEL_FILE = '-style-panels.component.ts';

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
      /* unreadable files declare nothing */
    }
  }

  return sources;
}

function areaOf(file) {
  if (file.startsWith('src/app/shared/')) {
    return 'shared';
  }

  if (file.startsWith('src/app/pages/')) {
    return 'page';
  }

  return 'shell';
}

export function buildInventory(sources) {
  const routes = sources.get(ROUTES_PATH) ?? '';
  const templates = [...sources.entries()].filter(([file]) => file.endsWith('.html'));
  const panelFolders = new Set(
    [...sources.keys()].filter((file) => file.endsWith(PANEL_FILE)).map((file) => path.dirname(file)),
  );

  const rows = [];

  for (const [file, source] of sources) {
    if (!file.endsWith('.ts') || file.endsWith('.spec.ts') || file.endsWith(PANEL_FILE)) {
      continue;
    }

    if (!source.includes('@Component')) {
      continue;
    }

    const componentClass = source.match(/export class (\w+)/u)?.[1] ?? '?';
    const selector = source.match(/selector: '([^']+)'/u)?.[1] ?? '';
    const importPath = file.replace(/^src\//u, './').replace(/\.ts$/u, '');

    /*
     * Routed pages appear in no template. The router reaches them through
     * `loadComponent: () => import('./pages/...')`, so the route file naming the
     * module - or the class - is the reach, and looking only for tags would call
     * 22 of these dead.
     */
    const routed =
      routes.includes(importPath.replace('./', './')) ||
      routes.includes(file.replace(/^src\//u, '').replace(/\.ts$/u, '')) ||
      routes.includes(componentClass);

    const hosts = selector
      ? templates.filter(([, contents]) => contents.includes(`<${selector}`)).length
      : 0;

    rows.push({
      componentClass,
      selector,
      file: file.replace('src/app/', ''),
      area: areaOf(file),
      routed,
      hosts,
      spec: sources.has(file.replace(/\.ts$/u, '.spec.ts')),
      stylePanels: panelFolders.has(path.dirname(file)),
    });
  }

  rows.sort(
    (left, right) =>
      left.area.localeCompare(right.area) || left.componentClass.localeCompare(right.componentClass),
  );

  return {
    rows,
    total: rows.length,
    withoutSpec: rows.filter((row) => !row.spec).length,
    unreachable: rows.filter((row) => !row.routed && row.hosts === 0),
  };
}

export function renderTable({ rows }) {
  const reach = (row) => (row.routed ? 'route' : `${row.hosts} template${row.hosts === 1 ? '' : 's'}`);

  return [
    '| Component | Area | Reached by | Spec | Style panels |',
    '| --- | --- | --- | :--: | :--: |',
    ...rows.map(
      (row) =>
        `| \`${row.componentClass}\` | ${row.area} | ${reach(row)} | ${row.spec ? 'yes' : '**no**'} | ${row.stylePanels ? 'yes' : '-'} |`,
    ),
  ].join('\n');
}

export function checkComponentInventory({ sources, doc }) {
  const errors = [];
  const inventory = buildInventory(sources);

  /* B. */
  for (const row of inventory.unreachable) {
    errors.push(
      `${row.componentClass} (${row.file}) is reached by no route and rendered by no template. Wire it, remove it, or establish what reaches it - do not assume it is dead.`,
    );
  }

  /* A and C. */
  const start = doc.indexOf(TABLE_START);
  const end = doc.indexOf(TABLE_END);

  if (start === -1 || end === -1) {
    errors.push(`${DOC_PATH} is missing the generated-table markers.`);

    return { errors, inventory };
  }

  if (doc.slice(start + TABLE_START.length, end).trim() !== renderTable(inventory)) {
    errors.push(
      `${DOC_PATH} is out of date. Regenerate it with \`npm run components:inventory -- --write\`.`,
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

    writeFileSync(
      docPath,
      `${doc.slice(0, start + TABLE_START.length)}\n${renderTable(inventory)}\n${doc.slice(end)}`,
    );
    console.log(`[components] wrote ${inventory.total} rows to ${DOC_PATH}.`);

    return;
  }

  const { errors, inventory } = checkComponentInventory({ sources, doc });

  if (errors.length) {
    console.error('component inventory check failed:\n');
    for (const error of errors) {
      console.error(`  - ${error}`);
    }
    process.exit(1);
  }

  console.log(
    `[components] ${inventory.total} rendering components; ${inventory.withoutSpec} without a spec; all reachable; inventory matches ${DOC_PATH}.`,
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
