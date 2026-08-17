import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  APP_CI_TRIGGER_ALLOWLIST,
  BRAIN_CI_TRIGGER_ALLOWLIST,
  formatCiTriggerResult,
  inspectCiTriggers,
  readTriggerEvents,
} from './check-github-ci-triggers.mjs';

let tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.map((dir) => rm(dir, { recursive: true, force: true })));
  tempDirs = [];
});

async function makeRoot(files: Record<string, string>) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'optc-ci-triggers-'));
  tempDirs.push(root);

  for (const [relativePath, content] of Object.entries(files)) {
    const absolutePath = path.join(root, relativePath);
    await mkdir(path.dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, content);
  }

  return root;
}

function workflow(onBlock: string[]) {
  return ['name: Example', 'on:', ...onBlock, 'jobs:', '  build:', '    runs-on: ubuntu-latest', ''].join('\n');
}

describe('check-github-ci-triggers', () => {
  it('accepts manual and scheduled workflows', async () => {
    const appRoot = await makeRoot({
      '.github/workflows/manual.yml': workflow(['  workflow_dispatch:']),
      '.github/workflows/nightly.yml': workflow(['  schedule:', "    - cron: '0 3 * * *'"]),
    });

    const result = inspectCiTriggers({ appRoot, appAllowlist: [] });

    expect(result.findings).toEqual([]);
    expect(result.ok).toBe(true);
    expect(result.checkedWorkflows).toHaveLength(2);
  });

  it('rejects a pull_request trigger that is not allowlisted', async () => {
    const appRoot = await makeRoot({
      '.github/workflows/test.yml': workflow(['  pull_request:']),
    });

    const result = inspectCiTriggers({ appRoot, appAllowlist: [] });

    expect(result.ok).toBe(false);
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]).toMatchObject({
      repo: 'app',
      workflowPath: '.github/workflows/test.yml',
      event: 'pull_request',
    });
  });

  it('rejects a push trigger that is not allowlisted', async () => {
    const appRoot = await makeRoot({
      '.github/workflows/test.yml': workflow(['  push:', '    branches:', '      - main']),
    });

    const result = inspectCiTriggers({ appRoot, appAllowlist: [] });

    expect(result.ok).toBe(false);
    expect(result.findings.map((finding) => finding.event)).toEqual(['push']);
  });

  it('rejects pull_request_target and other automatic events by default', async () => {
    const appRoot = await makeRoot({
      '.github/workflows/target.yml': workflow(['  pull_request_target:', '    types:', '      - opened']),
      '.github/workflows/chained.yml': workflow([
        '  workflow_run:',
        '    workflows:',
        '      - Test',
        '    types:',
        '      - completed',
      ]),
    });

    const result = inspectCiTriggers({ appRoot, appAllowlist: [] });

    expect(result.ok).toBe(false);
    expect(result.findings.map((finding) => finding.event).sort()).toEqual(['pull_request_target', 'workflow_run']);
  });

  it('accepts an allowlisted event only for the allowlisted workflow', async () => {
    const appRoot = await makeRoot({
      '.github/workflows/deploy-pages.yml': workflow(['  push:', '    branches:', '      - main']),
      '.github/workflows/test.yml': workflow(['  push:', '    branches:', '      - main']),
    });

    const result = inspectCiTriggers({
      appRoot,
      appAllowlist: [
        {
          workflowPath: '.github/workflows/deploy-pages.yml',
          events: { push: 'Production deploy.' },
        },
      ],
    });

    expect(result.ok).toBe(false);
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0].workflowPath).toBe('.github/workflows/test.yml');
  });

  it('reports an allowlist entry whose workflow no longer exists', async () => {
    const appRoot = await makeRoot({
      '.github/workflows/manual.yml': workflow(['  workflow_dispatch:']),
    });

    const result = inspectCiTriggers({
      appRoot,
      appAllowlist: [
        {
          workflowPath: '.github/workflows/deleted.yml',
          events: { push: 'Gone.' },
        },
      ],
    });

    expect(result.ok).toBe(false);
    expect(result.findings[0]).toMatchObject({
      repo: 'app',
      workflowPath: '.github/workflows/deleted.yml',
      message: expect.stringContaining('no longer exists'),
    });
  });

  it('reports a workflow with no triggers', async () => {
    const appRoot = await makeRoot({
      '.github/workflows/broken.yml': ['name: Broken', 'jobs:', '  build:', '    runs-on: ubuntu-latest', ''].join(
        '\n',
      ),
    });

    const result = inspectCiTriggers({ appRoot, appAllowlist: [] });

    expect(result.ok).toBe(false);
    expect(result.findings[0].message).toContain('declares no triggers');
  });

  it('reports a workflow that cannot be parsed', async () => {
    const appRoot = await makeRoot({
      '.github/workflows/broken.yml': 'name: [unterminated\n',
    });

    const result = inspectCiTriggers({ appRoot, appAllowlist: [] });

    expect(result.ok).toBe(false);
    expect(result.findings[0].message).toContain('could not be parsed');
  });

  it('checks the brain repo when a brain root is given', async () => {
    const appRoot = await makeRoot({
      '.github/workflows/manual.yml': workflow(['  workflow_dispatch:']),
    });
    const brainRoot = await makeRoot({
      '.github/workflows/docs-integrity.yml': workflow(['  pull_request:']),
    });

    const result = inspectCiTriggers({ appRoot, brainRoot, appAllowlist: [], brainAllowlist: [] });

    expect(result.ok).toBe(false);
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]).toMatchObject({
      repo: 'brain',
      workflowPath: '.github/workflows/docs-integrity.yml',
      event: 'pull_request',
    });
    expect(result.checkedWorkflows.map((entry) => entry.repo)).toEqual(['app', 'brain']);
  });

  it('skips the brain repo when appOnly is set', async () => {
    const appRoot = await makeRoot({
      '.github/workflows/manual.yml': workflow(['  workflow_dispatch:']),
    });
    const brainRoot = await makeRoot({
      '.github/workflows/docs-integrity.yml': workflow(['  pull_request:']),
    });

    const result = inspectCiTriggers({
      appRoot,
      brainRoot,
      appOnly: true,
      appAllowlist: [],
      brainAllowlist: [],
    });

    expect(result.ok).toBe(true);
    expect(result.checkedWorkflows.map((entry) => entry.repo)).toEqual(['app']);
  });

  it('reads triggers from string, array, and mapping forms', () => {
    expect(readTriggerEvents({ on: 'workflow_dispatch' })).toEqual(['workflow_dispatch']);
    expect(readTriggerEvents({ on: ['push', 'pull_request'] })).toEqual(['push', 'pull_request']);
    expect(readTriggerEvents({ on: { schedule: [{ cron: '0 3 * * *' }] } })).toEqual(['schedule']);
    expect(readTriggerEvents({ true: { workflow_dispatch: null } })).toEqual(['workflow_dispatch']);
    expect(readTriggerEvents({})).toEqual([]);
  });

  it('formats passing and failing results', () => {
    expect(formatCiTriggerResult({ ok: true, findings: [], checkedWorkflows: [{}] })).toContain('Status: passed');
    expect(
      formatCiTriggerResult({
        ok: false,
        findings: [
          { repo: 'app', workflowPath: '.github/workflows/test.yml', event: 'pull_request', message: 'nope' },
        ],
        checkedWorkflows: [],
      }),
    ).toContain('app:.github/workflows/test.yml:pull_request - nope');
  });

  it('keeps the shipped app allowlist limited to the production deploy workflow', () => {
    expect(APP_CI_TRIGGER_ALLOWLIST.map((entry) => entry.workflowPath)).toEqual([
      '.github/workflows/deploy-pages.yml',
    ]);
  });

  it('keeps the shipped brain allowlist empty', () => {
    expect(BRAIN_CI_TRIGGER_ALLOWLIST).toEqual([]);
  });

  it('allowlists no pull-request event in either repo', () => {
    const pullRequestEvents = [...APP_CI_TRIGGER_ALLOWLIST, ...BRAIN_CI_TRIGGER_ALLOWLIST]
      .flatMap((entry) => Object.keys(entry.events))
      .filter((event) => event.startsWith('pull_request'));

    expect(pullRequestEvents).toEqual([]);
  });

  it('passes for the real repository workflows', () => {
    const result = inspectCiTriggers({ appRoot: path.resolve(import.meta.dirname, '..') });

    expect(formatCiTriggerResult(result)).toContain('Status: passed');
    expect(result.ok).toBe(true);
  });
});
