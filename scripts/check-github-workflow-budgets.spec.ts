import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  formatWorkflowBudgetResult,
  inspectWorkflowBudgets,
} from './check-github-workflow-budgets.mjs';

let tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.map((dir) => rm(dir, { recursive: true, force: true })));
  tempDirs = [];
});

async function makeRoot(files: Record<string, string>) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'optc-workflow-budgets-'));
  tempDirs.push(root);

  for (const [relativePath, content] of Object.entries(files)) {
    const absolutePath = path.join(root, relativePath);
    await mkdir(path.dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, content);
  }

  return root;
}

function budgetStep(timeoutMinutes: number) {
  return [
    '      - name: Summarize workflow budget',
    '        run: |',
    '          {',
    '            echo "### Workflow budget"',
    `            echo "- Timeout budget: ${timeoutMinutes} minutes"`,
    '            echo "- Concurrency policy: PR freshness runs cancel stale PR attempts; release/evidence runs preserve history."',
    '          } >> "${GITHUB_STEP_SUMMARY}"',
  ].join('\n');
}

function appWorkflow({
  timeoutMinutes = 25,
  cancelInProgress = "${{ github.event_name == 'pull_request' }}",
  includeSummary = true,
} = {}) {
  return [
    'name: Docs Integrity',
    'on:',
    '  pull_request:',
    '  push:',
    '    branches:',
    '      - main',
    'permissions:',
    '  contents: read',
    'concurrency:',
    '  group: ${{ github.workflow }}-${{ github.event.pull_request.number || github.run_id }}',
    `  cancel-in-progress: ${cancelInProgress}`,
    'jobs:',
    '  docs-integrity:',
    '    runs-on: ubuntu-latest',
    `    timeout-minutes: ${timeoutMinutes}`,
    '    steps:',
    ...(includeSummary ? [budgetStep(timeoutMinutes)] : ['      - name: Checkout', '        run: echo checkout']),
  ].join('\n');
}

/**
 * 869f1ujj9. A workflow whose only interesting feature is how it asks for the Android SDK.
 *
 * It is deliberately EXEMPT from the budget contract in every test below, because that is the case
 * worth pinning: an exemption from the concurrency and timeout contract was never a decision to
 * let a job download 300MB it does not use.
 */
function androidWorkflow(withBlock: string[] = []) {
  return [
    'name: Android',
    'on:',
    '  workflow_dispatch:',
    'jobs:',
    '  release:',
    '    runs-on: ubuntu-latest',
    '    steps:',
    '      - name: Setup Android SDK',
    '        uses: android-actions/setup-android@40fd30fb8d7440372e1316f5d1809ec01dcd3699 # v4',
    ...withBlock,
    '',
  ].join('\n');
}

function androidResult(appRoot: string) {
  return inspectWorkflowBudgets({
    appRoot,
    appOnly: true,
    appContracts: [],
    appWorkflowExemptions: ['.github/workflows/android.yml'],
  });
}


describe('check-github-workflow-budgets', () => {
  it('reports missing workflows from the default app contract', async () => {
    const appRoot = await makeRoot({
      '.github/workflows/docs-integrity.yml': `${appWorkflow()}\n`,
    });

    const result = inspectWorkflowBudgets({
      appRoot,
      appOnly: true,
    });

    expect(result.ok).toBe(false);
    expect(result.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          workflowPath: '.github/workflows/test.yml',
          message: 'Workflow is missing: .github/workflows/test.yml',
        }),
      ]),
    );
  });

  it('passes when scoped to a matching custom app contract', async () => {
    const appRoot = await makeRoot({
      '.github/workflows/docs-integrity.yml': `${appWorkflow()}\n`,
    });

    const result = inspectWorkflowBudgets({
      appRoot,
      appOnly: true,
      appContracts: [
        {
          workflowPath: '.github/workflows/docs-integrity.yml',
          concurrency: {
            group: '${{ github.workflow }}-${{ github.event.pull_request.number || github.run_id }}',
            cancelInProgress: "${{ github.event_name == 'pull_request' }}",
          },
          jobs: {
            'docs-integrity': { timeoutMinutes: 25 },
          },
        },
      ],
    });

    expect(result.ok).toBe(true);
    expect(formatWorkflowBudgetResult(result)).toContain('Status: passed');
  });

  it('fails when a budgeted job timeout drifts', async () => {
    const appRoot = await makeRoot({
      '.github/workflows/docs-integrity.yml': `${appWorkflow({ timeoutMinutes: 30 })}\n`,
    });

    const result = inspectWorkflowBudgets({
      appRoot,
      appOnly: true,
      appContracts: [
        {
          workflowPath: '.github/workflows/docs-integrity.yml',
          concurrency: {
            group: '${{ github.workflow }}-${{ github.event.pull_request.number || github.run_id }}',
            cancelInProgress: "${{ github.event_name == 'pull_request' }}",
          },
          jobs: {
            'docs-integrity': { timeoutMinutes: 25 },
          },
        },
      ],
    });

    expect(result.ok).toBe(false);
    expect(result.findings).toEqual([
      expect.objectContaining({
        scope: 'jobs.docs-integrity',
        message: 'timeout-minutes is 30; expected 25.',
      }),
      expect.objectContaining({
        scope: 'jobs.docs-integrity',
        message: expect.stringContaining('Missing workflow-budget summary step'),
      }),
    ]);
  });

  it('fails when a covered workflow adds an unbudgeted job', async () => {
    const appRoot = await makeRoot({
      '.github/workflows/docs-integrity.yml': [
        appWorkflow(),
        '  unbudgeted:',
        '    runs-on: ubuntu-latest',
        '    steps:',
        '      - run: echo bypass',
      ].join('\n'),
    });

    const result = inspectWorkflowBudgets({
      appRoot,
      appOnly: true,
      appContracts: [
        {
          workflowPath: '.github/workflows/docs-integrity.yml',
          concurrency: {
            group: '${{ github.workflow }}-${{ github.event.pull_request.number || github.run_id }}',
            cancelInProgress: "${{ github.event_name == 'pull_request' }}",
          },
          jobs: {
            'docs-integrity': { timeoutMinutes: 25 },
          },
        },
      ],
    });

    expect(result.ok).toBe(false);
    expect(result.findings).toEqual([
      expect.objectContaining({
        scope: 'jobs.unbudgeted',
        message: 'Job is not covered by the workflow-budget contract.',
      }),
    ]);
  });

  it('fails when a workflow file is not contracted or explicitly exempted', async () => {
    const appRoot = await makeRoot({
      '.github/workflows/docs-integrity.yml': `${appWorkflow()}\n`,
      '.github/workflows/new-heavy.yml': [
        'name: New Heavy Workflow',
        'on:',
        '  pull_request:',
        'jobs:',
        '  verify:',
        '    runs-on: ubuntu-latest',
        '    steps:',
        '      - run: echo bypass',
      ].join('\n'),
    });

    const result = inspectWorkflowBudgets({
      appRoot,
      appOnly: true,
      appContracts: [
        {
          workflowPath: '.github/workflows/docs-integrity.yml',
          concurrency: {
            group: '${{ github.workflow }}-${{ github.event.pull_request.number || github.run_id }}',
            cancelInProgress: "${{ github.event_name == 'pull_request' }}",
          },
          jobs: {
            'docs-integrity': { timeoutMinutes: 25 },
          },
        },
      ],
    });

    expect(result.ok).toBe(false);
    expect(result.findings).toEqual([
      expect.objectContaining({
        workflowPath: '.github/workflows/new-heavy.yml',
        message: expect.stringContaining('Workflow is not covered by the budget contract'),
      }),
    ]);
  });

  it('fails when release-safe cancellation policy is loosened', async () => {
    const appRoot = await makeRoot({
      '.github/workflows/performance-budgets.yml': [
        'name: Performance Budgets',
        'on:',
        '  workflow_dispatch:',
        'concurrency:',
        '  group: performance-budgets',
        '  cancel-in-progress: true',
        'jobs:',
        '  performance-budgets:',
        '    runs-on: ubuntu-latest',
        '    timeout-minutes: 30',
        '    steps:',
        budgetStep(30),
      ].join('\n'),
    });

    const result = inspectWorkflowBudgets({
      appRoot,
      appOnly: true,
      appContracts: [
        {
          workflowPath: '.github/workflows/performance-budgets.yml',
          concurrency: {
            group: 'performance-budgets',
            cancelInProgress: false,
          },
          jobs: {
            'performance-budgets': { timeoutMinutes: 30 },
          },
        },
      ],
    });

    expect(result.ok).toBe(false);
    expect(result.findings).toEqual([
      expect.objectContaining({
        scope: 'workflow',
        message: 'cancel-in-progress is true; expected false.',
      }),
    ]);
  });

  it('fails when summary logging is missing from a budgeted job', async () => {
    const appRoot = await makeRoot({
      '.github/workflows/docs-integrity.yml': `${appWorkflow({ includeSummary: false })}\n`,
    });

    const result = inspectWorkflowBudgets({
      appRoot,
      appOnly: true,
      appContracts: [
        {
          workflowPath: '.github/workflows/docs-integrity.yml',
          concurrency: {
            group: '${{ github.workflow }}-${{ github.event.pull_request.number || github.run_id }}',
            cancelInProgress: "${{ github.event_name == 'pull_request' }}",
          },
          jobs: {
            'docs-integrity': { timeoutMinutes: 25 },
          },
        },
      ],
    });

    expect(result.ok).toBe(false);
    expect(result.findings).toEqual([
      expect.objectContaining({
        message: expect.stringContaining('Missing workflow-budget summary step'),
      }),
    ]);
  });

  it('accepts a setup-android step that asks only for platform-tools', async () => {
    const appRoot = await makeRoot({
      '.github/workflows/android.yml': androidWorkflow([
        '        with:',
        "          packages: 'platform-tools'",
      ]),
    });

    const result = androidResult(appRoot);

    expect(result.findings).toEqual([]);
    expect(result.ok).toBe(true);
  });

  /*
   * The regression this guard exists to stop: somebody removes the input and the action's own
   * default - `tools platform-tools` - quietly brings the emulator back. Nothing in a green run
   * would say so; the release just downloads 300MB it never uses, until the day that download is
   * corrupt and takes the release with it, which is how this was found.
   */
  it('MUTATION - rejects a setup-android step that states no packages at all', async () => {
    const appRoot = await makeRoot({ '.github/workflows/android.yml': androidWorkflow() });

    const result = androidResult(appRoot);

    expect(result.ok).toBe(false);
    expect(result.findings[0].scope).toBe('jobs.release.steps[0]');
    expect(result.findings[0].message).toContain('does not state its packages');
  });

  it.each([
    ["'tools platform-tools'", 'the action default'],
    ["'tools'", 'the obsolete package alone'],
  ])('MUTATION - rejects packages %s, %s', async (packages) => {
    const appRoot = await makeRoot({
      '.github/workflows/android.yml': androidWorkflow([
        '        with:',
        `          packages: ${packages}`,
      ]),
    });

    const result = androidResult(appRoot);

    expect(result.ok).toBe(false);
    expect(result.findings[0].message).toContain('obsolete package(s) tools');
  });

  /*
   * `platform-tools` ends in `tools`. A substring test would reject the package we mean to KEEP -
   * the one way this guard could be wrong while still looking like it works, because it would go
   * red on correct input and the obvious fix would be to delete the rule.
   */
  it('MUTATION - matches whole tokens, so platform-tools is not read as tools', async () => {
    const appRoot = await makeRoot({
      '.github/workflows/android.yml': androidWorkflow([
        '        with:',
        "          packages: 'platform-tools build-tools;36.0.0'",
      ]),
    });

    expect(androidResult(appRoot).ok).toBe(true);
  });

  it('ignores a workflow with no setup-android step', async () => {
    const appRoot = await makeRoot({
      '.github/workflows/android.yml': [
        'name: Android',
        'on:',
        '  workflow_dispatch:',
        'jobs:',
        '  release:',
        '    runs-on: ubuntu-latest',
        '    steps:',
        '      - name: Checkout',
        '        run: echo checkout',
        '',
      ].join('\n'),
    });

    expect(androidResult(appRoot).ok).toBe(true);
  });
});
