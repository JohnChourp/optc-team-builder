import { describe, expect, it } from 'vitest';

import {
  NON_LANE_TEST_SCRIPTS,
  TABLE_END,
  TABLE_START,
  buildInventory,
  checkNpmScriptInventory,
  classify,
  extractInvokedScriptNames,
  mentionsScript,
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
  describe('C - a lane naming a script package.json does not have', () => {
    /*
     * 869f135tn. The fixture is the test.
     *
     * C used to ask whether the lane command CONTAINS any script name as a
     * substring, and `ng` and `test` are real script names in this repository.
     * Every lane command is `npm run <something>`, so every one of them contains
     * `test`; C could not fail on the real tree no matter what was deleted.
     *
     * The old spec passed only because its fixture happened to hold neither
     * name. These two include both, so a regression to substring matching turns
     * the first case green - which is the failure this was written to catch.
     */
    const SCRIPTS_WITH_SHORT_NAMES = {
      ...SCRIPTS,
      ng: 'ng',
      test: 'ng test',
    };

    it('fails when a lane invokes a script that is gone', () => {
      const errors = run({
        scripts: SCRIPTS_WITH_SHORT_NAMES,
        suites: { orphaned: { label: 'Gone', command: 'npm run test:deleted' } },
      }).errors;

      expect(errors.some((error) => error.includes('`npm run test:deleted`'))).toBe(true);
    });

    it('checks EVERY script a command invokes, not just the first', () => {
      const errors = run({
        scripts: SCRIPTS_WITH_SHORT_NAMES,
        suites: {
          chained: {
            label: 'Chained',
            command: 'npm run test:ci-routing && npm run test:vanished',
          },
        },
      }).errors;

      expect(errors.some((error) => error.includes('`npm run test:vanished`'))).toBe(true);
    });

    it('stays quiet when every invoked script exists', () => {
      const errors = run({
        scripts: SCRIPTS_WITH_SHORT_NAMES,
        suites: {
          'ci-routing': { label: 'CI routing', command: 'npm run test:ci-routing' },
        },
      }).errors;

      expect(errors.filter((error) => error.includes('npm run'))).toEqual([]);
    });

    it('fails a lane whose command invokes no npm script at all', () => {
      const errors = run({
        scripts: SCRIPTS_WITH_SHORT_NAMES,
        suites: { inline: { label: 'Inline', command: 'npx vitest run scripts/x.spec.ts' } },
      }).errors;

      expect(errors.some((error) => error.includes('invokes no npm script at all'))).toBe(true);
    });
  });

  /* D. */
  describe('D - a test: script that is not a lane', () => {
    /*
     * 869f135tn. The direction the subtask names, and the one that was missing.
     * Without it, adding `test:my-guard` to package.json and forgetting the
     * SCRIPT_SUITES entry ships a guard nobody ever runs - and every other check
     * stays green, because the script IS classified: something references it.
     */
    it('fails when a test: script has no lane of the same id', () => {
      const errors = run({
        scripts: { ...SCRIPTS, 'test:my-guard': 'vitest run scripts/my-guard.spec.ts' },
        sources: new Map([
          ...SOURCES,
          ['docs/maintainer-validation-guide.md', 'Run `npm run test:my-guard` by hand.'],
        ]),
      }).errors;

      expect(errors.some((error) => error.includes('never runs in verify:local'))).toBe(true);
    });

    it('stays quiet for a test: script the allowlist covers', () => {
      const errors = run({
        scripts: { ...SCRIPTS, 'test:e2e': 'playwright test' },
        sources: new Map([
          ...SOURCES,
          ['docs/maintainer-validation-guide.md', 'Run `npm run test:e2e` by hand.'],
        ]),
      }).errors;

      expect(errors.some((error) => error.includes('never runs in verify:local'))).toBe(false);
    });

    it('stays quiet when the lane exists', () => {
      const errors = run({
        scripts: { ...SCRIPTS, 'test:paired': 'vitest run scripts/paired.spec.ts' },
        suites: {
          ...SUITES,
          paired: { label: 'Paired', command: 'npm run test:paired' },
        },
      }).errors;

      expect(errors.some((error) => error.includes('never runs in verify:local'))).toBe(false);
    });

    it('keeps the allowlist to the eight measured exemptions', () => {
      /*
       * The allowlist is check D's escape hatch, so a row added to silence a
       * failure IS the failure. Pinning the size makes adding one a deliberate
       * edit to this test rather than a quiet line in a map.
       */
      expect(NON_LANE_TEST_SCRIPTS.size).toBe(8);

      for (const reason of NON_LANE_TEST_SCRIPTS.values()) {
        expect(reason.length).toBeGreaterThan(30);
      }
    });
  });

  describe('extractInvokedScriptNames', () => {
    it('reads the script out of a plain lane command', () => {
      expect(extractInvokedScriptNames('npm run test:ability-tags')).toEqual(['test:ability-tags']);
    });

    it('reads every script from a chained command', () => {
      expect(
        extractInvokedScriptNames('npx vitest run a.spec.ts && npm run dataset:spec-pins'),
      ).toEqual(['dataset:spec-pins']);
    });

    it('does not invent a script from a command that runs none', () => {
      expect(extractInvokedScriptNames('npx cap sync')).toEqual([]);
    });

    it('keeps the whole scoped name, including colons and dots', () => {
      expect(extractInvokedScriptNames('npm run test:e2e:chromium')).toEqual(['test:e2e:chromium']);
    });
  });

  describe('mentionsScript', () => {
    /*
     * 869f135tn. The boundary is `[\w:@./-]` rather than `\b`, because script
     * names carry colons and dots. Each of these was a real wrong row in the
     * generated table before this existed.
     */
    it('does not match a longer script name that starts the same way', () => {
      expect(mentionsScript('npm run dataset:measurements', 'dataset:measure')).toBe(false);
      expect(mentionsScript('npm run test:e2e:chromium', 'test:e2e')).toBe(false);
      expect(mentionsScript('npm run config:app:web-strict', 'config:app')).toBe(false);
    });

    it('does not match the letters inside an ordinary word', () => {
      expect(mentionsScript('the job is still running', 'ng')).toBe(false);
      expect(mentionsScript('the latest run', 'test')).toBe(false);
    });

    it('does not match a command-line flag that shares the name', () => {
      expect(mentionsScript('ng test --watch=false', 'watch')).toBe(false);
    });

    it('still matches a real mention', () => {
      expect(mentionsScript('npm run dataset:measure', 'dataset:measure')).toBe(true);
      expect(mentionsScript('run: npm run build', 'build')).toBe(true);
      expect(mentionsScript('ng test', 'ng')).toBe(true);
    });
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
