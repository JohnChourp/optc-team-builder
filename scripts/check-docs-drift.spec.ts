import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  checkDocsDrift,
  extractDocsDriftAcknowledgement,
  formatDocsDriftResult,
  isSubstantiveAcknowledgement,
} from './check-docs-drift.mjs';

let tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.map((dir) => rm(dir, { recursive: true, force: true })));
  tempDirs = [];
});

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

    const result = await checkDocsDrift({
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

    const result = await checkDocsDrift({
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

    const result = await checkDocsDrift({
      appRoot,
      brainRoot,
      map: baseMap(),
      changedFiles: ['src/app/pages/manual-team-builder/manual-team-builder.page.ts'],
      brainChangedFiles: ['../optc-team-builder-brain/audits/task.md'],
    });

    expect(result.ok).toBe(true);
    expect(result.findings).toEqual([]);
  });

  it('accepts a substantive PR-body acknowledgement for intentional no-doc changes', async () => {
    const { appRoot, brainRoot } = await makeWorkspace();

    const result = await checkDocsDrift({
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

  it('rejects missing mapped docs paths before evaluating drift', async () => {
    const { appRoot, brainRoot } = await makeWorkspace();
    const map = baseMap();
    map.entries[0].docsPaths = ['docs/missing.md'];

    const result = await checkDocsDrift({
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
