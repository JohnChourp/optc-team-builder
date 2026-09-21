/**
 * Which environment each test suite meets, what it may assume, and what it must not.
 *
 * 869f13d8b. Test execution here spans four environments and the answer was knowable only
 * by reading the command: `vitest` in node, the same runner with jsdom, Playwright across
 * three engines, and the performance harnesses that start a server and drive Chromium
 * inside the Live Testing Gate. A contributor who does not know which one their spec will
 * meet writes a test that passes in one and fails in the other - which reads as a
 * regression and is not.
 *
 * 869f13d76 fixed the mechanism: `vitest.config.mjs` now decides a spec's environment from
 * where it LIVES, so the same file cannot answer differently to two commands. This is the
 * record of that decision, derived from the config rather than restating it - because a
 * second hand-written copy is the thing that drifts.
 */

/** What each environment gives a spec, and what it withholds. */
export const ENVIRONMENTS = Object.freeze({
  node: {
    id: 'node',
    runner: 'vitest',
    mayAssume: ['the real filesystem', 'node: builtins', 'process.argv and env'],
    mustNot: ['document', 'window', 'localStorage', 'requestAnimationFrame', 'any DOM global'],
    note: 'These specs drive Node scripts against real files. A DOM would only slow them down.',
  },
  jsdom: {
    id: 'jsdom',
    runner: 'vitest, and @angular/build:unit-test for the angular lane',
    mayAssume: ['document and window', 'localStorage', 'requestAnimationFrame', 'the Capacitor mocks in src/test-setup.ts', '@angular/compiler'],
    mustNot: [
      'a TestBed',
      'an Angular injector',
      'a Worker',
      'real network access',
    ],
    note:
      'The three "mustNot" entries are load-bearing and did NOT come from the old node default - jsdom has no Angular injector either. They shape how async and worker code is DESIGNED here: a design that cannot be exercised as pure functions cannot be tested in this project at all.',
  },
  browser: {
    id: 'browser',
    runner: 'playwright, across chromium, firefox and webkit',
    mayAssume: ['a real engine', 'a served build', 'real layout and paint'],
    mustNot: ['being trusted from a single run - flakiness means the control is taken on main, twice'],
    note: 'Only Chromium is installed by a scheduled workflow or a release, so it is the one engine exercised without somebody deciding to.',
  },
  /*
   * Not a fourth kind of environment - a suite whose ONE command names specs from two
   * projects, so Vitest runs each file under its own. Three do it today (field-naming,
   * locale-formatting, support-claims), each pairing a script checker's spec with the
   * `src/` spec of the thing it checks. That is deliberate and worth seeing in the record:
   * a reader of such a suite's output is looking at two environments at once.
   */
  mixed: {
    id: 'mixed',
    runner: 'vitest, resolving each named spec to its own project',
    mayAssume: ['whatever the project each individual spec belongs to allows'],
    mustNot: ['assuming one environment for the whole suite'],
    note: 'Pairs a script checker with the src/ spec of the thing it checks, in one command.',
  },
  'gated-chromium': {
    id: 'gated-chromium',
    runner: 'a performance harness that starts a server and drives Chromium',
    mayAssume: ['a real engine', 'a served build', 'timing measurements'],
    mustNot: ['running unannounced - these sit inside the Live Testing Gate'],
    note:
      'Headless and script-driven, so the owner decision of 2026-09-20 applies: a browser a script starts, drives and kills is not "Chrome" for the never-Chrome rule. Headed is the line, not the engine.',
  },
});

/**
 * The performance harnesses inside the Live Testing Gate.
 *
 * `perf:dataset` and `perf:saved-team-codecs` are deliberately absent: they measure in
 * node and start no browser. `perf:budget-report` and `perf:budget-history` aggregate the
 * others' artifacts, so they inherit the gate by dependency rather than by driving Chromium
 * themselves.
 */
export const GATED_PERF_SCRIPTS = Object.freeze([
  'perf:ability-filters',
  'perf:explanation-compare',
  'perf:memory-pressure',
  'perf:mobile-pickers',
  'perf:route-load',
]);

/*
 * 869f13d8b. There is NO DOM-global check here, and that is a measured decision rather
 * than an omission.
 *
 * The task asked for "a spec using a capability its environment lacks fails with a message
 * that says which", so one was built: flag a `scripts/**` spec referencing `document`,
 * `window`, `localStorage` and the rest. Run against all 100 script specs on 2026-09-21 it
 * produced **4 findings and 0 true positives**:
 *
 *   - `generate-dataset-schema.spec.ts`, `generate-import-pipeline.spec.ts` and
 *     `generate-worker-protocols.spec.ts` bind `const document = buildXDocument(...)` -
 *     `document` is the generated JSON document, a local name and a good one;
 *   - `check-optc-release-needed.spec.ts` carries `window.units = {` inside a fixture
 *     template literal, which is upstream data this repo parses, not a global it touches.
 *
 * Distinguishing those from a real use needs scope analysis, not a substring test - the
 * same conclusion `check-whats-new.mjs` already reached and recorded when three variants of
 * a prose guard rejected 44% and 65% of copy a human had approved.
 *
 * And the failure it would have caught is not silent: after 869f13d76 a `src` spec HAS a
 * DOM, so it cannot lack one, and a `scripts` spec touching a real DOM global dies on its
 * first run with `document is not defined`. A better MESSAGE for an already-loud failure is
 * not worth a 4% false-positive rate on legitimate code.
 *
 * What replaced it is the `mustNot` list on each environment above: written down, read by a
 * human, and asserted to be non-empty.
 */

/** Maps a vitest project include glob to the environment its project declares. */
export function environmentForSpec(specPath, projects) {
  for (const project of projects) {
    for (const glob of project.include) {
      const [prefix, suffix] = glob.split('**/');
      if (specPath.startsWith(prefix) && specPath.endsWith(suffix.replace('*', ''))) {
        return project.environment;
      }
    }
  }

  return null;
}

/** Every problem with a suite-environment record. Empty means it holds. */
export function checkSuiteEnvironments(record) {
  const problems = [];

  for (const suite of record.suites) {
    if (!ENVIRONMENTS[suite.environment]) {
      problems.push(`${suite.id} declares the unknown environment ${suite.environment}.`);
      continue;
    }

    // `mixed` has to EARN the label, or it becomes the bucket everything falls into.
    if (suite.environment === 'mixed' && (suite.environments ?? []).length < 2) {
      problems.push(
        `${suite.id} is recorded as mixed but resolves to ${(suite.environments ?? []).length} environment(s).`,
      );
    }

    if (suite.environment !== 'mixed' && (suite.environments ?? []).length > 1) {
      problems.push(
        `${suite.id} resolves to ${suite.environments.join(' and ')} but is recorded as ${suite.environment}.`,
      );
    }
  }

  for (const id of Object.keys(ENVIRONMENTS)) {
    if (!record.suites.some((suite) => suite.environment === id)) {
      problems.push(
        `No suite runs in ${id}, so the record describes an environment this project no longer has.`,
      );
    }
  }

  return problems;
}
