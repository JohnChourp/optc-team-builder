import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  collectMarkers,
  formatDatasetMeasurementResult,
  inspectDatasetMeasurements,
} from './check-dataset-measurements.mjs';
import {
  buildMeasurementsFile,
  flattenMeasurements,
  measureDataset,
} from './lib/dataset-measurements.mjs';

/*
 * 869f127e9. Three things used to age independently: the dataset, the numbers people quoted from
 * it, and nothing in between. `486` survived for exactly that reason - every copy of it agreed with
 * every other copy. So the checks worth having are the two directions of drift, and both are here.
 */

let tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.map((dir) => rm(dir, { recursive: true, force: true })));
  tempDirs = [];
});

const SEED = [
  "INSERT INTO characters (id, name, is_incomplete, type, primary_class, secondary_class, classes_json)",
  "      VALUES (",
  '        1,',
  "        'Monkey D. Luffy',",
  '        0,',
  "        'STR',",
  "        'Fighter',",
  '        NULL,',
  '        \'["Fighter"]\'',
  '      );',
  "INSERT INTO characters (id, name, is_incomplete, type, primary_class, secondary_class, classes_json)",
  "      VALUES (",
  '        2,',
  "        'Dual Type',",
  '        0,',
  "        'QCK,DEX',",
  "        'Slasher',",
  "        'Striker',",
  '        \'["Slasher","Striker"]\'',
  '      );',
].join('\n');

async function makeAppRoot({
  seed = SEED,
  comment = '',
  measurementsOverride = null,
}: { seed?: string; comment?: string; measurementsOverride?: Record<string, unknown> | null } = {}) {
  const appRoot = await mkdtemp(path.join(os.tmpdir(), 'optc-measurements-'));
  tempDirs.push(appRoot);
  await mkdir(path.join(appRoot, 'public/assets/data'), { recursive: true });
  await mkdir(path.join(appRoot, 'src/app/core/data'), { recursive: true });
  await writeFile(path.join(appRoot, 'public/assets/data/optc-seed.sql'), seed, 'utf8');

  const measurements = measurementsOverride ?? buildMeasurementsFile(measureDataset({ appRoot }));

  await writeFile(
    path.join(appRoot, 'src/app/core/data/dataset-measurements.json'),
    `${JSON.stringify(measurements, null, 2)}\n`,
    'utf8',
  );

  if (comment) {
    await writeFile(path.join(appRoot, 'src/example.ts'), comment, 'utf8');
  }

  return appRoot;
}

describe('measureDataset', () => {
  it('reads the type column, not the column beside it', async () => {
    /*
     * The first parser silently read `is_incomplete` as the type and reported ZERO dual-type
     * characters against a dataset that has 190. A plausible wrong number is worse than a throw,
     * so this pins a value only a correct column read can produce.
     */
    const appRoot = await makeAppRoot();
    const measured = measureDataset({ appRoot });

    expect(measured.characterRows).toBe(2);
    expect(measured.charactersWithTwoTypes).toBe(1);
    expect(measured.charactersWithOneType).toBe(1);
  });

  it('buckets classes into two, one and none', async () => {
    const appRoot = await makeAppRoot();
    const measured = measureDataset({ appRoot });

    expect(measured.charactersWithTwoClasses).toBe(1);
    expect(measured.charactersWithOneClass).toBe(1);
    expect(measured.charactersWithNoClasses).toBe(0);
  });

  it('counts a Support-only character only when all three facts hold', async () => {
    /*
     * 869f6td4p. Support data, no Captain Ability and no special - each of the other three rows
     * breaks exactly one of those, so a census that dropped any condition would count it.
     */
    const detail = (id: number, fields: Record<string, unknown>) =>
      `INSERT INTO character_details (character_id, detail_json)\n      VALUES (${id}, '${JSON.stringify({ characterId: id, captainAbility: null, captainAbilityVariants: [], specialText: null, supportData: [], ...fields })}');`;
    const support = [{ supportedCharactersText: 'Blade', levelDescriptions: ['Reduces Poison.'] }];
    const appRoot = await makeAppRoot({
      seed: [
        SEED,
        detail(1, { supportData: support }),
        detail(2, { supportData: support, captainAbility: 'Boosts ATK of all characters by 2x' }),
        detail(3, { supportData: support, specialText: 'Deals 5x damage' }),
        detail(4, { captainAbilityVariants: [{ key: 'captain', label: 'Captain Ability', text: '' }] }),
      ].join('\n'),
    });

    expect(measureDataset({ appRoot }).supportOnlyCharacters).toBe(1);
  });

  it('flattens nested metrics to the dotted names a marker uses', () => {
    expect(flattenMeasurements({ a: 1, b: { c: 2 }, note: 'skip' })).toEqual({ a: 1, 'b.c': 2 });
  });
});

describe('collectMarkers', () => {
  it('reads the number and the metric, and the line it is on', () => {
    expect(collectMarkers('x\n// 4618 [@dataset characterRows] rows')).toEqual([
      { quoted: 4618, metric: 'characterRows', line: 2 },
    ]);
  });

  it('reads a dotted metric name', () => {
    expect(collectMarkers('// 292 [@dataset triggerClauseInstances.beneficialOrb]')[0]!.metric).toBe(
      'triggerClauseInstances.beneficialOrb',
    );
  });

  it('ignores a number with no marker, which is most numbers in a comment', () => {
    // The sweep for this task found measurement-shaped numbers in 20 files; most are slot counts,
    // byte sizes and dates. Marking is what separates a measurement from a digit.
    expect(collectMarkers('// measured on 2026-09-13 across 48 slots')).toEqual([]);
  });
});

describe('inspectDatasetMeasurements', () => {
  it('passes when the file and every marker match the dataset', async () => {
    const appRoot = await makeAppRoot({ comment: '// 2 [@dataset characterRows] rows\n' });
    const result = inspectDatasetMeasurements({ appRoot, roots: ['src'] });

    expect(result.ok).toBe(true);
    expect(result.checkedMarkers).toBe(1);
    expect(formatDatasetMeasurementResult(result)).toContain('match the measured dataset');
  });

  it('FAILS on a comment that drifted from the file', async () => {
    const appRoot = await makeAppRoot({ comment: '// 999 [@dataset characterRows] rows\n' });
    const result = inspectDatasetMeasurements({ appRoot, roots: ['src'] });

    expect(result.ok).toBe(false);
    expect(result.findings[0]).toMatchObject({ kind: 'stale-comment', expected: 2, actual: 999 });
  });

  it('FAILS on a file that drifted from the dataset, even when every comment agrees with it', async () => {
    /*
     * The `486` failure mode exactly: every copy agreed with every other copy, and all of them were
     * wrong. Checking comment-versus-file alone would have passed this.
     */
    const appRoot = await makeAppRoot({
      comment: '// 99 [@dataset characterRows] rows\n',
      measurementsOverride: buildMeasurementsFile({ ...measureDataset({ appRoot: process.cwd(), sql: SEED }), characterRows: 99 }),
    });
    const result = inspectDatasetMeasurements({ appRoot, roots: ['src'] });

    expect(result.ok).toBe(false);
    expect(result.findings.some((finding) => finding.kind === 'stale-measurements-file')).toBe(true);
  });

  it('FAILS on a marker naming a metric nothing measures', async () => {
    const appRoot = await makeAppRoot({ comment: '// 5 [@dataset inventedMetric] things\n' });
    const result = inspectDatasetMeasurements({ appRoot, roots: ['src'] });

    expect(result.ok).toBe(false);
    expect(result.findings[0]!.kind).toBe('unknown-metric');
  });

  it('FAILS loudly when the generated file is missing entirely', async () => {
    const appRoot = await mkdtemp(path.join(os.tmpdir(), 'optc-measurements-none-'));
    tempDirs.push(appRoot);

    expect(inspectDatasetMeasurements({ appRoot, roots: ['src'] })).toMatchObject({
      ok: false,
      findings: [expect.objectContaining({ kind: 'missing-measurements' })],
    });
  });

  it('tells the reader to keep the prose', async () => {
    // The brain's culture is that the REASON is what a future reader acts on. The guard protects
    // the number; saying so where the failure is read is what stops someone deleting the paragraph.
    const appRoot = await makeAppRoot({ comment: '// 999 [@dataset characterRows] rows\n' });
    const output = formatDatasetMeasurementResult(inspectDatasetMeasurements({ appRoot, roots: ['src'] }));

    expect(output).toContain('Do not delete the prose');
  });

  it('keeps the real repository in step', () => {
    const result = inspectDatasetMeasurements({ appRoot: process.cwd() });

    expect(formatDatasetMeasurementResult(result)).toContain('match the measured dataset');
    expect(result.ok).toBe(true);
    // Guard against the guard checking nothing, which is how this would rot.
    expect(result.checkedMarkers).toBeGreaterThan(5);
  });
});
