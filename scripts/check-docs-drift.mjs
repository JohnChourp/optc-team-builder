#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

const DEFAULT_MAP_PATH = 'docs/docs-drift-map.json';
const ALL_ZERO_SHA_PATTERN = /^0+$/u;
const BRAIN_DOCS_PREFIX = '../optc-team-builder-brain/';
const PLACEHOLDER_PATTERN =
  /^(?:todo|tbd|n\/a|na|none|not applicable|pending|to be added|add later|link later|fill in|fixme|xxx|[-_.\s]+)$/iu;
const QUALIFIED_PLACEHOLDER_PATTERN =
  /^(?:todo|tbd|n\/a|na|none|not applicable|pending|to be added|add later|link later|fill in|fixme|xxx)\b/iu;
const PR_BODY_FIELD_PATTERN = /^\s*(?:[-*]\s*)?(?:\*\*)?Docs drift acknowledgement(?:\*\*)?\s*:\s*(.*)$/iu;
const TRACEABILITY_FIELD_PATTERN =
  /^\s*(?:[-*]\s*)?(?:\*\*)?(?:ClickUp task|Evidence|Verification|Summary|Notes)(?:\*\*)?\s*:/iu;

function normalizePath(value) {
  return String(value ?? '').replace(/\\/gu, '/').replace(/^\.\/+/u, '').trim();
}

function uniqueSorted(values) {
  return [...new Set(values.map(normalizePath).filter(Boolean))].sort();
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function isInsideOrEqual(child, parent) {
  const relative = path.relative(parent, child);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

async function pathExists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

function resolveAppPath(appRoot, relativePath) {
  return path.resolve(appRoot, ...normalizePath(relativePath).split('/'));
}

function resolveDocsPath({ appRoot, brainRoot, relativePath }) {
  const normalized = normalizePath(relativePath);

  if (normalized.startsWith(BRAIN_DOCS_PREFIX)) {
    return path.resolve(brainRoot, ...normalized.slice(BRAIN_DOCS_PREFIX.length).split('/'));
  }

  return resolveAppPath(appRoot, normalized);
}

function isSafeAppRelativePath(value) {
  const normalized = normalizePath(value);
  return Boolean(normalized) && !path.isAbsolute(value) && !normalized.split('/').includes('..');
}

function isSafeDocsPath(value) {
  const normalized = normalizePath(value);
  if (normalized.startsWith(BRAIN_DOCS_PREFIX)) {
    return !normalized.slice(BRAIN_DOCS_PREFIX.length).split('/').includes('..');
  }
  return isSafeAppRelativePath(value);
}

function pushError(errors, pathLabel, message) {
  errors.push(`${pathLabel}: ${message}`);
}

export async function loadDocsDriftMap({ appRoot = process.cwd(), mapPath = DEFAULT_MAP_PATH } = {}) {
  const resolvedMapPath = resolveAppPath(appRoot, mapPath);
  const text = await readFile(resolvedMapPath, 'utf8');
  return JSON.parse(text);
}

export async function validateDocsDriftMap(
  map,
  { appRoot = process.cwd(), brainRoot = path.join(appRoot, '..', 'optc-team-builder-brain'), appOnly = false } = {},
) {
  const errors = [];

  if (!isObject(map)) {
    return ['map must be an object'];
  }

  if (map.schemaVersion !== 1) {
    pushError(errors, 'schemaVersion', 'must be 1');
  }

  if (!Array.isArray(map.entries) || map.entries.length === 0) {
    pushError(errors, 'entries', 'must be a non-empty array');
    return errors;
  }

  const seenIds = new Set();

  for (const [entryIndex, entry] of map.entries.entries()) {
    const label = `entries[${entryIndex}]`;

    if (!isObject(entry)) {
      pushError(errors, label, 'must be an object');
      continue;
    }

    for (const key of ['id', 'name', 'owner', 'notes']) {
      if (!isNonEmptyString(entry[key])) {
        pushError(errors, `${label}.${key}`, 'must be a non-empty string');
      }
    }

    if (isNonEmptyString(entry.id)) {
      if (!/^[a-z0-9][a-z0-9-]*$/u.test(entry.id)) {
        pushError(errors, `${label}.id`, 'must be a lowercase kebab-case id');
      }
      if (seenIds.has(entry.id)) {
        pushError(errors, `${label}.id`, `duplicate id ${entry.id}`);
      }
      seenIds.add(entry.id);
    }

    await validateMappedPaths({
      paths: entry.featurePaths,
      pathLabel: `${label}.featurePaths`,
      root: appRoot,
      kind: 'feature',
      errors,
    });
    await validateMappedPaths({
      paths: entry.docsPaths,
      pathLabel: `${label}.docsPaths`,
      root: appRoot,
      brainRoot,
      kind: 'docs',
      appOnly,
      errors,
    });
  }

  return errors;
}

async function validateMappedPaths({ paths, pathLabel, root, brainRoot, kind, appOnly = false, errors }) {
  if (!Array.isArray(paths) || paths.length === 0) {
    pushError(errors, pathLabel, 'must be a non-empty array');
    return;
  }

  for (const [index, rawPath] of paths.entries()) {
    const itemLabel = `${pathLabel}[${index}]`;

    if (!isNonEmptyString(rawPath)) {
      pushError(errors, itemLabel, 'must be a non-empty string');
      continue;
    }

    const normalized = normalizePath(rawPath);
    const isBrainDocsPath = kind === 'docs' && normalized.startsWith(BRAIN_DOCS_PREFIX);

    if (kind === 'feature' && !isSafeAppRelativePath(normalized)) {
      pushError(errors, itemLabel, 'must be an app repo relative path');
      continue;
    }

    if (kind === 'docs' && !isSafeDocsPath(normalized)) {
      pushError(errors, itemLabel, 'must be an app docs path or ../optc-team-builder-brain path');
      continue;
    }

    if (appOnly && isBrainDocsPath) {
      continue;
    }

    const resolvedPath =
      kind === 'docs'
        ? resolveDocsPath({ appRoot: root, brainRoot: brainRoot ?? path.join(root, '..', 'optc-team-builder-brain'), relativePath: normalized })
        : resolveAppPath(root, normalized);

    const expectedRoot =
      isBrainDocsPath
        ? path.resolve(brainRoot ?? path.join(root, '..', 'optc-team-builder-brain'))
        : path.resolve(root);

    if (!isInsideOrEqual(resolvedPath, expectedRoot)) {
      pushError(errors, itemLabel, 'resolves outside the expected repository');
      continue;
    }

    if (!(await pathExists(resolvedPath)) && !(kind === 'feature' && hasTrackedPrefix(root, normalized))) {
      pushError(errors, itemLabel, `does not exist: ${normalized}`);
    }
  }
}

function hasTrackedPrefix(root, normalizedPath, execFile = execFileSync) {
  try {
    const output = execFile('git', ['-C', root, 'ls-files', normalizedPath, `${normalizedPath}*`], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return output
      .split(/\r?\n/u)
      .filter(Boolean)
      .some((filePath) => filePath === normalizedPath || filePath.startsWith(normalizedPath));
  } catch {
    return false;
  }
}

export function getChangedFiles({ baseRef, headRef, cwd = process.cwd(), execFile = execFileSync } = {}) {
  if (!baseRef || !headRef || ALL_ZERO_SHA_PATTERN.test(baseRef) || ALL_ZERO_SHA_PATTERN.test(headRef)) {
    return { changedFiles: [], error: 'both baseRef and headRef are required' };
  }

  try {
    const output = execFile('git', ['diff', '--name-status', '--diff-filter=ACMRTD', `${baseRef}...${headRef}`], {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { changedFiles: parseNameStatusOutput(output), error: '' };
  } catch (error) {
    return {
      changedFiles: [],
      error: error instanceof Error ? error.message : 'git diff failed',
    };
  }
}

export function parseNameStatusOutput(output) {
  const changedFiles = [];

  for (const rawLine of String(output ?? '').split(/\r?\n/u)) {
    const line = rawLine.trim();
    if (!line) {
      continue;
    }

    const [status, ...paths] = line.split('\t');
    if (/^[CR]/u.test(status) && paths.length >= 2) {
      changedFiles.push(paths[0], paths[1]);
      continue;
    }

    if (paths.length >= 1) {
      changedFiles.push(paths[0]);
    }
  }

  return uniqueSorted(changedFiles);
}

function readGitBranch(cwd, execFile = execFileSync) {
  try {
    return String(execFile('git', ['branch', '--show-current'], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })).trim();
  } catch {
    return '';
  }
}

function branchRefExists(cwd, ref, execFile = execFileSync) {
  try {
    execFile('git', ['rev-parse', '--verify', '--quiet', ref], { cwd, stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function getSiblingBrainChangedFiles({ brainRoot, execFile = execFileSync } = {}) {
  const resolvedBrainRoot = path.resolve(brainRoot ?? '');

  if (!resolvedBrainRoot || !branchRefExists(resolvedBrainRoot, 'HEAD', execFile)) {
    return { changedFiles: [], error: '' };
  }

  const currentBranch = readGitBranch(resolvedBrainRoot, execFile);
  const baseRef = branchRefExists(resolvedBrainRoot, 'origin/main', execFile) ? 'origin/main' : 'main';
  const headRef = currentBranch || 'HEAD';

  if (!branchRefExists(resolvedBrainRoot, baseRef, execFile)) {
    return { changedFiles: [], error: `brain base ref is unavailable: ${baseRef}` };
  }

  const result = getChangedFiles({ baseRef, headRef, cwd: resolvedBrainRoot, execFile });
  return {
    changedFiles: result.changedFiles.map((filePath) => `../optc-team-builder-brain/${filePath}`),
    error: result.error,
  };
}

function pathMatchesPattern(changedPath, mappedPath, allMappedPaths = []) {
  const changed = normalizePath(changedPath);
  const mapped = normalizePath(mappedPath);

  if (!changed || !mapped) {
    return false;
  }

  if (mapped.endsWith('/')) {
    return changed.startsWith(mapped);
  }

  if (changed === mapped || changed.startsWith(`${mapped}/`)) {
    return true;
  }

  if (path.posix.extname(mapped) || !changed.startsWith(mapped)) {
    return false;
  }

  return !allMappedPaths.some((rawCandidate) => {
    const candidate = normalizePath(rawCandidate);
    return (
      candidate &&
      candidate !== mapped &&
      candidate.length > mapped.length &&
      candidate.startsWith(mapped) &&
      pathMatchesPattern(changed, candidate)
    );
  });
}

function entryHasChangedPath(entry, changedFiles, key, entries) {
  const allMappedPaths = entries.flatMap((candidate) => (Array.isArray(candidate[key]) ? candidate[key] : []));
  return entry[key].some((mappedPath) =>
    changedFiles.some((changedFile) => pathMatchesPattern(changedFile, mappedPath, allMappedPaths)),
  );
}

export function extractDocsDriftAcknowledgement(body) {
  const lines = String(body ?? '').split(/\r?\n/u);

  for (let index = 0; index < lines.length; index += 1) {
    const match = lines[index].match(PR_BODY_FIELD_PATTERN);

    if (!match) {
      continue;
    }

    const valueLines = [match[1]?.trim() ?? ''];

    for (let nextIndex = index + 1; nextIndex < lines.length; nextIndex += 1) {
      const nextLine = lines[nextIndex];

      if (TRACEABILITY_FIELD_PATTERN.test(nextLine) || /^#{1,6}\s+/u.test(nextLine)) {
        break;
      }

      if (nextLine.trim()) {
        valueLines.push(nextLine.trim());
      }
    }

    return valueLines.join('\n').trim();
  }

  return '';
}

export function isSubstantiveAcknowledgement(value) {
  const normalized = String(value ?? '')
    .replace(/[`*_~]/gu, '')
    .replace(/^\s*[-*]\s+/gmu, '')
    .trim()
    .replace(/[.,;:!?]+$/u, '');

  return (
    Boolean(normalized) &&
    normalized.length >= 12 &&
    !PLACEHOLDER_PATTERN.test(normalized) &&
    !QUALIFIED_PLACEHOLDER_PATTERN.test(normalized)
  );
}

async function readAcknowledgementFromEvent(eventPath) {
  if (!eventPath) {
    return '';
  }

  try {
    const event = JSON.parse(await readFile(eventPath, 'utf8'));
    const candidates = [event.pull_request?.body, event.head_commit?.message];

    for (const candidate of candidates) {
      const acknowledgement = extractDocsDriftAcknowledgement(candidate ?? '');
      if (acknowledgement) {
        return acknowledgement;
      }
    }

    return '';
  } catch {
    return '';
  }
}

export async function checkDocsDrift(options = {}) {
  const appRoot = path.resolve(options.appRoot ?? process.cwd());
  const brainRoot = path.resolve(options.brainRoot ?? path.join(appRoot, '..', 'optc-team-builder-brain'));
  const map = options.map ?? (await loadDocsDriftMap({ appRoot, mapPath: options.mapPath ?? DEFAULT_MAP_PATH }));
  const mapErrors = await validateDocsDriftMap(map, { appRoot, brainRoot, appOnly: options.appOnly });
  const errors = [...mapErrors];
  let appChangedFiles = options.changedFiles ? uniqueSorted(options.changedFiles) : [];
  let brainChangedFiles = options.brainChangedFiles ? uniqueSorted(options.brainChangedFiles) : [];

  if (!options.changedFiles) {
    const appDiff = getChangedFiles({ baseRef: options.baseRef, headRef: options.headRef, cwd: appRoot, execFile: options.execFile });
    appChangedFiles = appDiff.changedFiles;
    if (appDiff.error) {
      errors.push(`app diff: ${appDiff.error}`);
    }
  }

  if (!options.appOnly && !options.brainChangedFiles && (await pathExists(brainRoot))) {
    const brainDiff = getSiblingBrainChangedFiles({ brainRoot, execFile: options.execFile });
    brainChangedFiles = brainDiff.changedFiles;
    if (brainDiff.error) {
      errors.push(`brain diff: ${brainDiff.error}`);
    }
  }

  const changedFiles = uniqueSorted([...appChangedFiles, ...brainChangedFiles]);
  const acknowledgement =
    options.acknowledgement ??
    (extractDocsDriftAcknowledgement(options.prBody ?? '') ||
      (await readAcknowledgementFromEvent(options.eventPath ?? process.env.GITHUB_EVENT_PATH)));
  const hasAcknowledgement = isSubstantiveAcknowledgement(acknowledgement);
  const findings = [];

  if (errors.length === 0) {
    for (const entry of map.entries) {
      const featureChanged = entryHasChangedPath(entry, changedFiles, 'featurePaths', map.entries);
      const docsChanged = entryHasChangedPath(entry, changedFiles, 'docsPaths', map.entries);

      if (featureChanged && !docsChanged) {
        findings.push({
          id: entry.id,
          name: entry.name,
          owner: entry.owner,
          featurePaths: entry.featurePaths,
          docsPaths: entry.docsPaths,
          changedFeatureFiles: changedFiles.filter((changedFile) =>
            entry.featurePaths.some((mappedPath) =>
              pathMatchesPattern(
                changedFile,
                mappedPath,
                map.entries.flatMap((candidate) => (Array.isArray(candidate.featurePaths) ? candidate.featurePaths : [])),
              ),
            ),
          ),
        });
      }
    }
  }

  return {
    appRoot,
    brainRoot,
    appOnly: Boolean(options.appOnly),
    checkedEntries: Array.isArray(map.entries) ? map.entries.length : 0,
    changedFiles,
    acknowledgement,
    hasAcknowledgement,
    errors,
    findings,
    ok: errors.length === 0 && (findings.length === 0 || hasAcknowledgement),
  };
}

export function formatDocsDriftResult(result) {
  const lines = [];

  if (result.errors.length > 0) {
    lines.push(`[docs:drift] found ${result.errors.length} configuration issue(s):`);
    for (const error of result.errors) {
      lines.push(`- ${error}`);
    }
    return lines.join('\n');
  }

  if (result.findings.length === 0) {
    lines.push(
      `[docs:drift] checked ${result.checkedEntries} mapped feature/workflow entries; no likely stale docs drift found.`,
    );
    return lines.join('\n');
  }

  lines.push(`[docs:drift] found ${result.findings.length} mapped feature/workflow change(s) without matching docs changes:`);
  for (const finding of result.findings) {
    lines.push(`- ${finding.id}: ${finding.name}`);
    lines.push(`  changed: ${finding.changedFeatureFiles.join(', ')}`);
    lines.push(`  update one of: ${finding.docsPaths.join(', ')}`);
  }

  if (result.hasAcknowledgement) {
    lines.push('[docs:drift] accepted PR acknowledgement for intentional no-doc changes.');
  } else {
    lines.push('[docs:drift] add a mapped docs update or a substantive `Docs drift acknowledgement:` PR-body field.');
  }

  return lines.join('\n');
}

export function parseArgs(argv) {
  const options = {};

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (['--app-root', '--brain-root', '--map', '--base-ref', '--head-ref', '--event-path'].includes(arg)) {
      const value = argv[index + 1];
      if (!value || value.startsWith('--')) {
        throw new Error(`${arg} requires a value.`);
      }
      const key = arg
        .slice(2)
        .replace(/-([a-z])/gu, (_, letter) => letter.toUpperCase())
        .replace(/^map$/u, 'mapPath');
      options[key] = value;
      index += 1;
      continue;
    }

    if (arg.startsWith('--app-root=')) {
      options.appRoot = arg.slice('--app-root='.length);
      continue;
    }

    if (arg.startsWith('--brain-root=')) {
      options.brainRoot = arg.slice('--brain-root='.length);
      continue;
    }

    if (arg.startsWith('--map=')) {
      options.mapPath = arg.slice('--map='.length);
      continue;
    }

    if (arg.startsWith('--base-ref=')) {
      options.baseRef = arg.slice('--base-ref='.length);
      continue;
    }

    if (arg.startsWith('--head-ref=')) {
      options.headRef = arg.slice('--head-ref='.length);
      continue;
    }

    if (arg.startsWith('--event-path=')) {
      options.eventPath = arg.slice('--event-path='.length);
      continue;
    }

    if (arg === '--app-only') {
      options.appOnly = true;
      continue;
    }

    if (arg === '--help' || arg === '-h') {
      options.help = true;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return options;
}

function usage() {
  return `Usage: node scripts/check-docs-drift.mjs --base-ref <ref> --head-ref <ref> [--brain-root <path>] [--app-only]`;
}

export async function runCli(args = process.argv.slice(2), io = console) {
  const options = parseArgs(args);

  if (options.help) {
    io.log(usage());
    return 0;
  }

  const result = await checkDocsDrift(options);
  const output = formatDocsDriftResult(result);

  if (!result.ok) {
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
      console.error(`[docs:drift] ${error instanceof Error ? error.message : String(error)}`);
      process.exitCode = 1;
    });
}
