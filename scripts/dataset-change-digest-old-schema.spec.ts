import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { buildDatasetChangeDigest } from './dataset-change-digest.mjs';
import {
  buildAutoBuilderAbilityCatalog,
  buildManifest,
  buildPreviewPayload,
  createSqlSeed,
  createUnresolvedCatalog,
} from './lib/optc-dataset.mjs';

/**
 * A digest compares an OLD ref against a new one, so the base seed carries the schema of its own
 * day. `region_release_json` arrived in v0.4.43; before this fix the projection named it
 * unconditionally and the whole digest died with `no such column: c.region_release_json` against any
 * older base - 869f45n8q work item 3.
 *
 * The base fixture here is a real generated seed with that one column REMOVED, which is what an
 * older tag's seed looks like. The negative control is the head fixture, which keeps it.
 */

let tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.map((dir) => rm(dir, { recursive: true, force: true })));
  tempDirs = [];
});

async function makeTempDir() {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'optc-digest-old-schema-'));
  tempDirs.push(dir);
  return dir;
}

const GENERATED_AT = '2026-07-02T00:00:00.000Z';

function character(id: number, name: string) {
  return {
    id,
    name,
    isIncomplete: false,
    type: 'STR',
    primaryClass: 'Fighter',
    secondaryClass: null,
    classes: ['Fighter'],
    stars: 5,
    starsLabel: '5',
    cost: 30,
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
    searchText: name.toLowerCase(),
    detail: {},
    builderAbilities: [],
  } as unknown as Parameters<typeof createSqlSeed>[0][number];
}

/**
 * Makes the seed produce a database WITHOUT the column, which is what an older tag's seed produces.
 * `ALTER TABLE ... DROP COLUMN` is appended rather than the DDL being rewritten by regex, so the
 * fixture stays a real generated seed and only its final schema differs.
 */
function withoutColumn(seedSql: string, column: string): string {
  return `${seedSql}\nALTER TABLE characters DROP COLUMN ${column};\n`;
}

async function writeFixture(dir: string, chars: ReturnType<typeof character>[], sourceVersion: string, dropColumn?: string) {
  await mkdir(dir, { recursive: true });
  const ships: never[] = [];
  const manifest = buildManifest(chars, ships, sourceVersion, [], GENERATED_AT);
  let seedSql = createSqlSeed(chars, ships, manifest);
  if (dropColumn) {
    seedSql = withoutColumn(seedSql, dropColumn);
  }
  await Promise.all([
    writeFile(path.join(dir, 'optc-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`),
    writeFile(path.join(dir, 'optc-seed.sql'), seedSql),
    writeFile(
      path.join(dir, 'optc-auto-builder-abilities.json'),
      `${JSON.stringify(buildAutoBuilderAbilityCatalog(GENERATED_AT, sourceVersion, []), null, 2)}\n`,
    ),
    writeFile(path.join(dir, 'optc-preview.json'), `${JSON.stringify(buildPreviewPayload(GENERATED_AT, chars, ships), null, 2)}\n`),
    writeFile(
      path.join(dir, 'optc-unresolved-images.json'),
      `${JSON.stringify(createUnresolvedCatalog(chars, [], sourceVersion, GENERATED_AT), null, 2)}\n`,
    ),
  ]);
}

describe('dataset-change-digest against a base older than the current schema', () => {
  it('reads a base seed that has no region_release_json instead of dying on it', async () => {
    const baseDir = await makeTempDir();
    const headDir = await makeTempDir();

    await writeFixture(baseDir, [character(101, 'Monkey D. Luffy')], '100', 'region_release_json');
    await writeFixture(headDir, [character(101, 'Monkey D. Luffy'), character(102, 'Roronoa Zoro')], '101');

    const report = await buildDatasetChangeDigest({ baseDir, headDir, generatedAt: GENERATED_AT });

    expect(report.characters.addedCount).toBe(1);
    expect(report.manifest.sourceVersion).toMatchObject({ base: '100', head: '101' });
  });

  it('still reads a base that HAS the column, so the tolerance did not silence a real read', async () => {
    const baseDir = await makeTempDir();
    const headDir = await makeTempDir();

    await writeFixture(baseDir, [character(101, 'Monkey D. Luffy')], '100');
    await writeFixture(headDir, [character(101, 'Monkey D. Luffy'), character(102, 'Roronoa Zoro')], '101');

    const report = await buildDatasetChangeDigest({ baseDir, headDir, generatedAt: GENERATED_AT });

    expect(report.characters.addedCount).toBe(1);
  });
});
