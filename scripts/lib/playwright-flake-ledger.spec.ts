import { mkdtemp, mkdir, rm, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  buildFlakeKey,
  createEmptyFlakeLedger,
  findRepeatedFlakes,
  formatFlakeLedgerSummary,
  MAX_OCCURRENCES_PER_RECORD,
  mergeFlakeObservations,
  toFlakeObservation,
  validateFlakeLedger,
} from './playwright-flake-ledger.mjs';
import { recordPlaywrightFlakes } from '../record-playwright-flakes.mjs';

/*
 * 869f127dh. The property under test is that a REPEAT is visible as a repeat - which means the
 * merge has to be right about two things nobody would guess from the happy path: that retries
 * inside one run are one flake, and that a renamed test is still the same flake.
 */

let tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.map((dir) => rm(dir, { recursive: true, force: true })));
  tempDirs = [];
});

function observation(overrides: Record<string, unknown> = {}) {
  return {
    project: 'chromium',
    spec: 'e2e/regression-flows.spec.ts',
    title: 'guided auto build reaches Sub 1',
    signature: 'Timed out <n>ms waiting for expect(locator).toBeVisible()',
    runId: 'run-1',
    at: '2026-09-13T10:00:00.000Z',
    ...overrides,
  };
}

describe('mergeFlakeObservations', () => {
  it('records a first failure with a count of one', () => {
    const ledger = mergeFlakeObservations(createEmptyFlakeLedger(), [observation()]);

    expect(ledger.records).toHaveLength(1);
    expect(ledger.records[0]).toMatchObject({
      count: 1,
      firstSeen: '2026-09-13T10:00:00.000Z',
      lastSeen: '2026-09-13T10:00:00.000Z',
    });
  });

  it('makes the SECOND run of the same failure visible as a repeat', () => {
    const first = mergeFlakeObservations(createEmptyFlakeLedger(), [observation()]);
    const second = mergeFlakeObservations(first, [
      observation({ runId: 'run-2', at: '2026-09-13T11:00:00.000Z' }),
    ]);

    expect(second.records).toHaveLength(1);
    expect(second.records[0]).toMatchObject({
      count: 2,
      firstSeen: '2026-09-13T10:00:00.000Z',
      lastSeen: '2026-09-13T11:00:00.000Z',
    });
    expect(findRepeatedFlakes(second)).toHaveLength(1);
  });

  it('counts retries WITHIN one run as one flake, not three', () => {
    // A spec that failed on three retries inside a single run flaked once. Counting retries would
    // make one bad run look like a standing pattern.
    const ledger = mergeFlakeObservations(createEmptyFlakeLedger(), [
      observation(),
      observation(),
      observation(),
    ]);

    expect(ledger.records[0]!.count).toBe(1);
    expect(ledger.records[0]!.occurrences).toHaveLength(1);
  });

  it('treats a renamed test as the same flake, and keeps the newest title', () => {
    const first = mergeFlakeObservations(createEmptyFlakeLedger(), [observation()]);
    const second = mergeFlakeObservations(first, [
      observation({ title: 'guided auto build reaches the first sub', at: '2026-09-13T11:00:00.000Z' }),
    ]);

    expect(second.records).toHaveLength(1);
    expect(second.records[0]!.count).toBe(2);
    expect(second.records[0]!.title).toBe('guided auto build reaches the first sub');
  });

  it('keeps a different signature apart, because that is a different failure', () => {
    const ledger = mergeFlakeObservations(createEmptyFlakeLedger(), [
      observation(),
      observation({ signature: 'Error: page.goto: net::ERR_CONNECTION_REFUSED' }),
    ]);

    expect(ledger.records).toHaveLength(2);
  });

  it('keeps the same failure in a different project apart', () => {
    const ledger = mergeFlakeObservations(createEmptyFlakeLedger(), [
      observation(),
      observation({ project: 'firefox' }),
    ]);

    expect(ledger.records).toHaveLength(2);
  });

  it('orders the most-repeated first, so the reader starts where the evidence is', () => {
    let ledger = mergeFlakeObservations(createEmptyFlakeLedger(), [
      observation({ spec: 'a.spec.ts' }),
      observation({ spec: 'b.spec.ts' }),
    ]);
    ledger = mergeFlakeObservations(ledger, [
      observation({ spec: 'b.spec.ts', at: '2026-09-13T11:00:00.000Z' }),
    ]);

    expect(ledger.records[0]!.spec).toBe('b.spec.ts');
    expect(ledger.records[0]!.count).toBe(2);
  });

  it('bounds the occurrences it keeps, while the count keeps counting', () => {
    let ledger = createEmptyFlakeLedger();

    for (let run = 0; run < MAX_OCCURRENCES_PER_RECORD + 5; run += 1) {
      ledger = mergeFlakeObservations(ledger, [
        observation({ runId: `run-${run}`, at: `2026-09-13T${String(run).padStart(2, '0')}:00:00.000Z` }),
      ]);
    }

    expect(ledger.records[0]!.count).toBe(MAX_OCCURRENCES_PER_RECORD + 5);
    expect(ledger.records[0]!.occurrences).toHaveLength(MAX_OCCURRENCES_PER_RECORD);
    // The newest are kept, so a trimmed record still says when it last happened.
    expect(ledger.records[0]!.occurrences.at(-1)!.runId).toBe(`run-${MAX_OCCURRENCES_PER_RECORD + 4}`);
  });

  it('does not mutate the ledger it was given', () => {
    const first = mergeFlakeObservations(createEmptyFlakeLedger(), [observation()]);
    const snapshot = JSON.stringify(first);

    mergeFlakeObservations(first, [observation({ at: '2026-09-13T11:00:00.000Z' })]);

    expect(JSON.stringify(first)).toBe(snapshot);
  });

  it('handles an empty run without inventing a record', () => {
    expect(mergeFlakeObservations(createEmptyFlakeLedger(), []).records).toEqual([]);
  });
});

describe('buildFlakeKey', () => {
  it('separates the three parts so two different triples cannot collide', () => {
    expect(buildFlakeKey({ project: 'a', spec: 'b', signature: 'c' })).not.toBe(
      buildFlakeKey({ project: 'a', spec: 'b :: c', signature: '' }),
    );
  });
});

describe('validateFlakeLedger', () => {
  it('accepts an empty ledger', () => {
    expect(validateFlakeLedger(createEmptyFlakeLedger()).ok).toBe(true);
  });

  it('rejects a wrong schema version', () => {
    expect(validateFlakeLedger({ schemaVersion: 99, records: [] }).ok).toBe(false);
  });

  it('rejects anything that is not an object', () => {
    expect(validateFlakeLedger(null).ok).toBe(false);
    expect(validateFlakeLedger([]).ok).toBe(false);
  });

  it('rejects a record missing a required field', () => {
    const result = validateFlakeLedger({
      schemaVersion: 1,
      records: [{ project: 'chromium', spec: '', signature: 's', firstSeen: 'a', lastSeen: 'b', count: 1, occurrences: [{}] }],
    });

    expect(result.ok).toBe(false);
    expect(result.errors.join('\n')).toContain('records[0].spec');
  });

  it('rejects a count lower than the occurrences kept, which is a hand edit', () => {
    const result = validateFlakeLedger({
      schemaVersion: 1,
      records: [
        {
          project: 'chromium',
          spec: 'a.spec.ts',
          signature: 's',
          firstSeen: 'a',
          lastSeen: 'b',
          count: 1,
          occurrences: [{ at: 'a' }, { at: 'b' }],
        },
      ],
    });

    expect(result.ok).toBe(false);
    expect(result.errors.join('\n')).toContain('lower than the occurrences');
  });
});

describe('formatFlakeLedgerSummary', () => {
  it('says nothing is recorded when nothing is', () => {
    expect(formatFlakeLedgerSummary(createEmptyFlakeLedger())).toContain('no browser failures recorded');
  });

  it('names the repeats and says a repeat is not a decision', () => {
    let ledger = mergeFlakeObservations(createEmptyFlakeLedger(), [observation()]);
    ledger = mergeFlakeObservations(ledger, [observation({ at: '2026-09-13T11:00:00.000Z' })]);

    const output = formatFlakeLedgerSummary(ledger);

    expect(output).toContain('1 seen more than once');
    expect(output).toContain('2x chromium');
    // Quarantine stays a deliberate act, and the summary has to say so where it is read.
    expect(output).toContain('Quarantine stays deliberate');
  });
});

describe('toFlakeObservation', () => {
  it("reads the summariser's own shape", () => {
    expect(
      toFlakeObservation(
        { browser: 'webkit', file: 'e2e/smoke.spec.ts', title: 'loads', errorSignature: 'boom' },
        { runId: 7, at: 'now' },
      ),
    ).toEqual({
      project: 'webkit',
      spec: 'e2e/smoke.spec.ts',
      title: 'loads',
      signature: 'boom',
      runId: '7',
      at: 'now',
    });
  });

  it('does not invent values it was not given', () => {
    expect(toFlakeObservation({}, { at: 'now' })).toMatchObject({
      project: 'unknown',
      spec: 'unknown',
      signature: 'unknown failure',
      runId: null,
    });
  });
});

describe('recordPlaywrightFlakes, end to end', () => {
  /** A Playwright JSON report with one failing spec, in the shape the summariser reads. */
  function report(message: string) {
    return {
      suites: [
        {
          title: 'e2e/regression-flows.spec.ts',
          file: 'e2e/regression-flows.spec.ts',
          suites: [
            {
              title: 'guided',
              specs: [
                {
                  title: 'reaches Sub 1',
                  file: 'e2e/regression-flows.spec.ts',
                  tests: [
                    {
                      projectName: 'chromium',
                      status: 'unexpected',
                      results: [{ status: 'failed', retry: 0, error: { message } }],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    };
  }

  it('turns two runs of a deliberately flaky fixture into two records and one visible repeat', async () => {
    const appRoot = await mkdtemp(path.join(os.tmpdir(), 'optc-flake-ledger-'));
    tempDirs.push(appRoot);
    await mkdir(path.join(appRoot, 'artifacts'), { recursive: true });
    await mkdir(path.join(appRoot, 'e2e'), { recursive: true });
    const ledgerPath = path.join(appRoot, 'e2e/flake-ledger.json');

    // Run one.
    await writeFile(
      path.join(appRoot, 'artifacts/results.json'),
      JSON.stringify(report('Timed out 5000ms waiting for locator')),
      'utf8',
    );
    const first = await recordPlaywrightFlakes({
      appRoot,
      input: 'artifacts',
      ledgerPath,
      runId: 'run-1',
      at: '2026-09-13T10:00:00.000Z',
    });

    expect(first.ledger.records).toHaveLength(1);
    expect(first.ledger.records[0]!.count).toBe(1);
    expect(findRepeatedFlakes(first.ledger)).toHaveLength(0);

    // Run two: the same failure, a different timeout number - which the shared signature
    // normaliser folds to the same `<n>`, so it is recognised as the SAME flake.
    await writeFile(
      path.join(appRoot, 'artifacts/results.json'),
      JSON.stringify(report('Timed out 9000ms waiting for locator')),
      'utf8',
    );
    const second = await recordPlaywrightFlakes({
      appRoot,
      input: 'artifacts',
      ledgerPath,
      runId: 'run-2',
      at: '2026-09-13T11:00:00.000Z',
    });

    expect(second.ledger.records).toHaveLength(1);
    expect(second.ledger.records[0]!.count).toBe(2);
    expect(findRepeatedFlakes(second.ledger)).toHaveLength(1);

    // And it is on disk, which is the whole difference from a per-run artifact.
    const onDisk = JSON.parse(await readFile(ledgerPath, 'utf8'));

    expect(validateFlakeLedger(onDisk).ok).toBe(true);
    expect(onDisk.records[0].count).toBe(2);
    expect(onDisk.records[0].occurrences.map((entry: { runId: string }) => entry.runId)).toEqual([
      'run-1',
      'run-2',
    ]);
  });

  it('never writes the quarantine file, because quarantine stays a deliberate act', async () => {
    const appRoot = await mkdtemp(path.join(os.tmpdir(), 'optc-flake-quarantine-'));
    tempDirs.push(appRoot);
    await mkdir(path.join(appRoot, 'artifacts'), { recursive: true });
    await mkdir(path.join(appRoot, 'e2e'), { recursive: true });
    const quarantinePath = path.join(appRoot, 'e2e/quarantine.json');
    const original = '{\n  "schemaVersion": 1,\n  "entries": []\n}\n';
    await writeFile(quarantinePath, original, 'utf8');
    await writeFile(
      path.join(appRoot, 'artifacts/results.json'),
      JSON.stringify(report('Timed out 5000ms waiting for locator')),
      'utf8',
    );

    await recordPlaywrightFlakes({
      appRoot,
      input: 'artifacts',
      ledgerPath: path.join(appRoot, 'e2e/flake-ledger.json'),
      at: '2026-09-13T10:00:00.000Z',
    });

    expect(await readFile(quarantinePath, 'utf8')).toBe(original);
  });

  it('skips a JSON file that is not a Playwright report rather than failing the run', async () => {
    const appRoot = await mkdtemp(path.join(os.tmpdir(), 'optc-flake-junk-'));
    tempDirs.push(appRoot);
    await mkdir(path.join(appRoot, 'artifacts'), { recursive: true });
    await mkdir(path.join(appRoot, 'e2e'), { recursive: true });
    await writeFile(path.join(appRoot, 'artifacts/notes.json'), 'not json at all', 'utf8');

    const result = await recordPlaywrightFlakes({
      appRoot,
      input: 'artifacts',
      ledgerPath: path.join(appRoot, 'e2e/flake-ledger.json'),
      at: '2026-09-13T10:00:00.000Z',
    });

    expect(result.ledger.records).toEqual([]);
  });

  it('refuses a ledger that is not valid, instead of overwriting it', async () => {
    const appRoot = await mkdtemp(path.join(os.tmpdir(), 'optc-flake-bad-'));
    tempDirs.push(appRoot);
    await mkdir(path.join(appRoot, 'e2e'), { recursive: true });
    const ledgerPath = path.join(appRoot, 'e2e/flake-ledger.json');
    await writeFile(ledgerPath, '{"schemaVersion": 99, "records": []}', 'utf8');

    await expect(
      recordPlaywrightFlakes({ appRoot, input: 'artifacts', ledgerPath, at: 'now' }),
    ).rejects.toThrow('not a valid flake ledger');
  });

  it("keeps the repository's own ledger valid", async () => {
    const onDisk = JSON.parse(await readFile(path.join(process.cwd(), 'e2e/flake-ledger.json'), 'utf8'));

    expect(validateFlakeLedger(onDisk).ok).toBe(true);
  });
});
