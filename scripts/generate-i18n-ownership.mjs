#!/usr/bin/env node
import { globSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

/**
 * Which page or component owns each i18n namespace, and who renders it.
 *
 * 869f12x61. `public/i18n/` holds 27 namespace folders. Some belong to a page
 * (`captain-coverage`, `saved-teams`, `faq`), some to a shared component
 * (`ability-picker`, `ship-picker`), and some are consumed from several hosts
 * (`ability-tag-sets`, `team-coverage-summary`). Nothing recorded which was
 * which, and the consequence has already been paid: this project shipped quoted
 * UI labels naming the wrong button in Greek - six of them reached production -
 * because a quote in one namespace refers to a label owned by another, and
 * nothing connected them.
 *
 * GENERATED FROM THE SOURCE, never hand-written, because a hand-written map is
 * the 28th copy of the same fact and drifts like all the others. The map is
 * derived from where each scope is actually referenced:
 *
 *   - `*transloco="let t; scope: 'x'"` in a template;
 *   - `translate(key, params, 'x')` in TypeScript.
 *
 * `kind` is then derived, not declared: a namespace referenced only from one
 * page directory is that page's; one referenced only from a single shared
 * component directory is that component's; one referenced from several
 * directories is shared, and its hosts are the pages that import it.
 *
 * Run: npm run i18n:ownership -- --write
 * Check: npm run i18n:ownership
 */

const OUTPUT_PATH = 'docs/i18n-namespace-ownership.json';
const I18N_ROOT = 'public/i18n';

/** Namespaces referenced by every source file, keyed by namespace. */
export function collectNamespaceReferences(files, readFile) {
  const references = new Map();
  const add = (namespace, file) => {
    const consumers = references.get(namespace) ?? new Set();

    consumers.add(file);
    references.set(namespace, consumers);
  };

  for (const file of files) {
    const source = readFile(file);

    for (const match of source.matchAll(/scope:\s*'([a-z][a-z0-9-]*)'/gu)) {
      /*
       * `scope: 'none'` is a repository-service sentinel, not a namespace.
       * Filtering by "does a folder exist" happens in the inspection, so this
       * only has to avoid inventing references.
       */
      add(match[1], file);
    }

    for (const match of source.matchAll(/translate\([^)]*?,\s*'([a-z][a-z0-9-]*)'\s*\)/gsu)) {
      add(match[1], file);
    }

    /*
     * 869f135ra. A scope passed as a CONSTANT is still a reference.
     *
     * Only the literal form was read, so a namespace whose scope name lives in an
     * exported constant looked like it was never used - by this map and by the
     * regression check's "no bundle that only a preloadScope keeps alive" rule,
     * which reads the same shapes. The `failures` namespace is the first to do it,
     * deliberately: it is read from inside catch blocks with no template to name a
     * scope, so a literal at every call site would be the thing that drifts.
     *
     * This resolves `const NAME = 'scope'` in the same file and then counts
     * `, NAME)`, which is the narrow, checkable version of the same idea.
     */
    for (const declaration of source.matchAll(
      /const\s+([A-Z][A-Z0-9_]*)\s*=\s*'([a-z][a-z0-9-]*)'/gu,
    )) {
      const [, constant, namespace] = declaration;

      if (new RegExp(`,\\s*${constant}\\s*\\)`, 'u').test(source)) {
        add(namespace, file);
      }
    }
  }

  return references;
}

function ownerDirectory(file) {
  const match = file.match(/^src\/app\/(pages|shared|core)\/([^/]+)\//u);

  return match ? { area: match[1], name: match[2], directory: `src/app/${match[1]}/${match[2]}/` } : null;
}

/** Which files import a given directory's component, so a shared namespace can name its hosts. */
function findImporters(directory, files, readFile) {
  const importers = new Set();
  const componentName = path.basename(directory.replace(/\/$/u, ''));

  for (const file of files) {
    if (file.startsWith(directory)) {
      continue;
    }

    const source = readFile(file);

    if (new RegExp(`from '[^']*${componentName}/${componentName}\\.component'`, 'u').test(source)) {
      importers.add(file);
    }
  }

  return importers;
}

export function buildOwnershipMap({ files, readFile, namespaceFolders }) {
  const references = collectNamespaceReferences(files, readFile);
  const entries = [];

  for (const namespace of [...namespaceFolders].sort()) {
    const consumers = [...(references.get(namespace) ?? new Set())].sort();
    const directories = [...new Set(consumers.map(ownerDirectory).filter(Boolean).map((owner) => owner.directory))];
    const owners = directories.map((directory) => ownerDirectory(`${directory}x`)).filter(Boolean);
    let kind = 'orphan';
    let owner = null;
    let hosts = [];

    if (directories.length === 1) {
      owner = directories[0];
      kind = owners[0]?.area === 'pages' ? 'page' : 'component';

      if (kind === 'component') {
        hosts = [...findImporters(owner, files, readFile)]
          .map((file) => ownerDirectory(file)?.directory)
          .filter(Boolean);
        hosts = [...new Set(hosts)].sort();
      }
    } else if (directories.length > 1) {
      kind = 'shared';
      hosts = directories.sort();
    }

    entries.push({
      namespace,
      kind,
      owner,
      hosts,
      consumers,
    });
  }

  const referencedWithoutFolder = [...references.keys()]
    .filter((namespace) => !namespaceFolders.has(namespace))
    .sort();

  return {
    schemaVersion: 1,
    description:
      'Generated by scripts/generate-i18n-ownership.mjs. Which page or component owns each i18n namespace, derived from where each scope is referenced. Do not edit by hand.',
    entries,
    referencedWithoutFolder,
  };
}

export function inspectOwnershipMap(map) {
  const errors = [];

  if (map.entries.length === 0) {
    errors.push(`No namespaces found under ${I18N_ROOT}/ - the tree could not be read.`);
  }

  for (const entry of map.entries) {
    if (entry.kind === 'orphan') {
      errors.push(
        `Namespace "${entry.namespace}" has a folder under ${I18N_ROOT}/ and no consumer in src/. ` +
          'Either something renders it and this check cannot see how, or it is dead weight shipped to ' +
          'every reader on every visit.',
      );
    }

    if (entry.kind !== 'orphan' && entry.consumers.length === 0) {
      errors.push(`Namespace "${entry.namespace}" is classified ${entry.kind} with no consumers.`);
    }
  }

  for (const namespace of map.referencedWithoutFolder) {
    /*
     * `none` is `OptcRepositoryService`'s sentinel for "no captain ability
     * scope", not a translation namespace. Everything else here is a real
     * reference to translations that do not exist - a blank label at runtime.
     */
    if (namespace === 'none') {
      continue;
    }

    errors.push(
      `"${namespace}" is used as a translation scope but has no folder under ${I18N_ROOT}/. ` +
        'Every key read from it renders blank.',
    );
  }

  return { namespaceCount: map.entries.length, errors };
}

export function formatOwnershipResult(result) {
  if (result.errors.length > 0) {
    return result.errors.map((error) => `[i18n:ownership] ${error}`).join('\n');
  }

  return `[i18n:ownership] ${result.namespaceCount} namespaces, every one owned.`;
}

function main() {
  const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const write = process.argv.includes('--write');
  const files = globSync('src/app/**/*.{ts,html}', { cwd: projectRoot })
    .map((file) => file.split(path.sep).join('/'))
    .filter((file) => !file.endsWith('.spec.ts'))
    .sort();
  const readFile = (file) => readFileSync(path.join(projectRoot, file), 'utf8');
  const namespaceFolders = new Set(
    globSync('*/', { cwd: path.join(projectRoot, I18N_ROOT) }).map((entry) =>
      entry.replace(/[/\\]$/u, ''),
    ),
  );
  const map = buildOwnershipMap({ files, readFile, namespaceFolders });
  const outputPath = path.join(projectRoot, ...OUTPUT_PATH.split('/'));
  const serialized = `${JSON.stringify(map, null, 2)}\n`;

  if (write) {
    writeFileSync(outputPath, serialized);
    console.log(`[i18n:ownership] wrote ${OUTPUT_PATH} with ${map.entries.length} namespaces.`);

    return;
  }

  const result = inspectOwnershipMap(map);

  if (result.errors.length === 0) {
    let committed = null;

    try {
      committed = readFileSync(outputPath, 'utf8');
    } catch {
      committed = null;
    }

    if (committed !== serialized) {
      console.error(
        `[i18n:ownership] ${OUTPUT_PATH} is out of date. Re-run: npm run i18n:ownership -- --write`,
      );
      process.exitCode = 1;

      return;
    }
  }

  const output = formatOwnershipResult(result);

  if (result.errors.length > 0) {
    console.error(output);
    process.exitCode = 1;

    return;
  }

  console.log(output);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}

export { OUTPUT_PATH, I18N_ROOT };
