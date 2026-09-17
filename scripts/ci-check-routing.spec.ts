import { readFileSync, readdirSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { SCRIPT_SUITES, buildCheckPlan, formatGitHubOutput, getChangedFiles, parseNameStatusOutput, renderMarkdown } from './ci-check-routing.mjs';

describe('ci-check-routing', () => {
  it('routes docs-only changes to docs script suites only', () => {
    const plan = buildCheckPlan(['docs/maintainer-validation-guide.md', 'docs/feature-coverage-map.md']);

    expect(plan.fullPlan).toBe(false);
    expect(plan.runAngular).toBe(false);
    expect(plan.runE2e).toBe(false);
    expect(plan.runQuarantine).toBe(false);
    expect(plan.runDatasetPerf).toBe(false);
    /*
     * 869f135u5. `feature-coverage-grades` is here because one of the two files
     * IS the map it grades - a change to `docs/feature-coverage-map.md` has to
     * re-derive the grades, or the lane only ever runs on a full plan.
     */
    expect(plan.scriptSuites).toEqual([
      'docs-integrity',
      'docs-commands',
      'docs-drift',
      'feature-coverage-grades',
    ]);
  });

  it('routes runtime changes to Angular and blocking browser e2e', () => {
    const plan = buildCheckPlan([
      'src/app/pages/saved-teams/saved-teams.page.ts',
      'src/app/core/services/captain-coverage.utils.ts',
    ]);

    expect(plan.fullPlan).toBe(false);
    expect(plan.runAngular).toBe(true);
    expect(plan.runE2e).toBe(true);
    expect(plan.runQuarantine).toBe(false);
    /*
     * 869f135rm. App source routes to `unused-members` as well: a public member
     * goes dead when somebody edits the file that USED it, which is usually not
     * the file that declares it.
     *
     * 869f138q3. A `.page.ts` also routes to `modal-labels`, because the handler a modal binds on
     * (didPresent) lives there - editing it is exactly when a modal can lose its name.
     *
     * 869f138qz. `component-map` joins from ANY app source, and deliberately so: the host map is
     * built from imports, so any file can become - or stop being - a host of a shared component.
     * Narrowing it would be narrowing what the map is for.
     */
    expect(plan.scriptSuites).toEqual([
      'failure-vocabulary',
      'unused-members',
      'modal-labels',
      'component-map',
    ]);
  });

  it('runs Angular tests for captain parser and generated metadata changes', () => {
    const plan = buildCheckPlan([
      'scripts/auto-team-builder-ability-parser.mjs',
      'scripts/data/special-ability-definitions.json',
      'src/app/core/services/fixtures/captain-contract-cases.json',
    ]);

    expect(plan.fullPlan).toBe(false);
    expect(plan.runAngular).toBe(true);
    expect(plan.runDatasetPerf).toBe(false);
    /*
     * 869f1328p. `ability-tags` joins these because the parser is what produces the tags, so a
     * parser change is exactly when the catalogue's counts and phrasings can move. The enemy and
     * naming lanes deliberately do NOT join: neither reads the parser.
     *
     * 869f138qm. `ability-catalogue` joins for the same reason from the other side: the parser
     * writes each character's abilities into the seed AND the index of them into the catalogue, so
     * a parser change is exactly when the two can stop agreeing.
     */
    expect(plan.scriptSuites).toEqual([
      'captain-contracts',
      'ability-tags',
      'source-data',
      'overlay-register',
      'ability-catalogue',
    ]);
  });

  it('runs the dataset benchmark when the shipped dataset changes', () => {
    /*
     * 869f138qd. The predicate only knew `src/assets/data/`, where the dataset lived before it moved
     * to `public/`, so a seed change never reached the benchmark that times opening it.
     */
    const plan = buildCheckPlan(['public/assets/data/optc-seed.sql']);

    expect(plan.runDatasetPerf).toBe(true);
    expect(plan.categories).toContain('dataset');
  });

  it('routes source data inputs to validation instead of dataset performance only', () => {
    const plan = buildCheckPlan(['scripts/data/manual-characters.json', 'scripts/data/party-conflict-overrides.json']);

    expect(plan.fullPlan).toBe(false);
    expect(plan.runDatasetPerf).toBe(false);
    /*
     * 869f135t0 added `overlay-register`: an overlay must keep saying why it
     * exists and what would remove it, and the party-conflict overlay's two copies
     * must keep agreeing, which is exactly what editing one of them risks.
     */
    expect(plan.scriptSuites).toEqual(['source-data', 'overlay-register']);
  });

  it('routes saved-team codec fixtures and docs to the focused fuzz suite', () => {
    const plan = buildCheckPlan([
      'src/app/pages/saved-teams/saved-teams-codec-fuzz.spec.ts',
      'scripts/fixtures/data/saved-team-codec-fuzz-corpus.json',
      'scripts/fixtures/data/saved-teams-v1.json',
      'docs/saved-team-schema-lifecycle.md',
    ]);

    expect(plan.fullPlan).toBe(false);
    expect(plan.runAngular).toBe(false);
    expect(plan.runE2e).toBe(false);
    expect(plan.runQuarantine).toBe(false);
    expect(plan.scriptSuites).toEqual([
      'saved-team-codecs',
      'docs-integrity',
      'docs-commands',
      'docs-drift',
      'unused-members',
    ]);
  });

  it('keeps browser coverage for saved-team transfer runtime changes', () => {
    const plan = buildCheckPlan(['src/app/pages/saved-teams/saved-teams-transfer.utils.ts']);

    expect(plan.fullPlan).toBe(false);
    expect(plan.runAngular).toBe(true);
    expect(plan.runE2e).toBe(true);
    expect(plan.runQuarantine).toBe(false);
    expect(plan.scriptSuites).toEqual(['saved-team-codecs', 'unused-members', 'component-map']);
  });

  it('routes Markdown fixtures before generic docs rules', () => {
    const plan = buildCheckPlan(['scripts/fixtures/release-readiness/expected-ready-summary.md']);

    expect(plan.fullPlan).toBe(false);
    expect(plan.runAngular).toBe(false);
    expect(plan.runE2e).toBe(false);
    expect(plan.scriptSuites).toEqual(['release-readiness']);
  });

  it('routes e2e runner changes to browser jobs and triage tests', () => {
    const plan = buildCheckPlan(['scripts/lib/playwright-e2e-runner.mjs', 'e2e/regression-flows.spec.ts']);

    expect(plan.fullPlan).toBe(false);
    expect(plan.runE2e).toBe(true);
    expect(plan.runQuarantine).toBe(true);
    expect(plan.scriptSuites).toEqual(['e2e-triage']);
  });

  it('routes maintainer environment doctor changes to the focused doctor suite', () => {
    const plan = buildCheckPlan([
      'scripts/maintainer-environment-doctor.mjs',
      'scripts/maintainer-environment-doctor.spec.ts',
    ]);

    expect(plan.fullPlan).toBe(false);
    expect(plan.runAngular).toBe(false);
    expect(plan.runE2e).toBe(false);
    expect(plan.scriptSuites).toEqual(['maintainer-doctor']);
  });

  it('routes GitHub Actions pin checker changes to the focused pin suite', () => {
    const plan = buildCheckPlan([
      'scripts/check-github-actions-pins.mjs',
      'scripts/check-github-actions-pins.spec.ts',
    ]);

    expect(plan.fullPlan).toBe(false);
    expect(plan.runAngular).toBe(false);
    expect(plan.runE2e).toBe(false);
    expect(plan.scriptSuites).toEqual(['actions-pins']);
  });

  it('routes GitHub workflow budget checker changes to the focused budget suite', () => {
    const plan = buildCheckPlan([
      'scripts/check-github-workflow-budgets.mjs',
      'scripts/check-github-workflow-budgets.spec.ts',
    ]);

    expect(plan.fullPlan).toBe(false);
    expect(plan.runAngular).toBe(false);
    expect(plan.runE2e).toBe(false);
    expect(plan.scriptSuites).toEqual(['workflow-budgets']);
  });

  it('routes CI trigger policy checker changes to the focused trigger suite', () => {
    const plan = buildCheckPlan([
      'scripts/check-github-ci-triggers.mjs',
      'scripts/check-github-ci-triggers.spec.ts',
    ]);

    expect(plan.fullPlan).toBe(false);
    expect(plan.runAngular).toBe(false);
    expect(plan.runE2e).toBe(false);
    expect(plan.scriptSuites).toEqual(['ci-triggers']);
  });

  it('routes dataset digest changes to the focused digest suite', () => {
    const plan = buildCheckPlan([
      'scripts/dataset-change-digest.mjs',
      'scripts/dataset-change-digest.spec.ts',
    ]);

    expect(plan.fullPlan).toBe(false);
    expect(plan.runAngular).toBe(false);
    expect(plan.runE2e).toBe(false);
    expect(plan.scriptSuites).toEqual(['dataset-digest']);
  });

  it('routes PWA shell changes to the install offline and upgrade safety suite', () => {
    const plan = buildCheckPlan(['ngsw-config.json', 'src/main.ts', 'public/manifest.webmanifest', 'scripts/pwa-shell-check.mjs']);

    expect(plan.fullPlan).toBe(false);
    expect(plan.runAngular).toBe(true);
    expect(plan.runE2e).toBe(true);
    expect(plan.runQuarantine).toBe(false);
    /*
     * 869f17h3g. `support-claims` joins without displacing `pwa-shell`:
     * ngsw-config.json decides what the supported screen promises works offline,
     * so a change to it has to re-check that promise as well as the shell. An
     * earlier version consumed the file and STOLE it from pwa-shell, which this
     * assertion caught - hence both, and in this order.
     *
     * 869f138q7. `dataset-delivery` joins the same way: the file also decides what a first visit
     * downloads, and putting the raw seed back into the prefetch group is exactly the defect that
     * suite exists for.
     */
    /*
     * 869f138qw. `packs-contract` joins because ngsw-config.json is where the runtime-media cache
     * policy lives, and the pack contract records it - the number that decides how much of a pack
     * is ever available offline.
     */
    expect(plan.scriptSuites).toEqual([
      'pwa-shell',
      'support-claims',
      'dataset-delivery',
      'packs-contract',
    ]);
  });

  it('routes a Playwright config change to both e2e triage and the support claims', () => {
    const plan = buildCheckPlan(['playwright.config.ts']);

    expect(plan.scriptSuites).toContain('support-claims');
    expect(plan.scriptSuites.length).toBeGreaterThan(1);
  });

  it('routes release and performance tooling to focused script suites', () => {
    const plan = buildCheckPlan([
      'scripts/backtest-optc-release-detector.mjs',
      'scripts/check-optc-release-needed.mjs',
      'scripts/release-decision-history.mjs',
      'scripts/release-provenance-report.mjs',
      'scripts/fixtures/release-check/no-change/remote-units.js',
      'scripts/fixtures/release-provenance/github-release-v1.2.3.json',
      'scripts/perf-budget-report.mjs',
      'scripts/perf-saved-team-codecs.mjs',
      'scripts/perf-route-load.mjs',
    ]);

    expect(plan.fullPlan).toBe(false);
    expect(plan.scriptSuites).toEqual(['release-check', 'perf-budget']);
  });

  it('routes release runbook drift tooling to its focused suite and docs gates', () => {
    const plan = buildCheckPlan([
      'scripts/check-release-runbook-drift.mjs',
      'scripts/check-release-runbook-drift.spec.ts',
    ]);

    expect(plan.fullPlan).toBe(false);
    expect(plan.runAngular).toBe(false);
    expect(plan.runE2e).toBe(false);
    expect(plan.scriptSuites).toEqual(['release-runbook-drift', 'docs-integrity', 'docs-commands', 'docs-drift']);
  });

  it('covers standalone route-load and codec harness changes in the selected performance suite', () => {
    const plan = buildCheckPlan(['scripts/perf-route-load.mjs', 'scripts/perf-saved-team-codecs.mjs']);
    const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

    expect(plan.fullPlan).toBe(false);
    expect(plan.scriptSuites).toEqual(['perf-budget']);
    expect(packageJson.scripts['test:perf-budget']).toContain('node --check ./scripts/perf-route-load.mjs');
    expect(packageJson.scripts['test:perf-budget']).toContain(
      'node --check ./scripts/perf-saved-team-codecs.mjs',
    );
  });

  it('fails closed for dependency, workflow, and router changes', () => {
    const plan = buildCheckPlan(['package-lock.json', '.github/workflows/test.yml']);

    expect(plan.fullPlan).toBe(true);
    expect(plan.runAngular).toBe(true);
    expect(plan.runE2e).toBe(true);
    expect(plan.runQuarantine).toBe(true);
    expect(plan.runDatasetPerf).toBe(true);
    expect(plan.scriptSuites).toEqual([
      'ci-routing',
      'actions-pins',
      'workflow-budgets',
      'ci-triggers',
      'maintainer-doctor',
      'branch-cleanup',
      'dataset-digest',
      'saved-team-codecs',
      'captain-contracts',
      'release-check',
      'release-runbook-drift',
      'release-readiness',
      'docs-integrity',
      'docs-commands',
      'docs-drift',
      'discoverability',
      'route-sitemap-coverage',
      'page-doc-coverage',
      'public-asset-shadowing',
      'enemy-vocabulary',
      'ability-tags',
      'field-naming',
      'dataset-consumers',
      'security-config',
      'storage-keys',
      'i18n-ownership',
      'engine-divergences',
      'content-ladder',
      'published-teams',
      'public-entry-synthetics',
      'i18n-regression',
      'drive-sync-server',
      'source-data',
      'perf-budget',
      'e2e-triage',
      'pwa-shell',
      'overlay-contrast',
      'ionic-host-property',
      'dataset-measurements',
      'unresolved-clauses',
      'dataset-provenance',
      'tag-picker-scoping',
      'whats-new',
      'scripts-references',
      'style-panels',
      'locale-formatting',
      'support-claims',
      'component-inventory',
      'support-ladder',
      'scripts-inventory',
      'dead-code',
      'failure-vocabulary',
      'overlay-register',
      'feature-coverage-grades',
      'i18n-greek-coverage',
      'component-style-budget',
      'unused-members',
      'worker-bundling',
      'dataset-delivery',
      'ability-catalogue',
      'modal-labels',
      'picker-dismissal',
      'dataset-schema',
      'component-map',
      'worker-protocols',
      'packs-contract',
    ]);
  });

  it('routes the dataset delivery guard and the database it checks to the delivery suite', () => {
    const guard = buildCheckPlan([
      'scripts/build-dataset-binary.mjs',
      'scripts/check-dataset-delivery.mjs',
      'scripts/lib/dataset-binary.mjs',
      'docs/dataset-delivery.md',
    ]);

    expect(guard.fullPlan).toBe(false);
    expect(guard.runAngular).toBe(false);
    expect(guard.scriptSuites).toEqual(['dataset-delivery']);

    /* The loader is app code, so Angular runs too; the delivery suite is added, not substituted. */
    const loader = buildCheckPlan(['src/app/core/services/dataset-database-loader.utils.ts']);

    expect(loader.runAngular).toBe(true);
    expect(loader.scriptSuites).toContain('dataset-delivery');
  });

  /* 869f138qm. The catalogue guard, and the two artifacts it compares. */
  it('routes the ability catalogue guard and the pair it compares to the catalogue suite', () => {
    const guard = buildCheckPlan([
      'scripts/check-ability-catalogue.mjs',
      'scripts/lib/ability-catalogue-index.mjs',
    ]);

    expect(guard.fullPlan).toBe(false);
    expect(guard.runAngular).toBe(false);
    expect(guard.scriptSuites).toEqual(['ability-catalogue']);

    /* The catalogue is regenerated data, so it also routes to the digest and the tag catalogue. */
    const catalogue = buildCheckPlan(['public/assets/data/optc-auto-builder-abilities.json']);

    expect(catalogue.scriptSuites).toContain('ability-catalogue');

    /* The parser writes the abilities into both files, so a change to it re-checks the pair. */
    const parser = buildCheckPlan(['scripts/auto-team-builder-ability-parser.mjs']);

    expect(parser.scriptSuites).toContain('ability-catalogue');
  });

  /* 869f138q3. The guard terminates; a template that could declare a modal joins without doing so. */
  it('routes the modal label guard and every template that could hold a modal', () => {
    const guard = buildCheckPlan([
      'scripts/check-modal-dialog-labels.mjs',
      'scripts/lib/modal-dialog-labels.mjs',
    ]);

    expect(guard.fullPlan).toBe(false);
    expect(guard.runAngular).toBe(false);
    expect(guard.scriptSuites).toEqual(['modal-labels']);

    const template = buildCheckPlan(['src/app/pages/characters/characters.page.html']);

    expect(template.runAngular).toBe(true);
    expect(template.scriptSuites).toContain('modal-labels');
  });

  /* 869f138pv. The dismissal guard terminates; a shared template joins without terminating. */
  it('routes the shared picker dismissal guard and the components it reads', () => {
    const guard = buildCheckPlan([
      'scripts/check-shared-picker-dismissal.mjs',
      'scripts/lib/shared-picker-dismissal.mjs',
    ]);

    expect(guard.fullPlan).toBe(false);
    expect(guard.runAngular).toBe(false);
    expect(guard.scriptSuites).toEqual(['picker-dismissal']);

    const picker = buildCheckPlan(['src/app/shared/ship-picker/ship-picker.component.html']);

    expect(picker.runAngular).toBe(true);
    expect(picker.scriptSuites).toContain('picker-dismissal');
    /* The same file is a modal template, so both shared-component lanes join. */
    expect(picker.scriptSuites).toContain('modal-labels');
  });

  /* 869f138qz. The generator terminates; any app source joins, because imports make the map. */
  it('routes the shared component map generator and every file that can host one', () => {
    const guard = buildCheckPlan([
      'scripts/generate-shared-component-map.mjs',
      'scripts/lib/shared-component-map.mjs',
      'docs/shared-component-map.json',
    ]);

    expect(guard.fullPlan).toBe(false);
    expect(guard.runAngular).toBe(false);
    expect(guard.scriptSuites).toEqual(['component-map']);

    const host = buildCheckPlan(['src/app/pages/crew-forge/crew-forge.page.ts']);

    expect(host.scriptSuites).toContain('component-map');
  });

  /* 869f138qx. The generator terminates; a models file is app source and joins without terminating. */
  it('routes the worker protocol generator and the models it reads', () => {
    const guard = buildCheckPlan([
      'scripts/generate-worker-protocols.mjs',
      'scripts/lib/worker-protocol.mjs',
      'docs/worker-protocols.json',
    ]);

    expect(guard.fullPlan).toBe(false);
    expect(guard.runAngular).toBe(false);
    expect(guard.scriptSuites).toEqual(['worker-protocols']);

    const models = buildCheckPlan([
      'src/app/core/services/captain-coverage-filter.worker.models.ts',
    ]);

    expect(models.runAngular).toBe(true);
    expect(models.scriptSuites).toContain('worker-protocols');
  });

  /* 869f138qw. The generator terminates; the packs and the manifest join without terminating. */
  it('routes the pack contract generator, the packs and the manifest that claims their sizes', () => {
    const guard = buildCheckPlan([
      'scripts/generate-offline-pack-contract.mjs',
      'scripts/lib/offline-pack-contract.mjs',
      'docs/offline-pack-contract.json',
    ]);

    expect(guard.fullPlan).toBe(false);
    expect(guard.scriptSuites).toEqual(['packs-contract']);

    const pack = buildCheckPlan(['public/assets/offline-packs/thumbnails-glo/1.png']);

    expect(pack.scriptSuites).toContain('packs-contract');

    const manifest = buildCheckPlan(['public/assets/data/optc-manifest.json']);

    expect(manifest.scriptSuites).toContain('packs-contract');
  });

  it('routes guide discoverability verifier changes to the focused suite', () => {
    const plan = buildCheckPlan([
      'scripts/verify-guide-discoverability.mjs',
      'scripts/verify-guide-discoverability.spec.ts',
    ]);

    expect(plan.fullPlan).toBe(false);
    expect(plan.runAngular).toBe(false);
    expect(plan.runE2e).toBe(false);
    expect(plan.scriptSuites).toEqual(['discoverability']);
  });

  it('routes public entry synthetic monitor changes to the focused suite', () => {
    const plan = buildCheckPlan([
      'scripts/public-entry-synthetics.mjs',
      'scripts/public-entry-synthetics.spec.ts',
    ]);

    expect(plan.fullPlan).toBe(false);
    expect(plan.runAngular).toBe(false);
    expect(plan.runE2e).toBe(false);
    expect(plan.scriptSuites).toEqual(['public-entry-synthetics']);
  });

  it('routes i18n regression checker changes to the focused suite', () => {
    const plan = buildCheckPlan([
      'scripts/i18n-regression-check.mjs',
      'scripts/i18n-regression-check.spec.ts',
    ]);

    expect(plan.fullPlan).toBe(false);
    expect(plan.runAngular).toBe(false);
    expect(plan.runE2e).toBe(false);
    expect(plan.scriptSuites).toEqual(['i18n-regression']);
  });

  it('routes README guide-link edits through docs and multilingual regression suites', () => {
    const plan = buildCheckPlan(['README.md']);

    expect(plan.fullPlan).toBe(false);
    expect(plan.runAngular).toBe(false);
    expect(plan.runE2e).toBe(false);
    expect(plan.scriptSuites).toEqual([
      'docs-integrity',
      'docs-commands',
      'docs-drift',
      'i18n-regression',
    ]);
  });

  it('adds multilingual regression checks to translation runtime changes', () => {
    const plan = buildCheckPlan(['public/i18n/saved-teams/el.json']);

    expect(plan.fullPlan).toBe(false);
    expect(plan.runAngular).toBe(true);
    expect(plan.runE2e).toBe(true);
    /*
     * 869f12x61 added `i18n-ownership` here deliberately. Adding or removing a
     * namespace folder is exactly when the ownership map changes, and a map
     * that is only checked when its own script changes is a map that goes
     * stale. Both lanes run; neither replaces the other.
     *
     * 869f135rx adds a third for the same reason: `i18n-regression` asserts Greek
     * script only on the routes it names, so editing a namespace it does not name
     * would otherwise reach no Greek-script check at all.
     */
    expect(plan.scriptSuites).toEqual([
      'i18n-ownership',
      'i18n-regression',
      'i18n-greek-coverage',
    ]);
  });

  it('routes branch cleanup report changes to the focused suite and docs gates', () => {
    const plan = buildCheckPlan(['scripts/branch-cleanup-report.mjs', 'docs/branch-lifecycle-policy.md']);

    expect(plan.fullPlan).toBe(false);
    expect(plan.runAngular).toBe(false);
    expect(plan.runE2e).toBe(false);
    expect(plan.scriptSuites).toEqual(['branch-cleanup', 'docs-integrity', 'docs-commands', 'docs-drift']);
  });

  it('fails closed for unknown paths and missing diff data', () => {
    expect(buildCheckPlan(['unclassified/file.txt']).fullPlan).toBe(true);
    expect(buildCheckPlan([], { diffUnavailable: true }).fullPlan).toBe(true);
    expect(buildCheckPlan([]).fullPlan).toBe(true);
  });

  it('includes both sides of renamed files before routing', () => {
    expect(parseNameStatusOutput('R100\tsrc/app/foo.ts\tdocs/foo.md\nM\tREADME.md\n')).toEqual([
      'src/app/foo.ts',
      'docs/foo.md',
      'README.md',
    ]);

    const plan = buildCheckPlan(parseNameStatusOutput('R100\tsrc/app/foo.ts\tdocs/foo.md\n'));
    expect(plan.runAngular).toBe(true);
    expect(plan.runE2e).toBe(true);
  });

  it('returns diff-unavailable when base or head is missing', () => {
    const result = getChangedFiles({ base: '', head: 'abc123' });

    expect(result.diffUnavailable).toBe(true);
    expect(result.changedFiles).toEqual([]);
  });

  it('sanitizes diff errors before writing GitHub outputs', () => {
    const result = getChangedFiles({
      base: 'base',
      head: 'head',
      execFile: () => {
        throw new Error('fatal: bad revision\nusage: git diff');
      },
    });
    const plan = buildCheckPlan(result.changedFiles, { diffUnavailable: result.diffUnavailable });
    plan.reasons.push(result.reason);

    const output = formatGitHubOutput(plan);
    expect(output).toContain('fatal: bad revision usage: git diff');
    expect(output).not.toContain('fatal: bad revision\nusage: git diff');
    expect(output.split('\n')).not.toContain('usage: git diff');
  });

  /*
   * These lanes ran their own unit specs and nothing else, so `verify:local` -
   * the command CLAUDE.md names as validation for an app change - never opened
   * a link, an anchor or a command block in the app's own docs. A spec that
   * only proves the checker's helper functions work is not the checker running.
   *
   * `actions-pins` was always wired the other way (`test:` && the real check),
   * which is what makes this an inconsistency rather than a stated policy.
   */
  it('runs the real docs checkers, not only their unit specs', () => {
    const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as {
      scripts: Record<string, string>;
    };

    for (const [suite, script, checker] of [
      ['docs-integrity', 'test:docs-integrity', 'docs:integrity'],
      ['docs-commands', 'test:docs-commands', 'docs:commands'],
    ] as const) {
      expect(SCRIPT_SUITES[suite].command).toBe(`npm run ${script}`);
      expect(pkg.scripts[script], `${script} must chain ${checker}`).toContain(
        `npm run ${checker}`,
      );
    }
  });

  /*
   * And `docs-drift` deliberately does NOT chain its checker: that one reads the
   * PR body from GitHub and returns an empty acknowledgement whenever
   * GITHUB_REPOSITORY / GITHUB_SHA are unset, which is always outside Actions.
   * Chaining it would fail every local run whose diff touches a mapped feature.
   * The label has to say so, or `pass docs-drift` reads as "the drift check ran".
   */
  it('keeps docs-drift spec-only, and says so in its label', () => {
    const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as {
      scripts: Record<string, string>;
    };

    expect(pkg.scripts['test:docs-drift']).not.toContain('npm run docs:drift');
    expect(SCRIPT_SUITES['docs-drift'].label).toContain('GitHub context');
  });

  /*
   * Two spec files - rumble-data-normalizer and super-special-criteria - were in
   * no lane at all, so ten tests could never fail the gate. Adding them is half
   * a fix; the other half is making the enumeration self-checking, or the next
   * spec added to `scripts/` is orphaned the same way and nobody finds out.
   *
   * Resolving `npm run X` transitively is the load-bearing part. Most suites
   * reach their specs through a package script rather than naming the file, so
   * a naive substring check over the raw commands reports 37 false orphans and
   * is useless.
   */
  it('reaches every scripts/ spec file from some lane', () => {
    const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as {
      scripts: Record<string, string>;
    };

    const expand = (command: string, seen = new Set<string>()): string => {
      let out = command;

      for (const [, name] of command.matchAll(/npm run ([\w:-]+)/gu)) {
        if (!name || seen.has(name)) {
          continue;
        }

        seen.add(name);
        const body = pkg.scripts[name];

        if (body) {
          out += ` ${expand(body, seen)}`;
        }
      }

      return out;
    };

    const specs: string[] = [];
    const walk = (dir: string): void => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = `${dir}/${entry.name}`;

        if (entry.isDirectory()) {
          walk(full);
        } else if (entry.name.endsWith('.spec.ts')) {
          specs.push(full);
        }
      }
    };
    walk('scripts');

    const commands = Object.values(SCRIPT_SUITES).map((suite) => expand(suite.command));
    const orphans = specs.filter((spec) => !commands.some((command) => command.includes(spec)));

    expect(specs.length).toBeGreaterThan(40);
    expect(orphans, `these spec files are in no lane, so their tests cannot fail the gate`).toEqual(
      [],
    );
  });

  /*
   * `.github/workflows/test.yml` duplicates SCRIPT_SUITES as two shell literals
   * so the dispatch path can run the full set. A duplicated list rots, and this
   * one had - three labels and one command were stale within a day of being
   * changed here.
   *
   * Worse, the literal is BASH SINGLE-QUOTED, and the What's New label contains
   * an apostrophe. That closed the string early and made the whole `Select
   * checks` step a syntax error - `line 42: syntax error near unexpected token
   * )`. Every `Test` dispatch failed before running anything, which is why the
   * newest run of any kind was 2026-08-17 and why the e2e quarantine could
   * never collect its restoration evidence.
   */
  it('keeps the workflow matrix identical to SCRIPT_SUITES', () => {
    const yml = readFileSync('.github/workflows/test.yml', 'utf8');
    const line = yml.split('\n').find((entry) => entry.includes('full_script_matrix='));

    expect(line, 'test.yml no longer defines full_script_matrix').toBeDefined();

    const literal = line!.slice(line!.indexOf("'") + 1, line!.lastIndexOf("'"));
    // Undo the shell close/escape/reopen dance before parsing.
    const matrix = JSON.parse(literal.split(`'"'"'`).join("'")) as {
      include: Array<{ suite: string; label: string; command: string }>;
    };

    expect(matrix.include).toEqual(
      Object.entries(SCRIPT_SUITES).map(([suite, config]) => ({
        suite,
        label: config.label,
        command: config.command,
      })),
    );

    const suitesLine = yml.split('\n').find((entry) => entry.includes('full_script_suites='));

    expect(suitesLine).toContain(Object.keys(SCRIPT_SUITES).join(','));
  });

  /*
   * And the literal has to survive bash. A label with an apostrophe is the case
   * that broke it, so assert the escape rather than assuming nobody adds
   * another one.
   */
  it('escapes every apostrophe so the shell step still parses', () => {
    const yml = readFileSync('.github/workflows/test.yml', 'utf8');
    const line = yml.split('\n').find((entry) => entry.includes('full_script_matrix='))!;
    const literal = line.slice(line.indexOf("'") + 1, line.lastIndexOf("'"));

    // Inside a bash single-quoted string, the only legal apostrophe is the
    // close/escape/reopen sequence.
    expect(literal.split(`'"'"'`).join('')).not.toContain("'");
  });

  it('renders GitHub outputs and Markdown summaries', () => {
    const plan = buildCheckPlan(['docs/maintainer-validation-guide.md']);

    expect(formatGitHubOutput(plan)).toContain('run_script_suites=true');
    expect(formatGitHubOutput(plan)).toContain('script_matrix=');
    expect(renderMarkdown(plan)).toContain('CI check routing');
    expect(renderMarkdown(plan)).toContain('docs/maintainer-validation-guide.md');
  });
});
