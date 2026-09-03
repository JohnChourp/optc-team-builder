#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

/**
 * The player-facing release history has to stay honest and complete.
 *
 * `src/app/core/data/whats-new.data.ts` backs the "What's new" modal in the side
 * menu. A release that forgets to add its entry leaves a hole in the version
 * list, which reads to a player as something withheld; an entry written in
 * developer language is worse than none, because it looks like an answer.
 *
 * So this checks four things:
 *
 *   A. the version in package.json has an entry;
 *   B. entries are unique and ordered newest-first;
 *   C. every entry says something in BOTH languages;
 *   D. `userVisible: false` means all three lists are empty, and a visible
 *      release has at least one bullet - neither invented value nor silence.
 *
 * Run: npm run whats-new:check
 */

const REQUIRED_BULLET_LISTS = ['added', 'improved', 'fixed'];

export function normalizePath(value) {
  return String(value ?? '')
    .replace(/\\/gu, '/')
    .replace(/^\.\/+/u, '')
    .trim();
}

/** Reads the exported array without executing the module. */
export function parseEntries(source) {
  const marker = 'export const WHATS_NEW_ENTRIES';
  const start = source.indexOf(marker);

  if (start === -1) {
    throw new Error('WHATS_NEW_ENTRIES is not exported from the data module.');
  }

  // Anchor on the assignment, not the first '[': the type annotation
  // `readonly WhatsNewEntry[]` sits between the name and the array literal.
  const assignment = source.indexOf('= [', start);
  const open = assignment === -1 ? -1 : assignment + 2;
  const close = source.lastIndexOf(']');

  if (open === -1 || close === -1 || close < open) {
    throw new Error('WHATS_NEW_ENTRIES is not an array literal.');
  }

  return JSON.parse(source.slice(open, close + 1));
}

export function compareVersionsDescending(left, right) {
  const l = String(left).split('.').map(Number);
  const r = String(right).split('.').map(Number);

  return r[0] - l[0] || r[1] - l[1] || r[2] - l[2];
}

export function inspectWhatsNew({ appRoot = process.cwd() } = {}) {
  const dataPath = 'src/app/core/data/whats-new.data.ts';
  const full = path.join(appRoot, dataPath);
  const findings = [];

  if (!existsSync(full)) {
    return {
      ok: false,
      entryCount: 0,
      releasedVersion: null,
      findings: [{ kind: 'missing-data', detail: `${dataPath} does not exist.` }],
    };
  }

  const entries = parseEntries(readFileSync(full, 'utf8'));
  const packageJsonPath = path.join(appRoot, 'package.json');
  const releasedVersion = existsSync(packageJsonPath)
    ? JSON.parse(readFileSync(packageJsonPath, 'utf8')).version
    : null;

  // A. the shipped version is described.
  if (releasedVersion && !entries.some((entry) => entry.version === releasedVersion)) {
    findings.push({
      kind: 'missing-released-version',
      version: releasedVersion,
      detail: `package.json is ${releasedVersion} but no What's New entry describes it. A release is not finished until it adds its entry at the top.`,
    });
  }

  // B. unique and newest-first.
  const versions = entries.map((entry) => entry.version);
  const duplicates = versions.filter((version, index) => versions.indexOf(version) !== index);

  for (const version of new Set(duplicates)) {
    findings.push({ kind: 'duplicate-version', version, detail: `${version} appears twice.` });
  }

  const ordered = [...versions].sort(compareVersionsDescending);

  if (JSON.stringify(versions) !== JSON.stringify(ordered)) {
    findings.push({
      kind: 'out-of-order',
      detail: 'Entries must be newest-first; a new release is prepended, never appended.',
    });
  }

  for (const entry of entries) {
    const where = entry.version ?? '(no version)';

    if (!/^\d+\.\d+\.\d+$/u.test(String(entry.version ?? ''))) {
      findings.push({ kind: 'bad-version', version: where, detail: `${where} is not X.Y.Z.` });
    }

    if (!/^\d{4}-\d{2}-\d{2}$/u.test(String(entry.date ?? ''))) {
      findings.push({ kind: 'bad-date', version: where, detail: `${where} has no ISO date.` });
    }

    // C. both languages, always.
    for (const [field, value] of [
      ['headline.en', entry.headline?.en],
      ['headline.el', entry.headline?.el],
      ['summaryEn', entry.summaryEn],
      ['summaryEl', entry.summaryEl],
    ]) {
      if (!String(value ?? '').trim()) {
        findings.push({
          kind: 'missing-copy',
          version: where,
          detail: `${where} has no ${field}. Every release says something, in both languages.`,
        });
      }
    }

    const bullets = REQUIRED_BULLET_LISTS.flatMap((list) => entry[list] ?? []);

    for (const bullet of bullets) {
      if (!String(bullet?.en ?? '').trim() || !String(bullet?.el ?? '').trim()) {
        findings.push({
          kind: 'missing-bullet-language',
          version: where,
          detail: `${where} has a bullet missing its English or Greek text.`,
        });
      }
    }

    // D. quiet releases stay quiet; visible ones say what changed.
    if (entry.userVisible === false && bullets.length > 0) {
      findings.push({
        kind: 'quiet-release-with-bullets',
        version: where,
        detail: `${where} is marked as carrying no visible change but lists ${bullets.length} bullet(s).`,
      });
    }

    if (entry.userVisible === true && bullets.length === 0) {
      findings.push({
        kind: 'visible-release-without-bullets',
        version: where,
        detail: `${where} claims a visible change but lists nothing a player would notice.`,
      });
    }
  }

  return { ok: findings.length === 0, entryCount: entries.length, releasedVersion, findings };
}

export function formatWhatsNewResult(result) {
  const lines = ["# What's New changelog check", ''];

  lines.push(
    `Checked ${result.entryCount} release entr${result.entryCount === 1 ? 'y' : 'ies'}; package.json is ${result.releasedVersion ?? 'unknown'}.`,
  );
  lines.push('');

  if (result.ok) {
    lines.push('Status: passed - every release is described, in both languages, newest first.');
    lines.push('');

    return lines.join('\n');
  }

  lines.push(`Status: failed - ${result.findings.length} finding(s).`);
  lines.push('');

  for (const finding of result.findings) {
    lines.push(`- [${finding.kind}] ${finding.version ?? ''}`.trimEnd());
    lines.push(`  ${finding.detail}`);
  }

  lines.push('');

  return lines.join('\n');
}

function parseArgs(argv) {
  const args = { appRoot: process.cwd(), json: false };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === '--app-root') {
      index += 1;
      args.appRoot = argv[index];
    } else if (arg.startsWith('--app-root=')) {
      args.appRoot = arg.slice('--app-root='.length);
    } else if (arg === '--json') {
      args.json = true;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return args;
}

function main() {
  try {
    const args = parseArgs(process.argv.slice(2));
    const result = inspectWhatsNew({ appRoot: args.appRoot });

    if (args.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      process.stdout.write(formatWhatsNewResult(result));
    }

    if (!result.ok) {
      process.exitCode = 1;
    }
  } catch (error) {
    console.error(`[whats-new] ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main();
}
