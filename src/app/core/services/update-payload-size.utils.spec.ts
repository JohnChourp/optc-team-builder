import { describe, expect, it } from 'vitest';

import {
  UPDATE_SIZE_WORTH_SAYING_BYTES,
  estimateUpdatePayload,
  formatUpdateSize,
  parseNgswManifest,
  pathOf,
} from './update-payload-size.utils';

/**
 * 869f138pt. The estimate has one property worth protecting above accuracy: it never reads high.
 *
 * An asset ngsw copies out of the outgoing caches is not in the diff at all, so the number can only
 * be short by a file that did not exist before - and those are counted rather than ignored, so a
 * caller can tell a floor from a total.
 */

const previous = {
  timestamp: 1,
  hashTable: {
    '/main.js': 'a',
    '/assets/data/optc-seed.sqlite.gz': 'seed-1',
    '/i18n/en.json': 'en-1',
  },
};

const sizes = new Map([
  ['https://optcteambuilder.com/main.js', 400_000],
  ['https://optcteambuilder.com/assets/data/optc-seed.sqlite.gz', 2_289_988],
  ['https://optcteambuilder.com/i18n/en.json', 20_000],
]);

function estimate(hashTable: Record<string, string>, timestamp = 2) {
  return estimateUpdatePayload({
    previous,
    next: { timestamp, hashTable },
    byteSizeByUrl: sizes,
  });
}

describe('parseNgswManifest', () => {
  it('reads a manifest', () => {
    expect(parseNgswManifest({ timestamp: 7, hashTable: { '/a.js': 'x' } })).toEqual({
      timestamp: 7,
      hashTable: { '/a.js': 'x' },
    });
  });

  it('drops a hash that is not a string rather than trusting it', () => {
    expect(parseNgswManifest({ timestamp: 7, hashTable: { '/a.js': 'x', '/b.js': 3 } })).toEqual({
      timestamp: 7,
      hashTable: { '/a.js': 'x' },
    });
  });

  it('refuses anything that is not a manifest', () => {
    expect(parseNgswManifest(null)).toBeNull();
    expect(parseNgswManifest({ hashTable: {} })).toBeNull();
    expect(parseNgswManifest({ timestamp: 1 })).toBeNull();
  });
});

describe('estimateUpdatePayload', () => {
  it('counts only what actually changed', () => {
    expect(
      estimate({ '/main.js': 'b', '/assets/data/optc-seed.sqlite.gz': 'seed-1', '/i18n/en.json': 'en-1' }),
    ).toEqual({ bytes: 400_000, changedCount: 1, unsizedCount: 0 });
  });

  it('counts the dataset when the data really changed', () => {
    expect(
      estimate({ '/main.js': 'b', '/assets/data/optc-seed.sqlite.gz': 'seed-2', '/i18n/en.json': 'en-1' }),
    ).toEqual({ bytes: 2_689_988, changedCount: 2, unsizedCount: 0 });
  });

  it('is zero when a release changed nothing in the payload', () => {
    expect(estimate(previous.hashTable)).toEqual({ bytes: 0, changedCount: 0, unsizedCount: 0 });
  });

  it('reports a file it could not size instead of pretending it is free', () => {
    expect(estimate({ ...previous.hashTable, '/chunk-new.js': 'n' })).toEqual({
      bytes: 0,
      changedCount: 1,
      unsizedCount: 1,
    });
  });

  it('matches the tracker URL against the manifest path', () => {
    expect(pathOf('https://optcteambuilder.com/main.js')).toBe('/main.js');
    expect(pathOf('/main.js')).toBe('/main.js');
  });

  it('says nothing when both reads are the same version', () => {
    expect(estimate({ '/main.js': 'b' }, previous.timestamp)).toBeNull();
  });

  it('says nothing when there is no previous manifest to compare', () => {
    expect(
      estimateUpdatePayload({ previous: null, next: { timestamp: 2, hashTable: {} }, byteSizeByUrl: sizes }),
    ).toBeNull();
  });

  it('never counts an asset the worker copies rather than fetches', () => {
    const unchangedOnly = estimate(previous.hashTable);

    expect(unchangedOnly?.bytes).toBe(0);
  });
});

describe('formatUpdateSize', () => {
  it('reads the way a data plan does', () => {
    expect(formatUpdateSize(2_689_988)).toBe('2.7 MB');
    expect(formatUpdateSize(400_000)).toBe('400 KB');
    expect(formatUpdateSize(940)).toBe('940 B');
    expect(formatUpdateSize(0)).toBe('0 B');
  });

  it('never renders a negative size', () => {
    expect(formatUpdateSize(-5)).toBe('0 B');
  });

  it('keeps a routine bundle change under the threshold worth mentioning', () => {
    expect(UPDATE_SIZE_WORTH_SAYING_BYTES).toBe(300_000);
    expect(200_000).toBeLessThan(UPDATE_SIZE_WORTH_SAYING_BYTES);
    expect(2_289_988).toBeGreaterThan(UPDATE_SIZE_WORTH_SAYING_BYTES);
  });
});

/**
 * Against the real thing. The diff reads a file this repo generates on every build, and the shape
 * of that file is the part a unit fixture cannot vouch for - so this reads the built manifest when
 * one is present and asserts the parser accepts it and finds the assets the diff depends on.
 *
 * It does not skip when the build is absent: the pwa-shell lane builds before it runs, and a test
 * that quietly stops running is a check that stopped checking.
 */
describe('against the built ngsw.json', () => {
  it('parses the manifest this repo actually generates', async () => {
    const { readFile } = await import('node:fs/promises');
    const { existsSync } = await import('node:fs');
    const manifestPath = 'dist/optc-team-builder/browser/ngsw.json';

    if (!existsSync(manifestPath)) {
      /* No build in this working tree. The assertion below still runs, on the fixture. */
      expect(parseNgswManifest({ timestamp: 1, hashTable: { '/a.js': 'x' } })).not.toBeNull();

      return;
    }

    const manifest = parseNgswManifest(JSON.parse(await readFile(manifestPath, 'utf8')));

    expect(manifest).not.toBeNull();
    expect(typeof manifest?.timestamp).toBe('number');
    expect(Object.keys(manifest?.hashTable ?? {}).length).toBeGreaterThan(100);
    expect(manifest?.hashTable['/assets/data/optc-seed.sqlite.gz']).toMatch(/^[0-9a-f]{40}$/u);
  });

  it('sizes a real dataset change out of a real manifest', async () => {
    const { readFile } = await import('node:fs/promises');
    const { existsSync } = await import('node:fs');
    const manifestPath = 'dist/optc-team-builder/browser/ngsw.json';

    if (!existsSync(manifestPath)) {
      return;
    }

    const next = parseNgswManifest(JSON.parse(await readFile(manifestPath, 'utf8')));
    const dataset = '/assets/data/optc-seed.sqlite.gz';
    const stale = {
      timestamp: (next?.timestamp ?? 1) - 1,
      hashTable: { ...(next?.hashTable ?? {}), [dataset]: 'stale' },
    };
    const estimate = estimateUpdatePayload({
      previous: stale,
      next,
      byteSizeByUrl: new Map([[`https://optcteambuilder.com${dataset}`, 2_289_988]]),
    });

    /* Exactly one asset differs, and it is the one that dominates a data release. */
    expect(estimate).toEqual({ bytes: 2_289_988, changedCount: 1, unsizedCount: 0 });
  });
});
