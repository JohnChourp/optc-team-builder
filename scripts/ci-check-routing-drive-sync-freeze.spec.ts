import { describe, expect, it } from 'vitest';

import { SCRIPT_SUITES, SCRIPT_SUITE_ORDER, buildCheckPlan } from './ci-check-routing.mjs';

/**
 * 869f13c92. The owner froze the Drive-sync backend out of the default checks on
 * 2026-09-19. Two halves, and the second is the one that could regress silently:
 * the lane must be GONE from the default plan, and a change under `server/` must
 * still be NAMED rather than falling through to `full-risk` - which would run the
 * whole suite for a backend nothing else depends on, and cost more than the lane.
 */
describe('the frozen Drive-sync backend', () => {
  it('is not a suite any more, so verify:local cannot enumerate it', () => {
    expect(SCRIPT_SUITE_ORDER).not.toContain('drive-sync-server');
    expect(SCRIPT_SUITES['drive-sync-server']).toBeUndefined();
  });

  it('names a server/ change and selects nothing, instead of triggering a full plan', () => {
    const plan = buildCheckPlan(['server/drive-sync-server.mjs']);

    expect(plan.categories).toContain('drive-sync-server-frozen');
    expect(plan.scriptSuites).toEqual([]);
    // The half that matters: NOT a full plan, and no Angular or e2e run.
    expect(plan.fullPlan).toBe(false);
    expect(plan.runAngular).toBe(false);
    expect(plan.runE2e).toBe(false);
  });

  it('still routes everything else normally when a server/ file is in the same change', () => {
    // The negative control: the freeze must not swallow its neighbours.
    const plan = buildCheckPlan(['server/drive-sync-server.mjs', 'docs/feature-coverage-map.md']);

    expect(plan.categories).toContain('drive-sync-server-frozen');
    expect(plan.scriptSuites.length).toBeGreaterThan(0);
    expect(plan.scriptSuites).toContain('docs-integrity');
  });
});
