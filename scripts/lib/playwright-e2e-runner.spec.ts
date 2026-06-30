import { describe, expect, it } from 'vitest';

import { buildRunPlan, parseRunnerArgs } from './playwright-e2e-runner.mjs';

describe('playwright e2e runner planning', () => {
  it('passes the scoped project as one Playwright argument', () => {
    const plan = buildRunPlan({
      rawArgs: ['--e2e-project=chromium', 'e2e/regression-flows.spec.ts'],
      quarantineConfig: { tags: [], grep: '' },
    });

    expect(plan.runs).toHaveLength(1);
    expect(plan.runs[0]!.args).toEqual(['--project=chromium', 'e2e/regression-flows.spec.ts']);
  });

  it('keeps filtered local runs unfiltered unless quarantine mode is explicit', () => {
    const plan = buildRunPlan({
      rawArgs: ['--e2e-project=chromium', 'e2e/regression-flows.spec.ts'],
      quarantineConfig: { tags: ['@quarantined:case'], grep: '@quarantined:case' },
    });

    expect(plan.runs[0]!.args).not.toContain('--grep-invert=@quarantined:case');
  });

  it('adds quarantine exclusion when requested', () => {
    const plan = buildRunPlan({
      rawArgs: ['--e2e-project=chromium', '--quarantine-mode=exclude'],
      quarantineConfig: {
        tags: ['@quarantined:case'],
        entries: [{ tag: '@quarantined:case', browsers: ['chromium'] }],
      },
    });

    expect(plan.runs).toHaveLength(2);
    expect(plan.runs[0]!.args).toContain('--grep-invert=@quarantined:case');
    expect(plan.runs[0]!.args).toContain('--pass-with-no-tests');
  });

  it('honors browser-specific quarantine metadata', () => {
    const plan = buildRunPlan({
      rawArgs: ['--e2e-project=firefox', '--quarantine-mode=exclude'],
      quarantineConfig: {
        tags: ['@quarantined:chromium-case'],
        entries: [{ tag: '@quarantined:chromium-case', browsers: ['chromium'] }],
      },
    });

    expect(plan.runs[0]!.args).not.toContain('--grep-invert=@quarantined:chromium-case');
  });

  it('can route generated artifacts under an explicit base directory', () => {
    const plan = buildRunPlan({
      rawArgs: ['--e2e-project=firefox'],
      env: { E2E_ARTIFACT_BASE_DIR: '../optc-team-builder-brain/live-artifacts/task/post/' },
      quarantineConfig: { tags: [], grep: '' },
    });

    expect(plan.runs[0]!.env).toMatchObject({
      PLAYWRIGHT_HTML_REPORT: '../optc-team-builder-brain/live-artifacts/task/post/playwright-report/firefox',
      PLAYWRIGHT_OUTPUT_DIR: '../optc-team-builder-brain/live-artifacts/task/post/test-results/firefox',
    });
  });

  it('turns empty quarantine-only runs into a clean no-op', () => {
    const plan = buildRunPlan({
      rawArgs: ['--quarantine-mode=only'],
      quarantineConfig: { tags: [], grep: '' },
    });

    expect(plan.runs).toEqual([]);
    expect(plan.message).toContain('No active quarantined');
  });

  it('validates quarantine mode values', () => {
    expect(() => parseRunnerArgs(['--quarantine-mode=bad'])).toThrow('Unsupported quarantine mode');
  });
});
