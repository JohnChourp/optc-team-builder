import { describe, expect, it } from 'vitest';

import { buildDisagreementReport } from './disagreement-report.utils';

/**
 * 869f13gb3. The report's value is that a maintainer can act on it without a reply,
 * so the cases here are about completeness rather than about formatting: every field
 * the app knows must be present, and the two that decide whether a fix had already
 * shipped - app version and dataset version - must never be silently omitted.
 */
const base = {
  characterId: 3456,
  characterName: 'Monkey D. Luffy',
  derivedTags: ['Orb Boost', 'Type Boost'],
  appVersion: '0.6.2',
  datasetSourceVersion: '2026.09.21',
  datasetGeneratedOn: '2026-09-21',
  language: 'el',
  generatedAt: '2026-09-22T10:00:00.000Z',
};

describe('buildDisagreementReport', () => {
  it('carries everything the app knows, so nothing has to be typed', () => {
    const report = buildDisagreementReport(base);

    expect(report).toContain('Monkey D. Luffy (#3456)');
    expect(report).toContain('- Orb Boost');
    expect(report).toContain('- Type Boost');
    expect(report).toContain('0.6.2');
    expect(report).toContain('2026.09.21');
    expect(report).toContain('2026-09-21');
    expect(report).toContain('el');
    expect(report).toContain('2026-09-22T10:00:00.000Z');
  });

  it('leaves exactly one labelled blank for the player', () => {
    expect(buildDisagreementReport(base)).toContain(
      'What I expected: (describe what you expected instead)',
    );
  });

  /*
   * A missing dataset version must read as unknown, never as absent. The maintainer's
   * first question is whether the reader was on data that already had the fix, and a
   * line that simply is not there is indistinguishable from a reader who removed it.
   */
  it('says unknown rather than dropping a missing dataset version', () => {
    const report = buildDisagreementReport({
      ...base,
      datasetSourceVersion: null,
      datasetGeneratedOn: null,
    });

    expect(report).toContain('Dataset:         unknown');
    expect(report).not.toContain('generated');
  });

  it('says so when a character has no derived tags at all', () => {
    expect(buildDisagreementReport({ ...base, derivedTags: [] })).toContain('(nothing)');
  });

  /*
   * Truncation announces itself. A report cut by the medium it is pasted into is cut
   * silently and in the middle; cut here, it says how much is missing.
   */
  it('caps a long tag list and counts what it left out', () => {
    const report = buildDisagreementReport({
      ...base,
      derivedTags: Array.from({ length: 45 }, (_, index) => `Tag ${index}`),
    });

    expect(report).toContain('... and 5 more');
    expect(report).toContain('- Tag 39');
    expect(report).not.toContain('- Tag 40\n');
  });

  it('is reproducible - same input, same bytes', () => {
    expect(buildDisagreementReport(base)).toEqual(buildDisagreementReport(base));
  });
});
