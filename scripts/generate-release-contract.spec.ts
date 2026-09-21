import { readFileSync } from 'node:fs';

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
