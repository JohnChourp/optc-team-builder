import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { checkReleaseWhatsNewReady } from './check-release-whats-new-ready.mjs';

/*
 * 869f127cq. The gate exists to refuse a CODE release with no entry BEFORE anything is bumped,
 * committed or tagged - and to leave the unattended data-only chain exactly as it was, because a
 * release dying mid-bump at 12:21 UTC is worse than the red lane this replaces.
 */

let tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.map((dir) => rm(dir, { recursive: true, force: true })));
  tempDirs = [];
});

async function makeAppRoot(versions: string[]): Promise<string> {
  const appRoot = await mkdtemp(path.join(os.tmpdir(), 'optc-whats-new-gate-'));
  tempDirs.push(appRoot);
  await mkdir(path.join(appRoot, 'src/app/core/data'), { recursive: true });
  const entries = versions
    .map((version) => `  {\n    version: '${version}',\n    date: '2026-09-13',\n  },`)
    .join('\n');
  await writeFile(
    path.join(appRoot, 'src/app/core/data/whats-new.data.ts'),
    `export const WHATS_NEW_ENTRIES = [\n${entries}\n];\n`,
    'utf8',
  );

  return appRoot;
}

const codeRelease = () => 3;
const dataOnlyRelease = () => 0;
const unknown = () => null;

describe('checkReleaseWhatsNewReady', () => {
  it('passes when the version is already described', async () => {
    const appRoot = await makeAppRoot(['0.4.21', '0.4.20']);

    expect(
      checkReleaseWhatsNewReady({ appRoot, version: '0.4.21', countCommits: codeRelease }),
    ).toMatchObject({ ok: true, reason: 'already-described' });
  });

  it('REFUSES a code release whose version has no entry', async () => {
    const appRoot = await makeAppRoot(['0.4.20']);
    const result = checkReleaseWhatsNewReady({
      appRoot,
      version: '0.4.21',
      previousTag: 'v0.4.20',
      countCommits: codeRelease,
    });

    expect(result.ok).toBe(false);
    expect(result.reason).toBe('missing-entry');
    expect(result.message).toContain('0.4.21 has no What’s New entry'.replace('’', "'"));
    expect(result.message).toContain('src/app/core/data/whats-new.data.ts');
    expect(result.message).toContain('3 commit(s) landed since v0.4.20');
    // The whole point of moving it earlier.
    expect(result.message).toContain('BEFORE the version bump');
  });

  it('lets the unattended data-only release through, so the generator can write its entry', async () => {
    const appRoot = await makeAppRoot(['0.4.20']);

    expect(
      checkReleaseWhatsNewReady({
        appRoot,
        version: '0.4.21',
        previousTag: 'v0.4.20',
        countCommits: dataOnlyRelease,
      }),
    ).toMatchObject({ ok: true, reason: 'data-only' });
  });

  it('treats an unanswerable commit count as data-only rather than blocking the release', async () => {
    // No previous tag, or a shallow clone. Blocking on an unanswerable question would make this
    // gate the thing that breaks releases; the post-bump lane still catches a missing entry.
    const appRoot = await makeAppRoot(['0.4.20']);

    expect(
      checkReleaseWhatsNewReady({ appRoot, version: '0.4.21', countCommits: unknown }),
    ).toMatchObject({ ok: true, reason: 'data-only' });
  });

  it('refuses a version that is not X.Y.Z', async () => {
    const appRoot = await makeAppRoot(['0.4.20']);

    expect(checkReleaseWhatsNewReady({ appRoot, version: 'v0.4.21' })).toMatchObject({
      ok: false,
      reason: 'bad-version',
    });
  });

  it('refuses when the data file is missing entirely', async () => {
    const appRoot = await mkdtemp(path.join(os.tmpdir(), 'optc-whats-new-gate-empty-'));
    tempDirs.push(appRoot);

    expect(checkReleaseWhatsNewReady({ appRoot, version: '0.4.21' })).toMatchObject({
      ok: false,
      reason: 'missing-data-file',
    });
  });

  it('does not match a different version by prefix', async () => {
    // '0.4.2' must not be satisfied by the entry for '0.4.20'.
    const appRoot = await makeAppRoot(['0.4.20']);

    expect(
      checkReleaseWhatsNewReady({
        appRoot,
        version: '0.4.2',
        previousTag: 'v0.4.1',
        countCommits: codeRelease,
      }),
    ).toMatchObject({ ok: false, reason: 'missing-entry' });
  });
});
