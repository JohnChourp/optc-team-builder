import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { checkDocsCommands, extractShellCommands } from './check-docs-commands.mjs';

let tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.map((dir) => rm(dir, { recursive: true, force: true })));
  tempDirs = [];
});

async function makeWorkspace(files: Record<string, string>) {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), 'optc-docs-commands-'));
  tempDirs.push(rootDir);
  const appRoot = path.join(rootDir, 'optc-team-builder');
  const brainRoot = path.join(rootDir, 'optc-team-builder-brain');
  await mkdir(appRoot, { recursive: true });
  await mkdir(brainRoot, { recursive: true });

  const defaultFiles: Record<string, string> = {
    'optc-team-builder/README.md': '# App\n',
    'optc-team-builder/docs/branch-lifecycle-policy.md': '# Branch lifecycle\n',
    'optc-team-builder/docs/post-merge-smoke-pack.md': '# Post-merge smoke\n',
    'optc-team-builder/docs/maintainer-validation-guide.md': '# Guide\n',
    'optc-team-builder/docs/fixture-ownership-guide.md': '# Fixtures\n',
    'optc-team-builder/e2e/README.md': '# E2E\n',
    'optc-team-builder/server/README.md': '# Server\n',
    'optc-team-builder-brain/README.md': '# Brain\n',
    'optc-team-builder-brain/OPTC_DB_AUTO_RELEASE_RUNBOOK.md': '# Runbook\n',
  };

  for (const [relativePath, content] of Object.entries({ ...defaultFiles, ...files })) {
    const absolutePath = path.join(rootDir, relativePath);
    await mkdir(path.dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, content);
  }

  return { appRoot, brainRoot };
}

describe('check-docs-commands', () => {
  it('extracts continued shell commands as one normalized command', () => {
    expect(
      extractShellCommands(
        [
          'npm run data:check-release -- --json \\',
          '  --remote-version-path=/tmp/version.js \\',
          '  --remote-units-path=/tmp/units.js',
        ].join('\n'),
      ),
    ).toEqual([
      'npm run data:check-release -- --json --remote-version-path=/tmp/version.js --remote-units-path=/tmp/units.js',
    ]);
  });

  it('runs each unique allowlisted CI command once and skips manual blocks', async () => {
    const { appRoot, brainRoot } = await makeWorkspace({
      'optc-team-builder/README.md': [
        '# App',
        '',
        'Command status: CI-executable.',
        '<!-- docs-command: ci-executable -->',
        '```bash',
        'npm run data:check-release -- --fixture=no-change --json',
        'npm run data:check-release -- --fixture=no-change --json',
        'npm run test:i18n-regression',
        'npm run test:public-entry-synthetics',
        '```',
        '',
        'Command status: manual/illustrative.',
        '<!-- docs-command: manual/illustrative -->',
        '```bash',
        'npm start',
        '```',
      ].join('\n'),
      'optc-team-builder-brain/README.md': [
        '# Brain',
        '',
        'Command status: CI-executable.',
        '<!-- docs-command: ci-executable -->',
        '```bash',
        'node scripts/audit-docs-integrity.mjs --brain . --app ../optc-team-builder',
        '```',
      ].join('\n'),
    });
    const seen: Array<{ command: string; cwd: string }> = [];
    const result = await checkDocsCommands({ appRoot, brainRoot }, async (command, options) => {
      seen.push({ command, cwd: options.cwd });
      return { status: 0 };
    });

    expect(result.failures).toEqual([]);
    expect(seen).toEqual([
      { command: 'npm run data:check-release -- --fixture=no-change --json', cwd: appRoot },
      { command: 'npm run test:i18n-regression', cwd: appRoot },
      { command: 'npm run test:public-entry-synthetics', cwd: appRoot },
      {
        // The canonical `../optc-team-builder` in the doc is resolved to the root
        // this run was configured with, so --app-root/--brain-root are honoured by
        // the command itself and not only by its working directory.
        command: `node scripts/audit-docs-integrity.mjs --brain . --app ${appRoot}`,
        cwd: brainRoot,
      },
    ]);
  });

  it('reports the canonical command text even though it runs the resolved one', async () => {
    const { appRoot, brainRoot } = await makeWorkspace({
      'optc-team-builder/README.md': '# App',
      'optc-team-builder-brain/README.md': [
        '# Brain',
        '',
        'Command status: CI-executable.',
        '<!-- docs-command: ci-executable -->',
        '```bash',
        'node scripts/audit-docs-integrity.mjs --brain . --app ../optc-team-builder',
        '```',
      ].join('\n'),
    });

    const result = await checkDocsCommands({ appRoot, brainRoot }, async () => ({ status: 1 }));

    // A reader has to find the failing command in the doc, so the message keeps the
    // text as written rather than the machine-specific resolved path.
    expect(result.failures).toHaveLength(1);
    expect(result.failures[0]).toContain('--app ../optc-team-builder');
    expect(result.failures[0]).not.toContain(appRoot);
  });

  it('leaves a command with no sibling path untouched', async () => {
    const { appRoot, brainRoot } = await makeWorkspace({
      'optc-team-builder/README.md': [
        '# App',
        '',
        'Command status: CI-executable.',
        '<!-- docs-command: ci-executable -->',
        '```bash',
        'npm run test:i18n-regression',
        '```',
      ].join('\n'),
      'optc-team-builder-brain/README.md': '# Brain',
    });
    const seen: string[] = [];

    await checkDocsCommands({ appRoot, brainRoot }, async (command) => {
      seen.push(command);
      return { status: 0 };
    });

    expect(seen).toEqual(['npm run test:i18n-regression']);
  });

  it('requires visible and machine-readable metadata before command fences', async () => {
    const { appRoot, brainRoot } = await makeWorkspace({
      'optc-team-builder/README.md': ['# App', '', '```bash', 'npm run test:release-check', '```'].join('\n'),
    });

    const result = await checkDocsCommands({ appRoot, brainRoot }, async () => ({ status: 0 }));

    expect(result.failures).toEqual(
      expect.arrayContaining([
        expect.stringContaining('Missing visible Command status line'),
        expect.stringContaining('Missing machine-readable docs-command metadata'),
      ]),
    );
  });

  it('rejects CI-executable commands that are not allowlisted', async () => {
    const { appRoot, brainRoot } = await makeWorkspace({
      'optc-team-builder/README.md': [
        '# App',
        '',
        'Command status: CI-executable.',
        '<!-- docs-command: ci-executable -->',
        '```bash',
        'npm run build',
        '```',
      ].join('\n'),
    });

    const result = await checkDocsCommands({ appRoot, brainRoot }, async () => ({ status: 0 }));

    expect(result.failures).toContainEqual(expect.stringContaining('CI-executable command is not allowlisted'));
  });

  it('honors expected nonzero commands', async () => {
    const { appRoot, brainRoot } = await makeWorkspace({
      'optc-team-builder/README.md': [
        '# App',
        '',
        'Command status: CI-executable.',
        '<!-- docs-command: ci-executable -->',
        '```bash',
        'node scripts/check-optc-release-needed.mjs --fixture=error --json',
        '```',
      ].join('\n'),
    });

    const passing = await checkDocsCommands({ appRoot, brainRoot }, async () => ({ status: 1 }));
    const failing = await checkDocsCommands({ appRoot, brainRoot }, async () => ({ status: 0 }));

    expect(passing.failures).toEqual([]);
    expect(failing.failures).toContainEqual(expect.stringContaining('expected nonzero'));
  });

  it('skips brain docs and brain-dependent app commands in app-only mode', async () => {
    const { appRoot, brainRoot } = await makeWorkspace({
      'optc-team-builder/README.md': [
        '# App',
        '',
        'Command status: CI-executable.',
        '<!-- docs-command: ci-executable -->',
        '```bash',
        'npm run docs:integrity -- --brain-root ../optc-team-builder-brain',
        'npm run docs:release-runbook-drift -- --brain-root ../optc-team-builder-brain',
        'npm run docs:integrity -- --app-only',
        '```',
      ].join('\n'),
      'optc-team-builder-brain/README.md': [
        '# Brain',
        '',
        'Command status: CI-executable.',
        '<!-- docs-command: ci-executable -->',
        '```bash',
        'node scripts/audit-docs-integrity.mjs --brain . --app ../optc-team-builder',
        '```',
      ].join('\n'),
    });
    const seen: string[] = [];

    const result = await checkDocsCommands({ appRoot, brainRoot, appOnly: true }, async (command) => {
      seen.push(command);
      return { status: 0 };
    });

    expect(result.failures).toEqual([]);
    expect(seen).toEqual(['npm run docs:integrity -- --app-only']);
    expect(result.skippedExecutions).toHaveLength(2);
  });
});
