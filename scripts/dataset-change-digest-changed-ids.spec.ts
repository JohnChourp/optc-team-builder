import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { runCli } from './dataset-change-digest.mjs';
import {
  buildAutoBuilderAbilityCatalog,
  buildManifest,
  buildPreviewPayload,
  createSqlSeed,
  createUnresolvedCatalog,
} from './lib/optc-dataset.mjs';

/**
 * 869f1zxuy. `--changed-ids-output` writes every added, removed and changed character id.
 *
 * The digest keeps counts and at most eight examples of each list, which is right for a reviewer
 * and useless to the release workflow, which submits the page of every added or changed character
 * to IndexNow. So the fixture changes MORE than eight: a file that only repeated the examples would
 * pass a test over eight or fewer.
 */

let tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.map((dir) => rm(dir, { recursive: true, force: true })));
  tempDirs = [];
});

async function makeTempDir() {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'optc-digest-changed-ids-'));
  tempDirs.push(dir);
  return dir;
}

const GENERATED_AT = '2026-07-02T00:00:00.000Z';

function character(id: number, cost: number) {
  return {
    id,
    name: `Fixture ${id}`,
    isIncomplete: false,
    type: 'STR',
    primaryClass: 'Fighter',
    secondaryClass: null,
    classes: ['Fighter'],
    stars: 5,
    starsLabel: '5',
    cost,
    combo: 4,
    minHp: 100,
    minAtk: 100,
    minRcv: 100,
    maxHp: 1000,
    maxAtk: 1000,
    maxRcv: 1000,
    growth: 'Slow',
    captainHpBoost: 1,
    captainAtkBoost: 2,
    captainAverageBoost: 1.5,
    region: { global: true, japan: true },
    regionRelease: { global: null, japan: null },
    assets: { exactLocal: null, thumbnailLocal: null, thumbnailGlobal: null, thumbnailJapan: null },
    searchText: `fixture ${id}`,
    detail: {},
    builderAbilities: [],
  } as unknown as Parameters<typeof createSqlSeed>[0][number];
}

async function writeFixture(dir: string, chars: ReturnType<typeof character>[]) {
  await mkdir(dir, { recursive: true });
  const ships: never[] = [];
  const manifest = buildManifest(chars, ships, '100', [], GENERATED_AT);
  await Promise.all([
    writeFile(path.join(dir, 'optc-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`),
    writeFile(path.join(dir, 'optc-seed.sql'), createSqlSeed(chars, ships, manifest)),
    writeFile(
      path.join(dir, 'optc-auto-builder-abilities.json'),
      `${JSON.stringify(buildAutoBuilderAbilityCatalog(GENERATED_AT, '100', []), null, 2)}\n`,
    ),
    writeFile(path.join(dir, 'optc-preview.json'), `${JSON.stringify(buildPreviewPayload(GENERATED_AT, chars, ships), null, 2)}\n`),
    writeFile(
      path.join(dir, 'optc-unresolved-images.json'),
      `${JSON.stringify(createUnresolvedCatalog(chars, [], '100', GENERATED_AT), null, 2)}\n`,
    ),
  ]);
}

const range = (from: number, count: number) => Array.from({ length: count }, (_, index) => from + index);

/** Ten characters change cost, nine arrive, one leaves, one stays exactly as it was. */
async function writeRange() {
  const baseDir = await makeTempDir();
  const headDir = await makeTempDir();

  await writeFixture(baseDir, [
    ...range(101, 10).map((id) => character(id, 30)),
    character(201, 30),
    character(401, 30),
  ]);
  await writeFixture(headDir, [
    ...range(101, 10).map((id) => character(id, 55)),
    ...range(301, 9).map((id) => character(id, 30)),
    character(401, 30),
  ]);

  return { baseDir, headDir };
}

describe('dataset-change-digest --changed-ids-output', () => {
  it('writes every added, removed and changed id, past the eight examples the digest keeps', async () => {
    const { baseDir, headDir } = await writeRange();
    const outputDir = await makeTempDir();
    const idsPath = path.join(outputDir, 'ids.json');

    const report = await runCli([
      '--base-dir', baseDir,
      '--head-dir', headDir,
      '--output', path.join(outputDir, 'digest.md'),
      '--changed-ids-output', idsPath,
    ]);
    const ids = JSON.parse(await readFile(idsPath, 'utf8'));

    // The control: the digest itself stops at eight, so the file cannot be a copy of it.
    expect(report?.characters.examples.changed).toHaveLength(8);
    expect(ids.characters).toEqual({
      added: range(301, 9),
      removed: [201],
      changed: range(101, 10),
    });
    expect(ids.base).toMatchObject({ ref: null, dir: baseDir });
    expect(ids.head).toMatchObject({ ref: null, dir: headDir });
  });

  it('leaves the digest\'s own markdown and JSON exactly what they were', async () => {
    const { baseDir, headDir } = await writeRange();
    const plainDir = await makeTempDir();
    const withIdsDir = await makeTempDir();
    const outputs = async (dir: string, extra: string[]) => {
      await runCli([
        '--base-dir', baseDir,
        '--head-dir', headDir,
        '--output', path.join(dir, 'digest.md'),
        '--json-output', path.join(dir, 'digest.json'),
        ...extra,
      ]);
      const json = JSON.parse(await readFile(path.join(dir, 'digest.json'), 'utf8'));
      delete json.generatedAt;

      return { markdown: await readFile(path.join(dir, 'digest.md'), 'utf8'), json };
    };

    const plain = await outputs(plainDir, []);
    const withIds = await outputs(withIdsDir, ['--changed-ids-output', path.join(withIdsDir, 'ids.json')]);

    expect(plain.markdown).toContain('Added: 9, removed: 1, changed: 10');
    expect(withIds.markdown).toBe(plain.markdown);
    expect(withIds.json).toEqual(plain.json);

    // Comparing the two runs cannot see a change that reaches both, so the shape is pinned as well.
    expect(Object.keys(plain.json)).toEqual([
      'schemaVersion', 'base', 'head', 'manifest', 'characters', 'ships', 'abilityCatalog', 'preview',
      'unresolvedImages', 'warnings', 'status',
    ]);
    expect(Object.keys(plain.json.characters)).toEqual([
      'addedCount', 'removedCount', 'changedCount', 'captainCoverageChangedCount', 'tierChangedCount',
      'builderAbilitiesChangedCount', 'tagsChangedCount', 'examples',
    ]);
  });
});
