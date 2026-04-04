import { describe, expect, it } from 'vitest';

import { packDefinitions, shouldDownloadPack } from './import-optc-data.mjs';

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
});
