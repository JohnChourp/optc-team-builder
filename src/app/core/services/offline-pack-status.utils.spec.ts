import { describe, expect, it } from 'vitest';

import {
  RUNTIME_MEDIA_MAX_ENTRIES,
  isPackUrl,
  readRuntimeMediaUrls,
  summarizeOfflinePacks,
} from './offline-pack-status.utils';

/**
 * 869f138pr. The screen counts; it never estimates.
 *
 * Every number here has to survive a reader checking it against what their device is doing, so the
 * cases that matter are the ones where the answer is unknown: no Cache Storage, a browser that
 * throws, a pack nothing has cached. All of them read zero, and the screen says what it counted.
 */

const packs = [
  {
    key: 'thumbnailsGlo',
    id: 'thumbnails-glo',
    label: 'Global thumbnails',
    localBasePath: 'assets/offline-packs/thumbnails-glo',
    fileCount: 5384,
    totalBytes: 54_801_747,
    installed: true,
  },
  {
    key: 'shipThumbnails',
    id: 'ship-thumbnails',
    label: 'Ship thumbnails',
    localBasePath: 'assets/offline-packs/ship-thumbnails',
    fileCount: 63,
    totalBytes: 502_890,
    installed: true,
  },
];

function fakeCaches(contents: Record<string, string[]>): CacheStorage {
  return {
    keys: async () => Object.keys(contents),
    open: async (name: string) =>
      ({
        keys: async () => (contents[name] ?? []).map((url) => ({ url })),
      }) as never,
  } as never;
}

describe('isPackUrl', () => {
  it('matches a pack file whatever origin it came from', () => {
    expect(isPackUrl('https://optcteambuilder.com/assets/offline-packs/thumbnails-glo/1.png', 'thumbnails-glo')).toBe(true);
    expect(isPackUrl('/assets/offline-packs/thumbnails-glo/1.png', 'thumbnails-glo')).toBe(true);
  });

  it('does not match another pack whose id is a prefix of nothing', () => {
    expect(isPackUrl('/assets/offline-packs/thumbnails-jap/1.png', 'thumbnails-glo')).toBe(false);
    expect(isPackUrl('/assets/exact-character-images/1.png', 'thumbnails-glo')).toBe(false);
  });
});

describe('summarizeOfflinePacks', () => {
  it('counts each pack against what is cached', () => {
    const summary = summarizeOfflinePacks({
      packs,
      cachedUrls: [
        'https://host/assets/offline-packs/thumbnails-glo/1.png',
        'https://host/assets/offline-packs/thumbnails-glo/2.png',
        'https://host/assets/offline-packs/ship-thumbnails/9.png',
        'https://host/assets/placeholders/character-card.svg',
      ],
    });

    expect(summary).toEqual([
      {
        id: 'thumbnails-glo',
        label: 'Global thumbnails',
        fileCount: 5384,
        totalBytes: 54_801_747,
        cachedCount: 2,
      },
      {
        id: 'ship-thumbnails',
        label: 'Ship thumbnails',
        fileCount: 63,
        totalBytes: 502_890,
        cachedCount: 1,
      },
    ]);
  });

  it('reports zero for a pack nothing has reached yet', () => {
    const [glo] = summarizeOfflinePacks({ packs, cachedUrls: [] });

    expect(glo.cachedCount).toBe(0);
    expect(glo.fileCount).toBe(5384);
  });
});

describe('readRuntimeMediaUrls', () => {
  it('reads only the runtime media caches, across every version present', async () => {
    const urls = await readRuntimeMediaUrls(
      fakeCaches({
        'ngsw:/:aaa:data:dynamic:runtime-media:cache': ['/assets/offline-packs/thumbnails-glo/1.png'],
        'ngsw:/:bbb:data:dynamic:runtime-media:cache': ['/assets/offline-packs/thumbnails-glo/2.png'],
        'ngsw:/:aaa:assets:app:cache': ['/main.js'],
      }),
    );

    expect(urls).toEqual([
      '/assets/offline-packs/thumbnails-glo/1.png',
      '/assets/offline-packs/thumbnails-glo/2.png',
    ]);
  });

  it('reads nothing where there is no cache storage at all', async () => {
    expect(await readRuntimeMediaUrls(null)).toEqual([]);
    expect(await readRuntimeMediaUrls(undefined)).toEqual([]);
  });

  it('reads nothing rather than throwing when the browser blocks storage', async () => {
    const hostile = {
      keys: async () => {
        throw new Error('denied');
      },
    } as never;

    expect(await readRuntimeMediaUrls(hostile)).toEqual([]);
  });
});

describe('the cap this screen quotes', () => {
  it('is the number ngsw-config.json actually configures', async () => {
    const { readFile } = await import('node:fs/promises');
    const config = JSON.parse(await readFile('ngsw-config.json', 'utf8')) as {
      dataGroups: Array<{ name: string; cacheConfig: { maxSize: number } }>;
    };
    const runtimeMedia = config.dataGroups.find((group) => group.name === 'runtime-media');

    expect(runtimeMedia?.cacheConfig.maxSize).toBe(RUNTIME_MEDIA_MAX_ENTRIES);
  });

  it('covers the offline packs, which is why the number is worth quoting', async () => {
    const { readFile } = await import('node:fs/promises');
    const config = JSON.parse(await readFile('ngsw-config.json', 'utf8')) as {
      dataGroups: Array<{ name: string; urls: string[] }>;
    };
    const runtimeMedia = config.dataGroups.find((group) => group.name === 'runtime-media');

    expect(runtimeMedia?.urls).toContain('/assets/offline-packs/**');
  });
});
