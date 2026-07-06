import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  buildPolicyContractFromOutputs,
  checkReleaseRunbookDrift,
  formatReleaseRunbookDriftResult,
} from './check-release-runbook-drift.mjs';

let tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.map((dir) => rm(dir, { recursive: true, force: true })));
  tempDirs = [];
});

async function writeWorkspaceFile(rootDir: string, relativePath: string, content: string) {
  const absolutePath = path.join(rootDir, relativePath);
  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, content);
}

function makeWorkflow(overrides: { outputNames?: string[]; inputDefault?: string; artifactNames?: string[] } = {}) {
  const outputNames = overrides.outputNames ?? [
    'duplicate_release_dispatch_blocked',
    'new_character_count',
    'release_dispatch_blocked',
    'release_dispatch_idempotency_key',
    'release_dispatch_mode',
    'release_dispatched',
    'release_needed',
    'run_reason',
    'run_status',
  ];
  const artifactNames = overrides.artifactNames ?? [
    'release-detector-status',
    'release-trigger-outcome',
    'upstream-monitor-report',
  ];

  return [
    'name: Check OPTC DB Release',
    '',
    'on:',
    '  workflow_dispatch:',
    '    inputs:',
    '      release_dispatch_mode:',
    "        description: 'Use verify-only for safe report generation, or dispatch-if-needed to run Release Android when new IDs exist.'",
    '        required: true',
    '        type: choice',
    `        default: ${overrides.inputDefault ?? 'verify-only'}`,
    '        options:',
    '          - verify-only',
    '          - dispatch-if-needed',
    '  schedule:',
    "    - cron: '37 7 * * *'",
    '',
    'jobs:',
    '  check:',
    '    outputs:',
    ...outputNames.map((name) => `      ${name}: \${{ steps.release-trigger-report.outputs.${name} }}`),
    '    steps:',
    ...artifactNames.flatMap((name) => [
      `      - name: Upload ${name}`,
      '        uses: actions/upload-artifact@v7',
      '        with:',
      `          name: ${name}`,
    ]),
  ].join('\n');
}

function makePackageJson() {
  return JSON.stringify(
    {
      scripts: {
        'data:backtest-release': 'node ./scripts/backtest-optc-release-detector.mjs',
        'data:check-release': 'node ./scripts/check-optc-release-needed.mjs',
        'data:monitor-upstream': 'node ./scripts/check-optc-upstream-monitor.mjs',
        'release:detector-status': 'node ./scripts/release-detector-status.mjs',
        'release:post-dispatch-smoke': 'node ./scripts/post-dispatch-production-smoke.mjs',
        'release:provenance': 'node ./scripts/release-provenance-report.mjs',
        'test:release-check':
          'vitest run scripts/check-optc-release-needed.spec.ts scripts/check-optc-upstream-monitor.spec.ts scripts/backtest-optc-release-detector.spec.ts scripts/release-detector-status.spec.ts scripts/release-provenance-report.spec.ts scripts/post-dispatch-production-smoke.spec.ts',
      },
    },
    null,
    2,
  );
}

function makeContract(overrides: Record<string, unknown> = {}) {
  const contract = {
    workflow: {
      artifacts: ['release-detector-status', 'release-trigger-outcome', 'upstream-monitor-report'],
      checkJobOutputs: [
        'duplicate_release_dispatch_blocked',
        'new_character_count',
        'release_dispatch_blocked',
        'release_dispatch_idempotency_key',
        'release_dispatch_mode',
        'release_dispatched',
        'release_needed',
        'run_reason',
        'run_status',
      ],
      manualInput: {
        name: 'release_dispatch_mode',
        description:
          'Use verify-only for safe report generation, or dispatch-if-needed to run Release Android when new IDs exist.',
        required: true,
        type: 'choice',
        default: 'verify-only',
        options: ['verify-only', 'dispatch-if-needed'],
      },
      scheduleCron: ['37 7 * * *'],
    },
    packageScripts: JSON.parse(makePackageJson()).scripts,
    releasePolicy: buildPolicyContractFromOutputs(),
    sourceFiles: {
      app: [
        '.github/workflows/check-optc-db-release.yml',
        '.github/workflows/release-android.yml',
        'scripts/backtest-optc-release-detector.mjs',
        'scripts/check-optc-release-needed.mjs',
        'scripts/check-optc-upstream-monitor.mjs',
        'scripts/lib/release-trigger-policy.mjs',
        'scripts/notify-upstream-monitor.mjs',
        'scripts/release-detector-status.mjs',
        'scripts/release-provenance-report.mjs',
        'scripts/post-dispatch-production-smoke.mjs',
      ],
      brain: ['OPTC_DB_AUTO_RELEASE_RUNBOOK.md', 'OPTC_DB_AUTO_RELEASE_TRIGGER_AUDIT.md'],
    },
    ...overrides,
  };

  return [
    '# Runbook',
    '',
    '<!-- release-runbook-drift: contract-start -->',
    '```json',
    JSON.stringify(contract, null, 2),
    '```',
    '<!-- release-runbook-drift: contract-end -->',
  ].join('\n');
}

async function makeWorkspace(options: { workflow?: string; runbook?: string; packageJson?: string } = {}) {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), 'optc-release-runbook-drift-'));
  tempDirs.push(rootDir);
  const appRoot = path.join(rootDir, 'optc-team-builder');
  const brainRoot = path.join(rootDir, 'optc-team-builder-brain');

  await writeWorkspaceFile(appRoot, '.github/workflows/check-optc-db-release.yml', options.workflow ?? makeWorkflow());
  await writeWorkspaceFile(appRoot, 'package.json', options.packageJson ?? makePackageJson());
  await writeWorkspaceFile(brainRoot, 'OPTC_DB_AUTO_RELEASE_RUNBOOK.md', options.runbook ?? makeContract());
  await writeWorkspaceFile(brainRoot, 'OPTC_DB_AUTO_RELEASE_TRIGGER_AUDIT.md', '# Audit\n');

  for (const filePath of [
    '.github/workflows/release-android.yml',
    'scripts/backtest-optc-release-detector.mjs',
    'scripts/check-optc-release-needed.mjs',
    'scripts/check-optc-upstream-monitor.mjs',
    'scripts/lib/release-trigger-policy.mjs',
    'scripts/notify-upstream-monitor.mjs',
    'scripts/release-detector-status.mjs',
    'scripts/release-provenance-report.mjs',
    'scripts/post-dispatch-production-smoke.mjs',
  ]) {
    await writeWorkspaceFile(appRoot, filePath, '\n');
  }

  return { appRoot, brainRoot };
}

describe('check-release-runbook-drift', () => {
  it('passes when the runbook contract matches live workflow, package, and policy sources', async () => {
    const { appRoot, brainRoot } = await makeWorkspace();

    const result = await checkReleaseRunbookDrift({ appRoot, brainRoot });

    expect(result.failures).toEqual([]);
    expect(formatReleaseRunbookDriftResult(result)).toContain('runbook contract matches');
  });

  it('surfaces workflow output drift with the runbook and source values', async () => {
    const { appRoot, brainRoot } = await makeWorkspace({
      workflow: makeWorkflow({ outputNames: ['run_status'] }),
    });

    const result = await checkReleaseRunbookDrift({ appRoot, brainRoot });

    expect(result.failures).toEqual([
      expect.stringContaining('workflow.checkJobOutputs does not match .github/workflows/check-optc-db-release.yml'),
    ]);
    expect(result.failures[0]).toContain('duplicate_release_dispatch_blocked');
  });

  it('surfaces workflow input drift', async () => {
    const { appRoot, brainRoot } = await makeWorkspace({
      workflow: makeWorkflow({ inputDefault: 'dispatch-if-needed' }),
    });

    const result = await checkReleaseRunbookDrift({ appRoot, brainRoot });

    expect(result.failures).toEqual([expect.stringContaining('workflow.manualInput does not match')]);
  });

  it('surfaces package script drift', async () => {
    const packageJson = JSON.parse(makePackageJson());
    packageJson.scripts['data:check-release'] = 'node ./scripts/renamed-release-check.mjs';
    const { appRoot, brainRoot } = await makeWorkspace({ packageJson: JSON.stringify(packageJson, null, 2) });

    const result = await checkReleaseRunbookDrift({ appRoot, brainRoot });

    expect(result.failures).toEqual([expect.stringContaining('packageScripts.data:check-release')]);
  });

  it('surfaces missing source files', async () => {
    const { appRoot, brainRoot } = await makeWorkspace({
      runbook: makeContract({
        sourceFiles: {
          app: ['scripts/missing-release-source.mjs'],
          brain: ['OPTC_DB_AUTO_RELEASE_RUNBOOK.md'],
        },
      }),
    });

    const result = await checkReleaseRunbookDrift({ appRoot, brainRoot });

    expect(result.failures).toEqual(['sourceFiles.app references missing app file: scripts/missing-release-source.mjs']);
  });
});
