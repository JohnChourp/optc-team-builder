import { describe, expect, it } from 'vitest';

import {
  applyShipThumbnailOverrides,
  normalizeCharacterDetail,
  packDefinitions,
  shouldDownloadPack,
} from './import-optc-data.mjs';

describe('import-optc-data ship thumbnail pack', () => {
  it('registers the ship thumbnail pack definition', () => {
    expect(
      packDefinitions.find((pack) => pack.id === 'ship-thumbnails'),
    ).toMatchObject({
      key: 'shipThumbnails',
      id: 'ship-thumbnails',
      listingPath: 'api/images/thumbnail',
      entryName: 'ship',
    });
  });

  it('includes ship thumbnails in the all and thumbnails download modes', () => {
    expect(shouldDownloadPack('all', 'ship-thumbnails')).toBe(true);
    expect(shouldDownloadPack('thumbnails', 'ship-thumbnails')).toBe(true);
  });

  it('supports downloading only ship thumbnails when requested explicitly', () => {
    expect(shouldDownloadPack('ship-thumbnails', 'ship-thumbnails')).toBe(true);
    expect(shouldDownloadPack('ship-thumbnails', 'thumbnails-glo')).toBe(false);
    expect(shouldDownloadPack('ship-thumbnails', 'full-transparent')).toBe(false);
  });

  it('fills missing ship thumbs from local overrides without replacing upstream thumbs', () => {
    const result = applyShipThumbnailOverrides(
      [
        { id: 63, name: "Shiki's Island Ship", thumb: null, description: '' },
        { id: 14, name: 'Thousand Sunny', thumb: 'ship_0014_t2.png', description: '' },
      ],
      new Map([
        [63, { file: 'ship_0063_t2.png' }],
        [14, { file: 'ship_0014_override.png' }],
      ]),
    );

    expect(result).toEqual([
      { id: 63, name: "Shiki's Island Ship", thumb: 'ship_0063_t2.png', description: '' },
      { id: 14, name: 'Thousand Sunny', thumb: 'ship_0014_t2.png', description: '' },
    ]);
  });

  it('imports typed support data and super special fields into the normalized detail shape', () => {
    const detail = normalizeCharacterDetail(
      {
        superSpecial:
          'Reduces Special Cooldown of all characters by 1 turn and transforms Free Spirit characters into Super Free Spirit characters.',
        superSpecialCriteria:
          'This character must be captain and your crew must consist of any 1 of the following, excluding Supports and counting only 1 per unit: Roronoa Zoro, Nami or Usopp.',
        superSpecialNotes: 'Only usable once per quest.',
        support: [
          {
            Characters: 'Roronoa Zoro, Nami and Usopp',
            description: ['Level 1 effect.', 'Level 2 effect.'],
          },
        ],
      },
      3607,
    );

    expect(detail.supportData).toEqual([
      {
        supportedCharactersText: 'Roronoa Zoro, Nami and Usopp',
        levelDescriptions: ['Level 1 effect.', 'Level 2 effect.'],
      },
    ]);
    expect(detail.superSpecialText).toContain('transforms Free Spirit characters');
    expect(detail.superSpecialCriteriaText).toContain('your crew must consist of any 1');
    expect(detail.superSpecialNotes).toBe('Only usable once per quest.');
    expect(detail.superSpecialCriteria).toMatchObject({
      parserStatus: 'roster_only',
      requiresCaptain: true,
      rosterBranches: [
        {
          branchType: 'character_count_any',
          requiredCount: 1,
        },
      ],
    });
  });
});
