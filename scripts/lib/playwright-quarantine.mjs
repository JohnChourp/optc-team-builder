import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

export const QUARANTINE_SCHEMA_VERSION = 1;
export const VALID_QUARANTINE_MODES = new Set(['off', 'exclude', 'only']);
export const VALID_QUARANTINE_BROWSERS = new Set(['chromium', 'firefox', 'webkit']);
export const QUARANTINE_TAG_PATTERN = /^@quarantined:[a-z0-9][a-z0-9-]*$/u;

const QUARANTINE_TAG_SCAN_PATTERN = /@quarantined:[a-z0-9][a-z0-9-]*/gu;

export function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}

export function buildQuarantineGrep(tags) {
  const uniqueTags = [...new Set(tags)].sort();
  return uniqueTags.length > 0 ? uniqueTags.map(escapeRegExp).join('|') : '';
}

export async function loadQuarantineConfig(options = {}) {
  const appRoot = path.resolve(options.appRoot ?? process.cwd());
  const configPath = path.resolve(appRoot, options.configPath ?? path.join('e2e', 'quarantine.json'));
  const scanDir = path.resolve(appRoot, options.scanDir ?? 'e2e');
  const rawConfig = JSON.parse(await readFile(configPath, 'utf8'));
  const specTags = options.validateTags === false ? new Set() : await collectQuarantineTags(scanDir);
  const result = validateQuarantineConfig(rawConfig, {
    specTags,
    requireRegisteredTagsInSpecs: options.requireRegisteredTagsInSpecs ?? true,
  });

  return {
    ...result,
    appRoot,
    configPath,
    scanDir,
    grep: buildQuarantineGrep(result.tags),
    specTags,
  };
}

export function validateQuarantineConfig(rawConfig, options = {}) {
  const failures = [];

  if (!rawConfig || typeof rawConfig !== 'object' || Array.isArray(rawConfig)) {
    failures.push('Quarantine config must be a JSON object.');
    return { config: rawConfig, entries: [], tags: [], failures };
  }

  if (rawConfig.schemaVersion !== QUARANTINE_SCHEMA_VERSION) {
    failures.push(`schemaVersion must be ${QUARANTINE_SCHEMA_VERSION}.`);
  }

  if (!Array.isArray(rawConfig.entries)) {
    failures.push('entries must be an array.');
  }

  const entries = Array.isArray(rawConfig.entries) ? rawConfig.entries : [];
  const tags = [];
  const seenTags = new Set();

  for (const [index, entry] of entries.entries()) {
    const prefix = `entries[${index}]`;

    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      failures.push(`${prefix} must be an object.`);
      continue;
    }

    const tag = entry.tag;
    if (typeof tag !== 'string' || !QUARANTINE_TAG_PATTERN.test(tag)) {
      failures.push(`${prefix}.tag must match ${QUARANTINE_TAG_PATTERN}.`);
    } else {
      tags.push(tag);

      if (seenTags.has(tag)) {
        failures.push(`${prefix}.tag duplicates ${tag}.`);
      }

      seenTags.add(tag);
    }

    validateRequiredString(entry, 'reason', prefix, failures);
    validateRequiredString(entry, 'trackingUrl', prefix, failures);
    validateRequiredString(entry, 'firstSeenAt', prefix, failures);
    validateRequiredString(entry, 'firstSeenEvidence', prefix, failures);
    validateRequiredString(entry, 'owner', prefix, failures);
    validateRequiredString(entry, 'restorationCriteria', prefix, failures);

    if (typeof entry.firstSeenAt === 'string' && !/^\d{4}-\d{2}-\d{2}$/u.test(entry.firstSeenAt)) {
      failures.push(`${prefix}.firstSeenAt must use YYYY-MM-DD.`);
    }

    if (typeof entry.trackingUrl === 'string' && !isAllowedTrackingUrl(entry.trackingUrl)) {
      failures.push(`${prefix}.trackingUrl must be a ClickUp or GitHub issue/PR URL.`);
    }

    if (!Array.isArray(entry.browsers) || entry.browsers.length === 0) {
      failures.push(`${prefix}.browsers must be a non-empty array.`);
    } else {
      for (const browser of entry.browsers) {
        if (!VALID_QUARANTINE_BROWSERS.has(browser)) {
          failures.push(`${prefix}.browsers contains unsupported browser: ${browser}.`);
        }
      }
    }
  }

  const specTags = options.specTags instanceof Set ? options.specTags : new Set();

  for (const specTag of specTags) {
    if (!seenTags.has(specTag)) {
      failures.push(`Spec tag ${specTag} is missing from e2e/quarantine.json.`);
    }
  }

  if (options.requireRegisteredTagsInSpecs !== false) {
    for (const tag of seenTags) {
      if (!specTags.has(tag)) {
        failures.push(`Quarantine tag ${tag} is registered but not present in an e2e spec title.`);
      }
    }
  }

  return {
    config: rawConfig,
    entries,
    tags: [...seenTags].sort(),
    failures,
  };
}

export async function collectQuarantineTags(rootDir) {
  const tags = new Set();
  const files = await collectSpecFiles(rootDir);

  for (const filePath of files) {
    const content = await readFile(filePath, 'utf8');

    for (const match of content.matchAll(QUARANTINE_TAG_SCAN_PATTERN)) {
      tags.add(match[0]);
    }
  }

  return tags;
}

async function collectSpecFiles(rootDir) {
  const files = [];

  let entries;
  try {
    entries = await readdir(rootDir, { withFileTypes: true });
  } catch {
    return files;
  }

  for (const entry of entries) {
    const entryPath = path.join(rootDir, entry.name);

    if (entry.isDirectory()) {
      files.push(...(await collectSpecFiles(entryPath)));
      continue;
    }

    if (entry.isFile() && /\.spec\.ts$/u.test(entry.name)) {
      files.push(entryPath);
    }
  }

  return files;
}

function validateRequiredString(entry, key, prefix, failures) {
  if (typeof entry[key] !== 'string' || !entry[key].trim()) {
    failures.push(`${prefix}.${key} must be a non-empty string.`);
  }
}

function isAllowedTrackingUrl(rawUrl) {
  let parsed;

  try {
    parsed = new URL(rawUrl);
  } catch {
    return false;
  }

  if (parsed.origin === 'https://app.clickup.com' && /^\/t\/(?:90121749478\/)?[A-Za-z0-9][A-Za-z0-9_-]*$/u.test(parsed.pathname)) {
    return true;
  }

  return parsed.origin === 'https://github.com' && /^\/[^/]+\/[^/]+\/(?:issues|pull)\/\d+$/u.test(parsed.pathname);
}
