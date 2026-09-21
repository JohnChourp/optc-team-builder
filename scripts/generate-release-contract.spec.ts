import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  AUTOMATIC_OUTPUT_SIGNATURES,
  MANUAL_OUTPUTS,
  VERSION_FIELD_RULES,
  buildVersionFields,
  checkReleaseContract,
} from './lib/release-contract.mjs';
import { buildReleaseContract, measureVersionFields } from './generate-release-contract.mjs';

/*
 * 869f13d7j / 869f13d7n. The record's value is that it is MEASURED. These tests exist to
 * stop it quietly becoming a hand-written list again, which is exactly how `FAQ.md` came
 * to state "eight version keys across five files" and stay wrong for days after `ios/`
 * was dropped.
 */
describe('release contract - the measured half', () => {
  const measured = measureVersionFields();

  it('discovers the version fields by bumping a fixture, not from a list', () => {
    const ids = measured.map(({ file, key }) => `${file}:${key}`).sort();

    expect(ids).toEqual([
      'android/app/build.gradle:versionCode',
      'android/app/build.gradle:versionName',
      'package-lock.json:version',
      'package.json:version',
      'src/app/core/data/app-version.data.ts:APP_VERSION',
    ]);
  });

  it('counts package-lock.json twice, because it mirrors the version in two places', () => {
    // The count is the part a hand-written record always gets wrong.
    const lock = measured.find((f) => f.file === 'package-lock.json');

    expect(lock?.valueSites).toBe(2);
    expect(measured.reduce((total, f) => total + f.valueSites, 0)).toBe(6);
  });

  it('records no iOS field, because the platform was dropped', () => {
    // The concrete claim FAQ.md got wrong: the four extra sites were the Xcode project's
    // Debug and Release copies of MARKETING_VERSION and CURRENT_PROJECT_VERSION.
    expect(measured.some((f) => /ios|pbxproj|MARKETING/iu.test(f.file))).toBe(false);
  });
});

describe('release contract - the guard', () => {
  const sources = {
    'scripts/release-and-tag.sh': readFileSync('scripts/release-and-tag.sh', 'utf8'),
    '.github/workflows/release-android.yml': readFileSync('.github/workflows/release-android.yml', 'utf8'),
  };

  it('passes on the real tree', () => {
    expect(checkReleaseContract(buildReleaseContract(), sources)).toEqual([]);
  });

  it('fails when a field moves with no recorded rule', () => {
    // The real fields stay in the fixture, so the ONE extra problem is the new field and
    // not the five "this field is gone" messages a bare fixture would also produce.
    const contract = {
      versionFields: buildVersionFields([
        ...measureVersionFields(),
        { file: 'some/new-file.txt', key: 'version', valueSites: 1 },
      ]),
      automaticOutputs: [],
      manualOutputs: [],
    };

    expect(checkReleaseContract(contract, sources)).toEqual([
      expect.stringContaining('some/new-file.txt:version moves on a release and has no recorded rule'),
    ]);
  });

  it('fails when a recorded field has stopped moving', () => {
    // The ios/ case, in the direction nobody checked: the record kept describing a field
    // that no longer existed.
    const contract = { versionFields: [], automaticOutputs: [], manualOutputs: [] };
    const problems = checkReleaseContract(contract, sources);

    expect(problems.length).toBe(Object.keys(VERSION_FIELD_RULES).length);
    expect(problems[0]).toContain('a bump no longer moves it');
  });

  it('fails when an artifact stops being produced by the step that made it', () => {
    const contract = {
      versionFields: buildVersionFields(measureVersionFields()),
      automaticOutputs: [{ id: 'signed-apk', producer: 'scripts/release-and-tag.sh', signature: 'assembleDebug', what: 'x' }],
      manualOutputs: [],
    };

    expect(checkReleaseContract(contract, sources)).toEqual([
      expect.stringContaining('is recorded as produced by scripts/release-and-tag.sh'),
    ]);
  });

  it('names a producer it could not read rather than passing quietly', () => {
    const contract = {
      versionFields: buildVersionFields(measureVersionFields()),
      automaticOutputs: [{ id: 'ghost', producer: 'scripts/not-a-file.sh', signature: 'x', what: 'x' }],
      manualOutputs: [],
    };

    expect(checkReleaseContract(contract, sources)).toEqual([
      expect.stringContaining('which was not read'),
    ]);
  });
});

describe('release contract - the manual half is the point', () => {
  it('distinguishes a manual step that is detected from one that is not', () => {
    // These two rows are why the inventory exists. Forgetting the What's New entry turns a
    // lane red AFTER the bump; forgetting the release-body paragraph is caught by nothing.
    const whatsNew = MANUAL_OUTPUTS.find((o) => o.id === 'whats-new-entry');
    const body = MANUAL_OUTPUTS.find((o) => o.id === 'github-release-body-summary');

    expect(whatsNew?.detectedBy).toContain('whats-new lane');
    expect(body?.detectedBy).toContain('nothing at all');
  });

  it('keeps every automatic output pointed at a producer this repo has', () => {
    const producers = new Set(AUTOMATIC_OUTPUT_SIGNATURES.map((o) => o.producer));

    expect([...producers].sort()).toEqual([
      '.github/workflows/release-android.yml',
      'scripts/release-and-tag.sh',
    ]);
  });
});

/*
 * 869f13d5t. The install explanation, on the page where the install happens.
 *
 * `/supported` already answers this in EN and EL - for somebody who HAS the app. This is
 * for somebody who does not: they arrive at a GitHub Release, see a generated commit list,
 * and are asked to allow installation from an unknown source.
 *
 * These run the real function out of the real script, so the assertions are about what a
 * release body will actually contain rather than about a copy of the text.
 */
describe('the release body explains the install', () => {
  const body = (() => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'optc-release-notes-'));
    const runner = path.join(dir, 'run.sh');
    const out = path.join(dir, 'notes.md');
    const script = readFileSync('scripts/release-and-tag.sh', 'utf8');

    // Lift the two functions out and call them; sourcing the whole script would run a release.
    const fns = [
      script.slice(script.indexOf('install_preamble() {'), script.indexOf('\n}\n', script.indexOf('install_preamble() {')) + 3),
      script.slice(script.indexOf('generate_release_notes() {'), script.indexOf('\n}\n', script.indexOf('generate_release_notes() {')) + 3),
    ].join('\n');

    writeFileSync(runner, `set -euo pipefail\n${fns}\ngenerate_release_notes "9.9.9" "999" "" "${out}"\n`);
    execFileSync('bash', [runner], { cwd: process.cwd() });

    return readFileSync(out, 'utf8');
  })();

  it('answers what it is, why the warning appears, and what it asks for - in both languages', () => {
    for (const heading of ['## Before you install', '## \u03a0\u03c1\u03b9\u03bd \u03c4\u03b7\u03bd \u03b5\u03b3\u03ba\u03b1\u03c4\u03ac\u03c3\u03c4\u03b1\u03c3\u03b7']) {
      expect(body).toContain(heading);
    }

    expect(body).toMatch(/not made by, endorsed by, or connected to Bandai Namco/u);
    expect(body).toMatch(/unknown source/u);
    expect(body).toMatch(/two permissions/u);
    expect(body).toMatch(/shasum -a 256/u);
  });

  it('puts the explanation ABOVE the commit list, where it will be read', () => {
    expect(body.indexOf('## Before you install')).toBeGreaterThan(-1);
    expect(body.indexOf('## Before you install')).toBeLessThan(body.indexOf('## Commits'));
  });

  /*
   * The task said it in as many words: "Do not overclaim safety. The honest statement is
   * 'here is what it does and how to check it', not 'it is safe'." A stranger's APK is
   * exactly where that distinction earns its keep, so it is asserted rather than trusted.
   */
  it('never claims the app is safe, and says what the checksum does not prove', () => {
    /*
     * Scoped to the preamble, and the SLICE IS GUARDED. Two things went wrong here before
     * this comment existed, and both are the repository's own recorded traps:
     *
     *   - a blanket ban on "is safe" fails the one sentence that MUST exist - "it does
     *     not, and cannot, tell you the app is safe";
     *   - unscoped, the split scooped the whole commit list, where `safe` appears in
     *     subjects like "Add safe import/share diagnostics". A negative assertion over the
     *     wrong region is worse than none.
     */
    const from = body.indexOf('## Before you install');
    const to = body.indexOf('## Commits');

    expect(from, 'the preamble slice must exist').toBeGreaterThan(-1);
    expect(to, 'the commit list must exist').toBeGreaterThan(from);

    const preamble = body.slice(from, to);
    expect(preamble.length, 'a slice that misses makes every check below trivially pass').toBeGreaterThan(800);

    const safetySentences = preamble
      .replace(/\s+/gu, ' ')
      .split(/(?<=[.;!?])\s+/u)
      .filter((sentence) => /\bsafe\b|\u03b1\u03c3\u03c6\u03b1\u03bb/iu.test(sentence));

    expect(safetySentences.length, 'the preamble must address safety at all').toBeGreaterThan(0);

    for (const sentence of safetySentences) {
      expect(sentence, 'an affirmative safety claim').toMatch(
        /\b(?:not|cannot|never)\b|\u03b4\u03b5\u03bd/iu,
      );
    }

    expect(preamble).not.toMatch(/\b(?:perfectly|completely|totally) safe\b/iu);
    expect(preamble).not.toMatch(/\btrust(?:ed|worthy)\b/iu);

    // The honest half has to be PRESENT, in both languages, not merely unobjectionable.
    expect(preamble).toMatch(/cannot, tell you the app is safe/u);
    expect(preamble).toMatch(/\u03b4\u03b5\u03bd \u03bc\u03c0\u03bf\u03c1\u03b5\u03af \u03bd\u03b1 \u03c3\u03bf\u03c5/u);
  });

  it('respects the warning instead of talking the reader past it', () => {
    // "click through the warning" would be the wrong advice to ever ship here.
    expect(body).not.toMatch(/just (?:click|tap|press|allow|accept|ignore)/iu);
    expect(body).toMatch(/doing its job/u);
  });
});
