import { describe, expect, it } from 'vitest';

import { parseSuperSpecialCriteria } from './super-special-criteria.mjs';

describe('parseSuperSpecialCriteria', () => {
  it('parses name-list criteria into a character-count branch', () => {
    const result = parseSuperSpecialCriteria(
      'This character must be captain and your crew must consist of any 1 of the following, excluding Supports and counting only 1 per unit: Roronoa Zoro, Nami or Vinsmoke Sanji.',
    );

    expect(result).toMatchObject({
      parserStatus: 'roster_only',
      requiresCaptain: true,
      hasNonRosterBranches: false,
      rosterBranches: [
        {
          branchType: 'character_count_any',
          requiredCount: 1,
          options: expect.arrayContaining([
            expect.objectContaining({
              label: 'Vinsmoke Sanji',
              acceptedKeys: expect.arrayContaining(['vinsmoke sanji', 'sanji']),
            }),
          ]),
        },
      ],
    });
  });

  it('parses class and type count criteria into a roster-valid branch', () => {
    const result = parseSuperSpecialCriteria(
      'This character must be captain and the crew must consist of 6 Powerhouse or Driven characters.',
    );

    expect(result).toEqual({
      rawText:
        'This character must be captain and the crew must consist of 6 Powerhouse or Driven characters.',
      requiresCaptain: true,
      excludesSelf: false,
      hasNonRosterBranches: false,
      parserStatus: 'roster_only',
      rosterBranches: [
        {
          branchType: 'class_or_type_count_any',
          requiredCount: 6,
          allowedClasses: ['Driven', 'Powerhouse'],
          allowedTypes: [],
        },
      ],
    });
  });

  it('marks non-roster-only criteria as ineligible for strict roster validation', () => {
    const result = parseSuperSpecialCriteria(
      'This character must be captain and HP must be below 30%.',
    );

    expect(result).toEqual({
      rawText: 'This character must be captain and HP must be below 30%.',
      requiresCaptain: true,
      excludesSelf: false,
      hasNonRosterBranches: true,
      parserStatus: 'non_roster_only',
      rosterBranches: [],
    });
  });

  it('accepts mixed OR criteria by preserving the roster-verifiable branch', () => {
    const result = parseSuperSpecialCriteria(
      'This character must be captain and 5 turns must pass, not including premptive turns or your crew must consist of any 2 of the following, excluding Supports and counting only 1 per unit: Roronoa Zoro, Nami, Usopp or Sanji.',
    );

    expect(result).toMatchObject({
      parserStatus: 'mixed',
      hasNonRosterBranches: true,
      rosterBranches: [
        {
          branchType: 'character_count_any',
          requiredCount: 2,
        },
      ],
    });
  });

  it('parses tag-list crew criteria that excludes self', () => {
    const result = parseSuperSpecialCriteria(
      'When any 3 [Straw Hat Pirates], [Giant], or [Four Emperors] characters are on the crew not including self, can be launched when character is a crewmate.',
    );

    expect(result).toMatchObject({
      parserStatus: 'roster_only',
      requiresCaptain: false,
      excludesSelf: true,
      rosterBranches: [
        {
          branchType: 'character_count_any',
          requiredCount: 3,
          matchMode: 'any_candidate',
          options: [
            {
              label: '[Straw Hat Pirates]',
              acceptedKeys: expect.arrayContaining(['straw hat pirates']),
            },
            {
              label: '[Giant]',
              acceptedKeys: expect.arrayContaining(['giant']),
            },
            {
              label: '[Four Emperors]',
              acceptedKeys: expect.arrayContaining(['four emperors']),
            },
          ],
        },
      ],
    });
    expect(result?.rosterBranches[0]).toMatchObject({
      options: expect.arrayContaining([
        expect.objectContaining({
          acceptedKeys: expect.not.arrayContaining(['characters']),
        }),
      ]),
    });
  });
});
