import { describe, expect, it } from 'vitest';
import { readFileSync, statSync } from 'node:fs';

import {
  CHANGELOG_BYTE_BUDGET,
  CHANGELOG_FILE,
  MEASURED,
  checkChangelogGrowth,
} from './check-changelog-growth.mjs';

/**
 * 869f13gb7. The guard exists because the changelog is the only thing in this
 * repository that grows on a schedule no human controls: a release adds an entry,
 * and the nightly upstream-data chain released 66 times in the fortnight to
 * 2026-09-22.
 *
 * The cases below are the mutation test written down. A budget is exactly the kind
 * of check that can sit green forever over nothing - so one case proves it fires,
 * one proves it does not fire early, and one proves the file it names is real and
 * still parses, because a byte budget over a path that has moved is a lane that can
 * never go red.
 */
describe('changelog growth budget', () => {
  it('fires when the file passes its ceiling', () => {
    const { errors } = checkChangelogGrowth({
      sourceBytes: CHANGELOG_BYTE_BUDGET + 1,
      entries: MEASURED.entries,
    });

    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('split the entries by era');
  });

  it('stays green one byte under', () => {
    expect(
      checkChangelogGrowth({ sourceBytes: CHANGELOG_BYTE_BUDGET, entries: MEASURED.entries }).errors,
    ).toEqual([]);
  });

  /*
   * The runway is the number the report quotes, so it is asserted rather than
   * printed and trusted. At the measured 4.7 releases/day and ~3,156 bytes/entry,
   * today's file has weeks, not months - which is the finding, not a rounding
   * detail.
   */
  it('reports a runway in days from the measured cadence', () => {
    const { bytesPerEntry, daysOfRunway } = checkChangelogGrowth({
      sourceBytes: MEASURED.sourceBytes,
      entries: MEASURED.entries,
    });

    expect(Math.round(bytesPerEntry)).toBe(3156);
    expect(daysOfRunway).toBeGreaterThan(0);
    expect(daysOfRunway).toBeLessThan(60);
  });

  /*
   * A budget whose subject has moved is a lane that cannot discriminate. This is
   * the "prove the sample is non-empty" step: the path resolves, and the entry
   * pattern the script counts with still matches the real file.
   */
  it('points at a file that exists and still parses', () => {
    const bytes = statSync(CHANGELOG_FILE).size;
    const entries = (readFileSync(CHANGELOG_FILE, 'utf8').match(/^ {2}\{\n {4}version: '/gmu) ?? [])
      .length;

    expect(bytes).toBeGreaterThan(100_000);
    expect(entries).toBeGreaterThanOrEqual(MEASURED.entries);
  });
});
