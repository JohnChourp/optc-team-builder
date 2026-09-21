import { execFile } from 'node:child_process';
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';

import { afterEach, describe, expect, it } from 'vitest';

import { VERSION_FIELD_RULES } from './lib/release-contract.mjs';

const execFileAsync = promisify(execFile);
const scriptPath = path.resolve(process.cwd(), 'scripts/bump-version.sh');

let tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.map((dir) => rm(dir, { recursive: true, force: true })));
  tempDirs = [];
});

const APP_VERSION_TS = 'src/app/core/data/app-version.data.ts';

/**
 * The script resolves its targets from its own location, so the workspace has to
 * mirror the real tree: scripts/, android/app/build.gradle, the iOS pbxproj, and
 * the web app's own APP_VERSION constant.
 */
async function makeWorkspace(
  version: string,
  versionCode = 42,
  appVersionSource = `export const APP_VERSION = '${version}';\n`,
) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'optc-bump-version-'));
  tempDirs.push(root);

  await mkdir(path.join(root, 'scripts'), { recursive: true });
  await mkdir(path.join(root, 'android/app'), { recursive: true });
  await mkdir(path.join(root, 'src/app/core/data'), { recursive: true });

  await copyFile(scriptPath, path.join(root, 'scripts/bump-version.sh'));

  await writeFile(
    path.join(root, 'package.json'),
    `${JSON.stringify({ name: 'bump-version-fixture', version }, null, 2)}\n`,
  );
  await writeFile(
    path.join(root, 'android/app/build.gradle'),
    `versionCode ${versionCode}\nversionName "${version}"\n`,
  );
  await writeFile(path.join(root, APP_VERSION_TS), appVersionSource);

  return root;
}

async function nextVersion(current: string, bump: 'patch' | 'minor' | 'major') {
  const root = await makeWorkspace(current);
  const { stdout } = await execFileAsync(
    'bash',
    [path.join(root, 'scripts/bump-version.sh'), '--bump', bump, '--print-only'],
    { cwd: root },
  );

  return stdout.match(/^VERSION=(.+)$/m)?.[1];
}

describe('bump-version.sh', () => {
  it('increments the patch normally below the segment cap', async () => {
    await expect(nextVersion('0.0.98', 'patch')).resolves.toBe('0.0.99');
    await expect(nextVersion('0.1.0', 'patch')).resolves.toBe('0.1.1');
    await expect(nextVersion('1.2.3', 'patch')).resolves.toBe('1.2.4');
  });

  it('rolls a patch bump at 99 into the minor instead of producing 0.0.100', async () => {
    // The case that shipped v0.0.100: releases keep two-digit segments, so the
    // next release after 0.0.99 is 0.1.0.
    await expect(nextVersion('0.0.99', 'patch')).resolves.toBe('0.1.0');
    await expect(nextVersion('1.4.99', 'patch')).resolves.toBe('1.5.0');
  });

  it('recovers a version that already ran past the cap', async () => {
    await expect(nextVersion('0.0.100', 'patch')).resolves.toBe('0.1.0');
  });

  it('rolls a patch bump into the major when the minor is also at 99', async () => {
    await expect(nextVersion('0.99.99', 'patch')).resolves.toBe('1.0.0');
  });

  /*
   * The cap was enforced on patch and minor and not on major, which is not an
   * oversight - there is no segment above the major to roll INTO. A patch at 99
   * rolls into the minor and a minor at 99 rolls into the major precisely
   * because somewhere higher exists to absorb it, and above the major nothing
   * does.
   *
   * So the rule "no segment ever reaches three digits" is enforced by refusing.
   * At 99 a major bump needs a decision about the version scheme, not a silent
   * three-digit version - and refusing is what makes the rule true at EVERY
   * segment rather than at two of the three.
   */
  it('refuses a major bump that would produce a three-digit segment', async () => {
    const root = await makeWorkspace('99.4.6');

    await expect(
      execFileAsync(
        'bash',
        [path.join(root, 'scripts/bump-version.sh'), '--bump', 'major', '--print-only'],
        { cwd: root },
      ),
    ).rejects.toThrow(/two-digit segments/u);
  });

  it('still allows a major bump below the cap', async () => {
    await expect(nextVersion('0.4.6', 'major')).resolves.toBe('1.0.0');
    await expect(nextVersion('98.4.6', 'major')).resolves.toBe('99.0.0');
  });

  it('rolls a minor bump at 99 into the major', async () => {
    await expect(nextVersion('0.99.5', 'minor')).resolves.toBe('1.0.0');
    await expect(nextVersion('0.99.99', 'minor')).resolves.toBe('1.0.0');
  });

  it('increments the minor normally below the cap and clears the patch', async () => {
    await expect(nextVersion('0.0.99', 'minor')).resolves.toBe('0.1.0');
    await expect(nextVersion('1.2.3', 'minor')).resolves.toBe('1.3.0');
  });

  it('always clears the lower segments on a major bump', async () => {
    await expect(nextVersion('0.0.99', 'major')).resolves.toBe('1.0.0');
    await expect(nextVersion('0.99.99', 'major')).resolves.toBe('1.0.0');
    await expect(nextVersion('1.2.3', 'major')).resolves.toBe('2.0.0');
  });

  it('rewrites the web app\'s own APP_VERSION alongside package.json and the Android project', async () => {
    const root = await makeWorkspace('0.4.16', 420);

    await execFileAsync('bash', [path.join(root, 'scripts/bump-version.sh'), '--bump', 'patch'], {
      cwd: root,
    });

    const read = async (file: string) => readFile(path.join(root, file), 'utf8');

    expect(JSON.parse(await read('package.json')).version).toBe('0.4.17');
    expect(await read('android/app/build.gradle')).toContain('versionName "0.4.17"');
    // Without this the Settings card would keep naming the previous release.
    expect(await read(APP_VERSION_TS)).toContain("export const APP_VERSION = '0.4.17';");
  });

  it('bumps cleanly in a workspace with no ios/ directory at all', async () => {
    // 869f13c92. This is the case that used to abort the release MID-BUMP: the
    // pbxproj was read unguarded, AFTER package.json and build.gradle had been
    // written, under `set -euo pipefail`. The fixture above no longer creates an
    // Xcode project, so this asserts the absence is now simply uneventful - and
    // that every other file still moved, which is what makes it a real control
    // rather than a test that the script did nothing.
    const root = await makeWorkspace('0.4.16', 420);

    await expect(
      execFileAsync('bash', [path.join(root, 'scripts/bump-version.sh'), '--bump', 'patch'], {
        cwd: root,
      }),
    ).resolves.toBeTruthy();

    expect(existsSync(path.join(root, 'ios'))).toBe(false);
    expect(JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8')).version).toBe('0.4.17');
    expect(await readFile(path.join(root, 'android/app/build.gradle'), 'utf8')).toContain(
      'versionCode 421',
    );
    expect(await readFile(path.join(root, APP_VERSION_TS), 'utf8')).toContain(
      "export const APP_VERSION = '0.4.17';",
    );
  });

  it('keeps the rest of the APP_VERSION file intact', async () => {
    const root = await makeWorkspace(
      '0.4.16',
      420,
      `/** Doc comment worth keeping. */\nexport const APP_VERSION = '0.4.16';\nexport const OTHER = 1;\n`,
    );

    await execFileAsync('bash', [path.join(root, 'scripts/bump-version.sh'), '--bump', 'patch'], {
      cwd: root,
    });

    const source = await readFile(path.join(root, APP_VERSION_TS), 'utf8');

    expect(source).toContain('/** Doc comment worth keeping. */');
    expect(source).toContain("export const APP_VERSION = '0.4.17';");
    expect(source).toContain('export const OTHER = 1;');
  });

  it('fails the bump when the APP_VERSION constant cannot be found', async () => {
    // A silent no-op here is the bad outcome: the release would ship with the
    // previous version printed in Settings and nothing would say so.
    const root = await makeWorkspace('0.4.16', 420, 'export const APP_VERSION = version;\n');

    await expect(
      execFileAsync('bash', [path.join(root, 'scripts/bump-version.sh'), '--bump', 'patch'], {
        cwd: root,
      }),
    ).rejects.toThrow(/Failed to locate the APP_VERSION constant/u);
  });

  it('leaves an explicit version untouched, cap or no cap', async () => {
    const root = await makeWorkspace('0.0.99');
    const { stdout } = await execFileAsync(
      'bash',
      [path.join(root, 'scripts/bump-version.sh'), '--version', '3.4.100', '--print-only'],
      { cwd: root },
    );

    expect(stdout.match(/^VERSION=(.+)$/m)?.[1]).toBe('3.4.100');
  });

  /*
   * 869f13d7b. The segment cap above is OUR rule and refusing is a choice. This
   * one is Android's: an install is accepted as an upgrade only when the incoming
   * versionCode is strictly greater than the installed one, so a code that fails
   * to increase makes every installed app refuse the release - silently, with no
   * error anywhere in the pipeline. The symptom looks exactly like a broken
   * updater, which is where it would be debugged.
   *
   * Each case runs --print-only so the assertion is about the refusal itself and
   * not about a half-written tree.
   */
  const bumpWithCode = async (root: string, code: string) =>
    execFileAsync(
      'bash',
      [path.join(root, 'scripts/bump-version.sh'), '--bump', 'patch', '--code', code, '--print-only'],
      { cwd: root },
    );

  it('refuses an explicit --code that goes backwards', async () => {
    const root = await makeWorkspace('0.5.6', 199);

    await expect(bumpWithCode(root, '5')).rejects.toThrow(/does not increase versionCode 199/u);
  });

  it('refuses an explicit --code equal to the current one', async () => {
    // Equal is the more likely mistake than backwards - a re-run of a release, or
    // a code copied from the version that is already out - and Android rejects it
    // for the same reason, so the boundary is `<=` and not `<`.
    const root = await makeWorkspace('0.5.6', 199);

    await expect(bumpWithCode(root, '199')).rejects.toThrow(/does not increase versionCode 199/u);
  });

  it('accepts an explicit --code that increases, including a jump', async () => {
    const root = await makeWorkspace('0.5.6', 199);

    const { stdout } = await bumpWithCode(root, '250');

    expect(stdout.match(/^CODE=(.+)$/m)?.[1]).toBe('250');
  });

  it('still increments by one when no --code is given', async () => {
    // The default path was always monotonic by construction; the guard must not
    // have changed it. Without this the two refusals above would also pass
    // against a script that refused every --code.
    const root = await makeWorkspace('0.5.6', 199);

    const { stdout } = await execFileAsync(
      'bash',
      [path.join(root, 'scripts/bump-version.sh'), '--bump', 'patch', '--print-only'],
      { cwd: root },
    );

    expect(stdout.match(/^CODE=(.+)$/m)?.[1]).toBe('200');
  });
});

/*
 * 869f13d7j. The bump is now tested against the RECORD rather than against four separately
 * hand-written expectations - which is the task's "Done when", and the reason it exists:
 * `FAQ.md` described eight version keys across five files and nothing re-derived it, so it
 * stayed wrong for days after `ios/` was dropped.
 *
 * `docs/release-contract.json` is generated by MEASURING a fixture bump. These assertions
 * close the loop from the other side: the script must move every field the record names,
 * and the record must name no field the script leaves alone.
 */
describe('bump-version.sh against docs/release-contract.json', () => {
  const RECORDED = Object.keys(VERSION_FIELD_RULES);

  it('moves every field the record names, and only those', async () => {
    const root = await makeWorkspace('0.4.16', 420);

    await execFileAsync('bash', [path.join(root, 'scripts/bump-version.sh'), '--bump', 'patch'], {
      cwd: root,
    });

    const moved: string[] = [];

    for (const id of RECORDED) {
      const [file, key] = [id.slice(0, id.lastIndexOf(':')), id.slice(id.lastIndexOf(':') + 1)];

      // package-lock.json is not part of this fixture: `npm version` writes it, and the
      // fixture has no lockfile to write. Its rule is covered by the generator's own spec.
      if (file === 'package-lock.json') {
        moved.push(id);
        continue;
      }

      const text = await readFile(path.join(root, file), 'utf8');
      if (text.includes('0.4.17') || (key === 'versionCode' && text.includes('421'))) {
        moved.push(id);
      }
    }

    expect(moved.sort()).toEqual([...RECORDED].sort());
  });

  it('gives every recorded field the four columns a reader needs', () => {
    // A row with no `breaksWhen` is the shape that makes an inventory decorative.
    for (const [id, rules] of Object.entries(VERSION_FIELD_RULES)) {
      for (const column of ['rule', 'enforcedBy', 'consumer', 'breaksWhen'] as const) {
        expect(rules[column], `${id}.${column}`).toBeTruthy();
      }
    }
  });
});
