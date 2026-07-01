import { describe, expect, it } from 'vitest';

import { buildCheckPlan, formatGitHubOutput, getChangedFiles, renderMarkdown } from './ci-check-routing.mjs';

describe('ci-check-routing', () => {
  it('routes docs-only changes to docs script suites only', () => {
    const plan = buildCheckPlan(['docs/maintainer-validation-guide.md', 'README.md']);

    expect(plan.fullPlan).toBe(false);
    expect(plan.runAngular).toBe(false);
    expect(plan.runE2e).toBe(false);
    expect(plan.runQuarantine).toBe(false);
    expect(plan.runDatasetPerf).toBe(false);
    expect(plan.scriptSuites).toEqual(['docs-integrity', 'docs-commands']);
  });

  it('routes runtime changes to Angular and blocking browser e2e', () => {
    const plan = buildCheckPlan(['src/app/pages/saved-teams/saved-teams.page.ts']);

    expect(plan.fullPlan).toBe(false);
    expect(plan.runAngular).toBe(true);
    expect(plan.runE2e).toBe(true);
    expect(plan.runQuarantine).toBe(false);
    expect(plan.scriptSuites).toEqual([]);
  });

  it('routes e2e runner changes to browser jobs and triage tests', () => {
    const plan = buildCheckPlan(['scripts/lib/playwright-e2e-runner.mjs', 'e2e/regression-flows.spec.ts']);

    expect(plan.fullPlan).toBe(false);
    expect(plan.runE2e).toBe(true);
    expect(plan.runQuarantine).toBe(true);
    expect(plan.scriptSuites).toEqual(['e2e-triage']);
  });

  it('routes release and performance tooling to focused script suites', () => {
    const plan = buildCheckPlan([
      'scripts/check-optc-release-needed.mjs',
      'scripts/fixtures/release-check/no-change/remote-units.js',
      'scripts/perf-budget-report.mjs',
    ]);

    expect(plan.fullPlan).toBe(false);
    expect(plan.scriptSuites).toEqual(['release-check', 'perf-budget']);
  });

  it('fails closed for dependency, workflow, and router changes', () => {
    const plan = buildCheckPlan(['package-lock.json', '.github/workflows/test.yml']);

    expect(plan.fullPlan).toBe(true);
    expect(plan.runAngular).toBe(true);
    expect(plan.runE2e).toBe(true);
    expect(plan.runQuarantine).toBe(true);
    expect(plan.runDatasetPerf).toBe(true);
    expect(plan.scriptSuites).toEqual([
      'captain-contracts',
      'release-check',
      'release-readiness',
      'docs-integrity',
      'docs-commands',
      'drive-sync-server',
      'perf-budget',
      'e2e-triage',
    ]);
  });

  it('fails closed for unknown paths and missing diff data', () => {
    expect(buildCheckPlan(['unclassified/file.txt']).fullPlan).toBe(true);
    expect(buildCheckPlan([], { diffUnavailable: true }).fullPlan).toBe(true);
    expect(buildCheckPlan([]).fullPlan).toBe(true);
  });

  it('returns diff-unavailable when base or head is missing', () => {
    const result = getChangedFiles({ base: '', head: 'abc123' });

    expect(result.diffUnavailable).toBe(true);
    expect(result.changedFiles).toEqual([]);
  });

  it('renders GitHub outputs and Markdown summaries', () => {
    const plan = buildCheckPlan(['docs/maintainer-validation-guide.md']);

    expect(formatGitHubOutput(plan)).toContain('run_script_suites=true');
    expect(formatGitHubOutput(plan)).toContain('script_matrix=');
    expect(renderMarkdown(plan)).toContain('CI check routing');
    expect(renderMarkdown(plan)).toContain('docs/maintainer-validation-guide.md');
  });
});
