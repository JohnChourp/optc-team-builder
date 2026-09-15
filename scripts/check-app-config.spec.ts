import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { ALLOWED_APP_CONFIG_KEYS, checkAppConfigSource } from './check-app-config.mjs';

const ROOT = resolve(import.meta.dirname, '..');
const read = (relativePath: string): string => readFileSync(resolve(ROOT, relativePath), 'utf8');

describe('app-config allowlist', () => {
  /**
   * 869f13287. Three files name the same key set and they are edited at different times: the
   * generator, the example, and this guard. The example was already one key behind the generator
   * when this landed - it documented four of the five, missing `googleDriveBackendUrl` - so the
   * agreement is asserted rather than assumed.
   */
  it('matches the keys the generator actually writes', () => {
    const generator = read('scripts/write-app-config.mjs');
    const written = generator
      .slice(generator.indexOf('window.__appConfig = ${JSON.stringify('))
      .slice(0, 400);

    for (const key of Object.keys(ALLOWED_APP_CONFIG_KEYS)) {
      expect(written, `generator does not write ${key}`).toContain(key);
    }
  });

  it('matches the keys the example documents', () => {
    const example = read('public/app-config.example.js');
    const documented = [...example.matchAll(/^\s{2}([A-Za-z][\w$]*):/gmu)].map(
      (match) => match[1],
    );

    expect(documented.sort()).toEqual(Object.keys(ALLOWED_APP_CONFIG_KEYS).sort());
  });
});

describe('checkAppConfigSource', () => {
  it('accepts a file carrying only allowlisted keys', () => {
    expect(checkAppConfigSource(read('scripts/fixtures/app-config/valid.js'))).toEqual([]);
  });

  it('refuses a key nobody declared', () => {
    const errors = checkAppConfigSource(read('scripts/fixtures/app-config/unexpected-key.js'));

    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('driveServiceAccount');
  });

  it('refuses a secret smuggled inside an allowlisted key', () => {
    const errors = checkAppConfigSource(read('scripts/fixtures/app-config/secret-shaped-value.js'));

    expect(errors.join(' ')).toContain('google-oauth-client-secret');
  });

  it('refuses a file with no config assignment at all', () => {
    expect(checkAppConfigSource('console.log("hello");').join(' ')).toContain(
      'no `window.__appConfig',
    );
  });

  it.each([
    ['AIzaSyAbCdEfGhIjKlMnOpQrStUvWxYz0123456', 'google-api-key'],
    ['ghp_abcdefghijklmnopqrstuvwxyz0123456789', 'github-token'],
    ['AKIAIOSFODNN7EXAMPLE', 'aws-access-key-id'],
  ])('refuses %s as %s', (value, patternId) => {
    const source = `window.__appConfig = { "googleDriveFolderName": "${value}" };`;

    expect(checkAppConfigSource(source).join(' ')).toContain(patternId);
  });
});
