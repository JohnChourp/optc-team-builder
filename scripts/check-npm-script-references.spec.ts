import { describe, expect, it } from 'vitest';

import {
  checkNpmScriptReferences,
  collectInterpolatedPrefixes,
} from './check-npm-script-references.mjs';

/**
 * 869f17h48. Every failure mode is driven from a tree that passes, so each test
 * changes exactly one thing and the guard has to notice. A check that has only
 * ever been run against a clean tree has not been shown to fail.
 */

const CLEAN_SCRIPTS = {
  build: 'ng build',
  'test:e2e:chromium': 'node ./scripts/run-playwright-e2e.mjs --e2e-project=chromium',
  'test:e2e:webkit': 'node ./scripts/run-playwright-e2e.mjs --e2e-project=webkit',
  'cap:sync': 'npx cap sync',
  'test:all': 'npm run build',
};

const CLEAN_SOURCES = new Map<string, string>([
  ['docs/guide.md', 'Run `npm run test:e2e:chromium` and `npm run test:all` before review.'],
  ['scripts/verify-local.mjs', "const lanes = ['chromium', 'webkit'].map((b) => `npm run test:e2e:${b}`);"],
]);

const CLEAN_REGISTRY = [
  {
    script: 'test:e2e:webkit',
    class: 'interpolated' as const,
    reason: 'Built by verify-local.mjs and run on every verify:local:full.',
    invokedBy: ['scripts/verify-local.mjs'],
  },
  {
    script: 'cap:sync',
    class: 'manual' as const,
    reason: 'Capacitor sync, run by a developer before opening a native project.',
  },
];

function run(overrides: Partial<Parameters<typeof checkNpmScriptReferences>[0]> = {}) {
  return checkNpmScriptReferences({
    scripts: CLEAN_SCRIPTS,
    sources: CLEAN_SOURCES,
    registry: CLEAN_REGISTRY,
    ...overrides,
  });
}

describe('npm script reference check', () => {
  it('passes on a tree where every script is referenced or registered', () => {
    expect(run().errors).toEqual([]);
  });

  /*
   * The whole reason this guard exists. `test:e2e:webkit` appears in no file;
   * verify-local.mjs builds it. A literal-only check calls that an orphan, which
   * is the measurement that produced a wave of work against a false premise.
   */
  it('treats an interpolated name as referenced, not as an orphan', () => {
    const { errors } = run({ registry: [CLEAN_REGISTRY[1]] });

    expect(errors).toEqual([]);
  });

  it('still finds the interpolated script when its builder is deleted', () => {
    const sources = new Map(CLEAN_SOURCES);

    sources.delete('scripts/verify-local.mjs');

    const { errors } = run({ sources, registry: [CLEAN_REGISTRY[1]] });

    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('test:e2e:webkit is called by nothing');
  });

  /* A. */
  it('fails on a script that nothing references and nothing registers', () => {
    const { errors } = run({ scripts: { ...CLEAN_SCRIPTS, 'seo:indexnow': 'node ./x.mjs' } });

    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('seo:indexnow is called by nothing');
  });

  /* B. */
  it('fails when the registry names a script package.json no longer has', () => {
    const { scripts, ...rest } = { scripts: { ...CLEAN_SCRIPTS }, rest: null };

    delete (scripts as Record<string, string>)['cap:sync'];

    const { errors } = run({ scripts });

    expect(errors.some((error) => error.includes('no longer exists in package.json'))).toBe(true);
    void rest;
  });

  /* C. The clause that stops an annotation being a rubber stamp. */
  it('fails when an interpolated entry names a file that does not exist', () => {
    const registry = [{ ...CLEAN_REGISTRY[0], invokedBy: ['scripts/imaginary.mjs'] }];

    const { errors } = run({ registry });

    expect(errors.some((error) => error.includes('is not a tracked file'))).toBe(true);
  });

  it('fails when an interpolated entry names a file that does not build the name', () => {
    const registry = [{ ...CLEAN_REGISTRY[0], invokedBy: ['docs/guide.md'] }];

    const { errors } = run({ registry });

    expect(
      errors.some((error) => error.includes('neither names it nor interpolates a prefix of it')),
    ).toBe(true);
  });

  /*
   * The hole an earlier version of this guard actually had, found by mutating
   * the real tree. `buildsName` also accepted the script's last segment appearing
   * anywhere in the file, to cover a workflow matrix. Rewriting verify-local.mjs's
   * interpolation into a fixed string then left the guard green, because the word
   * `webkit` still sat in the browser array beside it - so the annotation could no
   * longer be falsified, which is the only thing it is for.
   */
  it('does not accept the name\'s last segment appearing loosely in the file', () => {
    const sources = new Map(CLEAN_SOURCES);

    sources.set(
      'scripts/verify-local.mjs',
      "const lanes = ['chromium', 'webkit'].map(() => `npm run test:e2e:chromium`);",
    );

    const { errors } = run({ sources });

    expect(
      errors.some((error) => error.includes('neither names it nor interpolates a prefix of it')),
      'a file that merely mentions "webkit" must not satisfy an invokedBy claim',
    ).toBe(true);
  });

  it('fails when an interpolated entry names no file at all', () => {
    const registry = [{ ...CLEAN_REGISTRY[0], invokedBy: [] }];

    const { errors } = run({ registry });

    expect(errors.some((error) => error.includes('names no `invokedBy` file'))).toBe(true);
  });

  /* D. */
  it('fails when a manual entry is stale because the script is now referenced', () => {
    const sources = new Map(CLEAN_SOURCES);

    sources.set('.github/workflows/release.yml', 'run: npm run cap:sync');

    const { errors } = run({ sources });

    expect(errors.some((error) => error.includes('registered as manual but is invoked'))).toBe(
      true,
    );
  });

  /*
   * The registry names every script it registers, so if it is scanned as a
   * source every `manual` entry reports itself as referenced by its own entry
   * and demands its own removal. That is a contradiction, and it stayed hidden
   * until the registry was committed: `git ls-files` cannot see an untracked
   * file, so the check passed while the file was new and failed on the next run.
   */
  it('does not let an entry count as a reference to its own script', () => {
    const sources = new Map(CLEAN_SOURCES);

    sources.set(
      'scripts/npm-script-registry.mjs',
      "export const R = [{ script: 'cap:sync', class: 'manual', reason: '...' }];",
    );

    const { errors } = run({ sources });

    expect(
      errors.some((error) => error.includes('registered as manual but is invoked')),
      'the registry describing cap:sync must not count as calling it',
    ).toBe(false);
  });

  /*
   * D, the happier half: an `unwired` entry describes a finding, and wiring the
   * script fixes it. The entry then describes something that is no longer true,
   * which is how `seo:indexnow` would have kept claiming nothing submits after
   * 869f17h5v wired it into the deploy.
   */
  it('fails when an unwired entry is stale because the script is now wired', () => {
    const sources = new Map(CLEAN_SOURCES);

    sources.set('.github/workflows/deploy-pages.yml', 'run: npm run seo:indexnow');

    const { errors } = run({
      scripts: { ...CLEAN_SCRIPTS, 'seo:indexnow': 'node ./scripts/submit-indexnow.mjs' },
      sources,
      registry: [
        ...CLEAN_REGISTRY,
        {
          script: 'seo:indexnow',
          class: 'unwired' as const,
          reason: 'The key file is served live and nothing ever submits.',
          owner: '869f17h5v',
        },
      ],
    });

    expect(errors.some((error) => error.includes('registered as unwired but is invoked'))).toBe(
      true,
    );
  });

  /*
   * D and A ask different questions, and conflating them broke a real doc.
   * `docs/ios-platform-footprint.md` is an inventory written precisely to explain
   * why `ios:open` is unreferenced - and it made the guard demand the deletion of
   * the registry entry saying the same thing. Prose names a script; it never runs
   * one.
   */
  it('does not treat a doc naming a manual script as invoking it', () => {
    const sources = new Map(CLEAN_SOURCES);

    sources.set('docs/ios-platform-footprint.md', '`cap:sync` runs `npx cap sync`.');

    const { errors } = run({ sources });

    expect(
      errors.some((error) => error.includes('cap:sync')),
      'a doc describing cap:sync must not retire its manual entry',
    ).toBe(false);
  });

  it('still counts a doc as knowing about a script, so it is not an orphan', () => {
    const sources = new Map(CLEAN_SOURCES);

    sources.set('docs/runbook.md', 'Run `npm run data:import:all` before a release.');

    const { errors } = run({
      scripts: { ...CLEAN_SCRIPTS, 'data:import:all': 'node ./scripts/import.mjs' },
      sources,
    });

    expect(
      errors.some((error) => error.includes('data:import:all is called by nothing')),
      'a documented script is known, so the orphan clause must stay quiet',
    ).toBe(false);
  });

  /* E. */
  it('fails on an entry whose reason explains nothing', () => {
    const registry = [{ ...CLEAN_REGISTRY[1], reason: 'manual' }];

    const { errors } = run({ registry });

    expect(errors.some((error) => error.includes('needs a substantive reason'))).toBe(true);
  });

  it('fails on an unwired entry with no owning task', () => {
    const registry = [
      {
        script: 'cap:sync',
        class: 'unwired' as const,
        reason: 'Should be wired into the deploy job and currently is not.',
      },
    ];

    const { errors } = run({ registry });

    expect(errors.some((error) => error.includes('needs an `owner` task id'))).toBe(true);
  });

  describe('interpolated prefix collection', () => {
    it('collects a prefix from a template literal', () => {
      const prefixes = collectInterpolatedPrefixes(
        new Map([['a.mjs', 'const c = `npm run test:e2e:${browser}`;']]),
      );

      expect([...prefixes]).toEqual(['test:e2e:']);
    });

    /*
     * `npm run ${suite}` would match every script in the file and prove nothing
     * about any of them, so an empty prefix is dropped rather than treated as a
     * universal reference.
     */
    it('ignores an empty prefix, which would match everything', () => {
      const prefixes = collectInterpolatedPrefixes(
        new Map([['a.mjs', 'const c = `npm run ${suite}`;']]),
      );

      expect([...prefixes]).toEqual([]);
    });
  });
});
