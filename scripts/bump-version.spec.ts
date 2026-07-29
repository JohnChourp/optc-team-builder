import { execFile } from 'node:child_process';
import { copyFile, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
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

/**
 * The script resolves its targets from its own location, so the workspace has to
 * mirror the real tree: scripts/, android/app/build.gradle, and the iOS pbxproj.
 */
async function makeWorkspace(version: string, versionCode = 42) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'optc-bump-version-'));
  tempDirs.push(root);

  await mkdir(path.join(root, 'scripts'), { recursive: true });
  await mkdir(path.join(root, 'android/app'), { recursive: true });
  await mkdir(path.join(root, 'ios/App/App.xcodeproj'), { recursive: true });

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
