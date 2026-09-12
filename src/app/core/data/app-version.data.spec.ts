import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { APP_VERSION } from './app-version.data';

describe('APP_VERSION', () => {
  it('is the version package.json ships', () => {
    const packageVersion = (
      JSON.parse(readFileSync(resolve(process.cwd(), 'package.json'), 'utf8')) as {
        version: string;
      }
    ).version;

    expect(APP_VERSION).toBe(packageVersion);
  });

  it('stays in the shape bump-version.sh rewrites', () => {
    // The bump rewrites this with a regex. If the literal stops being a plain
    // single-quoted semver on its own line, the rewrite silently does nothing
    // and this constant freezes at whatever it last said.
    const source = readFileSync(
      resolve(process.cwd(), 'src/app/core/data/app-version.data.ts'),
      'utf8',
    );

    expect(source).toMatch(/^export const APP_VERSION = '\d+\.\d+\.\d+';$/mu);
    expect(APP_VERSION).toMatch(/^\d+\.\d+\.\d+$/u);
  });
});
