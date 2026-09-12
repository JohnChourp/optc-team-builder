import { describe, expect, it } from 'vitest';

import { type DatasetManifest } from '../../core/models/optc.models';
import { buildDatasetSummary } from './dataset-summary.utils';

function manifest(overrides: Partial<DatasetManifest> = {}): DatasetManifest {
  return {
    schemaVersion: 1,
    generatedAt: '2026-09-11T22:49:45.997Z',
    sourceVersion: '36',
    characterCount: 4618,
    detailCount: 4529,
    shipCount: 66,
    rumbleCount: 4600,
    availableTypes: [],
    availableClasses: [],
    packs: [],
    ...overrides,
  } as DatasetManifest;
}

describe('buildDatasetSummary', () => {
  it('reduces a manifest to the four display-ready facts', () => {
    expect(buildDatasetSummary(manifest())).toEqual({
      sourceVersion: '36',
      generatedOn: '2026-09-11',
      characterCount: 4618,
    });
  });

  it('reports the UTC date, so the same dataset prints the same string everywhere', () => {
    // 00:30 UTC is still the previous evening in the Americas. A local date
    // here would make two readers quote different "data generated" values for
    // one build, which is exactly what the FAQ tells them to compare.
    expect(
      buildDatasetSummary(manifest({ generatedAt: '2026-09-12T00:30:00.000Z' }))?.generatedOn,
    ).toBe('2026-09-12');
  });

  it('returns null rather than a half-filled card', () => {
    expect(buildDatasetSummary(null)).toBeNull();
    expect(buildDatasetSummary(undefined)).toBeNull();
    expect(buildDatasetSummary(manifest({ sourceVersion: '' }))).toBeNull();
    expect(buildDatasetSummary(manifest({ sourceVersion: '   ' }))).toBeNull();
    expect(buildDatasetSummary(manifest({ generatedAt: 'not a date' }))).toBeNull();
    expect(buildDatasetSummary(manifest({ generatedAt: '' }))).toBeNull();
  });

  it('rejects a character count that is not a whole non-negative number', () => {
    expect(buildDatasetSummary(manifest({ characterCount: Number.NaN }))).toBeNull();
    expect(buildDatasetSummary(manifest({ characterCount: -1 }))).toBeNull();
    expect(buildDatasetSummary(manifest({ characterCount: 4.5 }))).toBeNull();
  });

  it('accepts a genuinely empty dataset', () => {
    expect(buildDatasetSummary(manifest({ characterCount: 0 }))?.characterCount).toBe(0);
  });

  it('trims a padded source version instead of printing the padding', () => {
    expect(buildDatasetSummary(manifest({ sourceVersion: ' 36 ' }))?.sourceVersion).toBe('36');
  });
});
