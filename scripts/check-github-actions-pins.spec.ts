import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  collectWorkflowUses,
  formatGitHubActionPinResult,
  inspectGitHubActionPins,
} from './check-github-actions-pins.mjs';

let tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.map((dir) => rm(dir, { recursive: true, force: true })));
  tempDirs = [];
});

async function makeWorkspace(files: Record<string, string>) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'optc-action-pins-'));
  tempDirs.push(root);

  for (const [relativePath, content] of Object.entries(files)) {
    const absolutePath = path.join(root, relativePath);
    await mkdir(path.dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, content);
  }

  return root;
}

describe('check-github-actions-pins', () => {
  it('collects uses entries with source comments', () => {
    expect(
      collectWorkflowUses({
        workflowPath: '.github/workflows/test.yml',
        text: [
          'steps:',
          '  - uses: actions/checkout@9c091bb21b7c1c1d1991bb908d89e4e9dddfe3e0 # v7',
          '  - uses: "./.github/actions/local"',
        ].join('\n'),
      }),
    ).toEqual([
      {
        comment: 'v7',
        line: 2,
        value: 'actions/checkout@9c091bb21b7c1c1d1991bb908d89e4e9dddfe3e0',
        workflowPath: '.github/workflows/test.yml',
      },
      {
        comment: '',
        line: 3,
        value: './.github/actions/local',
        workflowPath: '.github/workflows/test.yml',
      },
    ]);
  });

  it('passes when strict workflow external refs are full SHAs and local refs are present', async () => {
    const root = await makeWorkspace({
      '.github/workflows/release-android.yml': [
        'steps:',
        '  - uses: actions/checkout@9c091bb21b7c1c1d1991bb908d89e4e9dddfe3e0 # v7',
        '  - uses: ./.github/actions/release-helper',
      ].join('\n'),
      '.github/workflows/codeql.yml': 'steps:\n  - uses: actions/checkout@v7\n',
    });

    const result = inspectGitHubActionPins({
      root,
      strictWorkflows: ['.github/workflows/release-android.yml'],
    });

    expect(result.ok).toBe(true);
    expect(result.findings).toEqual([]);
    expect(formatGitHubActionPinResult(result)).toContain('Status: passed');
  });

  it('fails when a strict workflow uses a mutable tag', async () => {
    const root = await makeWorkspace({
      '.github/workflows/test.yml': 'steps:\n  - uses: actions/setup-node@v6\n',
    });

    const result = inspectGitHubActionPins({
      root,
      strictWorkflows: ['.github/workflows/test.yml'],
    });

    expect(result.ok).toBe(false);
    expect(result.findings).toEqual([
      expect.objectContaining({
        line: 2,
        value: 'actions/setup-node@v6',
      }),
    ]);
    expect(formatGitHubActionPinResult(result)).toContain('.github/workflows/test.yml:2');
  });

  it('fails when a strict workflow external action has no ref', async () => {
    const root = await makeWorkspace({
      '.github/workflows/deploy-pages.yml': 'steps:\n  - uses: actions/deploy-pages\n',
    });

    const result = inspectGitHubActionPins({
      root,
      strictWorkflows: ['.github/workflows/deploy-pages.yml'],
    });

    expect(result.ok).toBe(false);
    expect(result.findings[0]).toEqual(
      expect.objectContaining({
        message: 'External action reference is missing an explicit ref.',
        value: 'actions/deploy-pages',
      }),
    );
  });

  it('reports missing strict workflows', async () => {
    const root = await makeWorkspace({});

    const result = inspectGitHubActionPins({
      root,
      strictWorkflows: ['.github/workflows/check-optc-db-release.yml'],
    });

    expect(result.ok).toBe(false);
    expect(result.errors).toEqual([
      {
        message: 'Strict workflow is missing.',
        workflowPath: '.github/workflows/check-optc-db-release.yml',
      },
    ]);
  });
});
