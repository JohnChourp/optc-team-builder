import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  checkDocsDrift,
  extractDocsDriftAcknowledgement,
  formatDocsDriftResult,
  getChangedFiles,
  isSubstantiveAcknowledgement,
} from './check-docs-drift.mjs';

let tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.map((dir) => rm(dir, { recursive: true, force: true })));
  tempDirs = [];
});

function checkDocsDriftForTest(options: Record<string, unknown>) {
  return checkDocsDrift({
    eventPath: '',
    githubRepository: '',
    githubSha: '',
    githubToken: '',
    ...options,
  });
}

async function makeWorkspace(files: Record<string, string> = {}) {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), 'optc-docs-drift-'));
  tempDirs.push(rootDir);
  const appRoot = path.join(rootDir, 'optc-team-builder');
  const brainRoot = path.join(rootDir, 'optc-team-builder-brain');

  const defaults: Record<string, string> = {
    'optc-team-builder/src/app/pages/manual-team-builder/manual-team-builder.page.ts': 'export class Manual {}\n',
    'optc-team-builder/src/app/pages/saved-teams/saved-teams.page.ts': 'export class SavedTeams {}\n',
    'optc-team-builder/docs/maintainer-validation-guide.md': '# Guide\n',
    'optc-team-builder/docs/feature-coverage-map.md': '# Feature Map\n',
    'optc-team-builder/docs/saved-team-schema-lifecycle.md': '# Saved Teams\n',
    'optc-team-builder-brain/audits/task.md': '# Brain Audit\n',
  };

  for (const [relativePath, content] of Object.entries({ ...defaults, ...files })) {
    const absolutePath = path.join(rootDir, relativePath);
    await mkdir(path.dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, content);
  }

  return { appRoot, brainRoot };
}

function baseMap() {
  return {
    schemaVersion: 1,
    entries: [
      {
        id: 'manual-builder',
        name: 'Manual builder',
        featurePaths: ['src/app/pages/manual-team-builder/'],
        docsPaths: ['docs/maintainer-validation-guide.md', '../optc-team-builder-brain/audits/task.md'],
        owner: 'Manual builder owner',
        notes: 'Manual-builder behavior needs validation guidance.',
      },
      {
        id: 'saved-teams',
        name: 'Saved teams',
        featurePaths: ['src/app/pages/saved-teams/'],
        docsPaths: ['docs/saved-team-schema-lifecycle.md'],
        owner: 'Saved teams owner',
        notes: 'Saved-team behavior needs schema guidance.',
      },
    ],
  };
}

describe('check-docs-drift', () => {
  it('flags mapped feature changes without mapped docs changes', async () => {
    const { appRoot, brainRoot } = await makeWorkspace();

    const result = await checkDocsDriftForTest({
      appRoot,
      brainRoot,
      map: baseMap(),
      changedFiles: ['src/app/pages/manual-team-builder/manual-team-builder.page.ts'],
      brainChangedFiles: [],
    });

    expect(result.ok).toBe(false);
    expect(result.findings).toEqual([
      expect.objectContaining({
        id: 'manual-builder',
        changedFeatureFiles: ['src/app/pages/manual-team-builder/manual-team-builder.page.ts'],
      }),
    ]);
    expect(formatDocsDriftResult(result)).toContain('update one of: docs/maintainer-validation-guide.md');
  });

  it('passes when a mapped app docs path changes with the feature path', async () => {
    const { appRoot, brainRoot } = await makeWorkspace();

    const result = await checkDocsDriftForTest({
      appRoot,
      brainRoot,
      map: baseMap(),
      changedFiles: [
        'src/app/pages/manual-team-builder/manual-team-builder.page.ts',
        'docs/maintainer-validation-guide.md',
      ],
      brainChangedFiles: [],
    });

    expect(result.ok).toBe(true);
    expect(result.findings).toEqual([]);
  });

  it('passes when a mapped brain docs path changes with the feature path', async () => {
    const { appRoot, brainRoot } = await makeWorkspace();

    const result = await checkDocsDriftForTest({
      appRoot,
      brainRoot,
      map: baseMap(),
      changedFiles: ['src/app/pages/manual-team-builder/manual-team-builder.page.ts'],
      brainChangedFiles: ['../optc-team-builder-brain/audits/task.md'],
    });

    expect(result.ok).toBe(true);
    expect(result.findings).toEqual([]);
  });

  it('does not require brain docs files to exist in app-only mode', async () => {
    const { appRoot, brainRoot } = await makeWorkspace();
    await rm(brainRoot, { recursive: true, force: true });

    const result = await checkDocsDriftForTest({
      appRoot,
      brainRoot,
      appOnly: true,
      map: baseMap(),
      changedFiles: [
        'src/app/pages/manual-team-builder/manual-team-builder.page.ts',
        'docs/maintainer-validation-guide.md',
      ],
      brainChangedFiles: [],
    });

    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('matches extensionless filename prefixes without shadowing more specific prefixes', async () => {
    const { appRoot, brainRoot } = await makeWorkspace({
      'optc-team-builder/src/app/core/services/auto-team-builder/.keep': '',
      'optc-team-builder/src/app/core/services/auto-team-builder.engine.ts': 'export const auto = true;\n',
      'optc-team-builder/src/app/core/services/auto-team-builder-rumble/.keep': '',
      'optc-team-builder/src/app/core/services/auto-team-builder-rumble.engine.ts': 'export const rumble = true;\n',
    });

    const map = {
      schemaVersion: 1,
      entries: [
        {
          id: 'auto-team-builder',
          name: 'Auto Team Builder',
          featurePaths: ['src/app/core/services/auto-team-builder'],
          docsPaths: ['docs/feature-coverage-map.md'],
          owner: 'Auto owner',
          notes: 'Auto builder service prefixes need docs coverage.',
        },
        {
          id: 'pirate-rumble',
          name: 'Pirate Rumble',
          featurePaths: ['src/app/core/services/auto-team-builder-rumble'],
          docsPaths: ['docs/maintainer-validation-guide.md'],
          owner: 'Rumble owner',
          notes: 'Rumble service prefixes need docs coverage.',
        },
      ],
    };

    const autoResult = await checkDocsDriftForTest({
      appRoot,
      brainRoot,
      map,
      changedFiles: ['src/app/core/services/auto-team-builder.engine.ts'],
      brainChangedFiles: [],
    });
    const rumbleResult = await checkDocsDriftForTest({
      appRoot,
      brainRoot,
      map,
      changedFiles: ['src/app/core/services/auto-team-builder-rumble.engine.ts'],
      brainChangedFiles: [],
    });

    expect(autoResult.findings.map((finding) => finding.id)).toEqual(['auto-team-builder']);
    expect(rumbleResult.findings.map((finding) => finding.id)).toEqual(['pirate-rumble']);
  });

  it('includes both paths from rename diff records before checking drift', async () => {
    const { appRoot, brainRoot } = await makeWorkspace();
    const diff = getChangedFiles({
      baseRef: 'base',
      headRef: 'head',
      cwd: appRoot,
      execFile: () =>
        [
          'R100\tsrc/app/pages/manual-team-builder/manual-team-builder.page.ts\tsrc/app/pages/manual-builder/manual-team-builder.page.ts',
          '',
        ].join('\n'),
    });

    const result = await checkDocsDriftForTest({
      appRoot,
      brainRoot,
      map: baseMap(),
      changedFiles: diff.changedFiles,
      brainChangedFiles: [],
    });

    expect(diff.changedFiles).toEqual([
      'src/app/pages/manual-builder/manual-team-builder.page.ts',
      'src/app/pages/manual-team-builder/manual-team-builder.page.ts',
    ]);
    expect(result.findings.map((finding) => finding.id)).toEqual(['manual-builder']);
  });

  it('accepts a substantive PR-body acknowledgement for intentional no-doc changes', async () => {
    const { appRoot, brainRoot } = await makeWorkspace();

    const result = await checkDocsDriftForTest({
      appRoot,
      brainRoot,
      map: baseMap(),
      changedFiles: ['src/app/pages/manual-team-builder/manual-team-builder.page.ts'],
      brainChangedFiles: [],
      prBody: ['## Summary', '', 'Docs drift acknowledgement: internal refactor only; user behavior and maintainer docs are unchanged.'].join(
        '\n',
      ),
    });

    expect(result.ok).toBe(true);
    expect(result.findings).toHaveLength(1);
    expect(result.hasAcknowledgement).toBe(true);
  });

  it('accepts a substantive push commit acknowledgement when PR body is unavailable', async () => {
    const { appRoot, brainRoot } = await makeWorkspace();
    const eventPath = path.join(appRoot, '..', 'push-event.json');
    await writeFile(
      eventPath,
      JSON.stringify({
        head_commit: {
          message: [
            'Fix manual builder internals (#123)',
            '',
            'Docs drift acknowledgement: paired brain PR records the mapped maintainer evidence update.',
          ].join('\n'),
        },
      }),
    );

    const result = await checkDocsDriftForTest({
      appRoot,
      brainRoot,
      map: baseMap(),
      changedFiles: ['src/app/pages/manual-team-builder/manual-team-builder.page.ts'],
      brainChangedFiles: [],
      eventPath,
    });

    expect(result.ok).toBe(true);
    expect(result.findings).toHaveLength(1);
    expect(result.hasAcknowledgement).toBe(true);
  });

  it('ignores acknowledgements from non-head commits in a batched push event', async () => {
    const { appRoot, brainRoot } = await makeWorkspace();
    const eventPath = path.join(appRoot, '..', 'batched-push-event.json');
    await writeFile(
      eventPath,
      JSON.stringify({
        head_commit: {
          message: 'Fix manual builder internals without docs',
        },
        commits: [
          {
            message: 'Docs drift acknowledgement: unrelated commit in the same push batch.',
          },
        ],
      }),
    );

    const result = await checkDocsDriftForTest({
      appRoot,
      brainRoot,
      map: baseMap(),
      changedFiles: ['src/app/pages/manual-team-builder/manual-team-builder.page.ts'],
      brainChangedFiles: [],
      eventPath,
    });

    expect(result.ok).toBe(false);
    expect(result.findings).toHaveLength(1);
    expect(result.hasAcknowledgement).toBe(false);
  });

  it('recovers acknowledgements from the pull request associated with a push commit', async () => {
    const { appRoot, brainRoot } = await makeWorkspace();
    const fetchCalls: Array<{ url: string; headers: Record<string, string> }> = [];

    const result = await checkDocsDriftForTest({
      appRoot,
      brainRoot,
      map: baseMap(),
      changedFiles: ['src/app/pages/manual-team-builder/manual-team-builder.page.ts'],
      brainChangedFiles: [],
      githubRepository: 'JohnChourp/optc-team-builder',
      githubSha: 'abc123',
      githubToken: 'test-token',
      fetchImpl: async (url: string, init: { headers: Record<string, string> }) => {
        fetchCalls.push({ url, headers: init.headers });
        return {
          ok: true,
          json: async () => [
            {
              body: 'Docs drift acknowledgement: PR body confirms this is a no-doc internal refactor.',
            },
          ],
        };
      },
    });

    expect(result.ok).toBe(true);
    expect(result.findings).toHaveLength(1);
    expect(result.hasAcknowledgement).toBe(true);
    expect(fetchCalls).toEqual([
      {
        url: 'https://api.github.com/repos/JohnChourp/optc-team-builder/commits/abc123/pulls',
        headers: expect.objectContaining({
          Accept: 'application/vnd.github+json',
          Authorization: 'Bearer test-token',
        }),
      },
    ]);
  });

  it('rejects missing mapped docs paths before evaluating drift', async () => {
    const { appRoot, brainRoot } = await makeWorkspace();
    const map = baseMap();
    map.entries[0].docsPaths = ['docs/missing.md'];

    const result = await checkDocsDriftForTest({
      appRoot,
      brainRoot,
      map,
      changedFiles: ['src/app/pages/manual-team-builder/manual-team-builder.page.ts'],
      brainChangedFiles: [],
    });

    expect(result.ok).toBe(false);
    expect(result.errors).toEqual(expect.arrayContaining([expect.stringContaining('does not exist: docs/missing.md')]));
    expect(result.findings).toEqual([]);
  });

  it('extracts and validates PR-body acknowledgements', () => {
    expect(
      extractDocsDriftAcknowledgement(
        [
          '## Summary',
          '',
          'Docs drift acknowledgement: internal rename only.',
          'No visible workflow or maintainer command changed.',
          'Evidence: audit',
        ].join('\n'),
      ),
    ).toBe('internal rename only.\nNo visible workflow or maintainer command changed.');
    expect(isSubstantiveAcknowledgement('todo')).toBe(false);
    expect(isSubstantiveAcknowledgement('none - fill this in only when docs do not need to change')).toBe(false);
    expect(isSubstantiveAcknowledgement('internal rename only')).toBe(true);
  });
});
