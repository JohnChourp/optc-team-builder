#!/usr/bin/env node
/**
 * 869f33bru. Refuses any value shaped like a credential - real or fake - wherever it could leave
 * this machine. The rules live in `scripts/lib/secret-scan.mjs`; this file only decides WHAT to scan.
 *
 * Usage:
 *   node ./scripts/check-secrets.mjs                   # every tracked file in the working tree (the lane)
 *   node ./scripts/check-secrets.mjs --staged          # the staged blobs (pre-commit hook)
 *   node ./scripts/check-secrets.mjs --pre-push        # added lines of every commit being pushed (pre-push hook, refs on stdin)
 *   node ./scripts/check-secrets.mjs --range A..B      # added lines of every commit in a range
 *   node ./scripts/check-secrets.mjs --dir <path>      # every file under a directory (a build before it ships)
 *   node ./scripts/check-secrets.mjs --history         # every blob reachable from any ref (audit only; slow)
 *
 * Layers, and what each one catches that the others do not (the owner asked for many on 2026-09-16):
 *   1. pre-commit  - a value never enters a commit on a machine with the hooks installed.
 *   2. pre-push    - a commit made elsewhere, or with --no-verify, never leaves this machine.
 *   3. `secrets` lane in `verify:local` - the tree a pull request proposes is clean, hooks or not.
 *   4. `build:pages` - the published site is clean even if something slipped past git entirely
 *      (a generated file, a gitignored `public/app-config.js`).
 *   5. `scripts/release-and-tag.sh` - the same for the web assets packed into the release APK.
 * GitHub's own secret scanning and push protection sit behind all five, and do not block every
 * provider: push protection never blocks `google_api_key`, which is why alert #1 was published.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { formatFinding, isProbablyBinary, scanText, scanUnifiedDiff } from './lib/secret-scan.mjs';

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MAX_FILE_BYTES = 64 * 1024 * 1024;
const ZERO_SHA = /^0+$/u;

function git(args, { input, cwd = ROOT_DIR, encoding = 'utf8' } = {}) {
  const result = spawnSync('git', args, {
    cwd,
    // A string input is always UTF-8; `encoding` only describes the output.
    input: typeof input === 'string' ? Buffer.from(input, 'utf8') : input,
    encoding,
    maxBuffer: 1024 * 1024 * 1024,
  });

  if (result.status !== 0) {
    const stderr = Buffer.isBuffer(result.stderr) ? result.stderr.toString('utf8') : result.stderr;
    throw new Error(`git ${args.join(' ')} failed: ${String(stderr).trim()}`);
  }

  return result.stdout;
}

function scanBuffer(buffer, label) {
  if (buffer.length > MAX_FILE_BYTES || isProbablyBinary(buffer)) {
    return [];
  }

  return scanText(buffer.toString('utf8'), { path: label });
}

export function scanTrackedTree({ cwd = ROOT_DIR } = {}) {
  const files = git(['ls-files', '-z'], { cwd }).split('\0').filter(Boolean);
  const findings = [];

  for (const file of files) {
    const absolute = path.join(cwd, file);
    let stat;

    try {
      stat = fs.lstatSync(absolute);
    } catch {
      continue; // deleted in the working tree but still in the index
    }

    if (!stat.isFile()) {
      continue;
    }

    findings.push(...scanBuffer(fs.readFileSync(absolute), file));
  }

  return { scanned: files.length, findings };
}

export function scanStaged({ cwd = ROOT_DIR } = {}) {
  const files = git(['diff', '--cached', '--name-only', '-z', '--diff-filter=ACMR'], { cwd })
    .split('\0')
    .filter(Boolean);
  const findings = [];

  for (const file of files) {
    const blob = git(['cat-file', 'blob', `:${file}`], { cwd, encoding: 'buffer' });
    findings.push(...scanBuffer(blob, file));
  }

  return { scanned: files.length, findings };
}

export function scanCommits(revListArgs, { cwd = ROOT_DIR } = {}) {
  const commits = git(['rev-list', ...revListArgs], { cwd }).split('\n').filter(Boolean);
  const findings = [];

  for (const commit of commits) {
    const diff = git(
      ['diff-tree', '-r', '-p', '--no-color', '--no-ext-diff', '--root', '-m', '--first-parent', commit],
      { cwd },
    );
    findings.push(...scanUnifiedDiff(diff, { commit }));
  }

  return { scanned: commits.length, findings };
}

/**
 * The refs git hands a pre-push hook on stdin: `<local ref> <local sha> <remote ref> <remote sha>`.
 * A new branch has an all-zero remote sha, so its range is "everything not already on the remote".
 */
export function prePushRanges(stdinText, remoteName = 'origin') {
  const ranges = [];

  for (const line of stdinText.split('\n')) {
    const [localRef, localSha, , remoteSha] = line.trim().split(/\s+/u);

    if (!localRef || !localSha || ZERO_SHA.test(localSha)) {
      continue; // a deletion pushes no content
    }

    ranges.push(
      !remoteSha || ZERO_SHA.test(remoteSha)
        ? [localSha, '--not', `--remotes=${remoteName}`]
        : [`${remoteSha}..${localSha}`],
    );
  }

  return ranges;
}

export function scanDirectory(directory) {
  const findings = [];
  let scanned = 0;

  const walk = (current) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const absolute = path.join(current, entry.name);

      if (entry.isDirectory()) {
        walk(absolute);
      } else if (entry.isFile()) {
        scanned += 1;
        findings.push(...scanBuffer(fs.readFileSync(absolute), path.relative(directory, absolute).split(path.sep).join('/')));
      }
    }
  };

  walk(directory);
  return { scanned, findings };
}

export function scanHistory({ cwd = ROOT_DIR, chunkBytes = 256 * 1024 * 1024 } = {}) {
  const objects = git(['rev-list', '--objects', '--all'], { cwd }).split('\n').filter(Boolean);
  const pathsByBlob = new Map();

  for (const line of objects) {
    const [sha, ...rest] = line.split(' ');
    if (rest.length && !pathsByBlob.has(sha)) {
      pathsByBlob.set(sha, rest.join(' '));
    }
  }

  const blobs = git(['cat-file', '--batch-check=%(objectname) %(objecttype) %(objectsize)'], {
    cwd,
    input: [...pathsByBlob.keys()].join('\n'),
  })
    .split('\n')
    .map((line) => line.split(' '))
    .filter(([, type, size]) => type === 'blob' && Number(size) <= MAX_FILE_BYTES);
  const findings = [];

  /*
   * One `git cat-file --batch` per ~256 MB rather than one process per blob: spawning 25,000
   * processes took over ten minutes on Windows for the brain alone. The batch output is
   * `<sha> <type> <size>\n<content>\n` per object, read back by size.
   */
  let chunk = [];
  let pending = 0;

  const flush = () => {
    if (!chunk.length) {
      return;
    }

    const output = git(['cat-file', '--batch'], { cwd, input: chunk.join('\n'), encoding: 'buffer' });
    let offset = 0;

    while (offset < output.length) {
      const headerEnd = output.indexOf(10, offset);
      const [sha, , size] = output.subarray(offset, headerEnd).toString('utf8').split(' ');
      const start = headerEnd + 1;
      const end = start + Number(size);

      for (const finding of scanBuffer(output.subarray(start, end), pathsByBlob.get(sha))) {
        findings.push({ ...finding, commit: sha });
      }

      offset = end + 1;
    }

    chunk = [];
    pending = 0;
  };

  for (const [sha, , size] of blobs) {
    if (chunk.length && pending + Number(size) > chunkBytes) {
      flush();
    }

    chunk.push(sha);
    pending += Number(size);
  }

  flush();
  return { scanned: blobs.length, findings };
}

function readStdin() {
  try {
    return fs.readFileSync(0, 'utf8');
  } catch {
    return '';
  }
}

function report(mode, { scanned, findings }) {
  if (!findings.length) {
    console.log(`[secrets] ${mode}: ${scanned} scanned, nothing shaped like a secret.`);
    return 0;
  }

  console.error(`[secrets] ${mode}: ${findings.length} value(s) shaped like a secret - refused.`);

  for (const finding of findings) {
    console.error(`  ${formatFinding(finding)}`);
  }

  console.error(
    [
      '',
      'If it is a real credential: revoke or rotate it at the provider FIRST, then remove it.',
      'Removing it from the file does not remove it from history or from anyone who fetched it.',
      'If it is a test fixture: assemble it at runtime from pieces (scripts/lib/secret-fixture.mjs),',
      'so the literal never exists in a file. There is no allowlist, by design (869f33bru).',
    ].join('\n'),
  );
  return 1;
}

function main(argv) {
  const flag = (name) => argv.includes(name);
  const value = (name) => {
    const index = argv.indexOf(name);
    return index >= 0 ? argv[index + 1] : undefined;
  };

  if (flag('--staged')) {
    return report('staged', scanStaged());
  }

  if (flag('--pre-push')) {
    const ranges = prePushRanges(readStdin(), argv[argv.indexOf('--pre-push') + 1] ?? 'origin');
    const merged = { scanned: 0, findings: [] };

    for (const range of ranges) {
      const result = scanCommits(range);
      merged.scanned += result.scanned;
      merged.findings.push(...result.findings);
    }

    return report('pre-push commits', merged);
  }

  if (value('--range')) {
    return report(`range ${value('--range')}`, scanCommits([value('--range')]));
  }

  if (value('--dir')) {
    const directory = path.resolve(value('--dir'));

    if (!fs.existsSync(directory)) {
      console.error(`[secrets] ${directory} does not exist - a build that produced nothing cannot be cleared.`);
      return 1;
    }

    return report(`directory ${path.relative(ROOT_DIR, directory) || directory}`, scanDirectory(directory));
  }

  if (flag('--history')) {
    return report('history', scanHistory());
  }

  return report('tracked files', scanTrackedTree());
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2));
}
