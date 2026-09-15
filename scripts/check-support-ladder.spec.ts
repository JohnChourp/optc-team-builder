import { describe, expect, it } from 'vitest';

import { checkSupportLadder, installsEngine, parsePlaywrightProjects } from './check-support-ladder.mjs';

/**
 * 869f17h7w / 869f17h7a. Driven from a tree that passes. The clause that matters
 * most is F, which exists because a sentence naming the right engines still lied
 * about when they run, and shipped to players in v0.4.40.
 */

const PROJECTS = ['chromium', 'firefox', 'webkit'];

const WORKFLOWS = new Map<string, string>([
  ['.github/workflows/performance-budgets.yml', 'run: npx playwright install --with-deps chromium'],
  ['.github/workflows/deploy-pages.yml', 'run: npx playwright install --with-deps chromium'],
  ['.github/workflows/test.yml', 'run: npx playwright install --with-deps ${{ matrix.browser }}'],
]);

const ENGINES = [
  { engine: 'chromium', level: 'verified' as const, unattendedIn: ['.github/workflows/performance-budgets.yml'] },
  { engine: 'firefox', level: 'supported' as const, unattendedIn: [] },
  { engine: 'webkit', level: 'supported' as const, unattendedIn: [] },
];

const PLATFORMS = [
  {
    platform: 'web',
    level: 'verified' as const,
    evidence: 'docs/platform-support-ladder.md',
    meaning: 'Deployed on every push to main with a post-deploy freshness check and scheduled synthetics.',
  },
];

function run(overrides = {}) {
  return checkSupportLadder({
    projects: PROJECTS,
    workflows: WORKFLOWS,
    claimedEngines: ['chromium', 'firefox', 'webkit'],
    browserCopy: { en: 'The app is tested on all three major browser engines.' },
    engines: ENGINES,
    platforms: PLATFORMS,
    fileExists: () => true,
    ...overrides,
  });
}

describe('support ladder', () => {
  it('passes when every level matches the automation', () => {
    expect(run().errors).toEqual([]);
  });

  /* A. */
  it('fails on a configured engine with no level', () => {
    const { errors } = run({ projects: [...PROJECTS, 'chrome'] });

    expect(errors.some((error) => error.includes("'chrome'"))).toBe(true);
  });

  it('fails on a levelled engine Playwright no longer configures', () => {
    const { errors } = run({ projects: ['chromium', 'firefox'] });

    expect(errors.some((error) => error.includes('no longer configures'))).toBe(true);
  });

  /* B. */
  it('fails when a verified engine names no unattended workflow', () => {
    const engines = ENGINES.map((entry) =>
      entry.engine === 'chromium' ? { ...entry, unattendedIn: [] } : entry,
    );

    expect(
      run({ engines }).errors.some((error) => error.includes('nobody has to press anything')),
    ).toBe(true);
  });

  it('fails when a verified engine names a workflow that does not install it', () => {
    const engines = ENGINES.map((entry) =>
      entry.engine === 'chromium'
        ? { ...entry, unattendedIn: ['.github/workflows/test.yml'] }
        : entry,
    );

    expect(run({ engines }).errors.some((error) => error.includes('never installs it'))).toBe(true);
  });

  /* C. Under-claiming is drift too. */
  it('fails when a supported engine is actually installed unattended', () => {
    const workflows = new Map(WORKFLOWS);

    workflows.set('.github/workflows/nightly.yml', 'run: npx playwright install --with-deps webkit');

    expect(run({ workflows }).errors.some((error) => error.includes('Raise it to verified'))).toBe(
      true,
    );
  });

  /* D. */
  it('fails when a platform rests on evidence that does not exist', () => {
    expect(
      run({ fileExists: () => false }).errors.some((error) =>
        error.includes('cannot outlive its evidence'),
      ),
    ).toBe(true);
  });

  /* E. */
  it('fails when the screen and the ladder disagree about the engine list', () => {
    expect(
      run({ claimedEngines: ['chromium'] }).errors.some((error) => error.includes('have drifted')),
    ).toBe(true);
  });

  /*
   * F. The exact sentence that shipped in v0.4.40. Clause E cannot see it: the
   * engine list was correct, and only the cadence was false.
   */
  it('fails on a cadence promise the ladder does not support', () => {
    const browserCopy = {
      en: 'Every release is tested automatically on all three major browser engines, not just one.',
    };

    const { errors } = run({ browserCopy });

    expect(errors.some((error) => error.includes('promises a cadence'))).toBe(true);
    expect(errors.some((error) => error.includes('only chromium runs unattended'))).toBe(true);
  });

  it('catches the same promise in Greek, not only in English', () => {
    const browserCopy = { el: 'Κάθε έκδοση δοκιμάζεται αυτόματα και στις τρεις μηχανές.' };

    expect(run({ browserCopy }).errors.some((error) => error.includes('promises a cadence'))).toBe(
      true,
    );
  });

  it('allows the cadence promise once every engine is verified', () => {
    const engines = ENGINES.map((entry) => ({
      ...entry,
      level: 'verified' as const,
      unattendedIn: ['.github/workflows/performance-budgets.yml'],
    }));
    const workflows = new Map([
      ['.github/workflows/performance-budgets.yml', 'playwright install chromium firefox webkit'],
    ]);

    const { errors } = run({
      engines,
      workflows,
      browserCopy: { en: 'Every release is tested automatically on all three engines.' },
    });

    expect(errors.some((error) => error.includes('promises a cadence'))).toBe(false);
  });

  describe('parsers', () => {
    it('reads only project names', () => {
      expect(parsePlaywrightProjects("use: { name: 'x' }\nprojects: [{ name: 'chromium' }]")).toEqual([
        'chromium',
      ]);
    });

    it('treats an install line as the proof an engine runs unattended', () => {
      expect(installsEngine('run: npx playwright install --with-deps webkit', 'webkit')).toBe(true);
      expect(installsEngine('run: echo webkit', 'webkit')).toBe(false);
    });
  });
});
