import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  inspectDatasetMeasurements,
  rewriteDatasetMeasurementMarkers,
} from './check-dataset-measurements.mjs';
import { buildMeasurementsFile, measureDataset } from './lib/dataset-measurements.mjs';

/*
 * Owner, 2026-09-25 (wave-11 close). A release that added characters left three lanes red on main;
 * one of them was this guard, because nothing moved the figures source comments quote. `--write`
 * now moves them at release - and ONLY them. Its own file rather than appended to
 * `check-dataset-measurements.spec.ts`, which proves the guard fails; this proves the writer keeps to
 * the number and that the release actually runs it, in the right place.
 */

let tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.map((dir) => rm(dir, { recursive: true, force: true })));
  tempDirs = [];
});

// Two characters: one dual type, one single; one with two classes, one with one.
const SEED = [
  'INSERT INTO characters (id, name, is_incomplete, type, primary_class, secondary_class, classes_json)',
  '      VALUES (',
  '        1,',
  "        'Monkey D. Luffy',",
  '        0,',
  "        'STR',",
  "        'Fighter',",
  '        NULL,',
  '        \'["Fighter"]\'',
  '      );',
  'INSERT INTO characters (id, name, is_incomplete, type, primary_class, secondary_class, classes_json)',
  '      VALUES (',
  '        2,',
  "        'Dual Type',",
  '        0,',
  "        'QCK,DEX',",
  "        'Slasher',",
  "        'Striker',",
  '        \'["Slasher","Striker"]\'',
  '      );',
].join('\n');

async function makeAppRoot(files: Record<string, string>, measurements?: Record<string, unknown>) {
  const appRoot = await mkdtemp(path.join(os.tmpdir(), 'optc-measurements-write-'));
  tempDirs.push(appRoot);
  await mkdir(path.join(appRoot, 'public/assets/data'), { recursive: true });
  await mkdir(path.join(appRoot, 'src/app/core/data'), { recursive: true });
  await writeFile(path.join(appRoot, 'public/assets/data/optc-seed.sql'), SEED, 'utf8');

  const recorded = measurements ?? buildMeasurementsFile(measureDataset({ appRoot }));

  await writeFile(
    path.join(appRoot, 'src/app/core/data/dataset-measurements.json'),
    `${JSON.stringify(recorded, null, 2)}\n`,
    'utf8',
  );

  for (const [file, content] of Object.entries(files)) {
    await mkdir(path.dirname(path.join(appRoot, file)), { recursive: true });
    await writeFile(path.join(appRoot, file), content, 'utf8');
  }

  return appRoot;
}

const read = (appRoot: string, file: string) => readFile(path.join(appRoot, file), 'utf8');

describe('rewriteDatasetMeasurementMarkers - the number moves, nothing else does', () => {
  it('moves each stale figure to the measured value and changes no other byte', async () => {
    const before =
      '/**\n * Verified over all 5 [@dataset characterRows] rows:\n * 3 [@dataset charactersWithTwoTypes] characters carry two types.\n */\nexport const x = 1;\n';
    const appRoot = await makeAppRoot({ 'src/example.ts': before });

    const moved = rewriteDatasetMeasurementMarkers({ appRoot });

    expect(moved).toEqual([
      { file: 'src/example.ts', line: 2, metric: 'characterRows', from: 5, to: 2 },
      { file: 'src/example.ts', line: 3, metric: 'charactersWithTwoTypes', from: 3, to: 1 },
    ]);
    expect(await read(appRoot, 'src/example.ts')).toBe(
      before.replace('5 [@dataset characterRows]', '2 [@dataset characterRows]').replace('3 [@dataset charactersWithTwoTypes]', '1 [@dataset charactersWithTwoTypes]'),
    );
    expect(inspectDatasetMeasurements({ appRoot }).ok).toBe(true);
  });

  it("keeps each figure's own style, and a comma that only punctuates the prose", async () => {
    const appRoot = await makeAppRoot(
      {
        'src/grouped.ts': '// 4,622 [@dataset characterRows] rows\n',
        'src/plain.ts': '// 4622 [@dataset characterRows] rows\n',
        'src/punctuated.ts': '// all 4622, [@dataset characterRows] of them\n',
      },
      { schemaVersion: 1, characterRows: 4626 },
    );

    rewriteDatasetMeasurementMarkers({ appRoot });

    expect(await read(appRoot, 'src/grouped.ts')).toBe('// 4,626 [@dataset characterRows] rows\n');
    expect(await read(appRoot, 'src/plain.ts')).toBe('// 4626 [@dataset characterRows] rows\n');
    expect(await read(appRoot, 'src/punctuated.ts')).toBe('// all 4626, [@dataset characterRows] of them\n');
  });

  it('never touches a number outside a marker', async () => {
    const before = '// The roster had 4622 rows in September; it has 5 [@dataset characterRows] now.\n';
    const appRoot = await makeAppRoot({ 'src/example.ts': before });

    rewriteDatasetMeasurementMarkers({ appRoot });

    expect(await read(appRoot, 'src/example.ts')).toBe(
      '// The roster had 4622 rows in September; it has 2 [@dataset characterRows] now.\n',
    );
  });

  it('leaves a marker whose metric is not measured exactly as it is, for the check to report', async () => {
    const before = '// 7 [@dataset noSuchMetric] of anything\n';
    const appRoot = await makeAppRoot({ 'src/example.ts': before });

    expect(rewriteDatasetMeasurementMarkers({ appRoot })).toEqual([]);
    expect(await read(appRoot, 'src/example.ts')).toBe(before);

    const result = inspectDatasetMeasurements({ appRoot });

    expect(result.ok).toBe(false);
    expect(result.findings.map((finding: { kind: string }) => finding.kind)).toEqual(['unknown-metric']);
  });

  it('moves nothing the second time, and leaves specs alone', async () => {
    const spec = '// 9 [@dataset characterRows] - a deliberately wrong fixture\n';
    const appRoot = await makeAppRoot({
      'src/example.ts': '// 5 [@dataset characterRows]\n',
      'src/example.spec.ts': spec,
    });

    expect(rewriteDatasetMeasurementMarkers({ appRoot })).toHaveLength(1);

    const settled = await read(appRoot, 'src/example.ts');

    expect(rewriteDatasetMeasurementMarkers({ appRoot })).toEqual([]);
    expect(await read(appRoot, 'src/example.ts')).toBe(settled);
    expect(await read(appRoot, 'src/example.spec.ts')).toBe(spec);
  });
});

describe('--write, as the release calls it', () => {
  const run = (appRoot: string) =>
    execFileSync(process.execPath, ['scripts/check-dataset-measurements.mjs', '--app-root', appRoot, '--write'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });

  it('prints every figure it moved and exits 0 once the check holds', async () => {
    const appRoot = await makeAppRoot({ 'src/example.ts': '// 5 [@dataset characterRows]\n' });

    const output = run(appRoot);

    expect(output).toContain('moved src/example.ts:1 characterRows: 5 -> 2');
    expect(output).toContain('match the measured dataset');
  });

  it('still exits non-zero on what it cannot fix, so the release stops before it commits', async () => {
    const appRoot = await makeAppRoot({ 'src/example.ts': '// 7 [@dataset noSuchMetric]\n' });

    expect(() => run(appRoot)).toThrow();
  });
});

describe('scripts/release-and-tag.sh runs the regenerations where they can work', () => {
  // Comment lines are stripped first: the step has to RUN, not merely be mentioned.
  const executed = readFileSync('scripts/release-and-tag.sh', 'utf8')
    .split('\n')
    .filter((line) => !/^\s*#/u.test(line))
    .join('\n');

  const at = (needle: string) => {
    const index = executed.indexOf(needle);

    expect(index, `${needle} is not an executed line of the release script`).toBeGreaterThan(-1);

    return index;
  };

  it('after the import and the re-measure, before the bump and the commit', () => {
    const imported = at('npm run data:import:all');
    const measured = at('scripts/measure-dataset-facts.mjs"');
    const schema = at('npm run dataset:schema');
    const packs = at('npm run packs:contract');
    const figures = at('scripts/check-dataset-measurements.mjs" --app-root "${PROJECT_ROOT}" --write');
    // The bump itself, not the `--print-only` read of the next version near the top.
    const bumped = at('scripts/bump-version.sh" "${BUMP_ARGS[@]}" >/dev/null');
    const committed = at('git commit -m "release:');

    for (const step of [schema, packs, figures]) {
      expect(step).toBeGreaterThan(imported);
      expect(step).toBeLessThan(bumped);
    }

    // The figures are moved from the file the re-measure writes, so they must come after it.
    expect(figures).toBeGreaterThan(measured);
    expect(bumped).toBeLessThan(committed);
  });
});
