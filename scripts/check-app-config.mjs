#!/usr/bin/env node
/**
 * 869f13287. Guards what `public/app-config.js` may contain before it is published.
 *
 * The file is gitignored, written at deploy time, and served to every visitor at
 * https://optcteambuilder.com/app-config.js with its own ngsw freshness group. That combination -
 * invisible to code review, machine-written, publicly served - is exactly where a key eventually
 * lands by accident, and nothing checked it until 2026-09-15.
 *
 * `write-app-config.mjs` already validates each value it writes, so a secret cannot arrive through
 * the generator. This check covers what the generator does not: a hand-edited file, a stale file
 * left over from an experiment, or a key someone adds to the generator without adding it here.
 *
 * Usage:
 *   node ./scripts/check-app-config.mjs                 # checks public/app-config.js
 *   node ./scripts/check-app-config.mjs --file <path>   # checks one file, used by the spec
 */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/**
 * The complete set of keys the published config may carry, and what each is for.
 *
 * Every one of these is public by design - a GA4 measurement id and an OAuth *client* id are
 * meant to be visible in a browser. That is the whole point of the allowlist: the file may hold
 * public identifiers and nothing else, so anything unrecognised is refused rather than reasoned
 * about. Adding a key here is a deliberate act that shows up in review, unlike adding one to a
 * gitignored file.
 *
 * Keep in step with `scripts/write-app-config.mjs` and `public/app-config.example.js`; the spec
 * asserts all three agree.
 */
export const ALLOWED_APP_CONFIG_KEYS = Object.freeze({
  ga4MeasurementId: 'Google Analytics 4 measurement id, public by design.',
  googleDriveBackendUrl: 'Origin of the optional Drive sync backend. Empty when undeployed.',
  googleDriveFolderName: 'Display name of the Drive folder backups are written to.',
  googleIosClientId: 'Google OAuth client id for iOS. A client id, never a secret.',
  googleWebClientId: 'Google OAuth client id for the web. A client id, never a secret.',
});

/**
 * Shapes that must never appear in a published file, whatever key carries them.
 *
 * The allowlist alone would already refuse an unknown key; these catch the worse case of a secret
 * arriving inside an ALLOWED key - someone pasting a service-account JSON into
 * `googleDriveFolderName` because it was the only free-text field.
 */
const SECRET_PATTERNS = [
  { id: 'google-oauth-client-secret', pattern: /GOCSPX-[A-Za-z0-9_-]{10,}/u },
  { id: 'google-api-key', pattern: /AIza[0-9A-Za-z_-]{30,}/u },
  { id: 'private-key-block', pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----/u },
  { id: 'github-token', pattern: /gh[pousr]_[A-Za-z0-9]{20,}/u },
  { id: 'aws-access-key-id', pattern: /\bAKIA[0-9A-Z]{16}\b/u },
  { id: 'slack-token', pattern: /\bxox[abprs]-[A-Za-z0-9-]{10,}/u },
  { id: 'bearer-jwt', pattern: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\./u },
  { id: 'secret-shaped-key-name', pattern: /"?(?:[A-Za-z]*(?:secret|password|passwd|privateKey|apiKey|accessToken|refreshToken|clientSecret))"?\s*:/iu },
];

export function checkAppConfigSource(source, { label = 'app-config.js' } = {}) {
  const errors = [];
  const match = source.match(/window\.__appConfig\s*=\s*(\{[\s\S]*?\})\s*;/u);

  if (!match) {
    errors.push(`${label}: no \`window.__appConfig = { ... };\` assignment found.`);
    return errors;
  }

  let parsed;

  try {
    // The generator writes strict JSON inside the braces. A file that is not parseable as JSON is
    // hand-written, which is itself the thing worth refusing.
    parsed = JSON.parse(match[1].replace(/([{,]\s*)([A-Za-z_$][\w$]*)\s*:/gu, '$1"$2":'));
  } catch (error) {
    errors.push(
      `${label}: the config object is not plain JSON (${error instanceof Error ? error.message : String(error)}).`,
    );
    return errors;
  }

  for (const key of Object.keys(parsed)) {
    if (!Object.hasOwn(ALLOWED_APP_CONFIG_KEYS, key)) {
      errors.push(
        `${label}: key "${key}" is not in the allowlist. Add it to ALLOWED_APP_CONFIG_KEYS, scripts/write-app-config.mjs and public/app-config.example.js, or remove it.`,
      );
    }
  }

  for (const { id, pattern } of SECRET_PATTERNS) {
    if (pattern.test(source)) {
      errors.push(`${label}: matches the secret-shaped pattern "${id}". This file is served publicly.`);
    }
  }

  return errors;
}

async function main() {
  const fileIndex = process.argv.indexOf('--file');
  const target =
    fileIndex >= 0 && process.argv[fileIndex + 1]
      ? path.resolve(process.argv[fileIndex + 1])
      : path.join(ROOT_DIR, 'public', 'app-config.js');

  if (!fs.existsSync(target)) {
    console.log(`[app-config] ${target} does not exist - nothing to publish, nothing to check.`);
    return;
  }

  const errors = checkAppConfigSource(fs.readFileSync(target, 'utf8'), {
    label: path.relative(ROOT_DIR, target) || target,
  });

  if (errors.length) {
    console.error('[app-config] refused:');
    for (const error of errors) {
      console.error(`  - ${error}`);
    }
    process.exitCode = 1;
    return;
  }

  console.log(
    `[app-config] OK - ${path.relative(ROOT_DIR, target)} carries only allowlisted keys and no secret-shaped values.`,
  );
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  await main();
}
