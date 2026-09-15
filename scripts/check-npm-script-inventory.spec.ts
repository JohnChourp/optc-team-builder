import { describe, expect, it } from 'vitest';

import {
  TABLE_END,
  TABLE_START,
  buildInventory,
  checkNpmScriptInventory,
  classify,
  renderTable,
} from './check-npm-script-inventory.mjs';

/**
 * 869f17h73. Driven from a tree that passes. The classification order is the
 * substance: a lane is the strongest answer because it is both the caller and the
 * thing that breaks, and `unclassified` is the only failing state.
 */

const SCRIPTS = {
  'test:ci-routing': 'vitest run scripts/ci-check-routing.spec.ts',
  'seo:indexnow': 'node ./scripts/submit-indexnow.mjs',
  'build:pages': 'ng build',
  'verify:local': 'node ./scripts/verify-local.mjs',
  'cap:sync': 'npx cap sync',
};

const SUITES = { 'ci-routing': { label: 'CI routing', command: 'npm run test:ci-routing' } };

const REGISTRY = [
  { script: 'cap:sync', class: 'manual', reason: 'Capacitor sync, run by a developer by hand.' },
];

const SOURCES = new Map<string, string>([
  ['.github/workflows/deploy-pages.yml', 'run: npm run seo:indexnow'],
  ['scripts/verify-local.mjs', "command: 'npm run build:pages'"],
  ['docs/maintainer-validation-guide.md', 'Run `npm run verify:local` before review.'],
]);

function run(overrides = {}) {
  const base = { scripts: SCRIPTS, sources: SOURCES, suites: SUITES, registry: REGISTRY };
  const merged = { ...base, ...overrides };

  return checkNpmScriptInventory({
    ...merged,
    doc: `${TABLE_START}\n${renderTable(buildInventory(merged))}\n${TABLE_END}`,
    ...('doc' in overrides ? { doc: (overrides as { doc: string }).doc } : {}),
  });
}

describe('npm script inventory', () => {
  it('passes when every script classifies and the table matches', () => {
    expect(run().errors).toEqual([]);
  });

  it('classifies a lane command as a lane, which is both caller and casualty', () => {
    const inventory = buildInventory({ scripts: SCRIPTS, sources: SOURCES, suites: SUITES, registry: REGISTRY });
    const row = inventory.rows.find((entry) => entry.name === 'test:ci-routing');

    expect(row?.kind).toBe('lane');
    expect(row?.breaks).toContain('ci-routing');
  });

  it('prefers a workflow over a doc mention', () => {
    const row = buildInventory({ scripts: SCRIPTS, sources: SOURCES, suites: SUITES, registry: REGISTRY }).rows.find(
      (entry) => entry.name === 'seo:indexnow',
    );

    expect(row?.kind).toBe('workflow');
  });

  it('classifies a script another npm script calls', () => {
    const scripts = { ...SCRIPTS, 'build:all': 'npm run build:pages' };
    const row = buildInventory({ scripts, sources: SOURCES, suites: SUITES, registry: REGISTRY }).rows.find(
      (entry) => entry.name === 'build:pages',
    );

    expect(row?.kind).toBe('npm script');
    expect(row?.detail).toBe('build:all');
  });

  /*
   * A script file is a caller too - `verify-local.mjs` composes lane commands.
   * Leaving this out classified such a script as unclassified and would have
   * demanded a registry entry for something that genuinely runs.
   */
  it('classifies a script a plain script file drives', () => {
    const row = buildInventory({ scripts: SCRIPTS, sources: SOURCES, suites: SUITES, registry: REGISTRY }).rows.find(
      (entry) => entry.name === 'build:pages',
    );

    expect(row?.kind).toBe('script file');
    expect(row?.detail).toBe('verify-local.mjs');
  });

  /* A runbook naming a script IS a reference, and what breaks is a human step. */
  it('classifies a documented-only script rather than calling it an orphan', () => {
    const row = buildInventory({ scripts: SCRIPTS, sources: SOURCES, suites: SUITES, registry: REGISTRY }).rows.find(
      (entry) => entry.name === 'verify:local',
    );

    expect(row?.kind).toBe('documented');
    expect(row?.breaks).toBe('a documented manual step');
  });

  it('falls back to the registry entry, using its authored reason', () => {
    const row = buildInventory({ scripts: SCRIPTS, sources: SOURCES, suites: SUITES, registry: REGISTRY }).rows.find(
      (entry) => entry.name === 'cap:sync',
    );

    expect(row?.kind).toBe('manual');
    expect(row?.breaks).toContain('by hand');
  });

  /* B. The done-condition: a new script without a row fails. */
  it('fails on a script that classifies as nothing', () => {
    const scripts = { ...SCRIPTS, 'zz:new': 'node ./scripts/new.mjs' };

    expect(
      run({ scripts }).errors.some((error) => error.includes('zz:new resolves to no caller')),
    ).toBe(true);
  });

  /* C. */
  it('fails when a lane names a script package.json does not have', () => {
    const suites = { orphaned: { label: 'Gone', command: 'npm run test:deleted' } };

    expect(
      run({ suites }).errors.some((error) => error.includes('names no script package.json has')),
    ).toBe(true);
  });

  /* A. */
  it('fails when the table drifts from package.json', () => {
    const doc = `${TABLE_START}\n| Script | Reached by | What breaks without it |\n| --- | --- | --- |\n${TABLE_END}`;

    expect(run({ doc }).errors.some((error) => error.includes('out of date'))).toBe(true);
  });

  it('fails when the generated-table markers are missing', () => {
    expect(run({ doc: '# no markers' }).errors.some((error) => error.includes('markers'))).toBe(
      true,
    );
  });

  describe('classification order', () => {
    it('puts a lane ahead of a workflow that also names the script', () => {
      const sources = new Map(SOURCES);

      sources.set('.github/workflows/test.yml', 'run: npm run test:ci-routing');

      const result = classify({
        name: 'test:ci-routing',
        scripts: SCRIPTS,
        sources,
        lanes: Object.entries(SUITES),
        registered: new Map(),
      });

      expect(result.kind).toBe('lane');
    });
  });
});
