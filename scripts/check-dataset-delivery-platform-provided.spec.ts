import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { inspectShippedDataFiles } from './check-dataset-delivery.mjs';

/**
 * 869f4kxrm. One name the app reads is created by the PACKAGER, not by this build.
 *
 * `cap sync` copies `optc-seed.sqlite.gz` into the Android assets, and AAPT unpacks a `.gz` asset
 * and strips the extension when it builds the APK. So `optc-seed.sqlite` exists inside the APK and
 * nowhere else, and the app asks for it only after the `.gz` name 404s - which happens only there.
 *
 * The exemption has to be narrow, because the rule it bends is the one that catches a file the app
 * reads and the build forgot. These tests pin BOTH halves: the exempt name is silent, and a
 * genuinely missing file is still reported even while the exempt one is present.
 */
let tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs) {
    rmSync(dir, { recursive: true, force: true });
  }

  tempDirs = [];
});

function distWith(files: string[]): string {
  const root = mkdtempSync(path.join(os.tmpdir(), 'optc-delivery-'));
  tempDirs.push(root);
  const dataDir = path.join(root, 'assets', 'data');
  mkdirSync(dataDir, { recursive: true });

  for (const file of files) {
    writeFileSync(path.join(dataDir, file), 'x');
  }

  return root;
}

function missingFindings(distDir: string, runtimeDataFiles: Set<string>): string[] {
  const { findings } = inspectShippedDataFiles({ distDir, runtimeDataFiles });

  return findings
    .filter((finding: { kind: string }) => finding.kind === 'missing-runtime-data-file')
    .map((finding: { detail: string }) => finding.detail);
}

describe('a data file the packager creates rather than the build', () => {
  it('does not report the AAPT-unpacked database as missing from the web build', () => {
    const distDir = distWith(['optc-seed.sqlite.gz']);

    expect(missingFindings(distDir, new Set(['optc-seed.sqlite']))).toEqual([]);
  });

  it('still reports a file that is genuinely missing', () => {
    /*
     * The negative control. Without it this would pass for an exemption that silenced the whole
     * check, which is the one outcome that would make the guard worthless.
     */
    const distDir = distWith(['optc-seed.sqlite.gz']);

    expect(missingFindings(distDir, new Set(['optc-nothing-builds-this.json']))).toEqual([
      'the app reads assets/data/optc-nothing-builds-this.json, and the build does not contain it',
    ]);
  });

  it('reports only the real one when both are read', () => {
    /*
     * The exemption is by NAME, not a mode the first match switches on: a genuinely missing file
     * next to the exempt one must still be named, and named alone.
     */
    const distDir = distWith(['optc-seed.sqlite.gz']);
    const findings = missingFindings(
      distDir,
      new Set(['optc-seed.sqlite', 'optc-nothing-builds-this.json']),
    );

    expect(findings).toHaveLength(1);
    expect(findings[0]).toContain('optc-nothing-builds-this.json');
    expect(findings[0]).not.toContain('optc-seed.sqlite,');
  });
});
