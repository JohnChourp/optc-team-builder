import { describe, expect, it } from 'vitest';

import {
  FIELD_ABSENCE_CONVENTIONS,
  formatFieldForDisplay,
  isFieldAbsent,
  type FieldAbsenceFamily,
} from './field-absence.utils';

const FAMILIES = Object.keys(FIELD_ABSENCE_CONVENTIONS) as FieldAbsenceFamily[];

describe('isFieldAbsent', () => {
  it.each(FAMILIES)('treats null and undefined as absent in every family (%s)', (family) => {
    expect(isFieldAbsent(family, null)).toBe(true);
    expect(isFieldAbsent(family, undefined)).toBe(true);
  });

  /**
   * 869f1328r's whole reason to exist. A stat of 0 is a measurement; a cooldown of 0 is a
   * fully-reduced special. Reading either as "unknown" hides a real unit from a sort.
   */
  it.each(['stat', 'cooldown'] as const)('keeps 0 as a fact in the %s family', (family) => {
    expect(isFieldAbsent(family, 0)).toBe(false);
    expect(formatFieldForDisplay(family, 0)).toBe('0');
  });

  it('renders absence and zero differently, which is the point', () => {
    expect(formatFieldForDisplay('stat', 0)).toBe('0');
    expect(formatFieldForDisplay('stat', null)).toBeNull();
  });

  it('treats a blank or whitespace-only string as absent, never as empty prose', () => {
    expect(isFieldAbsent('prose', '')).toBe(true);
    expect(isFieldAbsent('prose', '   ')).toBe(true);
    expect(isFieldAbsent('prose', 'Deals damage')).toBe(false);
  });

  /**
   * `Number(undefined)` is `NaN`. A family that accepted it would let a parse failure read as a
   * measurement, which is worse than reading as unknown.
   */
  it.each(FAMILIES)('treats NaN as absent in every family (%s)', (family) => {
    expect(isFieldAbsent(family, Number.NaN)).toBe(true);
  });

  it('keeps a negative stat, because an editor save is allowed to store one', () => {
    expect(isFieldAbsent('stat', -5)).toBe(false);
  });

  /**
   * The 869f13284 defect, stated as a test: `false` is "upstream has a row and it does not say
   * Global", `null` is "upstream has no row". Only the second is absence.
   */
  it('separates a known-negative release flag from a missing one', () => {
    expect(isFieldAbsent('regionRelease', false)).toBe(false);
    expect(isFieldAbsent('regionRelease', null)).toBe(true);
  });
});

describe('FIELD_ABSENCE_CONVENTIONS', () => {
  it('declares null as absence in every family, so there is one sentinel and not five', () => {
    for (const family of FAMILIES) {
      expect(FIELD_ABSENCE_CONVENTIONS[family].absentValue).toBeNull();
    }
  });

  it('covers the three families the subtask named, plus the two the region work needed', () => {
    expect(FAMILIES).toEqual(
      expect.arrayContaining(['stat', 'cooldown', 'asset', 'prose', 'regionRelease']),
    );
  });
});
