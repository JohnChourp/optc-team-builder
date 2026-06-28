#!/usr/bin/env node
import { readFileSync } from 'node:fs';

const REQUIRED_FIELDS = ['ClickUp task', 'Evidence', 'Verification'];
const OPTC_CLICKUP_WORKSPACE_ID = '90121749478';
const CLICKUP_URL_PATTERN = /https:\/\/app\.clickup\.com\/t\/[^\s<>)]+/g;
const PLACEHOLDER_PATTERN =
  /^(?:todo|tbd|n\/a|na|none|not applicable|pending|to be added|add later|link later|fill in|fixme|xxx|[-_.\s]+)$/i;
const QUALIFIED_PLACEHOLDER_PATTERN =
  /\b(?:todo|tbd|n\/a|none|not applicable|pending|to be added|add later|link later|fill in|fixme|xxx)\b/i;

function readEvent() {
  const eventPath = process.env.GITHUB_EVENT_PATH;

  if (!eventPath) {
    throw new Error('GITHUB_EVENT_PATH is not set.');
  }

  return JSON.parse(readFileSync(eventPath, 'utf8'));
}

function isBotUser(user = {}) {
  const login = String(user.login ?? '').toLowerCase();
  const type = String(user.type ?? '').toLowerCase();

  return type === 'bot' || login.endsWith('[bot]') || login === 'dependabot' || login.startsWith('github-actions');
}

function fieldLinePattern(label) {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`^\\s*(?:[-*]\\s*)?(?:\\*\\*)?${escaped}(?:\\*\\*)?\\s*:\\s*(.*)$`, 'i');
}

function startsAnyRequiredField(line) {
  return REQUIRED_FIELDS.some((label) => fieldLinePattern(label).test(line));
}

function extractField(body, label) {
  const lines = String(body ?? '').split(/\r?\n/);
  const startPattern = fieldLinePattern(label);

  for (let index = 0; index < lines.length; index += 1) {
    const match = lines[index].match(startPattern);

    if (!match) {
      continue;
    }

    const valueLines = [match[1].trim()];

    for (let nextIndex = index + 1; nextIndex < lines.length; nextIndex += 1) {
      const nextLine = lines[nextIndex];

      if (startsAnyRequiredField(nextLine) || /^#{1,6}\s+/.test(nextLine)) {
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

function stripMarkdown(value) {
  return String(value ?? '')
    .replace(/[`*_~]/g, '')
    .replace(/^\s*[-*]\s+/gm, '')
    .trim();
}

function isPlaceholder(value) {
  const stripped = stripMarkdown(value).replace(/^<((?:https?:\/\/|\/)[^>]+)>$/, '$1');

  if (!stripped || /^<[^>]+>$/.test(stripped)) {
    return true;
  }

  return PLACEHOLDER_PATTERN.test(stripped) || QUALIFIED_PLACEHOLDER_PATTERN.test(stripped);
}

function hasNonClickUpSentinel(value) {
  const stripped = stripMarkdown(value);
  const match = stripped.match(/^none\s*[-:]\s*(.+)$/i);
  const reason = match?.[1]?.trim() ?? '';

  return Boolean(reason) && !/^<[^>]+>$/.test(reason) && !QUALIFIED_PLACEHOLDER_PATTERN.test(reason);
}

function validateClickUpUrl(rawUrl) {
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
    if (segments[1] === OPTC_CLICKUP_WORKSPACE_ID || /^\d+$/.test(segments[1])) {
      return false;
    }

    return /^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(segments[1]);
  }

  if (segments.length === 3) {
    return segments[1] === OPTC_CLICKUP_WORKSPACE_ID && /^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(segments[2]);
  }

  return false;
}

function hasValidClickUpReference(value) {
  for (const match of String(value ?? '').matchAll(CLICKUP_URL_PATTERN)) {
    const candidate = match[0].replace(/[.,;:!?]+$/, '');

    if (validateClickUpUrl(candidate)) {
      return true;
    }
  }

  return false;
}

function validateTraceability(pr) {
  const body = pr.body ?? '';
  const clickupTask = extractField(body, 'ClickUp task');
  const evidence = extractField(body, 'Evidence');
  const verification = extractField(body, 'Verification');
  const failures = [];

  if (!hasValidClickUpReference(clickupTask) && !hasNonClickUpSentinel(clickupTask)) {
    failures.push(
      `ClickUp task must include a https://app.clickup.com/t/${OPTC_CLICKUP_WORKSPACE_ID}/... URL, a https://app.clickup.com/t/... custom task URL, or "none - <reason>".`,
    );
  }

  if (isPlaceholder(evidence)) {
    failures.push('Evidence must name a durable audit, artifact, PR, CI run, or verification location.');
  }

  if (isPlaceholder(verification)) {
    failures.push('Verification must list concrete commands, CI checks, or review gates.');
  }

  return failures;
}

function main() {
  const event = readEvent();
  const pr = event.pull_request;

  if (!pr) {
    console.log('No pull_request payload found; skipping traceability check.');
    return;
  }

  if (isBotUser(pr.user)) {
    console.log(`Skipping traceability check for bot-authored PR by ${pr.user?.login ?? 'unknown bot'}.`);
    return;
  }

  const failures = validateTraceability(pr);

  if (failures.length > 0) {
    console.error('PR traceability check failed:');
    for (const failure of failures) {
      console.error(`- ${failure}`);
    }
    process.exit(1);
  }

  console.log('PR traceability check passed.');
}

main();
