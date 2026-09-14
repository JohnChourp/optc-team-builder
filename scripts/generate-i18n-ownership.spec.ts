import { globSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  buildOwnershipMap,
  collectNamespaceReferences,
  formatOwnershipResult,
  I18N_ROOT,
  inspectOwnershipMap,
  OUTPUT_PATH,
} from './generate-i18n-ownership.mjs';

const projectRoot = path.resolve(import.meta.dirname, '..');
const files = globSync('src/app/**/*.{ts,html}', { cwd: projectRoot })
  .map((file) => file.split(path.sep).join('/'))
  .filter((file) => !file.endsWith('.spec.ts'))
  .sort();
const readFile = (file: string) => readFileSync(path.join(projectRoot, file), 'utf8');
const namespaceFolders = new Set(
  globSync('*/', { cwd: path.join(projectRoot, I18N_ROOT) }).map((entry) =>
    entry.replace(/[/\\]$/u, ''),
  ),
);
const map = buildOwnershipMap({ files, readFile, namespaceFolders });

describe('i18n namespace ownership', () => {
  it('owns every namespace that ships', () => {
    const result = inspectOwnershipMap(map);

    expect(result.errors).toEqual([]);
    expect(result.namespaceCount).toBeGreaterThan(20);
    expect(formatOwnershipResult(result)).toContain('every one owned');
  });

  it('matches the committed map exactly', () => {
    /*
     * The generated artifact is committed so a reader can open it, and this is
     * what stops it becoming a document ABOUT the code instead of a description
     * OF it - the failure mode of every hand-written map this subtask replaces.
     */
    const committed = JSON.parse(readFileSync(path.join(projectRoot, OUTPUT_PATH), 'utf8'));

    expect(committed).toEqual(map);
  });

  it('derives kind from where a scope is really referenced', () => {
    const byNamespace = new Map(map.entries.map((entry) => [entry.namespace, entry]));

    expect(byNamespace.get('faq')?.kind).toBe('page');
    expect(byNamespace.get('faq')?.owner).toBe('src/app/pages/faq/');
    expect(byNamespace.get('ship-picker')?.kind).toBe('component');
    expect(byNamespace.get('ship-picker')?.owner).toBe('src/app/shared/ship-picker/');
  });

  it('names the cross-namespace reads that caused the wrong Greek labels', () => {
    /*
     * This is the finding, not a formality. `faq.data.ts` reads the `settings`
     * scope: an FAQ entry quoting a button owned by another namespace. That is
     * the exact mechanism behind the six wrong Greek labels that reached
     * production, and it was invisible before this map existed.
     */
    const settings = map.entries.find((entry) => entry.namespace === 'settings');

    expect(settings?.kind).toBe('shared');
    expect(settings?.consumers).toContain('src/app/pages/faq/faq.data.ts');
    expect(settings?.consumers).toContain('src/app/pages/account/account.page.html');
  });

  it('goes red on a namespace nothing renders', () => {
    const withOrphan = buildOwnershipMap({
      files,
      readFile,
      namespaceFolders: new Set([...namespaceFolders, 'abandoned-namespace']),
    });
    const result = inspectOwnershipMap(withOrphan);

    expect(result.errors.join('\n')).toContain('"abandoned-namespace"');
    expect(result.errors.join('\n')).toContain('dead weight shipped to every reader');
  });

  it('goes red on a scope used with no translations behind it', () => {
    const result = inspectOwnershipMap({
      ...map,
      referencedWithoutFolder: ['ghost-scope'],
    });

    expect(result.errors.join('\n')).toContain('renders blank');
  });

  it('ignores the repository service’s "none" sentinel', () => {
    /*
     * `scope: 'none'` is OptcRepositoryService's marker for a captain with no
     * ability, not a translation namespace. Treating it as one would produce a
     * permanent false failure, which is how a guard gets switched off.
     */
    expect(map.referencedWithoutFolder).toContain('none');
    expect(inspectOwnershipMap(map).errors).toEqual([]);
  });

  it('finds both ways a scope is referenced', () => {
    const references = collectNamespaceReferences(
      ['fake.html', 'fake.ts'],
      (file) =>
        file.endsWith('.html')
          ? `<ng-container *transloco="let t; scope: 'from-template'; read: 'from-template'">`
          : `this.i18n.translate('some.key', undefined, 'from-typescript')`,
    );

    expect([...references.keys()].sort()).toEqual(['from-template', 'from-typescript']);
  });

  it('reports an unreadable tree instead of passing on nothing', () => {
    const empty = buildOwnershipMap({ files: [], readFile, namespaceFolders: new Set() });

    expect(inspectOwnershipMap(empty).errors.join('\n')).toContain('could not be read');
  });
});
