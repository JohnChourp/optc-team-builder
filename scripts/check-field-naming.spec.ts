import { describe, expect, it } from 'vitest';

import {
  DECLARED_WORLD_CLAIMS,
  RETIRED_MISLEADING_NAMES,
  extractModelFieldNames,
  findRetiredNameReturns,
  findWorldClaimViolations,
} from './lib/field-naming.mjs';
import { readModelNames } from './check-field-naming.mjs';

describe('extractModelFieldNames', () => {
  it('reads interface names, type names and field names', () => {
    const names = extractModelFieldNames(
      [
        'export interface CharacterRecord {',
        '  regionArtwork: CharacterRegionArtwork;',
        '  readonly values?: string[];',
        '}',
        "export type CharacterSortMode = 'catalog';",
      ].join('\n'),
    );

    expect(names).toEqual(
      expect.arrayContaining(['CharacterRecord', 'regionArtwork', 'values', 'CharacterSortMode']),
    );
  });
});

describe('findWorldClaimViolations', () => {
  /**
   * 869f1328c. The shape of the original defect: a name promising availability over a value
   * derived from whether an image file exists.
   */
  it('refuses a new name that claims availability', () => {
    expect(findWorldClaimViolations(['shipAvailability']).join(' ')).toContain('shipAvailability');
  });

  it('accepts a claim that is declared with what it reads', () => {
    expect(findWorldClaimViolations(Object.keys(DECLARED_WORLD_CLAIMS))).toEqual([]);
  });

  it('refuses the availableOn<Place> shape, which asserts obtainability somewhere', () => {
    expect(findWorldClaimViolations(['availableOnJapan']).join(' ')).toContain('availableOnJapan');
  });

  it('accepts a name whose suffix says it measures our own data', () => {
    expect(findWorldClaimViolations(['thumbnailsInstalled', 'availableTypesCount'])).toEqual([]);
  });

  /**
   * Bare `available` is not a claim word. Including it flagged seven UI option lists on the first
   * run - every one a fact about OUR catalogue - and an allowlist longer than the rule is how a
   * guard teaches people to switch it off.
   */
  it.each([
    'availableTriggerTags',
    'availableSlotTokens',
    'availableSources',
    'availableResponseTags',
    'availableCoverageModes',
  ])('accepts the option-list name %s', (name) => {
    expect(findWorldClaimViolations([name])).toEqual([]);
  });

  it('accepts an ordinary name', () => {
    expect(findWorldClaimViolations(['regionArtwork', 'captainAbility', 'maxSockets'])).toEqual([]);
  });
});

describe('findRetiredNameReturns', () => {
  it('refuses the return of the name the defect shipped under', () => {
    expect(findRetiredNameReturns(['regionAvailability']).join(' ')).toContain('is back');
    expect(findRetiredNameReturns(['RegionAvailability']).join(' ')).toContain('927');
  });

  it('says nothing about names that were never retired', () => {
    expect(findRetiredNameReturns(['regionArtwork', 'regionRelease'])).toEqual([]);
  });
});

describe('the shipped models', () => {
  it('carry no undeclared world claim and no retired name', () => {
    const names = readModelNames();

    expect(findWorldClaimViolations(names)).toEqual([]);
    expect(findRetiredNameReturns(names)).toEqual([]);
  });

  it('keeps the retired names recorded with the reason, not merely listed', () => {
    for (const reason of Object.values(RETIRED_MISLEADING_NAMES)) {
      expect(reason.length).toBeGreaterThan(40);
    }
  });
});
