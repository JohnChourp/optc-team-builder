#!/usr/bin/env node
import { existsSync } from 'node:fs';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { findUndeclaredSizeUnits } from './lib/size-units.mjs';

export const PERFORMANCE_REPORT_SCHEMA_VERSION = 1;

/**
 * 869f1vu91. Which budget failures stop the nightly run, and which only get reported.
 *
 * Not every metric here is the same kind of measurement, and pretending otherwise is how these
 * budgets became fiction: every one of them said "hard", none of them was enforced, and twelve
 * timing budgets went unmet for eleven days without anyone seeing it.
 *
 * - **hard** - reproducible to the byte across runs. Bundle sizes measured 178_855 / 178_852 /
 *   178_870 on three consecutive days, so a breach is a real change and nothing else. These gate.
 * - **advisory** - wall-clock timings on a shared GitHub runner, whose speed moves about ±35% day
 *   to day; on 2026-09-09 every single metric came in ~40% faster with no code change. Gating on
 *   that would fail the build for the weather, and the first flaky night would teach everyone to
 *   ignore it. These are measured, recorded and shown, and they do not gate.
 *
 * A metric with no explicit enforcement is advisory, so adding a noisy metric cannot accidentally
 * start gating the nightly run. Making one gate is a deliberate edit.
 */
export const HARD_BUDGET_ENFORCEMENT = 'hard';
export const ADVISORY_BUDGET_ENFORCEMENT = 'advisory';

export function resolveBudgetEnforcement(metric) {
  return metric?.enforcement === HARD_BUDGET_ENFORCEMENT
    ? HARD_BUDGET_ENFORCEMENT
    : ADVISORY_BUDGET_ENFORCEMENT;
}

export const BASELINE_WARNING_POLICY = Object.freeze({
  minPercentIncrease: 35,
  minMsIncrease: 100,
  minBytesIncrease: 10_000,
});

/**
 * What a budgeted number IS, per harness. 869f135u7.
 *
 * A budget without this is a number with no units and no conditions: 2,600 of
 * what, measured how, on what machine. The report published 38 of them and said
 * none of it, so "did this regress" could only ever be answered by whoever wrote
 * the harness.
 *
 * Declared once and referenced by id rather than copied onto 40 definitions,
 * because the profile is a property of the HARNESS - all three browser harnesses
 * share one, verified at perf-route-load.mjs:265-271,
 * perf-ability-filters.mjs:42-48 and perf-explanation-compare.mjs:93-99.
 *
 * `grep -rn "throttl" scripts/perf-*.mjs` returns nothing, so "no throttling" is
 * measured rather than assumed - and it is the single most important thing on
 * this page, because it means these numbers describe an unthrottled CI machine
 * and NOT a player's phone.
 *
 * 869f138qd added the one exception, and gave it its own profile so the rows
 * above keep meaning what they say: `datasetReady` throttles the mobile CPU 4x
 * (perf-route-load.mjs, DATASET_READY_CPU_THROTTLING).
 */
export const MEASUREMENT_PROFILES = Object.freeze({
  browser: {
    basis: 'single observation',
    desktop: 'Chromium 1440x1000, Desktop Chrome UA, no throttling',
    mobile: 'Playwright devices[Pixel 7], no throttling',
  },
  node: {
    basis: 'mean over N loops of a 1500-team / 519,013-byte fixture',
    node: 'Node on ubuntu-latest, no throttling',
  },
  bundle: {
    basis: 'deterministic - read from the esbuild stats.json',
    bundle: 'esbuild stats.json from a production build',
  },
  payload: {
    basis: 'deterministic - read from the build output and its ngsw.json',
    bundle: 'service-worker prefetch groups of a production build; wire = gzip level 6 for types the edge compresses',
  },
  datasetReady: {
    basis: 'single observation',
    desktop: 'Chromium 1440x1000, Desktop Chrome UA, no throttling',
    mobile: 'Playwright devices[Pixel 7], 4x CPU throttling',
  },
});

/**
 * Where a budget's value came from. 869f135u7.
 *
 * Two honest states, and no third:
 *
 *   measured    a run exists and the doc records it. Four bundle rows qualify -
 *               docs/bundle-budgets.md, 2026-09-15, headroom x1.03.
 *   provisional the value was committed without a recorded measurement. `setOn`
 *               cites the commit that introduced it, which is all that is
 *               knowable, and the flag says so rather than dressing a guess as a
 *               governed number.
 *
 * Inventing a measurement date for the provisional rows would be worse than the
 * silence it replaces: the next reader would believe the number was chosen.
 */
export const BUDGET_PROVENANCE_STATES = Object.freeze(['measured', 'provisional']);

const TIMING_BUDGETS_SET_IN = 'b06342bd';

const ABILITY_METRICS = Object.freeze([
  {
    area: 'Saved Teams',
    sourcePath: ['timings', 'savedTeams'],
    metricKey: 'pageReadyMs',
    metricLabel: 'page ready',
    budgets: {},
    profile: 'browser',
    setOn: TIMING_BUDGETS_SET_IN,
    provenance: 'provisional',
  },
  {
    area: 'Saved Teams',
    sourcePath: ['timings', 'savedTeams'],
    metricKey: 'firstToggleMs',
    metricLabel: 'first ability toggle',
    budgets: { desktop: 2600, mobile: 2100 },
    profile: 'browser',
    setOn: TIMING_BUDGETS_SET_IN,
    provenance: 'provisional',
  },
  {
    area: 'Saved Enemies',
    sourcePath: ['timings', 'savedEnemies'],
    metricKey: 'pageReadyMs',
    metricLabel: 'page ready',
    budgets: {},
    profile: 'browser',
    setOn: TIMING_BUDGETS_SET_IN,
    provenance: 'provisional',
  },
  {
    area: 'Saved Enemies',
    sourcePath: ['timings', 'savedEnemies'],
    metricKey: 'firstToggleMs',
    metricLabel: 'first ability toggle',
    budgets: { desktop: 500, mobile: 500 },
    profile: 'browser',
    setOn: TIMING_BUDGETS_SET_IN,
    provenance: 'provisional',
  },
  {
    area: 'Manual Picker',
    sourcePath: ['timings', 'manualPicker'],
    metricKey: 'pageReadyMs',
    metricLabel: 'page ready',
    budgets: {},
    profile: 'browser',
    setOn: TIMING_BUDGETS_SET_IN,
    provenance: 'provisional',
  },
  {
    area: 'Manual Picker',
    sourcePath: ['timings', 'manualPicker'],
    metricKey: 'pickerOpenMs',
    metricLabel: 'picker open',
    budgets: { desktop: 800, mobile: 800 },
    profile: 'browser',
    setOn: TIMING_BUDGETS_SET_IN,
    provenance: 'provisional',
  },
  {
    area: 'Manual Picker',
    sourcePath: ['timings', 'manualPicker'],
    metricKey: 'specialFilterMs',
    metricLabel: 'special filter apply',
    budgets: { desktop: 2500, mobile: 2500 },
    profile: 'browser',
    setOn: TIMING_BUDGETS_SET_IN,
    provenance: 'provisional',
  },
]);

const EXPLANATION_METRICS = Object.freeze([
  {
    area: 'Compare',
    sourcePath: ['timings', 'compare'],
    metricKey: 'compareOpenMs',
    metricLabel: 'compare panel open',
    budgets: { desktop: 800, mobile: 1000 },
    profile: 'browser',
    setOn: TIMING_BUDGETS_SET_IN,
    provenance: 'provisional',
  },
  {
    area: 'Compare',
    sourcePath: ['timings', 'compare'],
    metricKey: 'compareImportMs',
    metricLabel: 'imported compare apply',
    budgets: { desktop: 1200, mobile: 1500 },
    profile: 'browser',
    setOn: TIMING_BUDGETS_SET_IN,
    provenance: 'provisional',
  },
  {
    area: 'Import/share hydration',
    sourcePath: ['timings', 'importShareHydration'],
    metricKey: 'savedTeamsParseSanitizeMs',
    metricLabel: 'saved-team parse/sanitize',
    budgets: { desktop: 500, mobile: 500 },
    profile: 'browser',
    setOn: TIMING_BUDGETS_SET_IN,
    provenance: 'provisional',
  },
  {
    area: 'Import/share hydration',
    sourcePath: ['timings', 'importShareHydration'],
    metricKey: 'savedTeamsImportReadyMs',
    metricLabel: 'saved-team import ready',
    budgets: { desktop: 5800, mobile: 6000 },
    profile: 'browser',
    setOn: TIMING_BUDGETS_SET_IN,
    provenance: 'provisional',
  },
  {
    area: 'Import/share hydration',
    sourcePath: ['timings', 'importShareHydration'],
    metricKey: 'manualShareHydrationMs',
    metricLabel: 'manual share-link hydration',
    budgets: { desktop: 3800, mobile: 4000 },
    profile: 'browser',
    setOn: TIMING_BUDGETS_SET_IN,
    provenance: 'provisional',
  },
  {
    area: 'Explanations',
    sourcePath: ['timings', 'explanations'],
    metricKey: 'firstExplanationToggleMs',
    metricLabel: 'first explanation toggle',
    budgets: { desktop: 300, mobile: 450 },
    profile: 'browser',
    setOn: TIMING_BUDGETS_SET_IN,
    provenance: 'provisional',
  },
  {
    area: 'Explanations',
    sourcePath: ['timings', 'explanations'],
    metricKey: 'allExplanationToggleMs',
    metricLabel: 'all explanation toggles',
    budgets: { desktop: 900, mobile: 1200 },
    profile: 'browser',
    setOn: TIMING_BUDGETS_SET_IN,
    provenance: 'provisional',
  },
]);

const SAVED_TEAM_CODEC_METRICS = Object.freeze([
  {
    area: 'Saved-team codecs',
    sourcePath: ['timings', 'savedTeamCodecs'],
    metricKey: 'bulkExportEncodeMs',
    metricLabel: 'bulk export encode',
    budgets: { node: 5 },
    profile: 'node',
    setOn: '2026-09-16',
    provenance: 'measured',
  },
  {
    area: 'Saved-team codecs',
    sourcePath: ['timings', 'savedTeamCodecs'],
    metricKey: 'bulkJsonParseMs',
    metricLabel: 'bulk JSON parse',
    budgets: { node: 4 },
    profile: 'node',
    setOn: '2026-09-16',
    provenance: 'measured',
  },
  {
    area: 'Saved-team codecs',
    sourcePath: ['timings', 'savedTeamCodecs'],
    metricKey: 'bulkSanitizeMs',
    metricLabel: 'bulk sanitize',
    budgets: { node: 8 },
    profile: 'node',
    setOn: '2026-09-16',
    provenance: 'measured',
  },
  {
    area: 'Saved-team codecs',
    sourcePath: ['timings', 'savedTeamCodecs'],
    metricKey: 'bulkParseSanitizeMs',
    metricLabel: 'bulk parse and sanitize',
    budgets: { node: 12 },
    profile: 'node',
    setOn: '2026-09-16',
    provenance: 'measured',
  },
  {
    area: 'Saved-team codecs',
    sourcePath: ['timings', 'savedTeamCodecs'],
    metricKey: 'shareEncodeMs',
    metricLabel: 'share encode',
    budgets: { node: 2.5 },
    profile: 'node',
    setOn: '2026-09-16',
    provenance: 'measured',
  },
  {
    area: 'Saved-team codecs',
    sourcePath: ['timings', 'savedTeamCodecs'],
    metricKey: 'shareDecodeMs',
    metricLabel: 'share decode',
    budgets: { node: 0.6 },
    profile: 'node',
    setOn: '2026-09-16',
    provenance: 'measured',
  },
  {
    area: 'Saved-team codecs',
    sourcePath: ['timings', 'savedTeamCodecs'],
    metricKey: 'shareResolveSanitizeMs',
    metricLabel: 'share resolve and sanitize',
    budgets: { node: 1 },
    profile: 'node',
    setOn: '2026-09-16',
    provenance: 'measured',
  },
  {
    area: 'Saved-team codecs',
    sourcePath: ['timings', 'savedTeamCodecs'],
    metricKey: 'invalidValidationMs',
    metricLabel: 'invalid input validation',
    budgets: { node: 0.1 },
    profile: 'node',
    setOn: '2026-09-16',
    provenance: 'measured',
  },
]);

const ROUTE_LOAD_METRICS = Object.freeze([
  {
    area: 'Dataset',
    sourcePath: ['timings', 'dataset'],
    metricKey: 'datasetReadyMs',
    metricLabel: 'dataset ready',
    budgets: { desktop: 700, mobile: 2200 },
    profile: 'datasetReady',
    setOn: '869f138qd',
    provenance: 'provisional',
  },
  {
    area: 'Route load',
    sourcePath: ['timings', 'routes'],
    metricKey: 'guideShareCompareReadyMs',
    metricLabel: 'guide route ready',
    budgets: { desktop: 1500, mobile: 2200 },
    profile: 'browser',
    setOn: TIMING_BUDGETS_SET_IN,
    provenance: 'provisional',
  },
  {
    area: 'Route load',
    sourcePath: ['timings', 'routes'],
    metricKey: 'manualShareLandingReadyMs',
    metricLabel: 'manual share landing ready',
    budgets: { desktop: 4000, mobile: 3500 },
    profile: 'browser',
    setOn: TIMING_BUDGETS_SET_IN,
    provenance: 'provisional',
  },
  {
    area: 'Route load',
    sourcePath: ['timings', 'routes'],
    metricKey: 'compareEntryReadyMs',
    metricLabel: 'compare entry ready',
    budgets: { desktop: 3000, mobile: 4500 },
    profile: 'browser',
    setOn: TIMING_BUDGETS_SET_IN,
    provenance: 'provisional',
  },
  {
    area: 'Route load',
    sourcePath: ['timings', 'routes'],
    metricKey: 'charactersSearchReadyMs',
    metricLabel: 'characters search ready',
    budgets: { desktop: 3700, mobile: 3200 },
    profile: 'browser',
    setOn: TIMING_BUDGETS_SET_IN,
    provenance: 'provisional',
  },
  {
    area: 'Route load',
    sourcePath: ['timings', 'routes'],
    metricKey: 'savedTeamsReadyMs',
    metricLabel: 'saved teams ready',
    budgets: { desktop: 6100, mobile: 5700 },
    profile: 'browser',
    setOn: TIMING_BUDGETS_SET_IN,
    provenance: 'provisional',
  },
  {
    area: 'Route load',
    sourcePath: ['timings', 'routes'],
    metricKey: 'captainCoverageReadyMs',
    metricLabel: 'captain coverage ready',
    budgets: { desktop: 3900, mobile: 4500 },
    profile: 'browser',
    setOn: TIMING_BUDGETS_SET_IN,
    provenance: 'provisional',
  },
  {
    scope: 'result',
    viewport: 'bundle',
    enforcement: 'hard',
    area: 'Bundle',
    sourcePath: ['bundle', 'initial'],
    metricKey: 'rawBytes',
    metricLabel: 'entry script raw JS',
    unit: 'bytes',
    sizeUnit: 'raw',
    minDeltaWarning: BASELINE_WARNING_POLICY.minBytesIncrease,
    budgets: { bundle: 391_000 },
    profile: 'bundle',
    setOn: '2026-09-15',
    provenance: 'measured',
  },
  {
    scope: 'result',
    viewport: 'bundle',
    enforcement: 'hard',
    area: 'Bundle',
    sourcePath: ['bundle', 'initial'],
    metricKey: 'gzipBytes',
    metricLabel: 'entry script gzip JS',
    unit: 'bytes',
    sizeUnit: 'gzip',
    minDeltaWarning: BASELINE_WARNING_POLICY.minBytesIncrease,
    budgets: { bundle: 100_000 },
    profile: 'bundle',
    setOn: '2026-09-15',
    provenance: 'measured',
  },
  /*
   * 869f135rq. The initial PAYLOAD: the entry scripts plus every chunk they
   * statically import, which is what a first visit downloads. `area` differs from
   * the two rows above because the metric id is built from area + metricKey, and
   * these must not collide with their history.
   */
  {
    scope: 'result',
    viewport: 'bundle',
    enforcement: 'hard',
    area: 'Initial payload',
    sourcePath: ['bundle', 'initialGraph'],
    metricKey: 'rawBytes',
    metricLabel: 'initial payload raw JS',
    unit: 'bytes',
    sizeUnit: 'raw',
    minDeltaWarning: BASELINE_WARNING_POLICY.minBytesIncrease,
    budgets: { bundle: 1_536_000 },
    profile: 'bundle',
    setOn: '2026-09-15',
    provenance: 'measured',
  },
  {
    scope: 'result',
    viewport: 'bundle',
    enforcement: 'hard',
    area: 'Initial payload',
    sourcePath: ['bundle', 'initialGraph'],
    metricKey: 'gzipBytes',
    metricLabel: 'initial payload gzip JS',
    unit: 'bytes',
    sizeUnit: 'gzip',
    minDeltaWarning: BASELINE_WARNING_POLICY.minBytesIncrease,
    budgets: { bundle: 387_000 },
    profile: 'bundle',
    setOn: '2026-09-15',
    provenance: 'measured',
  },
  {
    scope: 'result',
    viewport: 'bundle',
    enforcement: 'hard',
    area: 'Bundle',
    sourcePath: ['bundle', 'routes', 'guide'],
    metricKey: 'rawBytes',
    metricLabel: 'guide route raw JS',
    unit: 'bytes',
    sizeUnit: 'raw',
    minDeltaWarning: BASELINE_WARNING_POLICY.minBytesIncrease,
    budgets: { bundle: 14_000 },
    profile: 'bundle',
    setOn: TIMING_BUDGETS_SET_IN,
    provenance: 'provisional',
  },
  {
    scope: 'result',
    viewport: 'bundle',
    enforcement: 'hard',
    area: 'Bundle',
    sourcePath: ['bundle', 'routes', 'manualShare'],
    metricKey: 'rawBytes',
    metricLabel: 'manual share route raw JS',
    unit: 'bytes',
    sizeUnit: 'raw',
    minDeltaWarning: BASELINE_WARNING_POLICY.minBytesIncrease,
    budgets: { bundle: 320_000 },
    profile: 'bundle',
    setOn: TIMING_BUDGETS_SET_IN,
    provenance: 'provisional',
  },
  {
    scope: 'result',
    viewport: 'bundle',
    enforcement: 'hard',
    area: 'Bundle',
    sourcePath: ['bundle', 'routes', 'compare'],
    metricKey: 'rawBytes',
    metricLabel: 'compare route raw JS',
    unit: 'bytes',
    sizeUnit: 'raw',
    minDeltaWarning: BASELINE_WARNING_POLICY.minBytesIncrease,
    budgets: { bundle: 740_000 },
    profile: 'bundle',
    setOn: TIMING_BUDGETS_SET_IN,
    provenance: 'provisional',
  },
  {
    scope: 'result',
    viewport: 'bundle',
    enforcement: 'hard',
    area: 'Bundle',
    sourcePath: ['bundle', 'routes', 'characters'],
    metricKey: 'rawBytes',
    metricLabel: 'characters route raw JS',
    unit: 'bytes',
    sizeUnit: 'raw',
    minDeltaWarning: BASELINE_WARNING_POLICY.minBytesIncrease,
    budgets: { bundle: 192_400 },
    profile: 'bundle',
    setOn: TIMING_BUDGETS_SET_IN,
    provenance: 'provisional',
  },
  {
    scope: 'result',
    viewport: 'bundle',
    enforcement: 'hard',
    area: 'Bundle',
    sourcePath: ['bundle', 'routes', 'savedTeams'],
    metricKey: 'rawBytes',
    metricLabel: 'saved teams route raw JS',
    unit: 'bytes',
    sizeUnit: 'raw',
    minDeltaWarning: BASELINE_WARNING_POLICY.minBytesIncrease,
    budgets: { bundle: 187_000 },
    profile: 'bundle',
    setOn: TIMING_BUDGETS_SET_IN,
    provenance: 'provisional',
  },
  {
    scope: 'result',
    viewport: 'bundle',
    enforcement: 'hard',
    area: 'Bundle',
    sourcePath: ['bundle', 'routes', 'captainCoverage'],
    metricKey: 'rawBytes',
    metricLabel: 'captain coverage route raw JS',
    unit: 'bytes',
    sizeUnit: 'raw',
    minDeltaWarning: BASELINE_WARNING_POLICY.minBytesIncrease,
    budgets: { bundle: 330_000 },
    profile: 'bundle',
    setOn: TIMING_BUDGETS_SET_IN,
    provenance: 'provisional',
  },
  /*
   * 869f138qh. What the service worker downloads before the app works offline. Until these rows,
   * the performance system measured JavaScript only, and the prefetch group was 35,163,757 B, 79%
   * of it a SQL seed no row mentioned. Measured 2026-09-16; see docs/bundle-budgets.md.
   */
  {
    scope: 'result',
    viewport: 'bundle',
    enforcement: 'hard',
    area: 'Prefetch payload',
    sourcePath: ['bundle', 'payload'],
    metricKey: 'cachedBytes',
    metricLabel: 'prefetch total cached',
    unit: 'bytes',
    sizeUnit: 'cached',
    minDeltaWarning: BASELINE_WARNING_POLICY.minBytesIncrease,
    budgets: { bundle: 9_153_000 },
    profile: 'payload',
    setOn: '2026-09-17',
    provenance: 'measured',
  },
  {
    scope: 'result',
    viewport: 'bundle',
    enforcement: 'hard',
    area: 'Prefetch payload',
    sourcePath: ['bundle', 'payload'],
    metricKey: 'wireBytes',
    metricLabel: 'prefetch total over the wire',
    unit: 'bytes',
    sizeUnit: 'gzip',
    minDeltaWarning: BASELINE_WARNING_POLICY.minBytesIncrease,
    budgets: { bundle: 4_154_000 },
    profile: 'payload',
    setOn: '2026-09-17',
    provenance: 'measured',
  },
  {
    scope: 'result',
    viewport: 'bundle',
    enforcement: 'hard',
    area: 'Prefetch payload',
    sourcePath: ['bundle', 'payload'],
    metricKey: 'databaseBytes',
    metricLabel: 'dataset database',
    unit: 'bytes',
    sizeUnit: 'cached',
    minDeltaWarning: BASELINE_WARNING_POLICY.minBytesIncrease,
    budgets: { bundle: 2_358_700 },
    profile: 'payload',
    setOn: '2026-09-16',
    provenance: 'measured',
  },
  {
    scope: 'result',
    viewport: 'bundle',
    enforcement: 'hard',
    area: 'Prefetch payload',
    sourcePath: ['bundle', 'payload'],
    metricKey: 'abilityCatalogCachedBytes',
    metricLabel: 'ability catalogue cached',
    unit: 'bytes',
    sizeUnit: 'cached',
    minDeltaWarning: BASELINE_WARNING_POLICY.minBytesIncrease,
    budgets: { bundle: 818_200 },
    profile: 'payload',
    setOn: '2026-09-17',
    provenance: 'measured',
  },
  {
    scope: 'result',
    viewport: 'bundle',
    enforcement: 'hard',
    area: 'Prefetch payload',
    sourcePath: ['bundle', 'payload'],
    metricKey: 'abilityCatalogWireBytes',
    metricLabel: 'ability catalogue over the wire',
    unit: 'bytes',
    sizeUnit: 'gzip',
    minDeltaWarning: BASELINE_WARNING_POLICY.minBytesIncrease,
    budgets: { bundle: 143_600 },
    profile: 'payload',
    setOn: '2026-09-17',
    provenance: 'measured',
  },
  {
    scope: 'result',
    viewport: 'bundle',
    enforcement: 'hard',
    area: 'Prefetch payload',
    sourcePath: ['bundle', 'payload'],
    metricKey: 'sqlWasmWireBytes',
    metricLabel: 'sql.js wasm over the wire',
    unit: 'bytes',
    sizeUnit: 'gzip',
    minDeltaWarning: BASELINE_WARNING_POLICY.minBytesIncrease,
    budgets: { bundle: 332_300 },
    profile: 'payload',
    setOn: '2026-09-16',
    provenance: 'measured',
  },
]);

const HARNESS_DEFINITIONS = Object.freeze({
  ability: {
    harness: 'ability-filters',
    metrics: ABILITY_METRICS,
  },
  explanation: {
    harness: 'explanation-compare',
    metrics: EXPLANATION_METRICS,
  },
  savedTeamCodecs: {
    harness: 'saved-team-codecs',
    metrics: SAVED_TEAM_CODEC_METRICS,
  },
  routeLoad: {
    harness: 'route-load',
    metrics: ROUTE_LOAD_METRICS,
  },
});

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function formatPercent(value) {
  if (!Number.isFinite(value)) {
    return 'n/a';
  }

  return `${value.toFixed(1)}%`;
}

function formatMs(value) {
  if (!Number.isFinite(value)) {
    return 'n/a';
  }

  const rounded = Math.round(value);
  if (Math.abs(value - rounded) < 0.001) {
    return `${rounded}ms`;
  }

  return `${value.toFixed(3).replace(/0+$/, '').replace(/\.$/, '')}ms`;
}

function formatBytes(value) {
  if (!Number.isFinite(value)) {
    return 'n/a';
  }

  if (Math.abs(value) >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(2)}MB`;
  }

  if (Math.abs(value) >= 1_000) {
    return `${(value / 1_000).toFixed(1)}KB`;
  }

  return `${Math.round(value)}B`;
}

function formatMetricValue(value, unit) {
  return unit === 'bytes' ? formatBytes(value) : formatMs(value);
}

function formatDeltaValue(value, unit) {
  if (!Number.isFinite(value)) {
    return 'n/a';
  }

  if (unit === 'bytes') {
    const prefix = value >= 0 ? '+' : '';
    return `${prefix}${formatBytes(value)}`;
  }

  const prefix = value > 0 ? '+' : value < 0 ? '-' : '';
  return `${prefix}${formatMs(Math.abs(value))}`;
}

function getNestedValue(value, keys) {
  return keys.reduce((current, key) => (isObject(current) ? current[key] : undefined), value);
}

function toOptionalFiniteNumber(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return null;
  }

  const rounded = Math.round(value * 1000) / 1000;

  return Object.is(rounded, -0) ? 0 : rounded;
}

function normalizeSegment(value) {
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function buildMetricId(harness, viewport, area, metricKey) {
  return [harness, viewport, area, metricKey].map(normalizeSegment).join('.');
}

function buildWorkflowMetadata(env) {
  const repository = env.GITHUB_REPOSITORY ?? null;
  const runId = env.GITHUB_RUN_ID ?? null;
  const serverUrl = env.GITHUB_SERVER_URL ?? 'https://github.com';

  return {
    name: env.GITHUB_WORKFLOW ?? 'local',
    repository,
    runId,
    runNumber: env.GITHUB_RUN_NUMBER ?? null,
    runAttempt: env.GITHUB_RUN_ATTEMPT ?? null,
    runUrl: repository && runId ? `${serverUrl}/${repository}/actions/runs/${runId}` : null,
    eventName: env.GITHUB_EVENT_NAME ?? null,
    ref: env.GITHUB_REF ?? null,
    sha: env.GITHUB_SHA ?? null,
    actor: env.GITHUB_ACTOR ?? null,
  };
}

function detectResultKind(result) {
  if (
    Array.isArray(result?.viewportRuns) &&
    isObject(result?.selectedAbilities) &&
    result.viewportRuns.some((run) => isObject(run?.timings?.savedTeams))
  ) {
    return 'ability';
  }

  if (
    Array.isArray(result?.viewportRuns) &&
    isObject(result?.fixture) &&
    result.viewportRuns.some((run) => isObject(run?.timings?.compare))
  ) {
    return 'explanation';
  }

  if (
    result?.harness === 'saved-team-codecs' ||
    (Array.isArray(result?.viewportRuns) &&
      result.viewportRuns.some((run) => isObject(run?.timings?.savedTeamCodecs)))
  ) {
    return 'savedTeamCodecs';
  }

  if (
    Array.isArray(result?.viewportRuns) &&
    isObject(result?.bundle) &&
    result.viewportRuns.some((run) => isObject(run?.timings?.routes))
  ) {
    return 'routeLoad';
  }

  return null;
}

async function collectJsonFiles(rootDir) {
  if (!existsSync(rootDir)) {
    return [];
  }

  const entries = await readdir(rootDir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const entryPath = path.join(rootDir, entry.name);

    if (entry.isDirectory()) {
      files.push(...(await collectJsonFiles(entryPath)));
    } else if (entry.isFile() && entry.name.endsWith('.json')) {
      files.push(entryPath);
    }
  }

  return files.sort();
}

export async function readPerformanceResults(currentDir) {
  const jsonFiles = await collectJsonFiles(currentDir);
  const results = {};

  for (const filePath of jsonFiles) {
    const parsed = JSON.parse(await readFile(filePath, 'utf8'));
    const kind = detectResultKind(parsed);

    if (!kind || results[kind]) {
      continue;
    }

    results[kind] = {
      filePath,
      result: parsed,
    };
  }

  for (const kind of Object.keys(HARNESS_DEFINITIONS)) {
    if (!results[kind]) {
      throw new Error(`Missing ${HARNESS_DEFINITIONS[kind].harness} performance result under ${currentDir}.`);
    }
  }

  return results;
}

function buildMetricRowsForResult(kind, resultEntry, baselineRows) {
  const definition = HARNESS_DEFINITIONS[kind];
  const rows = [];
  const viewportMetrics = definition.metrics.filter((metric) => metric.scope !== 'result');
  const resultMetrics = definition.metrics.filter((metric) => metric.scope === 'result');

  for (const viewportRun of resultEntry.result.viewportRuns) {
    const viewport = viewportRun.viewport;

    if (typeof viewport !== 'string' || viewport.trim() === '') {
      throw new Error(`Invalid ${definition.harness} result: viewport label is required.`);
    }

    for (const metric of viewportMetrics) {
      const source = getNestedValue(viewportRun, metric.sourcePath);
      const actualMs = toOptionalFiniteNumber(source?.[metric.metricKey]);
      const budgetMs = metric.budgets[viewport] ?? null;
      const id = buildMetricId(definition.harness, viewport, metric.area, metric.metricKey);
      const baselineRow = baselineRows.get(id);
      const baselineMs = toOptionalFiniteNumber(baselineRow?.actualMs);
      const deltaMs = actualMs === null || baselineMs === null ? null : toOptionalFiniteNumber(actualMs - baselineMs);
      const deltaPercent =
        baselineMs && baselineMs > 0 && deltaMs !== null ? (deltaMs / baselineMs) * 100 : null;
      const hardBudgetStatus =
        actualMs === null ? 'failed' : budgetMs === null ? 'not-budgeted' : actualMs <= budgetMs ? 'passed' : 'failed';
      const baselineWarning =
        actualMs !== null &&
        baselineMs !== null &&
        deltaMs !== null &&
        deltaMs >= (metric.minDeltaWarning ?? BASELINE_WARNING_POLICY.minMsIncrease) &&
        deltaPercent >= BASELINE_WARNING_POLICY.minPercentIncrease;

      rows.push({
        id,
        harness: definition.harness,
        viewport,
        area: metric.area,
        metric: metric.metricLabel,
        metricKey: metric.metricKey,
        unit: metric.unit ?? 'ms',
        enforcement: resolveBudgetEnforcement(metric),
        /*
         * 869f135u7. What this number IS, carried on the row rather than left to
         * whoever wrote the harness. `basis` says single observation vs mean over
         * loops - the difference between a figure that moves with CI weather and
         * one that does not - and `profile` says on what.
         */
        basis: MEASUREMENT_PROFILES[metric.profile]?.basis ?? null,
        profile: MEASUREMENT_PROFILES[metric.profile]?.[viewport] ?? null,
        setOn: metric.setOn ?? null,
        provenance: metric.provenance ?? null,
        /* 869f138r0. Which of the four sizes this is. Null for anything not measured in bytes. */
        sizeUnit: metric.sizeUnit ?? null,
        actualMs,
        budgetMs,
        baselineMs,
        deltaMs,
        deltaPercent: deltaPercent === null ? null : Number(deltaPercent.toFixed(2)),
        hardBudgetStatus,
        baselineWarning,
      });
    }
  }

  for (const metric of resultMetrics) {
    const viewport = metric.viewport ?? 'bundle';
    const source = getNestedValue(resultEntry.result, metric.sourcePath);
    const actualMs = toOptionalFiniteNumber(source?.[metric.metricKey]);
    const budgetMs = metric.budgets[viewport] ?? null;
    const id = buildMetricId(definition.harness, viewport, metric.area, metric.metricLabel);
    const baselineRow = baselineRows.get(id);
    const baselineMs = toOptionalFiniteNumber(baselineRow?.actualMs);
    const deltaMs = actualMs === null || baselineMs === null ? null : toOptionalFiniteNumber(actualMs - baselineMs);
    const deltaPercent =
      baselineMs && baselineMs > 0 && deltaMs !== null ? (deltaMs / baselineMs) * 100 : null;
    const hardBudgetStatus =
      actualMs === null ? 'failed' : budgetMs === null ? 'not-budgeted' : actualMs <= budgetMs ? 'passed' : 'failed';
    const baselineWarning =
      actualMs !== null &&
      baselineMs !== null &&
      deltaMs !== null &&
      deltaMs >= (metric.minDeltaWarning ?? BASELINE_WARNING_POLICY.minMsIncrease) &&
      deltaPercent >= BASELINE_WARNING_POLICY.minPercentIncrease;

    rows.push({
      id,
      harness: definition.harness,
      viewport,
      area: metric.area,
      metric: metric.metricLabel,
      metricKey: metric.metricKey,
      unit: metric.unit ?? 'ms',
      enforcement: resolveBudgetEnforcement(metric),
      /*
       * 869f138qh. The result rows dropped these four, so every bundle row printed "unrecorded"
       * and "provisional (undefined)" in the Markdown summary even when its definition said
       * measured. The viewport rows above already carried them.
       */
      basis: MEASUREMENT_PROFILES[metric.profile]?.basis ?? null,
      profile: MEASUREMENT_PROFILES[metric.profile]?.[viewport] ?? null,
      setOn: metric.setOn ?? null,
      provenance: metric.provenance ?? null,
      /* 869f138r0. Which of the four sizes this is. Null for anything not measured in bytes. */
      sizeUnit: metric.sizeUnit ?? null,
      actualMs,
      budgetMs,
      baselineMs,
      deltaMs,
      deltaPercent: deltaPercent === null ? null : Number(deltaPercent.toFixed(2)),
      hardBudgetStatus,
      baselineWarning,
    });
  }

  return rows;
}

function summarizeCurrentResults(results, rootDir) {
  return Object.fromEntries(
    Object.entries(results).map(([kind, entry]) => [
      kind,
      {
        harness: HARNESS_DEFINITIONS[kind].harness,
        path: path.relative(rootDir, entry.filePath),
        capturedAt: entry.result.capturedAt ?? null,
        appCommit: entry.result.appCommit ?? null,
        runLabel: entry.result.runLabel ?? null,
        baseURL: entry.result.baseURL ?? null,
      },
    ]),
  );
}

async function readBaselineReport(baselineReportPath) {
  if (!baselineReportPath || !existsSync(baselineReportPath)) {
    return null;
  }

  const parsed = JSON.parse(await readFile(baselineReportPath, 'utf8'));

  if (parsed?.schemaVersion !== PERFORMANCE_REPORT_SCHEMA_VERSION || !Array.isArray(parsed.metricRows)) {
    throw new Error(`Invalid baseline performance report: ${baselineReportPath}`);
  }

  return parsed;
}

export async function buildPerformanceBudgetReport(options = {}, env = process.env) {
  const currentDir = path.resolve(options.currentDir ?? path.join('perf-artifacts', 'current'));
  const baselineReport = await readBaselineReport(options.baselineReportPath);
  const baselineRows = new Map((baselineReport?.metricRows ?? []).map((row) => [row.id, row]));
  const results = await readPerformanceResults(currentDir);
  const metricRows = Object.entries(results).flatMap(([kind, entry]) =>
    buildMetricRowsForResult(kind, entry, baselineRows),
  );
  const describeFailure = (row) => ({
    metricId: row.id,
    message: `${row.harness} ${row.viewport} ${row.area} ${row.metric}: ${formatMetricValue(
      row.actualMs,
      row.unit,
    )} > ${formatMetricValue(row.budgetMs, row.unit)}`,
  });
  /*
   * 869f1vu91. A row with no value at all is ALWAYS hard, whatever its enforcement. `hardBudgetStatus`
   * conflates two different things - over budget, and never measured - and only the first of those is
   * the runner's weather. A metric that produced nothing means the measurement broke, which is
   * deterministic and must stop the run rather than be filed under "timings are noisy".
   */
  const hardBudgetFailures = metricRows
    .filter(
      (row) =>
        row.hardBudgetStatus === 'failed' &&
        (row.actualMs === null || row.enforcement === HARD_BUDGET_ENFORCEMENT),
    )
    .map(describeFailure);
  /*
   * Reported with the same detail as a hard failure, and deliberately not gating - see
   * HARD_BUDGET_ENFORCEMENT above. Kept as its own list rather than folded into the warnings so a
   * timing regression is still visible as a budget breach rather than a footnote.
   */
  const advisoryBudgetFailures = metricRows
    .filter(
      (row) =>
        row.hardBudgetStatus === 'failed' &&
        row.actualMs !== null &&
        row.enforcement === ADVISORY_BUDGET_ENFORCEMENT,
    )
    .map(describeFailure);
  const invalidMetricFailures = [
    ...metricRows
      .filter((row) => row.actualMs === null)
      .map((row) => ({
        metricId: row.id,
        message: `${row.harness} ${row.viewport} ${row.area} ${row.metric}: missing or non-finite metric value`,
      })),
    /*
     * 869f138r0. A byte row that does not say WHICH size it is. The same file has four, and the
     * abilities catalogue differs eight-fold between two of them, so "1.6 MB" without a unit is not
     * a wrong number - it is an unusable one, and two readers can argue from it and both be right.
     * Joined to the invalid-metric failures because it is the same class of defect: a row that
     * cannot be read, rather than a budget that was missed.
     */
    ...findUndeclaredSizeUnits(metricRows).map((finding) => ({
      metricId: finding.metricKey,
      message: `${finding.metricLabel || finding.metricKey}: ${finding.detail}`,
    })),
  ];
  const baselineDeltaWarnings = metricRows
    .filter((row) => row.baselineWarning)
    .map((row) => ({
      metricId: row.id,
      message: `${row.harness} ${row.viewport} ${row.area} ${row.metric}: ${formatMetricValue(
        row.actualMs,
        row.unit,
      )} vs baseline ${formatMetricValue(row.baselineMs, row.unit)} (${formatPercent(row.deltaPercent)} increase)`,
    }));
  const status = resolveReportStatus({
    hardBudgetFailures,
    advisoryBudgetFailures,
    invalidMetricFailures,
    baselineDeltaWarnings,
  });

  return {
    schemaVersion: PERFORMANCE_REPORT_SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    status,
    workflow: buildWorkflowMetadata(env),
    current: summarizeCurrentResults(results, currentDir),
    baseline: baselineReport
      ? {
          generatedAt: baselineReport.generatedAt ?? null,
          status: baselineReport.status ?? null,
          workflow: baselineReport.workflow ?? null,
        }
      : null,
    /*
     * 869f135u7. `hardBudgets` used to sit here: a second, hand-maintained copy
     * of every budget, published in the report. Nine of its entries CONTRADICTED
     * the enforced values - `savedTeamsImportReadyMs` read 3000/4000 against an
     * enforced 5800/6000 - it was misnamed (42 of the 52 budgeted rows are
     * advisory, not hard), and nothing in the repository read it: one occurrence,
     * its own declaration.
     *
     * Deriving it was possible and pointless - derived, it restates `metricRows`,
     * which every consumer already has. So `metricRows` is now the ONLY statement
     * of a budget, and `perf-budget-report.spec.ts` asserts no second budget
     * literal grows back.
     */
    budgetPolicy: {
      measurementProfiles: MEASUREMENT_PROFILES,
      baselineWarning: BASELINE_WARNING_POLICY,
    },
    summary: {
      metricCount: metricRows.length,
      budgetedMetricCount: metricRows.filter((row) => row.budgetMs !== null).length,
      hardBudgetFailureCount: hardBudgetFailures.length,
      advisoryBudgetFailureCount: advisoryBudgetFailures.length,
      invalidMetricFailureCount: invalidMetricFailures.length,
      baselineDeltaWarningCount: baselineDeltaWarnings.length,
    },
    metricRows,
    hardBudgetFailures,
    advisoryBudgetFailures,
    invalidMetricFailures,
    baselineDeltaWarnings,
  };
}

/**
 * The report's own verdict.
 *
 * Extracted so it can be tested: it used to be one inline ternary inside a
 * hundred-line builder, and the only test that produced an invalid metric also
 * produced a hard budget failure - so the two were indistinguishable and a
 * mutation dropping `invalidMetricFailures` from the rule passed every test.
 *
 * `invalidMetricFailures` counts. `main` already exits 1 on them, but `status`
 * was computed without them, so the report JSON said "passed" on a run that
 * failed - and anything reading the artifact rather than the exit code believed
 * it. A metric that is missing or non-finite is not a pass; it is a measurement
 * that did not happen.
 */
export function resolveReportStatus({
  hardBudgetFailures = [],
  advisoryBudgetFailures = [],
  invalidMetricFailures = [],
  baselineDeltaWarnings = [],
} = {}) {
  if (hardBudgetFailures.length || invalidMetricFailures.length) {
    return 'failed';
  }

  /*
   * 869f1vu91. An advisory breach is a `warning`, never `passed`. It does not gate the run - the
   * timing it measures is partly the runner's speed - but calling it `passed` would hide it in the
   * trend history, which is the only place a slow drift is ever visible.
   */
  return advisoryBudgetFailures.length || baselineDeltaWarnings.length ? 'warning' : 'passed';
}

export function formatPerformanceBudgetSummary(report) {
  const lines = [
    '# Performance Budgets',
    '',
    `Status: ${report.status}`,
    `Metrics: ${report.summary.metricCount} total, ${report.summary.budgetedMetricCount} budgeted`,
  ];

  if (report.workflow.runUrl) {
    lines.push(`Run: ${report.workflow.runUrl}`);
  }

  if (report.baseline?.workflow?.runUrl) {
    lines.push(`Baseline: ${report.baseline.workflow.runUrl}`);
  } else {
    lines.push('Baseline: none available; this run can establish the first baseline artifact.');
  }

  lines.push('', '## Hard Budget Failures');
  if (report.hardBudgetFailures.length) {
    for (const failure of report.hardBudgetFailures) {
      lines.push(`- ${failure.message}`);
    }
  } else {
    lines.push('- None');
  }

  lines.push('', '## Advisory Budget Failures (timings; reported, not gating)');
  if (report.advisoryBudgetFailures?.length) {
    for (const failure of report.advisoryBudgetFailures) {
      lines.push(`- ${failure.message}`);
    }
  } else {
    lines.push('- None');
  }

  lines.push('', '## Invalid Metrics');
  if (report.invalidMetricFailures.length) {
    for (const failure of report.invalidMetricFailures) {
      lines.push(`- ${failure.message}`);
    }
  } else {
    lines.push('- None');
  }

  lines.push('', '## Baseline Delta Warnings');
  if (report.baselineDeltaWarnings.length) {
    for (const warning of report.baselineDeltaWarnings) {
      lines.push(`- ${warning.message}`);
    }
  } else {
    lines.push('- None');
  }

  lines.push(
    '',
    '## Metrics',
    '| Harness | Viewport | Area | Metric | Current | Budget | Baseline | Delta | Basis | Set |',
    '| --- | --- | --- | --- | ---: | ---: | ---: | ---: | --- | --- |',
  );

  for (const row of report.metricRows) {
    const delta =
      row.deltaMs === null
        ? 'n/a'
        : `${formatDeltaValue(row.deltaMs, row.unit)} (${formatPercent(row.deltaPercent)})`;
    lines.push(
      `| ${row.harness} | ${row.viewport} | ${row.area} | ${row.metric} | ${formatMetricValue(
        row.actualMs,
        row.unit,
      )} | ${formatMetricValue(row.budgetMs, row.unit)} | ${formatMetricValue(row.baselineMs, row.unit)} | ${delta} | ${
        row.basis ?? 'unrecorded'
      } | ${row.provenance === 'measured' ? `measured ${row.setOn}` : `provisional (${row.setOn})`} |`,
    );
  }

  return `${lines.join('\n')}\n`;
}

function parseArgs(argv) {
  const options = {};

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const [name, inlineValue] = arg.includes('=') ? arg.split(/=(.*)/s, 2) : [arg, null];
    const readValue = () => {
      if (inlineValue !== null) {
        return inlineValue;
      }

      index += 1;
      if (index >= argv.length) {
        throw new Error(`Missing value for ${name}.`);
      }

      return argv[index];
    };

    switch (name) {
      case '--current-dir':
        options.currentDir = readValue();
        break;
      case '--baseline-report':
        options.baselineReportPath = readValue();
        break;
      case '--output':
        options.outputPath = readValue();
        break;
      case '--summary':
        options.summaryPath = readValue();
        break;
      case '--report-only':
        options.reportOnly = true;
        break;
      default:
        throw new Error(`Unknown option: ${arg}`);
    }
  }

  return options;
}

export async function runCli(argv = process.argv.slice(2), env = process.env) {
  const options = parseArgs(argv);
  const outputPath = path.resolve(options.outputPath ?? path.join('perf-artifacts', 'performance-budget-report.json'));
  const summaryPath = options.summaryPath ?? env.GITHUB_STEP_SUMMARY ?? null;
  const report = await buildPerformanceBudgetReport(options, env);

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`);

  const markdown = formatPerformanceBudgetSummary(report);
  if (summaryPath) {
    await mkdir(path.dirname(path.resolve(summaryPath)), { recursive: true });
    await writeFile(summaryPath, markdown);
  } else {
    process.stdout.write(markdown);
  }

  if (report.invalidMetricFailures.length || (report.hardBudgetFailures.length && !options.reportOnly)) {
    process.exitCode = 1;
  }

  return report;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    await runCli();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
