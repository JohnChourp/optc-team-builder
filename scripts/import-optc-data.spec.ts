import { describe, expect, it } from 'vitest';

import { applyShipThumbnailOverrides, packDefinitions, shouldDownloadPack } from './import-optc-data.mjs';

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
});
