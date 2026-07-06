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
    '  group: ${{ github.workflow }}-${{ github.event.pull_request.number || github.ref }}',
    `  cancel-in-progress: ${cancelInProgress}`,
    'jobs:',
    '  docs-integrity:',
    '    runs-on: ubuntu-latest',
    `    timeout-minutes: ${timeoutMinutes}`,
    '    steps:',
    ...(includeSummary ? [budgetStep(timeoutMinutes)] : ['      - name: Checkout', '        run: echo checkout']),
  ].join('\n');
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
            group: '${{ github.workflow }}-${{ github.event.pull_request.number || github.ref }}',
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
            group: '${{ github.workflow }}-${{ github.event.pull_request.number || github.ref }}',
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
            group: '${{ github.workflow }}-${{ github.event.pull_request.number || github.ref }}',
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
});
