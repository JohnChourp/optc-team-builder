#!/usr/bin/env node
import { access, readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const OPTC_CLICKUP_WORKSPACE_ID = '90121749478';
const IGNORE_NEXT_LINE_PATTERN = /<!--\s*docs-integrity-ignore-next-line:\s*(.+?)\s*-->/iu;
const MARKDOWN_LINK_PATTERN = /!?\[[^\]\n]*\]\(([^)\n]+)\)/gu;
const MARKDOWN_REFERENCE_PATTERN = /^\s{0,3}\[[^\]\n]+\]:\s+(\S+)/u;
const CODE_SPAN_PATTERN = /`([^`\n]+)`/gu;
const URL_PATTERN = /\bhttps?:\/\/[^\s<>)"'`]+/giu;
const HEADER_PATTERN = /^\s{0,3}(#{1,6})\s+(.+?)\s*#*\s*$/u;
const HTML_ID_PATTERN = /\bid=["']([^"']+)["']/giu;

const GENERATED_DIRS = new Set([
  '.angular',
  '.git',
  'coverage',
  'dist',
  'live-artifacts',
  'node_modules',
  'perf-artifacts',
  'playwright-report',
  'test-results',
  'tmp-worktrees',
  'www',
]);

const BRAIN_ONLY_IGNORED_DIRS = new Set(['.claude', '.codex']);

const REPO_ROOT_PREFIXES = [
  '.github/',
  'android/',
  'audits/',
  'docs/',
  'e2e/',
  'ios/',
  'public/',
  'scripts/',
  'server/',
  'src/',
];

const ROOT_FILE_NAMES = new Set([
  '.env.example',
  '.node-version',
  '.nvmrc',
  'AGENTS.md',
  'CLAUDE.md',
  'LICENSE',
  'README.md',
  'SECURITY.md',
  'SEO_AUDIT.md',
  'angular.json',
  'capacitor.config.ts',
  'ionic.config.json',
  'knip.json',
  'ngsw-config.json',
  'package-lock.json',
  'package.json',
  'playwright.config.ts',
  'transloco.config.ts',
  'tsconfig.app.json',
  'tsconfig.json',
  'tsconfig.spec.json',
]);

const OPTIONAL_FILE_REFERENCES = new Set(['MEMORY.md', 'CLAUDE_MEMORY.md']);
const GENERATED_FILE_REFERENCES = new Set([
  'android/app/build',
  'android/app/build/',
  'android/app/src/main/assets',
  'android/app/src/main/assets/',
  'ios/App/App/public',
  'ios/App/App/public/',
  'public/app-config.js',
]);

const KNOWN_PUBLIC_PATHS = new Set([
  '',
  'cookies',
  'guides/guided-build-compare-team-sharing',
  'guides/how-to-build-an-optc-team',
  'guides/optc-pirate-rumble-team-building',
  'privacy',
  'robots.txt',
  'sitemap.xml',
  'tabs/account',
  'tabs/auto-team-builder',
  'tabs/auto-team-builder-rumble',
  'tabs/captain-coverage',
  'tabs/characters',
  'tabs/crew-forge',
  'tabs/manual-team-builder',
  'tabs/rumble-characters',
  'terms',
  'tools/optc-auto-team-builder',
  'tools/optc-character-database',
  'tools/optc-rumble-team-builder',
  'tools/optc-team-builder',
]);

export async function checkDocsIntegrity(options = {}) {
  const appRoot = path.resolve(options.appRoot ?? process.cwd());
  const brainRoot = path.resolve(options.brainRoot ?? path.join(appRoot, '..', 'optc-team-builder-brain'));
  const failures = [];
  const docs = await collectMarkdownDocs({ appRoot, brainRoot });
  const docCache = new Map();

  for (const doc of docs) {
    const parsed = await readDoc(doc, docCache);
    const linkTargets = extractMarkdownLinkTargets(parsed);
    const codeSpanTargets = extractCodeSpanTargets(parsed);
    const urlTargets = extractUrlTargets(parsed);

    for (const target of linkTargets) {
      await validateMarkdownTarget({
        target,
        doc,
        parsed,
        appRoot,
        brainRoot,
        docCache,
        failures,
      });
    }

    for (const target of codeSpanTargets) {
      await validateCodeSpanTarget({ target, doc: parsed, appRoot, brainRoot, failures });
    }

    for (const target of urlTargets) {
      validateExternalUrlTarget({ target, doc: parsed, failures });
    }
  }

  return {
    appRoot,
    brainRoot,
    checkedFiles: docs.length,
    failures,
  };
}

async function collectMarkdownDocs({ appRoot, brainRoot }) {
  const docs = [];
  await collectMarkdownUnder(appRoot, appRoot, docs, 'app');
  await collectMarkdownUnder(brainRoot, brainRoot, docs, 'brain');
  docs.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
  return docs;
}

async function collectMarkdownUnder(root, currentDir, docs, repoName) {
  let entries;

  try {
    entries = await readdir(currentDir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    if (GENERATED_DIRS.has(entry.name) || (repoName === 'brain' && BRAIN_ONLY_IGNORED_DIRS.has(entry.name))) {
      continue;
    }

    const absolutePath = path.join(currentDir, entry.name);

    if (entry.isDirectory()) {
      await collectMarkdownUnder(root, absolutePath, docs, repoName);
      continue;
    }

    if (entry.isFile() && entry.name.toLowerCase().endsWith('.md')) {
      docs.push({
        absolutePath,
        repoName,
        repoRoot: root,
        relativePath: normalizePath(path.relative(root, absolutePath)),
      });
    }
  }
}

async function readDoc(doc, docCache) {
  const cached = docCache.get(doc.absolutePath);

  if (cached) {
    return cached;
  }

  const text = await readFile(doc.absolutePath, 'utf8');
  const lines = text.split(/\r?\n/u);
  const ignoredLines = new Set();
  const scanLines = [];
  const anchors = collectAnchors(lines);
  let inFence = false;

  for (let index = 0; index < lines.length; index += 1) {
    const lineNumber = index + 1;
    const line = lines[index];
    const ignoreMatch = line.match(IGNORE_NEXT_LINE_PATTERN);

    if (ignoreMatch?.[1]?.trim()) {
      ignoredLines.add(lineNumber + 1);
    }

    if (/^\s*```/u.test(line)) {
      inFence = !inFence;
      scanLines.push('');
      continue;
    }

    scanLines.push(inFence ? '' : line);
  }

  const parsed = {
    ...doc,
    text,
    lines,
    scanText: scanLines.join('\n'),
    linkScanText: maskInlineCodeSpans(scanLines.join('\n')),
    ignoredLines,
    anchors,
  };
  docCache.set(doc.absolutePath, parsed);
  return parsed;
}

function collectAnchors(lines) {
  const anchors = new Set();
  const slugCounts = new Map();

  for (const line of lines) {
    for (const match of line.matchAll(HTML_ID_PATTERN)) {
      if (match[1]) {
        anchors.add(match[1]);
      }
    }

    const header = line.match(HEADER_PATTERN);

    if (!header) {
      continue;
    }

    const baseSlug = slugifyHeading(header[2] ?? '');
    const count = slugCounts.get(baseSlug) ?? 0;
    const slug = count === 0 ? baseSlug : `${baseSlug}-${count}`;
    slugCounts.set(baseSlug, count + 1);
    anchors.add(slug);
  }

  return anchors;
}

export function slugifyHeading(value) {
  return String(value)
    .replace(/<[^>]+>/gu, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/gu, '$1')
    .replace(/[`*_~]/gu, '')
    .trim()
    .toLowerCase()
    .replace(/[^\p{Letter}\p{Number}\s-]/gu, '')
    .replace(/\s+/gu, '-')
    .replace(/-+/gu, '-')
    .replace(/^-|-$/gu, '');
}

function extractMarkdownLinkTargets(parsed) {
  const targets = [];

  for (const match of parsed.linkScanText.matchAll(MARKDOWN_LINK_PATTERN)) {
    targets.push({
      raw: cleanMarkdownTarget(match[1] ?? ''),
      line: lineNumberAt(parsed.linkScanText, match.index ?? 0),
      kind: 'markdown-link',
    });
  }

  parsed.linkScanText.split('\n').forEach((line, index) => {
    const match = line.match(MARKDOWN_REFERENCE_PATTERN);

    if (match) {
      targets.push({
        raw: cleanMarkdownTarget(match[1] ?? ''),
        line: index + 1,
        kind: 'markdown-reference',
      });
    }
  });

  return targets;
}

function extractCodeSpanTargets(parsed) {
  const targets = [];

  for (const match of parsed.scanText.matchAll(CODE_SPAN_PATTERN)) {
    const raw = normalizeCodeSpan(match[1] ?? '');

    if (!raw || !isFileReferenceCandidate(raw)) {
      continue;
    }

    targets.push({
      raw,
      line: lineNumberAt(parsed.scanText, match.index ?? 0),
      kind: 'code-span',
    });
  }

  return targets;
}

function extractUrlTargets(parsed) {
  const targets = [];

  for (const match of parsed.scanText.matchAll(URL_PATTERN)) {
    targets.push({
      raw: trimTrailingUrlPunctuation(match[0] ?? ''),
      line: lineNumberAt(parsed.scanText, match.index ?? 0),
      kind: 'url',
    });
  }

  return targets;
}

function maskInlineCodeSpans(text) {
  return text
    .split('\n')
    .map((line) => line.replace(/`[^`\n]*`/gu, (match) => ' '.repeat(match.length)))
    .join('\n');
}

async function validateMarkdownTarget({ target, doc, parsed, appRoot, brainRoot, docCache, failures }) {
  if (!target.raw || shouldIgnoreLine(parsed, target.line)) {
    return;
  }

  const parsedTarget = parseTarget(target.raw);

  if (isExternalScheme(parsedTarget.path)) {
    validateExternalUrlTarget({ target, doc, failures });
    return;
  }

  if (!parsedTarget.path && parsedTarget.hash) {
    validateAnchor({ anchor: parsedTarget.hash, targetDoc: parsed, target, doc, failures });
    return;
  }

  if (parsedTarget.path.startsWith('/')) {
    validateAbsoluteRoute({ rawPath: parsedTarget.path, target, doc, failures });
    return;
  }

  const targetPath = resolveMarkdownPath(doc, parsedTarget.path, appRoot, brainRoot);
  const targetExists = await pathExists(targetPath);

  if (!targetExists) {
    addFailure({
      failures,
      doc,
      line: target.line,
      message: `Missing linked file: ${target.raw}`,
    });
    return;
  }

  if (parsedTarget.hash && targetPath.toLowerCase().endsWith('.md')) {
    const targetDoc = await readDoc(
      {
        absolutePath: targetPath,
        repoName: repoNameForPath(targetPath, appRoot, brainRoot),
        repoRoot: targetPath.startsWith(brainRoot) ? brainRoot : appRoot,
        relativePath: normalizePath(path.relative(targetPath.startsWith(brainRoot) ? brainRoot : appRoot, targetPath)),
      },
      docCache,
    );
    validateAnchor({ anchor: parsedTarget.hash, targetDoc, target, doc, failures });
  }
}

async function validateCodeSpanTarget({ target, doc, appRoot, brainRoot, failures }) {
  if (shouldIgnoreLineForDoc(doc, target.line)) {
    return;
  }

  if (isLiveArtifactReference(target.raw)) {
    if (!isValidLiveArtifactReference(target.raw)) {
      addFailure({
        failures,
        doc,
        line: target.line,
        message: `Live artifact path must use live-artifacts/<task-id>/...: ${target.raw}`,
      });
    }

    return;
  }

  if (isExternalScheme(target.raw)) {
    validateExternalUrlTarget({ target, doc, failures });
    return;
  }

  if (OPTIONAL_FILE_REFERENCES.has(target.raw)) {
    return;
  }

  if (GENERATED_FILE_REFERENCES.has(target.raw)) {
    return;
  }

  const resolvedPaths = resolveFileReferenceCandidates(doc, target.raw, appRoot, brainRoot);
  const found = await firstExistingPath(resolvedPaths);

  if (!found) {
    addFailure({
      failures,
      doc,
      line: target.line,
      message: `Missing referenced file: ${target.raw}`,
    });
  }
}

function validateExternalUrlTarget({ target, doc, failures }) {
  if (shouldIgnoreLineForDoc(doc, target.line)) {
    return;
  }

  const raw = trimTrailingUrlPunctuation(target.raw);

  if (raw.startsWith('https://optcteambuilder.com')) {
    validateOptcPublicUrl({ raw, target, doc, failures });
  }

  if (raw.startsWith('https://app.clickup.com/t/')) {
    validateClickUpReference({ raw, target, doc, failures });
  }
}

function validateOptcPublicUrl({ raw, target, doc, failures }) {
  let parsed;

  try {
    parsed = new URL(raw);
  } catch {
    addFailure({ failures, doc, line: target.line, message: `Invalid OPTC public URL: ${raw}` });
    return;
  }

  const publicPath = normalizePublicPath(parsed.pathname);

  if (KNOWN_PUBLIC_PATHS.has(publicPath) || /^characters\/(?:[1-9]\d*|:id)$/u.test(publicPath)) {
    return;
  }

  addFailure({
    failures,
    doc,
    line: target.line,
    message: `Unknown OPTC public URL path: ${raw}`,
  });
}

function validateClickUpReference({ raw, target, doc, failures }) {
  const lineText = doc.lines?.[target.line - 1] ?? '';

  if (lineText.includes('...') && raw === `https://app.clickup.com/t/${OPTC_CLICKUP_WORKSPACE_ID}/`) {
    return;
  }

  if (!isValidClickUpTaskUrl(raw)) {
    addFailure({
      failures,
      doc,
      line: target.line,
      message: `Invalid ClickUp task URL for OPTC workspace: ${raw}`,
    });
  }
}

export function isValidClickUpTaskUrl(rawUrl) {
  let parsed;

  try {
    parsed = new URL(rawUrl);
  } catch {
    return false;
  }

  if (parsed.origin !== 'https://app.clickup.com') {
    return false;
  }

  const segments = parsed.pathname.split('/').filter(Boolean);

  if (segments[0] !== 't') {
    return false;
  }

  if (segments.length === 2) {
    if (segments[1] === OPTC_CLICKUP_WORKSPACE_ID || /^\d+$/u.test(segments[1])) {
      return false;
    }

    return /^[A-Za-z0-9][A-Za-z0-9_-]*$/u.test(segments[1] ?? '');
  }

  if (segments.length === 3) {
    return segments[1] === OPTC_CLICKUP_WORKSPACE_ID && /^[A-Za-z0-9][A-Za-z0-9_-]*$/u.test(segments[2] ?? '');
  }

  return false;
}

function validateAbsoluteRoute({ rawPath, target, doc, failures }) {
  const publicPath = normalizePublicPath(rawPath);

  if (!publicPath || KNOWN_PUBLIC_PATHS.has(publicPath) || /^characters\/(?:[1-9]\d*|:id)$/u.test(publicPath)) {
    return;
  }

  addFailure({
    failures,
    doc,
    line: target.line,
    message: `Unknown absolute app/public path: ${rawPath}`,
  });
}

function validateAnchor({ anchor, targetDoc, target, doc, failures }) {
  const normalizedAnchor = decodeUriFragment(anchor);

  if (targetDoc.anchors.has(normalizedAnchor)) {
    return;
  }

  addFailure({
    failures,
    doc,
    line: target.line,
    message: `Missing Markdown anchor "#${anchor}" in ${targetDoc.relativePath}.`,
  });
}

function cleanMarkdownTarget(rawTarget) {
  let target = String(rawTarget ?? '').trim();

  if (target.startsWith('<')) {
    const closingIndex = target.indexOf('>');

    if (closingIndex !== -1) {
      return target.slice(1, closingIndex);
    }
  }

  const titleMatch = target.match(/^(\S+)\s+["'][\s\S]*["']$/u);

  if (titleMatch) {
    target = titleMatch[1] ?? target;
  }

  return trimTrailingUrlPunctuation(target);
}

function normalizeCodeSpan(rawTarget) {
  return String(rawTarget ?? '')
    .trim()
    .replace(/^(?:File|Path):\s*/iu, '')
    .replace(/:\d+(?::\d+)?$/u, '')
    .replace(/[.,;:!?]+$/u, '');
}

function isFileReferenceCandidate(value) {
  if (!value || value.length > 220) {
    return false;
  }

  if (/[{}*|$\n\r<>]/u.test(value) || /\s/u.test(value)) {
    return false;
  }

  if (/^(?:npm|npx|node|git|curl|if|for|while|export|source)\b/u.test(value)) {
    return false;
  }

  if (/^[A-Z0-9_]+=/u.test(value) || value.startsWith('~')) {
    return false;
  }

  if (isLiveArtifactReference(value) || isExternalScheme(value)) {
    return true;
  }

  if (/^\d+\.md$/u.test(value) || /^completed_\d+\.md$/u.test(value)) {
    return false;
  }

  if (
    value.startsWith('../optc-team-builder/') ||
    value.startsWith('../optc-team-builder-brain/') ||
    value.startsWith('optc-team-builder/') ||
    value.startsWith('optc-team-builder-brain/')
  ) {
    return true;
  }

  if (value.startsWith('./')) {
    return hasKnownFileExtension(value);
  }

  if (REPO_ROOT_PREFIXES.some((prefix) => value.startsWith(prefix))) {
    return true;
  }

  if (ROOT_FILE_NAMES.has(value)) {
    return true;
  }

  return /^[A-Z0-9][A-Z0-9_-]+\.md$/u.test(value);
}

function resolveMarkdownPath(doc, targetPath, appRoot, brainRoot) {
  const value = decodePath(targetPath);

  if (value.startsWith('../optc-team-builder/')) {
    return path.join(appRoot, value.slice('../optc-team-builder/'.length));
  }

  if (value.startsWith('../optc-team-builder-brain/')) {
    return path.join(brainRoot, value.slice('../optc-team-builder-brain/'.length));
  }

  if (value.startsWith('optc-team-builder/')) {
    return path.join(appRoot, value.slice('optc-team-builder/'.length));
  }

  if (value.startsWith('optc-team-builder-brain/')) {
    return path.join(brainRoot, value.slice('optc-team-builder-brain/'.length));
  }

  return path.resolve(path.dirname(doc.absolutePath), value);
}

function resolveFileReferenceCandidates(doc, rawPath, appRoot, brainRoot) {
  const value = decodePath(rawPath);

  if (value.startsWith('../optc-team-builder/')) {
    return [path.join(appRoot, value.slice('../optc-team-builder/'.length))];
  }

  if (value.startsWith('../optc-team-builder-brain/')) {
    return [path.join(brainRoot, value.slice('../optc-team-builder-brain/'.length))];
  }

  if (value.startsWith('optc-team-builder/')) {
    return [path.join(appRoot, value.slice('optc-team-builder/'.length))];
  }

  if (value.startsWith('optc-team-builder-brain/')) {
    return [path.join(brainRoot, value.slice('optc-team-builder-brain/'.length))];
  }

  if (value.startsWith('./') || value.startsWith('../')) {
    return [path.resolve(path.dirname(doc.absolutePath), value)];
  }

  const candidates = [path.resolve(path.dirname(doc.absolutePath), value)];

  if (REPO_ROOT_PREFIXES.some((prefix) => value.startsWith(prefix)) || ROOT_FILE_NAMES.has(value)) {
    candidates.unshift(path.join(doc.repoRoot, value));
  }

  if (/^[^/]+\.md$/iu.test(value)) {
    candidates.unshift(path.join(doc.repoRoot, value));
  }

  if (doc.repoName === 'brain' && appLikelyRootPath(value)) {
    candidates.push(path.join(appRoot, value));
  }

  if (doc.repoName === 'app' && brainLikelyRootPath(value)) {
    candidates.push(path.join(brainRoot, value));
  }

  return [...new Set(candidates)];
}

function appLikelyRootPath(value) {
  return /^(?:android|docs|e2e|ios|public|scripts|server|src|\.github)\//u.test(value) || ROOT_FILE_NAMES.has(value);
}

function brainLikelyRootPath(value) {
  return /^(?:audits|live-artifacts|\.github)\//u.test(value);
}

function parseTarget(rawTarget) {
  const hashIndex = rawTarget.indexOf('#');

  if (hashIndex === -1) {
    return { path: rawTarget, hash: '' };
  }

  return {
    path: rawTarget.slice(0, hashIndex),
    hash: rawTarget.slice(hashIndex + 1),
  };
}

function isExternalScheme(value) {
  return /^(?:https?:|mailto:|tel:|app:)/iu.test(value);
}

function isLiveArtifactReference(value) {
  return value === 'live-artifacts' || value.includes('live-artifacts/');
}

function isValidLiveArtifactReference(value) {
  const normalized = normalizePath(value)
    .replace(/^optc-team-builder-brain\//u, '')
    .replace(/^\.\.\/optc-team-builder-brain\//u, '');

  if (normalized === 'live-artifacts' || normalized === 'live-artifacts/') {
    return true;
  }

  return /^live-artifacts\/[A-Za-z0-9_-]+(?:\/.*)?$/u.test(normalized);
}

function hasKnownFileExtension(value) {
  return /\.(?:css|html|jpeg|jpg|js|json|md|mjs|png|scss|sh|sql|toml|ts|txt|webp|xml|ya?ml)$/iu.test(value);
}

function normalizePublicPath(rawPath) {
  const decoded = decodePath(rawPath);
  return decoded.replace(/^\/+/u, '').replace(/\/+$/u, '');
}

function decodeUriFragment(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function decodePath(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function trimTrailingUrlPunctuation(value) {
  return String(value ?? '').replace(/[.,;:!?`]+$/u, '');
}

function normalizePath(value) {
  return value.split(path.sep).join('/');
}

async function firstExistingPath(paths) {
  for (const candidate of paths) {
    if (await pathExists(candidate)) {
      return candidate;
    }
  }

  return null;
}

async function pathExists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

function repoNameForPath(filePath, appRoot, brainRoot) {
  if (filePath.startsWith(brainRoot)) {
    return 'brain';
  }

  if (filePath.startsWith(appRoot)) {
    return 'app';
  }

  return 'external';
}

function lineNumberAt(text, index) {
  return text.slice(0, index).split('\n').length;
}

function shouldIgnoreLine(parsed, line) {
  return parsed.ignoredLines.has(line);
}

function shouldIgnoreLineForDoc(doc, line) {
  return Boolean(doc.ignoredLines?.has(line));
}

function addFailure({ failures, doc, line, message }) {
  if (shouldIgnoreLineForDoc(doc, line)) {
    return;
  }

  failures.push({
    file: doc.relativePath,
    repo: doc.repoName,
    line,
    message,
  });
}

export function formatFailures(result) {
  if (result.failures.length === 0) {
    return `[docs:integrity] checked ${result.checkedFiles} Markdown files across app and brain docs.`;
  }

  return [
    `[docs:integrity] found ${result.failures.length} docs integrity issue(s):`,
    ...result.failures.map(
      (failure) => `- ${failure.repo}:${failure.file}:${failure.line} - ${failure.message}`,
    ),
  ].join('\n');
}

export function parseArgs(args) {
  const options = {};

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === '--app-root') {
      options.appRoot = args[index + 1];
      index += 1;
      continue;
    }

    if (arg.startsWith('--app-root=')) {
      options.appRoot = arg.slice('--app-root='.length);
      continue;
    }

    if (arg === '--brain-root') {
      options.brainRoot = args[index + 1];
      index += 1;
      continue;
    }

    if (arg.startsWith('--brain-root=')) {
      options.brainRoot = arg.slice('--brain-root='.length);
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return options;
}

export async function runCli(args = process.argv.slice(2), io = console) {
  const result = await checkDocsIntegrity(parseArgs(args));
  const output = formatFailures(result);

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
      console.error(`[docs:integrity] ${error instanceof Error ? error.message : String(error)}`);
      process.exitCode = 1;
    });
}
