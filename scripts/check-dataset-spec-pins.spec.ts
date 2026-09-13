import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  collectPins,
  formatDatasetSpecPinResult,
  inspectDatasetSpecPins,
  readShippedCharacterNames,
} from './check-dataset-spec-pins.mjs';

/*
 * 869f127dr. The dataset only moves at release, so a spec that repeats a dataset value goes red on
 * `main` after the release regenerates it - never on the branch that changed the importer. These
 * drive the two shapes that actually exist in this repository, measured before the guard was
 * written: 357 pinned ids and 550 `#id Name` titles, with zero name assertions.
 */

let tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.map((dir) => rm(dir, { recursive: true, force: true })));
  tempDirs = [];
});

const SEED = [
  "INSERT INTO characters (id, name) VALUES (1, 'Monkey D. Luffy', 0);",
  "INSERT INTO characters (id, name) VALUES (2, 'Roronoa Zoro', 0);",
  "INSERT INTO characters (id, name) VALUES (3, 'Nami''s Log', 0);",
].join('\n');

async function makeAppRoot(specSource: string, seed = SEED): Promise<string> {
  const appRoot = await mkdtemp(path.join(os.tmpdir(), 'optc-spec-pins-'));
  tempDirs.push(appRoot);
  await mkdir(path.join(appRoot, 'public/assets/data'), { recursive: true });
  await mkdir(path.join(appRoot, 'src'), { recursive: true });
  await writeFile(path.join(appRoot, 'public/assets/data/optc-seed.sql'), seed, 'utf8');
  await writeFile(path.join(appRoot, 'src/example.spec.ts'), specSource, 'utf8');

  return appRoot;
}

describe('readShippedCharacterNames', () => {
  it('reads names out of the seed, unescaping doubled quotes', async () => {
    const appRoot = await makeAppRoot('');
    const names = readShippedCharacterNames(appRoot);

    expect(names.get(1)).toBe('Monkey D. Luffy');
    expect(names.get(3)).toBe("Nami's Log");
  });

  it('returns nothing when the dataset is absent, rather than throwing', async () => {
    const appRoot = await mkdtemp(path.join(os.tmpdir(), 'optc-spec-pins-empty-'));
    tempDirs.push(appRoot);

    expect(readShippedCharacterNames(appRoot).size).toBe(0);
  });
});

describe('collectPins', () => {
  it('finds every loaded character id, de-duplicated and ordered', () => {
    const { recordIds } = collectPins(
      'loadGeneratedCharacterRecord(7); loadGeneratedCharacterRecord( 2 ); loadGeneratedCharacterRecord(7);',
    );

    expect(recordIds).toEqual([2, 7]);
  });

  it('reads a name out of a test title', () => {
    const { titlePins } = collectPins("it('keeps #1 Monkey D. Luffy as both leaders', () => {});");

    expect(titlePins).toEqual([{ id: 1, name: 'Monkey D. Luffy' }]);
  });

  it('ignores a bare number with no name after it', () => {
    expect(collectPins("it('covers slot #4', () => {});").titlePins).toEqual([]);
  });

  it('ignores a hash outside a test title', () => {
    expect(collectPins('// see PR #123 Something Else').titlePins).toEqual([]);
  });
});

describe('inspectDatasetSpecPins', () => {
  it('passes when every pin resolves', async () => {
    const appRoot = await makeAppRoot(
      ["it('keeps #1 Monkey D. Luffy as a leader', () => {", '  loadGeneratedCharacterRecord(1);', '});'].join('\n'),
    );
    const result = inspectDatasetSpecPins({ appRoot });

    expect(result.ok).toBe(true);
    expect(result.checkedPins).toBe(2);
    expect(formatDatasetSpecPinResult(result)).toContain('resolved 2 pin(s)');
  });

  it('FAILS on a pinned id the dataset no longer has - the release-day throw, caught by name', async () => {
    const appRoot = await makeAppRoot(
      ["it('keeps #9999 Someone as a leader', () => {", '  loadGeneratedCharacterRecord(9999);', '});'].join('\n'),
    );
    const result = inspectDatasetSpecPins({ appRoot });

    expect(result.ok).toBe(false);
    expect(result.findings[0]).toMatchObject({ kind: 'missing-character', id: 9999 });
    expect(formatDatasetSpecPinResult(result)).toContain('no longer has');
  });

  it('FAILS on a title whose name the dataset disagrees with - the silent lie', async () => {
    // Nothing asserts a character name anywhere in this repository, so before this guard a renamed
    // character left 550 titles describing someone the dataset no longer calls that, and no lane
    // ever said so.
    const appRoot = await makeAppRoot(
      ["it('keeps #2 Monkey D. Luffy as a leader', () => {", '  loadGeneratedCharacterRecord(2);', '});'].join('\n'),
    );
    const result = inspectDatasetSpecPins({ appRoot });

    expect(result.ok).toBe(false);
    expect(result.findings[0]).toMatchObject({
      kind: 'stale-name',
      id: 2,
      expected: 'Roronoa Zoro',
      actual: 'Monkey D. Luffy',
    });
  });

  it('accepts a title that carries a prefix of the real name', async () => {
    // Titles shorten a long dataset name; that is not drift, and failing it would make the guard
    // demand the full string in every title instead of catching the case it exists for.
    const appRoot = await makeAppRoot(
      ["it('keeps #1 Monkey D. as a leader', () => {", '  loadGeneratedCharacterRecord(1);', '});'].join('\n'),
    );

    expect(inspectDatasetSpecPins({ appRoot }).ok).toBe(true);
  });

  it('ignores a title id the file never loads', async () => {
    const appRoot = await makeAppRoot("it('covers #4321 Something Else in prose', () => {});");

    expect(inspectDatasetSpecPins({ appRoot }).ok).toBe(true);
  });

  it('fails loudly when the dataset itself cannot be read', async () => {
    const appRoot = await mkdtemp(path.join(os.tmpdir(), 'optc-spec-pins-nodata-'));
    tempDirs.push(appRoot);
    await mkdir(path.join(appRoot, 'src'), { recursive: true });

    const result = inspectDatasetSpecPins({ appRoot });

    expect(result.ok).toBe(false);
    expect(result.findings[0]!.kind).toBe('missing-dataset');
  });

  it('keeps the real repository resolving', () => {
    // The subject. Red here means a pin drifted from the dataset - which is the release-day
    // failure, surfaced where it can still be fixed.
    const result = inspectDatasetSpecPins({ appRoot: process.cwd() });

    expect(formatDatasetSpecPinResult(result)).toContain('resolved');
    expect(result.ok).toBe(true);
    // Guard against the guard silently checking nothing, which is how this would rot.
    expect(result.checkedPins).toBeGreaterThan(100);
  });
});
