import { describe, expect, it } from 'vitest';

import { ENVIRONMENTS, GATED_PERF_SCRIPTS, checkSuiteEnvironments, environmentForSpec } from './lib/suite-environments.mjs';
import { buildSuiteEnvironments, readVitestProjects } from './generate-suite-environments.mjs';

/*
 * 869f13d8b. The record's worth is that it is DERIVED from vitest.config.mjs. A second
 * hand-written environment map is the thing that drifts, and drifting is what made this a
 * task: the answer used to be knowable only by reading the command.
 */
describe('suite environments - derived from the real config', () => {
  it('reads the projects out of vitest.config.mjs, not from a list here', async () => {
    const projects = await readVitestProjects();

    expect(projects.map((p) => p.name).sort()).toEqual(['scripts', 'server', 'src']);
    expect(projects.find((p) => p.name === 'src')?.environment).toBe('jsdom');
    expect(projects.find((p) => p.name === 'scripts')?.environment).toBe('node');
  });

  it('resolves a spec to the environment its location implies', async () => {
    const projects = await readVitestProjects();

    expect(environmentForSpec('src/app/app.component.spec.ts', projects)).toBe('jsdom');
    expect(environmentForSpec('scripts/ci-check-routing.spec.ts', projects)).toBe('node');
    expect(environmentForSpec('server/drive-sync-server.spec.mjs', projects)).toBe('node');
    // Playwright's are claimed by no vitest project, deliberately.
    expect(environmentForSpec('e2e/smoke.spec.ts', projects)).toBeNull();
  });

  it('records the three suites that genuinely span two environments', async () => {
    // Each pairs a script checker's spec with the src/ spec of the thing it checks, in one
    // command. `mixed` is the honest answer, not a gap.
    const record = await buildSuiteEnvironments();
    const mixed = record.suites.filter((s) => s.environment === 'mixed').map((s) => s.id).sort();

    expect(mixed).toEqual(['field-naming', 'locale-formatting', 'support-claims']);
    for (const id of mixed) {
      expect(record.suites.find((s) => s.id === id)?.environments).toEqual(['jsdom', 'node']);
    }
  });

  it('includes the suites a reader forgets - the browsers and the gated harnesses', async () => {
    const record = await buildSuiteEnvironments();
    const byEnv = (env: string) => record.suites.filter((s) => s.environment === env).map((s) => s.id).sort();

    expect(byEnv('browser')).toEqual(['e2e-chromium', 'e2e-firefox', 'e2e-webkit']);
    expect(byEnv('gated-chromium')).toEqual([...GATED_PERF_SCRIPTS].sort());
  });

  it('passes its own check on the real tree', async () => {
    expect(checkSuiteEnvironments(await buildSuiteEnvironments())).toEqual([]);
  });
});

describe('suite environments - the guard', () => {
  const base = {
    suites: [
      { id: 'a', environment: 'node', environments: ['node'] },
      { id: 'b', environment: 'jsdom', environments: ['jsdom'] },
      { id: 'c', environment: 'browser', environments: ['browser'] },
      { id: 'd', environment: 'gated-chromium', environments: ['gated-chromium'] },
      { id: 'e', environment: 'mixed', environments: ['jsdom', 'node'] },
    ],
  };

  it('rejects an environment nobody declared', () => {
    const record = { suites: [...base.suites, { id: 'x', environment: 'deno', environments: ['deno'] }] };

    expect(checkSuiteEnvironments(record)).toEqual([
      expect.stringContaining('x declares the unknown environment deno'),
    ]);
  });

  it('makes `mixed` earn its label', () => {
    // Otherwise it becomes the bucket every unresolved suite falls into. `e` stays valid so
    // the only problem is `f`'s bare claim.
    const record = {
      suites: [...base.suites, { id: 'f', environment: 'mixed', environments: ['node'] }],
    };

    expect(checkSuiteEnvironments(record)).toEqual([
      expect.stringContaining('f is recorded as mixed but resolves to 1 environment'),
    ]);
  });

  it('rejects a suite that spans two environments while claiming one', () => {
    // `e` is kept as the valid mixed suite, so the ONE problem is the mislabelled `f` and
    // not a second "no suite runs in mixed" from dropping it.
    const record = {
      suites: [...base.suites, { id: 'f', environment: 'node', environments: ['jsdom', 'node'] }],
    };

    expect(checkSuiteEnvironments(record)).toEqual([
      expect.stringContaining('f resolves to jsdom and node but is recorded as node'),
    ]);
  });

  it('notices an environment the record describes and the project no longer has', () => {
    const record = { suites: base.suites.filter((s) => s.environment !== 'browser') };

    expect(checkSuiteEnvironments(record)).toEqual([
      expect.stringContaining('No suite runs in browser'),
    ]);
  });

  /*
   * 869f13d8b. There is no DOM-global check, and the reason is measured rather than
   * assumed: one was built, run against all 100 script specs, and produced 4 findings with
   * 0 true positives - three specs bind `const document = buildXDocument(...)` where
   * `document` is the generated JSON document, and one carries a `window.units` assignment
   * inside a fixture template literal, which is upstream data this repo parses. Telling
   * those from a real use needs scope analysis, not a substring test - the same conclusion
   * check-whats-new.mjs already reached and recorded.
   *
   * lib/suite-environments.mjs carries the full reasoning. This pins the decision so a
   * future session re-adds such a check deliberately rather than by accident.
   */
  it('carries no DOM-global check, by measurement', () => {
    const localDocumentBinding = [
      'const document = buildDatasetSchemaDocument({});',
      "expect(document.generatedAt).toBe('x');",
    ].join('\n');

    const fixtureTemplateLiteral = 'const src = `window.units = { 1: [] };`;';

    // The signature takes no spec sources any more, so passing them must change nothing.
    expect(
      checkSuiteEnvironments(base, {
        nodeSpecSources: {
          'scripts/generate-dataset-schema.spec.ts': localDocumentBinding,
          'scripts/check-optc-release-needed.spec.ts': fixtureTemplateLiteral,
        },
      }),
    ).toEqual([]);
  });
});

describe('suite environments - the constraints are recorded, not remembered', () => {
  it('states what jsdom withholds, which is the load-bearing part', () => {
    // These did NOT come from the old `node` default - jsdom has no injector either - and
    // they shape how async and worker code is designed here.
    expect(ENVIRONMENTS.jsdom.mustNot).toEqual(
      expect.arrayContaining(['a TestBed', 'an Angular injector', 'a Worker']),
    );
  });

  it('gives every environment both halves and a reason', () => {
    for (const [id, env] of Object.entries(ENVIRONMENTS)) {
      expect(env.mayAssume.length, `${id}.mayAssume`).toBeGreaterThan(0);
      expect(env.mustNot.length, `${id}.mustNot`).toBeGreaterThan(0);
      expect(env.note, `${id}.note`).toBeTruthy();
    }
  });
});
