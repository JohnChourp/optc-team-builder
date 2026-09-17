import { describe, expect, it } from 'vitest';

import {
  SIZE_UNITS,
  SIZE_UNIT_NAMES,
  findUndeclaredSizeUnits,
  isValidSizeUnit,
  requiresSizeUnit,
} from './size-units.mjs';

/**
 * 869f138r0. The point is the failing case: a byte row that does not say which size it is.
 *
 * `unit: 'bytes'` was already on every one of those rows and said nothing useful, which is the
 * failure worth protecting against - a field that looks like it answers the question while
 * answering a different one.
 */

describe('the four units', () => {
  it('names exactly the four the task defined', () => {
    expect(SIZE_UNIT_NAMES).toEqual(['raw', 'gzip', 'cached', 'parsed']);
  });

  it('says what each one means, so the name is not the whole definition', () => {
    expect(SIZE_UNITS.cached).toContain('decoded');
    expect(SIZE_UNITS.gzip).toContain('estimate');
    expect(SIZE_UNITS.parsed).toContain('memory');
  });

  it('accepts only those four', () => {
    expect(isValidSizeUnit('raw')).toBe(true);
    expect(isValidSizeUnit('wire')).toBe(false);
    expect(isValidSizeUnit('')).toBe(false);
    expect(isValidSizeUnit(undefined)).toBe(false);
  });
});

describe('requiresSizeUnit', () => {
  it('asks it of byte rows only', () => {
    expect(requiresSizeUnit({ unit: 'bytes' })).toBe(true);
    expect(requiresSizeUnit({ unit: 'ms' })).toBe(false);
    expect(requiresSizeUnit({})).toBe(false);
    expect(requiresSizeUnit(null)).toBe(false);
  });
});

describe('findUndeclaredSizeUnits', () => {
  it('says nothing about rows that declare one', () => {
    expect(
      findUndeclaredSizeUnits([
        { unit: 'bytes', sizeUnit: 'raw', metricKey: 'rawBytes' },
        { unit: 'bytes', sizeUnit: 'cached', metricKey: 'cachedBytes' },
        { unit: 'ms', metricKey: 'pageReadyMs' },
      ]),
    ).toEqual([]);
  });

  it('catches a byte row with no unit at all', () => {
    const [finding] = findUndeclaredSizeUnits([
      { unit: 'bytes', metricKey: 'gzipBytes', metricLabel: 'initial payload gzip JS' },
    ]);

    expect(finding.kind).toBe('missing-size-unit');
    expect(finding.metricLabel).toBe('initial payload gzip JS');
    expect(finding.detail).toContain('raw, gzip, cached, parsed');
  });

  it('catches a byte row whose unit is not one of the four', () => {
    const [finding] = findUndeclaredSizeUnits([
      { unit: 'bytes', sizeUnit: 'wire', metricKey: 'wireBytes' },
    ]);

    expect(finding.detail).toContain('"wire"');
  });

  it('reports every offender at once rather than one per run', () => {
    expect(
      findUndeclaredSizeUnits([
        { unit: 'bytes', metricKey: 'a' },
        { unit: 'bytes', metricKey: 'b' },
        { unit: 'bytes', sizeUnit: 'raw', metricKey: 'c' },
      ]).map((finding) => finding.metricKey),
    ).toEqual(['a', 'b']);
  });

  it('survives a missing list', () => {
    expect(findUndeclaredSizeUnits(undefined)).toEqual([]);
  });
});

describe('the shipped budget rows', () => {
  it('every byte row in the report declares which size it is', async () => {
    const { readFile } = await import('node:fs/promises');
    const source = await readFile('scripts/perf-budget-report.mjs', 'utf8');
    const byteRows = [...source.matchAll(/unit: 'bytes',\n(\s*)sizeUnit: '(\w+)',/gu)];
    const totalByteRows = [...source.matchAll(/unit: 'bytes',/gu)];

    expect(byteRows).toHaveLength(totalByteRows.length);
    expect(byteRows.every(([, , unit]) => SIZE_UNIT_NAMES.includes(unit))).toBe(true);
  });

  it('uses cached for what the device stores and gzip for what crosses the wire', async () => {
    const { readFile } = await import('node:fs/promises');
    const source = await readFile('scripts/perf-budget-report.mjs', 'utf8');

    expect(source).toContain("metricLabel: 'prefetch total cached',\n    unit: 'bytes',\n    sizeUnit: 'cached',");
    expect(source).toContain("metricLabel: 'prefetch total over the wire',\n    unit: 'bytes',\n    sizeUnit: 'gzip',");
  });
});
