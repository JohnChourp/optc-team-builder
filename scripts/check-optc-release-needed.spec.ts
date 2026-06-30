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
import {
  buildReleaseTriggerNotification,
  sendReleaseTriggerNotification,
} from './lib/release-trigger-notifications.mjs';
import {
  MALFORMED_RELEASE_CHECK_FIXTURE,
  RELEASE_CHECK_FIXTURE_FILE_NAMES,
  RELEASE_CHECK_REPLAY_FIXTURE_CASES,
} from './fixtures/shared/release-check-fixtures.mjs';

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
    expect(releaseTriggerPolicy.notification).toMatchObject({
      sink: 'github-issue',
      issueTitle: 'OPTC DB release trigger notifications',
      issueMarker: '<!-- optc-release-trigger-notifications -->',
      quietReasons: ['no-new-upstream-characters'],
      severities: {
        'release-dispatched': 'info',
        'active-release-running': 'warning',
        'fixture-validation-failed': 'error',
        'detector-failed': 'error',
        'active-release-check-failed': 'error',
        'dispatch-failed': 'error',
      },
    });
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
    expect(() =>
      validateReleaseTriggerPolicy({
        ...releaseTriggerPolicy,
        notification: {
          ...releaseTriggerPolicy.notification,
          sink: 'webhook',
        },
      }),
    ).toThrow('notification.sink must be one of github-issue');
  });

  it('resolves bundled fixture paths from the fixture name', () => {
    const options = parseReleaseCheckArgs(['--fixture=no-change', '--json']);

    expect(options).toMatchObject({
      fixture: 'no-change',
      json: true,
    });
    expect(
      normalizePath(options.manifestPath).endsWith(
        `scripts/fixtures/release-check/no-change/${RELEASE_CHECK_FIXTURE_FILE_NAMES.manifestPath}`,
      ),
    ).toBe(true);
    expect(
      normalizePath(options.seedPath).endsWith(
        `scripts/fixtures/release-check/no-change/${RELEASE_CHECK_FIXTURE_FILE_NAMES.seedPath}`,
      ),
    ).toBe(true);
    expect(
      normalizePath(options.remoteVersionPath).endsWith(
        `scripts/fixtures/release-check/no-change/${RELEASE_CHECK_FIXTURE_FILE_NAMES.remoteVersionPath}`,
      ),
    ).toBe(true);
    expect(
      normalizePath(options.remoteUnitsPath).endsWith(
        `scripts/fixtures/release-check/no-change/${RELEASE_CHECK_FIXTURE_FILE_NAMES.remoteUnitsPath}`,
      ),
    ).toBe(true);
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

  it('keeps routine no-change release-trigger reports quiet', async () => {
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
    const fetchImpl = () => {
      throw new Error('quiet notification must not call GitHub');
    };

    expect(buildReleaseTriggerNotification(report)).toMatchObject({
      shouldNotify: false,
      reason: 'no-new-upstream-characters',
    });
    await expect(
      sendReleaseTriggerNotification({
        report,
        fetchImpl,
        logger: { info: () => undefined },
      }),
    ).resolves.toMatchObject({
      sent: false,
      action: 'skipped',
    });
  });

  it('formats release-dispatched reports as info notifications', () => {
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
      workflow: {
        repository: 'JohnChourp/optc-team-builder',
        runUrl: 'https://github.com/JohnChourp/optc-team-builder/actions/runs/123',
        sha: 'abc123',
      },
      stepOutcomes: {
        fixtureValidation: 'success',
        releaseCheck: 'success',
        activeRelease: 'success',
        dispatchRelease: 'success',
        skipRelease: 'skipped',
      },
    });
    const notification = buildReleaseTriggerNotification(report);

    expect(notification).toMatchObject({
      shouldNotify: true,
      reason: 'release-dispatched',
      severity: 'info',
    });
    expect(notification.body).toContain('Release dispatched: yes');
    expect(notification.body).toContain('New character IDs: 3');
    expect(notification.body).toContain('release-trigger-outcome');
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

  it('formats active-release blocked reports as warning notifications', () => {
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

    expect(buildReleaseTriggerNotification(report)).toMatchObject({
      shouldNotify: true,
      reason: 'active-release-running',
      severity: 'warning',
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

  it('formats release-trigger failure reasons as error notifications', () => {
    const releaseCheckResult = buildReleaseCheckResult({
      source: dataImportSources['2shankz'],
      localSourceVersion: '36',
      remoteSourceVersion: '37',
      localCharacterIds: [1, 2],
      remoteCharacters: [{ id: 1 }, { id: 2 }, { id: 3 }],
    });
    const failureCases = [
      {
        reason: 'fixture-validation-failed',
        releaseCheckResult: null,
        stepOutcomes: {
          fixtureValidation: 'failure',
          releaseCheck: 'skipped',
          activeRelease: 'skipped',
          dispatchRelease: 'skipped',
          skipRelease: 'skipped',
        },
      },
      {
        reason: 'detector-failed',
        releaseCheckResult: null,
        stepOutcomes: {
          fixtureValidation: 'success',
          releaseCheck: 'failure',
          activeRelease: 'skipped',
          dispatchRelease: 'skipped',
          skipRelease: 'skipped',
        },
      },
      {
        reason: 'active-release-check-failed',
        releaseCheckResult,
        stepOutcomes: {
          fixtureValidation: 'success',
          releaseCheck: 'success',
          activeRelease: 'failure',
          dispatchRelease: 'skipped',
          skipRelease: 'skipped',
        },
      },
      {
        reason: 'dispatch-failed',
        releaseCheckResult,
        activeReleaseCount: '0',
        stepOutcomes: {
          fixtureValidation: 'success',
          releaseCheck: 'success',
          activeRelease: 'success',
          dispatchRelease: 'failure',
          skipRelease: 'skipped',
        },
      },
    ];

    for (const failureCase of failureCases) {
      const { reason, ...reportInput } = failureCase;
      const report = buildReleaseTriggerReport({
        generatedAt: '2026-06-26T00:00:00.000Z',
        ...reportInput,
      });

      expect(report.reason).toBe(reason);
      expect(buildReleaseTriggerNotification(report)).toMatchObject({
        shouldNotify: true,
        reason,
        severity: 'error',
      });
    }
  });

  it('creates the notification issue when no thread exists', async () => {
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
    const calls = [];
    const fetchImpl = async (url, options = {}) => {
      calls.push({ url, options });

      if (calls.length === 1) {
        return buildMockGitHubResponse([]);
      }

      return buildMockGitHubResponse({
        number: 42,
        html_url: 'https://github.com/JohnChourp/optc-team-builder/issues/42',
      });
    };

    await expect(
      sendReleaseTriggerNotification({
        report,
        env: {
          GITHUB_REPOSITORY: 'JohnChourp/optc-team-builder',
          GITHUB_TOKEN: 'token',
        },
        fetchImpl,
        logger: { info: () => undefined },
      }),
    ).resolves.toMatchObject({
      sent: true,
      action: 'created',
      issueNumber: 42,
    });
    expect(calls).toHaveLength(2);
    expect(calls[0].url).toContain('/issues?state=open');
    expect(calls[1].url).toBe('https://api.github.com/repos/JohnChourp/optc-team-builder/issues');
    expect(JSON.parse(calls[1].options.body)).toMatchObject({
      title: releaseTriggerPolicy.notification.issueTitle,
    });
    expect(JSON.parse(calls[1].options.body).body).toContain(releaseTriggerPolicy.notification.issueMarker);
  });

  it('comments on the existing notification issue thread', async () => {
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
    const calls = [];
    const fetchImpl = async (url, options = {}) => {
      calls.push({ url, options });

      if (calls.length === 1) {
        return buildMockGitHubResponse([
          {
            number: 42,
            title: releaseTriggerPolicy.notification.issueTitle,
            body: releaseTriggerPolicy.notification.issueMarker,
            html_url: 'https://github.com/JohnChourp/optc-team-builder/issues/42',
          },
        ]);
      }

      return buildMockGitHubResponse({
        html_url: 'https://github.com/JohnChourp/optc-team-builder/issues/42#issuecomment-1',
      });
    };

    await expect(
      sendReleaseTriggerNotification({
        report,
        env: {
          GITHUB_REPOSITORY: 'JohnChourp/optc-team-builder',
          GITHUB_TOKEN: 'token',
        },
        fetchImpl,
        logger: { info: () => undefined },
      }),
    ).resolves.toMatchObject({
      sent: true,
      action: 'commented',
      issueNumber: 42,
    });
    expect(calls).toHaveLength(2);
    expect(calls[1].url).toBe('https://api.github.com/repos/JohnChourp/optc-team-builder/issues/42/comments');
    expect(JSON.parse(calls[1].options.body).body).toContain('fixture-validation-failed');
  });

  it('paginates notification issue lookup before creating duplicate threads', async () => {
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
    const firstPage = Array.from({ length: 100 }, (_, index) => ({
      number: index + 1,
      title: `Other issue ${index + 1}`,
      body: '',
      html_url: `https://github.com/JohnChourp/optc-team-builder/issues/${index + 1}`,
    }));
    const calls = [];
    const fetchImpl = async (url, options = {}) => {
      calls.push({ url, options });

      if (calls.length === 1) {
        return buildMockGitHubResponse(firstPage);
      }

      if (calls.length === 2) {
        return buildMockGitHubResponse([
          {
            number: 142,
            title: releaseTriggerPolicy.notification.issueTitle,
            body: releaseTriggerPolicy.notification.issueMarker,
            html_url: 'https://github.com/JohnChourp/optc-team-builder/issues/142',
          },
        ]);
      }

      return buildMockGitHubResponse({
        html_url: 'https://github.com/JohnChourp/optc-team-builder/issues/142#issuecomment-1',
      });
    };

    await expect(
      sendReleaseTriggerNotification({
        report,
        env: {
          GITHUB_REPOSITORY: 'JohnChourp/optc-team-builder',
          GITHUB_TOKEN: 'token',
        },
        fetchImpl,
        logger: { info: () => undefined },
      }),
    ).resolves.toMatchObject({
      sent: true,
      action: 'commented',
      issueNumber: 142,
    });
    expect(calls).toHaveLength(3);
    expect(calls[0].url).toContain('page=1');
    expect(calls[1].url).toContain('page=2');
    expect(calls[2].url).toBe('https://api.github.com/repos/JohnChourp/optc-team-builder/issues/142/comments');
  });

  for (const fixtureCase of RELEASE_CHECK_REPLAY_FIXTURE_CASES) {
    it(`replays the bundled ${fixtureCase.fixture} fixture: ${fixtureCase.branch}`, async () => {
      const { fixture, branch, expectedResult } = fixtureCase;

      expect(branch.length).toBeGreaterThan(0);
      await expect(checkOptcReleaseNeeded({ fixture })).resolves.toMatchObject(expectedResult);
    });
  }

  it('fails deterministically for the malformed error fixture', async () => {
    await expect(
      checkOptcReleaseNeeded({ fixture: MALFORMED_RELEASE_CHECK_FIXTURE }),
    ).rejects.toThrow();
  });
});

function buildMockGitHubResponse(payload, ok = true, status = 200) {
  const text = JSON.stringify(payload);

  return {
    ok,
    status,
    text: async () => text,
  };
}

function normalizePath(value: unknown) {
  return String(value).replace(/\\/g, '/');
}
