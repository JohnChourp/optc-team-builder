import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { buildCheckPlan, formatGitHubOutput, getChangedFiles, parseNameStatusOutput, renderMarkdown } from './ci-check-routing.mjs';

describe('ci-check-routing', () => {
  it('routes docs-only changes to docs script suites only', () => {
    const plan = buildCheckPlan(['docs/maintainer-validation-guide.md', 'README.md']);

    expect(plan.fullPlan).toBe(false);
    expect(plan.runAngular).toBe(false);
    expect(plan.runE2e).toBe(false);
    expect(plan.runQuarantine).toBe(false);
    expect(plan.runDatasetPerf).toBe(false);
    expect(plan.scriptSuites).toEqual(['docs-integrity', 'docs-commands', 'docs-drift']);
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
    expect(plan.scriptSuites).toEqual([]);
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
    expect(plan.scriptSuites).toEqual(['captain-contracts', 'source-data']);
  });

  it('routes source data inputs to validation instead of dataset performance only', () => {
    const plan = buildCheckPlan(['scripts/data/manual-characters.json', 'scripts/data/party-conflict-overrides.json']);

    expect(plan.fullPlan).toBe(false);
    expect(plan.runDatasetPerf).toBe(false);
    expect(plan.scriptSuites).toEqual(['source-data']);
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
    expect(plan.scriptSuites).toEqual(['saved-team-codecs', 'docs-integrity', 'docs-commands', 'docs-drift']);
  });

  it('keeps browser coverage for saved-team transfer runtime changes', () => {
    const plan = buildCheckPlan(['src/app/pages/saved-teams/saved-teams-transfer.utils.ts']);

    expect(plan.fullPlan).toBe(false);
    expect(plan.runAngular).toBe(true);
    expect(plan.runE2e).toBe(true);
    expect(plan.runQuarantine).toBe(false);
    expect(plan.scriptSuites).toEqual(['saved-team-codecs']);
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
    expect(plan.scriptSuites).toEqual(['pwa-shell']);
  });

  it('routes release and performance tooling to focused script suites', () => {
    const plan = buildCheckPlan([
      'scripts/backtest-optc-release-detector.mjs',
      'scripts/check-optc-release-needed.mjs',
      'scripts/release-provenance-report.mjs',
      'scripts/fixtures/release-check/no-change/remote-units.js',
      'scripts/fixtures/release-provenance/github-release-v1.2.3.json',
      'scripts/perf-budget-report.mjs',
      'scripts/perf-route-load.mjs',
    ]);

    expect(plan.fullPlan).toBe(false);
    expect(plan.scriptSuites).toEqual(['release-check', 'perf-budget']);
  });

  it('covers standalone route-load harness changes in the selected performance suite', () => {
    const plan = buildCheckPlan(['scripts/perf-route-load.mjs']);
    const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

    expect(plan.fullPlan).toBe(false);
    expect(plan.scriptSuites).toEqual(['perf-budget']);
    expect(packageJson.scripts['test:perf-budget']).toContain('node --check ./scripts/perf-route-load.mjs');
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
      'maintainer-doctor',
      'branch-cleanup',
      'dataset-digest',
      'saved-team-codecs',
      'captain-contracts',
      'release-check',
      'release-readiness',
      'docs-integrity',
      'docs-commands',
      'docs-drift',
      'discoverability',
      'public-entry-synthetics',
      'drive-sync-server',
      'source-data',
      'perf-budget',
      'e2e-triage',
      'pwa-shell',
    ]);
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

  it('renders GitHub outputs and Markdown summaries', () => {
    const plan = buildCheckPlan(['docs/maintainer-validation-guide.md']);

    expect(formatGitHubOutput(plan)).toContain('run_script_suites=true');
    expect(formatGitHubOutput(plan)).toContain('script_matrix=');
    expect(renderMarkdown(plan)).toContain('CI check routing');
    expect(renderMarkdown(plan)).toContain('docs/maintainer-validation-guide.md');
  });
});
