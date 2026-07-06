#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

export const STRICT_GITHUB_ACTION_WORKFLOWS = [
  '.github/workflows/check-optc-db-release.yml',
  '.github/workflows/release-android.yml',
  '.github/workflows/deploy-pages.yml',
  '.github/workflows/test.yml',
  '.github/workflows/public-entry-synthetics.yml',
  '.github/workflows/performance-budgets.yml',
  '.github/workflows/guide-discoverability.yml',
];

const FULL_LENGTH_SHA_PATTERN = /^[0-9a-f]{40}$/iu;
const SOURCE_TAG_COMMENT_PATTERN = /^v\d+(?:[.\w-]*)?$/iu;
const USES_LINE_PATTERN = /^\s*(?:-\s*)?uses:\s*([^#\s]+)(?:\s+#\s*(.*?))?\s*$/u;
const BLOCK_SCALAR_PATTERN = /^(\s*)(?:-\s*)?[A-Za-z0-9_-]+:\s*[|>]/u;

function normalizePath(value) {
  return String(value ?? '').replace(/\\/gu, '/').replace(/^\.\/+/u, '').trim();
}

function isLocalActionRef(value) {
  return value.startsWith('./') || value.startsWith('../');
}

function parseUsesValue(rawValue) {
  return String(rawValue ?? '').replace(/^['"]|['"]$/gu, '');
}

function getIndent(line) {
  return line.match(/^\s*/u)?.[0].length ?? 0;
}

function parseExternalActionRef(value) {
  const refSeparatorIndex = value.lastIndexOf('@');
  if (refSeparatorIndex === -1) {
    return { ref: '', ownerRepo: '' };
  }

  const target = value.slice(0, refSeparatorIndex);
  const ref = value.slice(refSeparatorIndex + 1);
  const [owner, repo] = target.split('/');
  const ownerRepo = owner && repo ? `${owner}/${repo}` : '';
  return { ref, ownerRepo };
}

function defaultRefExists(ownerRepo, ref) {
  try {
    const output = execFileSync('git', ['ls-remote', `https://github.com/${ownerRepo}.git`], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return output
      .split(/\r?\n/u)
      .some((line) => line.split(/\s+/u)[0]?.toLowerCase() === ref.toLowerCase());
  } catch {
    return false;
  }
}

export function collectWorkflowUses({ workflowPath, text }) {
  const uses = [];
  const lines = String(text ?? '').split(/\r?\n/u);
  let blockScalarIndent = null;

  for (const [index, line] of lines.entries()) {
    const indent = getIndent(line);
    if (blockScalarIndent !== null) {
      if (line.trim() === '' || indent > blockScalarIndent) {
        continue;
      }
      blockScalarIndent = null;
    }

    const blockScalarMatch = line.match(BLOCK_SCALAR_PATTERN);
    if (blockScalarMatch) {
      blockScalarIndent = blockScalarMatch[1].length;
      continue;
    }

    const match = line.match(USES_LINE_PATTERN);
    if (!match) {
      continue;
    }

    uses.push({
      workflowPath: normalizePath(workflowPath),
      line: index + 1,
      value: parseUsesValue(match[1]),
      comment: match[2]?.trim() ?? '',
    });
  }

  return uses;
}

export function inspectGitHubActionPins({
  root = process.cwd(),
  strictWorkflows = STRICT_GITHUB_ACTION_WORKFLOWS,
  validateRemoteRefs = true,
  refExists = defaultRefExists,
} = {}) {
  const entries = [];
  const findings = [];
  const errors = [];
  const refExistenceCache = new Map();

  for (const workflowPath of strictWorkflows.map(normalizePath)) {
    const absolutePath = path.join(root, workflowPath);
    if (!existsSync(absolutePath)) {
      errors.push({
        workflowPath,
        message: 'Strict workflow is missing.',
      });
      continue;
    }

    const text = readFileSync(absolutePath, 'utf8');
    for (const entry of collectWorkflowUses({ workflowPath, text })) {
      entries.push(entry);

      if (isLocalActionRef(entry.value)) {
        continue;
      }

      const { ref, ownerRepo } = parseExternalActionRef(entry.value);
      if (!ref) {
        findings.push({
          ...entry,
          message: 'External action reference is missing an explicit ref.',
        });
        continue;
      }

      if (!FULL_LENGTH_SHA_PATTERN.test(ref)) {
        findings.push({
          ...entry,
          message: 'External action reference must be pinned to a full 40-character commit SHA.',
        });
        continue;
      }

      if (!SOURCE_TAG_COMMENT_PATTERN.test(entry.comment)) {
        findings.push({
          ...entry,
          message: 'External action SHA pin must keep the source tag in a trailing comment.',
        });
      }

      if (validateRemoteRefs && ownerRepo) {
        const cacheKey = `${ownerRepo}@${ref}`;
        if (!refExistenceCache.has(cacheKey)) {
          refExistenceCache.set(cacheKey, refExists(ownerRepo, ref));
        }
        if (!refExistenceCache.get(cacheKey)) {
          findings.push({
            ...entry,
            message: 'Pinned SHA must exist in the referenced action repository.',
          });
        }
      }
    }
  }

  return {
    ok: findings.length === 0 && errors.length === 0,
    entries,
    errors,
    findings,
    strictWorkflows: strictWorkflows.map(normalizePath),
  };
}

export function formatGitHubActionPinResult(result) {
  const lines = ['# GitHub Actions pin check', ''];

  if (result.ok) {
    lines.push(
      `Status: passed - ${result.entries.length} action reference(s) in ${result.strictWorkflows.length} strict workflow(s) are pinned to full commit SHAs.`,
    );
    return `${lines.join('\n')}\n`;
  }

  lines.push('Status: failed', '');

  if (result.errors.length > 0) {
    lines.push('## Errors', '');
    for (const error of result.errors) {
      lines.push(`- ${error.workflowPath}: ${error.message}`);
    }
    lines.push('');
  }

  if (result.findings.length > 0) {
    lines.push('## Findings', '');
    for (const finding of result.findings) {
      lines.push(`- ${finding.workflowPath}:${finding.line} \`${finding.value}\` - ${finding.message}`);
    }
    lines.push('');
  }

  lines.push('Use a full commit SHA and keep the source tag in a trailing comment, for example `owner/action@<sha> # vN`.');
  return `${lines.join('\n')}\n`;
}

function parseArgs(argv) {
  const options = {
    root: process.cwd(),
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--root') {
      options.root = path.resolve(argv[index + 1] ?? '');
      index += 1;
    } else if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return options;
}

function printHelp() {
  console.log(`Usage: node scripts/check-github-actions-pins.mjs [--root <repo-root>]

Checks release-critical and browser/test-critical workflows for full-SHA action pins.`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const options = parseArgs(process.argv.slice(2));
    if (options.help) {
      printHelp();
      process.exit(0);
    }

    const result = inspectGitHubActionPins(options);
    process.stdout.write(formatGitHubActionPinResult(result));
    if (!result.ok) {
      process.exitCode = 1;
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
