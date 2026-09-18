import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { ALLOWED_APP_CONFIG_KEYS, checkAppConfigSource } from './check-app-config.mjs';
import { SECRET_FIXTURES } from './lib/secret-fixture.mjs';

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

  /*
   * 869f33bru. The value is assembled at runtime rather than kept in a fixture file: a fixture of
   * this shape is itself a secret-shaped literal in the repository, which is what GitHub secret
   * scanning alert #1 was.
   */
  it('refuses a secret smuggled inside an allowlisted key', () => {
    const source = `window.__appConfig = { "ga4MeasurementId": "G-TEST123", "googleDriveFolderName": "${SECRET_FIXTURES['google-oauth-client-secret']()}" };`;
    const errors = checkAppConfigSource(source);

    expect(errors.join(' ')).toContain('google-oauth-client-secret');
  });

  it('refuses a file with no config assignment at all', () => {
    expect(checkAppConfigSource('console.log("hello");').join(' ')).toContain(
      'no `window.__appConfig',
    );
  });

  /*
   * 869f33bru. These three used to be literals, and the first of them - a fake Google API key - is
   * GitHub secret scanning alert #1. They are assembled at runtime now, so no file carries one.
   */
  it.each(['google-api-key', 'github-token', 'aws-access-key-id'] as const)('refuses a %s', (patternId) => {
    const value = SECRET_FIXTURES[patternId]();
    const source = `window.__appConfig = { "googleDriveFolderName": "${value}" };`;

    expect(checkAppConfigSource(source).join(' ')).toContain(patternId);
  });
});
