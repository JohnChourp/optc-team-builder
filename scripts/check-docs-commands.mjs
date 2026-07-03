#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const APP_DOCS = [
  'README.md',
  'docs/maintainer-validation-guide.md',
  'docs/fixture-ownership-guide.md',
  'e2e/README.md',
  'server/README.md',
];

const BRAIN_DOCS = ['README.md', 'OPTC_DB_AUTO_RELEASE_RUNBOOK.md'];

const SHELL_FENCE_LANGUAGES = new Set(['', 'bash', 'sh', 'shell', 'zsh']);
const DOCS_COMMAND_PATTERN = /<!--\s*docs-command:\s*(ci-executable|manual(?:\/illustrative)?|illustrative)\s*-->/iu;
const VISIBLE_STATUS_PATTERN = /\bCommand status:\s*(CI-executable|manual(?:\/illustrative)?|manual|illustrative)\b/iu;

const ALLOWED_COMMANDS = new Map(
  [
    [
      'npx vitest run scripts/lib/dataset-integrity.spec.ts scripts/lib/manual-character-overlay.spec.ts scripts/lib/manual-character-apply.spec.ts scripts/upsert-manual-character.spec.ts',
      { cwd: 'app', expected: 'zero' },
    ],
    ['npm run data:check-release -- --fixture=no-change --json', { cwd: 'app', expected: 'zero' }],
    ['npm run data:check-release -- --fixture=new-character --json', { cwd: 'app', expected: 'zero' }],
    ['npm run data:check-release -- --fixture=active-release-running --json', { cwd: 'app', expected: 'zero' }],
    ['npm run data:check-release -- --fixture=upstream-shape-drift --json', { cwd: 'app', expected: 'zero' }],
    ['npm run data:backtest-release -- --json', { cwd: 'app', expected: 'zero' }],
    ['node scripts/check-optc-release-needed.mjs --fixture=error --json', { cwd: 'app', expected: 'nonzero' }],
    ['npm run test:docs-integrity', { cwd: 'app', expected: 'zero' }],
    ['npm run test:docs-drift', { cwd: 'app', expected: 'zero' }],
    [
      'npm run docs:integrity -- --brain-root ../optc-team-builder-brain',
      { cwd: 'app', expected: 'zero', requiresBrain: true },
    ],
    [
      'npm run docs:drift -- --base-ref origin/main --head-ref HEAD --brain-root ../optc-team-builder-brain',
      { cwd: 'app', expected: 'zero', requiresBrain: true },
    ],
    [
      'npm run doctor:maintainer -- --profile=ci --brain-root ../optc-team-builder-brain',
      { cwd: 'app', expected: 'zero', requiresBrain: true },
    ],
    ['npm run test:dataset-digest', { cwd: 'app', expected: 'zero' }],
    ['npm run docs:integrity -- --app-only', { cwd: 'app', expected: 'zero' }],
    ['npm run docs:drift -- --base-ref origin/main --head-ref HEAD --app-only', { cwd: 'app', expected: 'zero' }],
    [
      'node scripts/audit-docs-integrity.mjs --brain . --app ../optc-team-builder',
      { cwd: 'brain', expected: 'zero', requiresBrain: true },
    ],
  ].map(([command, config]) => [normalizeCommand(command), config]),
);

export async function checkDocsCommands(options = {}, runner = runAllowedCommand) {
  const appRoot = path.resolve(options.appRoot ?? process.cwd());
  const brainRoot = path.resolve(options.brainRoot ?? path.join(appRoot, '..', 'optc-team-builder-brain'));
  const appOnly = Boolean(options.appOnly);
  const failures = [];

  if (!(await directoryExists(appRoot))) {
    failures.push(formatFailure({ repo: 'app', file: '.', line: 1 }, `App root does not exist: ${appRoot}`));
  }

  if (!appOnly && !(await directoryExists(brainRoot))) {
    failures.push(formatFailure({ repo: 'brain', file: '.', line: 1 }, `Brain root does not exist: ${brainRoot}`));
  }

  if (failures.length > 0) {
    return { appRoot, brainRoot, appOnly, checkedFiles: 0, blocks: [], executions: [], skippedExecutions: [], failures };
  }

  const docs = [
    ...APP_DOCS.map((relativePath) => ({ repo: 'app', root: appRoot, relativePath })),
    ...(appOnly ? [] : BRAIN_DOCS.map((relativePath) => ({ repo: 'brain', root: brainRoot, relativePath }))),
  ];
  const blocks = [];

  for (const doc of docs) {
    blocks.push(...(await collectCommandBlocks(doc, failures)));
  }

  const plannedExecutions = new Map();

  for (const block of blocks) {
    if (block.classification !== 'ci-executable') {
      continue;
    }

    for (const command of block.commands) {
      const normalizedCommand = normalizeCommand(command);
      const allowed = ALLOWED_COMMANDS.get(normalizedCommand);

      if (!allowed) {
        failures.push(formatFailure(block, `CI-executable command is not allowlisted: ${command}`));
        continue;
      }

      plannedExecutions.set(`${allowed.cwd}\0${normalizedCommand}`, {
        command: normalizedCommand,
        config: allowed,
        firstSeen: block,
      });
    }
  }

  if (failures.length > 0 || options.dryRun) {
    return {
      appRoot,
      brainRoot,
      appOnly,
      checkedFiles: docs.length,
      blocks,
      executions: [...plannedExecutions.values()].map(({ command, config, firstSeen }) => ({
        command,
        cwd: config.cwd,
        expected: config.expected,
        firstSeen,
      })),
      skippedExecutions: [],
      failures,
    };
  }

  const executions = [];
  const skippedExecutions = [];

  for (const { command, config, firstSeen } of plannedExecutions.values()) {
    if (appOnly && config.requiresBrain) {
      skippedExecutions.push({ command, reason: 'requires brain checkout', firstSeen });
      continue;
    }

    const cwd = config.cwd === 'brain' ? brainRoot : appRoot;
    const result = await runner(command, { cwd, expected: config.expected, firstSeen });
    executions.push({ command, cwd: config.cwd, expected: config.expected, status: result.status, firstSeen });

    if (!isExpectedExit(result.status, config.expected)) {
      failures.push(
        formatFailure(
          firstSeen,
          `Command exited ${result.status}; expected ${config.expected === 'nonzero' ? 'nonzero' : 'zero'}: ${command}`,
        ),
      );
    }
  }

  return { appRoot, brainRoot, appOnly, checkedFiles: docs.length, blocks, executions, skippedExecutions, failures };
}

async function collectCommandBlocks(doc, failures) {
  const absolutePath = path.join(doc.root, doc.relativePath);
  const text = await readFile(absolutePath, 'utf8');
  const lines = text.split(/\r?\n/u);
  const blocks = [];
  let inFence = false;
  let fenceMarker = '';
  let fenceLanguage = '';
  let fenceStartLine = 0;
  let body = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const fenceMatch = line.match(/^\s*(`{3,}|~{3,})\s*([A-Za-z0-9_-]*)\s*$/u);

    if (!fenceMatch) {
      if (inFence) {
        body.push(line);
      }

      continue;
    }

    if (!inFence) {
      inFence = true;
      fenceMarker = fenceMatch[1] ?? '';
      fenceLanguage = (fenceMatch[2] ?? '').toLowerCase();
      fenceStartLine = index + 1;
      body = [];
      continue;
    }

    if (!isClosingFence(fenceMatch[1] ?? '', fenceMarker)) {
      body.push(line);
      continue;
    }

    if (SHELL_FENCE_LANGUAGES.has(fenceLanguage)) {
      const commands = extractShellCommands(body.join('\n'));

      if (commands.length > 0) {
        const block = {
          repo: doc.repo,
          file: doc.relativePath,
          line: fenceStartLine,
          commands,
          classification: findClassification(lines, fenceStartLine),
          visibleStatus: findVisibleStatus(lines, fenceStartLine),
        };

        if (!block.visibleStatus) {
          failures.push(formatFailure(block, 'Missing visible Command status line before shell command block.'));
        }

        if (!block.classification) {
          failures.push(formatFailure(block, 'Missing machine-readable docs-command metadata before shell command block.'));
        }

        if (block.visibleStatus && block.classification && block.visibleStatus !== block.classification) {
          failures.push(
            formatFailure(
              block,
              `Command status line (${block.visibleStatus}) does not match docs-command metadata (${block.classification}).`,
            ),
          );
        }

        blocks.push(block);
      }
    }

    inFence = false;
    fenceMarker = '';
    fenceLanguage = '';
    fenceStartLine = 0;
    body = [];
  }

  if (inFence) {
    failures.push(formatFailure({ repo: doc.repo, file: doc.relativePath, line: fenceStartLine }, 'Unclosed command fence.'));
  }

  return blocks;
}

export function extractShellCommands(source) {
  const commands = [];
  let current = '';

  for (const rawLine of source.split(/\r?\n/u)) {
    const trimmed = rawLine.trim();

    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    if (trimmed.endsWith('\\')) {
      current = `${current}${trimmed.slice(0, -1).trimEnd()} `;
      continue;
    }

    current = `${current}${trimmed}`;
    commands.push(normalizeCommand(current));
    current = '';
  }

  if (current.trim()) {
    commands.push(normalizeCommand(current));
  }

  return commands;
}

export function normalizeCommand(command) {
  return String(command ?? '').trim().replace(/\s+/gu, ' ');
}

function findClassification(lines, fenceStartLine) {
  for (let index = fenceStartLine - 2; index >= 0 && fenceStartLine - index <= 5; index -= 1) {
    const match = lines[index]?.match(DOCS_COMMAND_PATTERN);

    if (match?.[1]) {
      return normalizeClassification(match[1]);
    }
  }

  return null;
}

function findVisibleStatus(lines, fenceStartLine) {
  for (let index = fenceStartLine - 2; index >= 0 && fenceStartLine - index <= 5; index -= 1) {
    const match = lines[index]?.match(VISIBLE_STATUS_PATTERN);

    if (match?.[1]) {
      return normalizeClassification(match[1]);
    }
  }

  return null;
}

function normalizeClassification(value) {
  return /^ci-executable$/iu.test(value) ? 'ci-executable' : 'manual';
}

function isClosingFence(candidateMarker, openingMarker) {
  return candidateMarker[0] === openingMarker[0] && candidateMarker.length >= openingMarker.length;
}

function isExpectedExit(status, expected) {
  return expected === 'nonzero' ? status !== 0 : status === 0;
}

async function runAllowedCommand(command, { cwd, expected }) {
  console.log(`[docs:commands] running in ${cwd}: ${command}`);
  const result = spawnSync(command, {
    cwd,
    env: { ...process.env, CI: process.env.CI ?? 'true' },
    shell: true,
    stdio: expected === 'nonzero' ? 'pipe' : 'inherit',
    timeout: Number.parseInt(process.env.DOCS_COMMAND_TIMEOUT_MS ?? '180000', 10),
    encoding: 'utf8',
  });

  if (result.error) {
    throw result.error;
  }

  if (expected === 'nonzero' && result.status !== 0) {
    console.log(`[docs:commands] expected nonzero command exited ${result.status}: ${command}`);
  }

  if (expected === 'nonzero' && result.status === 0) {
    process.stdout.write(result.stdout ?? '');
    process.stderr.write(result.stderr ?? '');
  }

  return { status: result.status ?? 1 };
}

async function directoryExists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

function formatFailure(block, message) {
  return `${block.repo}:${block.file}:${block.line} - ${message}`;
}

export function formatResult(result) {
  const manualBlocks = result.blocks.filter((block) => block.classification !== 'ci-executable').length;

  if (result.failures.length > 0) {
    return [
      `[docs:commands] found ${result.failures.length} issue(s):`,
      ...result.failures.map((failure) => `- ${failure}`),
    ].join('\n');
  }

  return [
    `[docs:commands] checked ${result.checkedFiles} docs and ${result.blocks.length} command block(s).`,
    `[docs:commands] executed ${result.executions.length} unique CI command(s); skipped ${manualBlocks} manual/illustrative block(s) and ${result.skippedExecutions.length} checkout-dependent command(s).`,
  ].join('\n');
}

export function parseArgs(args) {
  const options = {};

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === '--brain-root') {
      options.brainRoot = args[index + 1];
      index += 1;
      continue;
    }

    if (arg.startsWith('--brain-root=')) {
      options.brainRoot = arg.slice('--brain-root='.length);
      continue;
    }

    if (arg === '--app-root') {
      options.appRoot = args[index + 1];
      index += 1;
      continue;
    }

    if (arg.startsWith('--app-root=')) {
      options.appRoot = arg.slice('--app-root='.length);
      continue;
    }

    if (arg === '--app-only') {
      options.appOnly = true;
      continue;
    }

    if (arg === '--dry-run') {
      options.dryRun = true;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return options;
}

export async function runCli(args = process.argv.slice(2), io = console) {
  const result = await checkDocsCommands(parseArgs(args));
  const output = formatResult(result);

  if (result.failures.length > 0) {
    io.error(output);
    return 1;
  }

  io.log(output);
  return 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  runCli()
    .then((exitCode) => {
      process.exitCode = exitCode;
    })
    .catch((error) => {
      console.error(`[docs:commands] ${error instanceof Error ? error.message : String(error)}`);
      process.exitCode = 1;
    });
}
