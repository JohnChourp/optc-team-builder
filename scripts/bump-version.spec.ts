import { execFile } from 'node:child_process';
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

import { afterEach, describe, expect, it } from 'vitest';

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
  await mkdir(path.join(root, 'ios/App/App.xcodeproj'), { recursive: true });
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
  await writeFile(
    path.join(root, 'ios/App/App.xcodeproj/project.pbxproj'),
    `CURRENT_PROJECT_VERSION = ${versionCode};\nMARKETING_VERSION = ${version};\n`,
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

  it('rewrites the web app\'s own APP_VERSION alongside package.json and the two native projects', async () => {
    const root = await makeWorkspace('0.4.16', 420);

    await execFileAsync('bash', [path.join(root, 'scripts/bump-version.sh'), '--bump', 'patch'], {
      cwd: root,
    });

    const read = async (file: string) => readFile(path.join(root, file), 'utf8');

    expect(JSON.parse(await read('package.json')).version).toBe('0.4.17');
    expect(await read('android/app/build.gradle')).toContain('versionName "0.4.17"');
    expect(await read('ios/App/App.xcodeproj/project.pbxproj')).toContain(
      'MARKETING_VERSION = 0.4.17;',
    );
    // Without this the Settings card would keep naming the previous release.
    expect(await read(APP_VERSION_TS)).toContain("export const APP_VERSION = '0.4.17';");
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
});
