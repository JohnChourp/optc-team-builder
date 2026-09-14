#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { globSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import ts from 'typescript';

/**
 * Every browser-storage key the app writes must be registered, and every
 * durable one must be exported.
 *
 * 869f12x56. The registry is `src/app/core/data/browser-storage-keys.data.ts`;
 * this is what stops it becoming a document about the code rather than a
 * description of it. It reads the real source, finds every `*_KEY` constant and
 * every call that hands one to a storage API, and fails when:
 *
 *   A. a constant reaches storage and is not in the registry - the state
 *      `crewForgeImageProfiles` was in when a full export silently dropped it;
 *   B. the registry names a constant that no longer exists, or whose declared
 *      value or backend has changed underneath it;
 *   C. a `*_KEY` constant is neither registered nor listed as deliberately not
 *      storage, so "this is not a storage key" and "somebody forgot" stay
 *      distinguishable;
 *   D. a `durable-user-data` record names no export scope, or a non-durable one
 *      claims a scope - the second is how a credential would end up in a file;
 *   E. a NEW key uses a spelling that does not match its backend's convention.
 *      Existing odd spellings carry `legacySpelling: true` and are left alone,
 *      because renaming a key is silent data loss for everyone who has one.
 *
 * Run: npm run storage:keys
 */

const REGISTRY_PATH = 'src/app/core/data/browser-storage-keys.data.ts';

/** Spelling rules per backend, applied only to keys without `legacySpelling`. */
const CONVENTIONS = {
  preferences: {
    pattern: /^[a-z][A-Za-z0-9]*$/u,
    describe: 'camelCase with no separators, e.g. savedTeams',
  },
  local: {
    pattern: /^[a-z][A-Za-z0-9]*$/u,
    describe: 'camelCase with no separators',
  },
  session: {
    pattern: /^optc\.[a-z][A-Za-z0-9]*\.[a-z][A-Za-z0-9]*$/u,
    describe: 'optc.<screen>.<thing>, e.g. optc.savedTeams.viewState',
  },
};

const STORAGE_CALL_PATTERNS = [
  { pattern: /preferences\.(get|set|remove)$/u, backend: 'preferences' },
  { pattern: /(^|\.)localStorage\.(getItem|setItem|removeItem)$/u, backend: 'local' },
  { pattern: /(^|\.)sessionStorage\.(getItem|setItem|removeItem)$/u, backend: 'session' },
  /* `readJson`/`persistJson` wrap Capacitor Preferences inside UserStateService. */
  { pattern: /(readJson|persistJson|removeJson)$/u, backend: 'preferences' },
  /*
   * A Storage reached through a local alias, e.g.
   * `const storage = this.getLocalStorage(); storage.setItem(KEY, ...)`.
   *
   * This has to be last, and it has to exist: the first version of this file
   * matched only the literal `localStorage.`/`sessionStorage.` spellings, and
   * `GOOGLE_ACCOUNT_SESSION_KEY` - a CREDENTIAL - was therefore invisible to it.
   * The guard still passed, because that key happened to be registered; a new
   * one written the same way would have slipped past registration entirely,
   * which is the whole hole this check exists to close.
   *
   * The backend cannot be resolved from the call site, so it is recorded as
   * `unresolved`: registration is still enforced, and only the backend-equality
   * check is skipped for these. The registry states the backend, and the reader
   * of this file states how it was established.
   */
  { pattern: /\.(getItem|setItem|removeItem)$/u, backend: 'unresolved' },
];

function isSpec(filePath) {
  return filePath.endsWith('.spec.ts');
}

/** `*_KEY` string constants across the app, with the file that declares them. */
export function collectKeyConstants(files, readFile) {
  const constants = new Map();

  for (const file of files) {
    const sourceFile = ts.createSourceFile(file, readFile(file), ts.ScriptTarget.Latest, true);

    (function visit(node) {
      if (
        ts.isVariableDeclaration(node) &&
        /_KEY$/u.test(node.name.getText()) &&
        node.initializer &&
        ts.isStringLiteralLike(node.initializer)
      ) {
        constants.set(node.name.getText(), { value: node.initializer.text, file });
      }

      ts.forEachChild(node, visit);
    })(sourceFile);
  }

  return constants;
}

/** Which constants are handed to a storage API, and through which backend. */
export function collectStorageUsage(files, readFile, constantNames) {
  const usage = new Map();

  for (const file of files) {
    const sourceFile = ts.createSourceFile(file, readFile(file), ts.ScriptTarget.Latest, true);

    (function visit(node) {
      if (ts.isCallExpression(node)) {
        const callee = node.expression.getText();
        const match = STORAGE_CALL_PATTERNS.find((entry) => entry.pattern.test(callee));

        if (match) {
          const argumentText = node.arguments.map((argument) => argument.getText()).join(' ');

          for (const name of constantNames) {
            /*
             * Word-boundary, not `includes`. `SAVED_TEAMS_KEY` is a substring of
             * nothing here today, but `FAVORITES_KEY` and `FAVORITE_SHIPS_KEY`
             * are exactly the shape that would eventually collide.
             */
            if (new RegExp(`\\b${name}\\b`, 'u').test(argumentText)) {
              const backends = usage.get(name) ?? new Set();

              backends.add(match.backend);
              usage.set(name, backends);
            }
          }
        }
      }

      ts.forEachChild(node, visit);
    })(sourceFile);
  }

  return usage;
}

export function inspectBrowserStorageKeys({ registry, nonStorage, constants, usage }) {
  const errors = [];
  const byConstant = new Map(registry.map((record) => [record.constantName, record]));
  const nonStorageByConstant = new Map(nonStorage.map((entry) => [entry.constantName, entry]));

  if (registry.length === 0) {
    errors.push(`No records found in ${REGISTRY_PATH} - it could not be read.`);
  }

  if (constants.size === 0) {
    errors.push('No *_KEY constants found in src/ - the source could not be read.');
  }

  for (const [name, info] of constants) {
    const record = byConstant.get(name);
    const declaredNonStorage = nonStorageByConstant.get(name);
    const backends = usage.get(name);

    if (record && declaredNonStorage) {
      errors.push(
        `"${name}" is in the storage registry and also listed as not-storage. Remove one of the two.`,
      );
      continue;
    }

    if (backends && !record) {
      errors.push(
        `"${name}" (${info.value}) is written to ${[...backends].join(', ')} storage but is not in ` +
          `${REGISTRY_PATH}. Add it with its classification, or the export, the sync and the quota ` +
          'handler have no way to know what it holds.',
      );
      continue;
    }

    if (!backends && !record && !declaredNonStorage) {
      errors.push(
        `"${name}" is named like a storage key but reaches no storage API and is not listed in ` +
          'NON_STORAGE_KEY_CONSTANTS. Say which it is, so "not storage" stays distinguishable from ' +
          '"forgotten".',
      );
      continue;
    }

    if (record && record.value !== undefined && record.value !== info.value) {
      errors.push(
        `"${name}" is declared as "${info.value}" but registered as "${record.value}". ` +
          'A key\'s spelling is its identity - changing it orphans everyone who already has one.',
      );
    }

    const resolvedBackends = backends
      ? new Set([...backends].filter((backend) => backend !== 'unresolved'))
      : null;

    if (record && resolvedBackends?.size && !resolvedBackends.has(record.backend)) {
      errors.push(
        `"${name}" is registered as ${record.backend} storage but is used with ` +
          `${[...resolvedBackends].join(', ')}. The registry decides what the export and the sync carry, ` +
          'so it has to match where the value really is.',
      );
    }
  }

  for (const record of registry) {
    if (!constants.has(record.constantName)) {
      errors.push(
        `${REGISTRY_PATH} names "${record.constantName}", which no longer exists in src/. Remove the entry.`,
      );
      continue;
    }

    const convention = CONVENTIONS[record.backend];

    if (!record.legacySpelling && convention && !convention.pattern.test(record.key)) {
      errors.push(
        `"${record.key}" does not follow the ${record.backend} convention (${convention.describe}). ` +
          'Rename it before it ships, or mark it legacySpelling once readers have it.',
      );
    }

    if (record.classification === 'durable-user-data' && !record.exportedAs) {
      errors.push(
        `"${record.key}" is classified durable-user-data but names no export scope. Durable means ` +
          'it survives an export; without a scope that is a claim nothing checks.',
      );
    }

    if (record.classification !== 'durable-user-data' && record.exportedAs) {
      errors.push(
        `"${record.key}" is ${record.classification} but names an export scope. Only durable user ` +
          'data is exported - a credential or a device preference must never travel in a file.',
      );
    }

    if (typeof record.note !== 'string' || record.note.trim().length < 20) {
      errors.push(`"${record.key}" needs a real note saying what it holds and why it is that class.`);
    }
  }

  for (const entry of nonStorage) {
    if (!constants.has(entry.constantName)) {
      errors.push(
        `NON_STORAGE_KEY_CONSTANTS names "${entry.constantName}", which no longer exists. Remove the entry.`,
      );
    } else if (usage.has(entry.constantName)) {
      errors.push(
        `"${entry.constantName}" is listed as not-storage but is written to ` +
          `${[...usage.get(entry.constantName)].join(', ')} storage.`,
      );
    }
  }

  return {
    constantCount: constants.size,
    registeredCount: registry.length,
    nonStorageCount: nonStorage.length,
    errors,
  };
}

export function formatBrowserStorageKeysResult(result) {
  if (result.errors.length > 0) {
    return result.errors.map((error) => `[storage:keys] ${error}`).join('\n');
  }

  return (
    `[storage:keys] ${result.constantCount} *_KEY constants: ` +
    `${result.registeredCount} registered storage keys, ${result.nonStorageCount} declared not-storage.`
  );
}

async function main() {
  const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const registryModule = await import(
    `file://${path.join(projectRoot, 'scripts', 'lib', 'browser-storage-registry.mjs')}`
  );
  const files = globSync('src/**/*.ts', { cwd: projectRoot })
    .map((file) => file.split(path.sep).join('/'))
    .filter((file) => !isSpec(file));
  const readFile = (file) => readFileSync(path.join(projectRoot, file), 'utf8');
  const constants = collectKeyConstants(files, readFile);
  const usage = collectStorageUsage(files, readFile, [...constants.keys()]);
  const result = inspectBrowserStorageKeys({
    registry: registryModule.readStorageRegistry(projectRoot),
    nonStorage: registryModule.readNonStorageConstants(projectRoot),
    constants,
    usage,
  });
  const output = formatBrowserStorageKeysResult(result);

  if (result.errors.length > 0) {
    console.error(output);
    process.exitCode = 1;

    return;
  }

  console.log(output);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}

export { REGISTRY_PATH, CONVENTIONS };
