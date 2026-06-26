import { describe, expect, it } from 'vitest';

import { dataImportSources } from './import-optc-data.mjs';
import {
  buildReleaseTriggerReport,
  buildReleaseCheckResult,
  checkOptcReleaseNeeded,
  evaluateLegacyDataSource,
  extractCharacterIdsFromSeed,
  formatReleaseTriggerSummary,
  parseReleaseCheckArgs,
  resolveReleaseCheckOptions,
} from './check-optc-release-needed.mjs';
import {
  buildReleasePolicyGitHubOutputs,
  releaseTriggerPolicy,
  validateReleaseTriggerPolicy,
} from './lib/release-trigger-policy.mjs';

describe('check-optc-release-needed', () => {
  it('defaults to the 2shankz source and JSON output off', () => {
    expect(parseReleaseCheckArgs([])).toMatchObject({
      source: releaseTriggerPolicy.defaultSource,
      json: false,
    });
  });

  it('exposes the versioned release trigger policy for detector and workflow consumers', () => {
    expect(releaseTriggerPolicy).toMatchObject({
      schemaVersion: 1,
      defaultSource: '2shankz',
      decision: {
        strategy: 'missing-character-ids',
        releaseReason: 'new-upstream-characters',
        skipReason: 'no-new-upstream-characters',
        ignoredChangeClasses: [
          'source-version-only',
          'image-only',
          'filter-only',
          'same-id-edits',
        ],
      },
      dispatch: {
        workflow: 'release-android.yml',
        ref: 'main',
        bump: 'patch',
        activeStatuses: ['queued', 'in_progress'],
      },
      report: {
        schemaVersion: 1,
      },
    });
    expect(releaseTriggerPolicy.localDataset.manifestPath).toMatch(/public[/\\]assets[/\\]data[/\\]optc-manifest\.json$/);
    expect(releaseTriggerPolicy.localDataset.seedPath).toMatch(/public[/\\]assets[/\\]data[/\\]optc-seed\.sql$/);
    expect(releaseTriggerPolicy.upstream).toEqual({
      versionPath: 'common/data/version.js',
      unitsPath: 'common/data/units.js',
    });
    expect(buildReleasePolicyGitHubOutputs()).toEqual({
      release_workflow: 'release-android.yml',
      release_ref: 'main',
      release_bump: 'patch',
      active_statuses_json: '["queued","in_progress"]',
    });
    expect(Object.isFrozen(releaseTriggerPolicy)).toBe(true);
    expect(Object.isFrozen(releaseTriggerPolicy.dispatch.activeStatuses)).toBe(true);
  });

  it('validates release trigger policy invariants before consumers use config values', () => {
    expect(() =>
      validateReleaseTriggerPolicy({
        ...releaseTriggerPolicy,
        schemaVersion: 2,
      }),
    ).toThrow('schemaVersion must be 1');
    expect(() =>
      validateReleaseTriggerPolicy({
        ...releaseTriggerPolicy,
        decision: {
          ...releaseTriggerPolicy.decision,
          strategy: 'source-version',
        },
      }),
    ).toThrow('decision.strategy must be one of missing-character-ids');
    expect(() =>
      validateReleaseTriggerPolicy({
        ...releaseTriggerPolicy,
        decision: {
          ...releaseTriggerPolicy.decision,
          releaseReason: 'changed-release-reason',
        },
      }),
    ).toThrow('decision.releaseReason must match report reasons');
  });

  it('resolves bundled fixture paths from the fixture name', () => {
    const options = parseReleaseCheckArgs(['--fixture=no-change', '--json']);

    expect(options).toMatchObject({
      fixture: 'no-change',
      json: true,
    });
    expect(options.manifestPath).toMatch(/scripts[/\\]fixtures[/\\]release-check[/\\]no-change[/\\]local-manifest\.json$/);
    expect(options.seedPath).toMatch(/scripts[/\\]fixtures[/\\]release-check[/\\]no-change[/\\]local-seed\.sql$/);
    expect(options.remoteVersionPath).toMatch(/scripts[/\\]fixtures[/\\]release-check[/\\]no-change[/\\]remote-version\.js$/);
    expect(options.remoteUnitsPath).toMatch(/scripts[/\\]fixtures[/\\]release-check[/\\]no-change[/\\]remote-units\.js$/);
  });

  it('rejects unknown options', () => {
    expect(() => parseReleaseCheckArgs(['--unknown'])).toThrow('Unknown option: --unknown');
  });

  it('rejects ambiguous or incomplete replay inputs', () => {
    expect(() => parseReleaseCheckArgs(['--fixture=no-change', '--fixture-dir=/tmp/replay'])).toThrow(
      'Use either --fixture or --fixture-dir, not both.',
    );
    expect(() => parseReleaseCheckArgs(['--fixture=../no-change'])).toThrow(
      'Invalid fixture name: ../no-change',
    );
    expect(() =>
      resolveReleaseCheckOptions({ remoteVersionPath: '/tmp/version.js' }),
    ).toThrow(
      'Both --remote-version-path and --remote-units-path are required when replaying captured upstream files.',
    );
  });

  it('extracts only character table IDs from the generated SQL seed', () => {
    const ids = extractCharacterIdsFromSeed(`
      CREATE TABLE characters (id INTEGER PRIMARY KEY);
      INSERT INTO characters (id, name) VALUES (2, 'Zoro');
      INSERT INTO character_details (character_id, detail_json) VALUES (9000, '{}');
      INSERT INTO characters (
        id,
        name
      )
      VALUES (
        1,
        'Luffy'
      );
      INSERT INTO characters (id, name) VALUES (2, 'Duplicate');
    `);

    expect(ids).toEqual([1, 2]);
  });

  it('throws when the seed has no generated character rows', () => {
    expect(() => extractCharacterIdsFromSeed('CREATE TABLE ships (id INTEGER);')).toThrow(
      'No character rows found in local optc-seed.sql.',
    );
  });

  it('evaluates upstream legacy data files in a window sandbox', () => {
    const result = evaluateLegacyDataSource(`
      window.units = {
        "1": { id: "1", name: "Luffy", type: "STR", class: ["Fighter"], stars: "5" }
      };
    `);

    expect(result.units['1'].name).toBe('Luffy');
  });

  it('does not request a release for source-version-only changes', () => {
    const result = buildReleaseCheckResult({
      source: dataImportSources['2shankz'],
      localSourceVersion: '36',
      remoteSourceVersion: '37',
      localCharacterIds: [1, 2],
      remoteCharacters: [{ id: 1 }, { id: 2 }],
    });

    expect(result).toMatchObject({
      releaseNeeded: false,
      reason: 'no-new-upstream-characters',
      localCharacterCount: 2,
      remoteCharacterCount: 2,
      newCharacterIds: [],
      newCharacterCount: 0,
    });
  });

  it('requests a release when upstream includes IDs missing from the committed seed', () => {
    const result = buildReleaseCheckResult({
      source: dataImportSources['2shankz'],
      localSourceVersion: '36',
      remoteSourceVersion: '37',
      localCharacterIds: [1, 2, 4],
      remoteCharacters: [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }],
    });

    expect(result).toMatchObject({
      releaseNeeded: true,
      reason: 'new-upstream-characters',
      newCharacterIds: [3],
      newCharacterCount: 1,
    });
  });

  it('checks IDs instead of count so same-size replacements still surface new upstream IDs', () => {
    const result = buildReleaseCheckResult({
      source: dataImportSources['2shankz'],
      localSourceVersion: '36',
      remoteSourceVersion: '36',
      localCharacterIds: [1, 2],
      remoteCharacters: [{ id: 1 }, { id: 3 }],
    });

    expect(result.releaseNeeded).toBe(true);
    expect(result.newCharacterIds).toEqual([3]);
  });

  it('builds a skipped report for a no-change release check', () => {
    const releaseCheckResult = buildReleaseCheckResult({
      source: dataImportSources['2shankz'],
      localSourceVersion: '36',
      remoteSourceVersion: '36',
      localCharacterIds: [1, 2],
      remoteCharacters: [{ id: 1 }, { id: 2 }],
    });
    const report = buildReleaseTriggerReport({
      releaseCheckResult,
      generatedAt: '2026-06-26T00:00:00.000Z',
      stepOutcomes: {
        fixtureValidation: 'success',
        releaseCheck: 'success',
        activeRelease: 'skipped',
        dispatchRelease: 'skipped',
        skipRelease: 'success',
      },
    });

    expect(report).toMatchObject({
      schemaVersion: 1,
      status: 'skipped',
      reason: 'no-new-upstream-characters',
      dispatch: {
        releaseNeeded: false,
        releaseDispatched: false,
      },
    });
    expect(formatReleaseTriggerSummary(report)).toContain(
      '## OPTC DB release trigger report',
    );
  });

  it('builds a released report when the Android release workflow is dispatched', () => {
    const releaseCheckResult = buildReleaseCheckResult({
      source: dataImportSources['2shankz'],
      localSourceVersion: '36',
      remoteSourceVersion: '37',
      localCharacterIds: [1, 2],
      remoteCharacters: [{ id: 1 }, { id: 2 }, { id: 3 }],
    });
    const report = buildReleaseTriggerReport({
      releaseCheckResult,
      activeReleaseCount: '0',
      generatedAt: '2026-06-26T00:00:00.000Z',
      stepOutcomes: {
        fixtureValidation: 'success',
        releaseCheck: 'success',
        activeRelease: 'success',
        dispatchRelease: 'success',
        skipRelease: 'skipped',
      },
    });

    expect(report).toMatchObject({
      status: 'released',
      reason: 'release-dispatched',
      comparison: {
        newCharacterIds: [3],
        newCharacterCount: 1,
      },
      dispatch: {
        releaseNeeded: true,
        releaseDispatched: true,
        activeReleaseCount: 0,
      },
    });
  });

  it('builds a skipped report when an Android release run is already active', () => {
    const releaseCheckResult = buildReleaseCheckResult({
      source: dataImportSources['2shankz'],
      localSourceVersion: '36',
      remoteSourceVersion: '37',
      localCharacterIds: [1, 2],
      remoteCharacters: [{ id: 1 }, { id: 2 }, { id: 3 }],
    });
    const report = buildReleaseTriggerReport({
      releaseCheckResult,
      activeReleaseCount: '2',
      generatedAt: '2026-06-26T00:00:00.000Z',
      stepOutcomes: {
        fixtureValidation: 'success',
        releaseCheck: 'success',
        activeRelease: 'success',
        dispatchRelease: 'skipped',
        skipRelease: 'skipped',
      },
    });

    expect(report).toMatchObject({
      status: 'skipped',
      reason: 'active-release-running',
      dispatch: {
        releaseNeeded: true,
        releaseDispatched: false,
        activeReleaseCount: 2,
      },
    });
  });

  it('builds the active-release blocked report from the bundled active-release-running fixture', async () => {
    const releaseCheckResult = await checkOptcReleaseNeeded({ fixture: 'active-release-running' });
    const report = buildReleaseTriggerReport({
      releaseCheckResult,
      activeReleaseCount: '1',
      generatedAt: '2026-06-26T00:00:00.000Z',
      stepOutcomes: {
        fixtureValidation: 'success',
        releaseCheck: 'success',
        activeRelease: 'success',
        dispatchRelease: 'skipped',
        skipRelease: 'skipped',
      },
    });

    expect(report).toMatchObject({
      status: 'skipped',
      reason: 'active-release-running',
      comparison: {
        newCharacterIds: [3],
        newCharacterCount: 1,
      },
      dispatch: {
        releaseNeeded: true,
        releaseDispatched: false,
        activeReleaseCount: 1,
      },
    });
  });

  it('builds a failed report when fixture validation fails before the live check', () => {
    const report = buildReleaseTriggerReport({
      generatedAt: '2026-06-26T00:00:00.000Z',
      stepOutcomes: {
        fixtureValidation: 'failure',
        releaseCheck: 'skipped',
        activeRelease: 'skipped',
        dispatchRelease: 'skipped',
        skipRelease: 'skipped',
      },
    });

    expect(report).toMatchObject({
      status: 'failed',
      reason: 'fixture-validation-failed',
      releaseCheck: null,
      comparison: null,
    });
  });

  const replayFixtureCases = [
    {
      fixture: 'no-change',
      branch: 'no new upstream IDs',
      releaseNeeded: false,
      reason: 'no-new-upstream-characters',
      localSourceVersion: '36',
      remoteSourceVersion: '36',
      localCharacterCount: 2,
      remoteCharacterCount: 2,
      newCharacterIds: [],
      newCharacterCount: 0,
    },
    {
      fixture: 'new-character',
      branch: 'new upstream ID detected',
      releaseNeeded: true,
      reason: 'new-upstream-characters',
      localSourceVersion: '36',
      remoteSourceVersion: '37',
      localCharacterCount: 2,
      remoteCharacterCount: 3,
      newCharacterIds: [3],
      newCharacterCount: 1,
    },
    {
      fixture: 'active-release-running',
      branch: 'new upstream ID blocked by active release guard',
      releaseNeeded: true,
      reason: 'new-upstream-characters',
      localSourceVersion: '36',
      remoteSourceVersion: '37',
      localCharacterCount: 2,
      remoteCharacterCount: 3,
      newCharacterIds: [3],
      newCharacterCount: 1,
    },
    {
      fixture: 'upstream-shape-drift',
      branch: 'source and object shape drift with no new upstream IDs',
      releaseNeeded: false,
      reason: 'no-new-upstream-characters',
      localSourceVersion: '36',
      remoteSourceVersion: '38',
      localCharacterCount: 2,
      remoteCharacterCount: 2,
      newCharacterIds: [],
      newCharacterCount: 0,
    },
  ];

  for (const fixtureCase of replayFixtureCases) {
    it(`replays the bundled ${fixtureCase.fixture} fixture: ${fixtureCase.branch}`, async () => {
      const { fixture, branch, ...expectedResult } = fixtureCase;

      expect(branch.length).toBeGreaterThan(0);
      await expect(checkOptcReleaseNeeded({ fixture })).resolves.toMatchObject(expectedResult);
    });
  }

  it('fails deterministically for the malformed error fixture', async () => {
    await expect(checkOptcReleaseNeeded({ fixture: 'error' })).rejects.toThrow();
  });
});
