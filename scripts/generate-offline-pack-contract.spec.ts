import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { buildDocument } from './generate-offline-pack-contract.mjs';
import {
  IGNORED_LOCAL_FILES,
  PACK_PRECEDENCE,
  buildOfflinePackContract,
  findPackContractFailures,
  measurePackDirectory,
} from './lib/offline-pack-contract.mjs';

/**
 * 869f138qw. Two things here were nearly wrong, and both have tests because of it.
 *
 * `.DS_Store` would have made the committed document differ between a developer's disk and CI, so
 * the `--check` would have failed there for a reason that has nothing to do with the packs. And the
 * byte drift is REAL - the manifest sums a cache record rather than the files - so a guard that
 * failed on it would be red today for something nobody has decided to change.
 */

describe('measurePackDirectory', () => {
  const directories: string[] = [];

  afterEach(async () => {
    await Promise.all(directories.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
  });

  async function fixture(files: Record<string, string>) {
    const root = await mkdtemp(path.join(os.tmpdir(), 'optc-pack-'));

    directories.push(root);

    for (const [name, content] of Object.entries(files)) {
      const filePath = path.join(root, name);

      await mkdir(path.dirname(filePath), { recursive: true });
      await writeFile(filePath, content, 'utf8');
    }

    return root;
  }

  it('counts the images and their bytes', async () => {
    const root = await fixture({ 'a.png': 'xxxx', 'nested/b.png': 'yy' });

    expect(measurePackDirectory(root)).toEqual({
      fileCount: 2,
      totalBytes: 6,
      markers: [],
    });
  });

  it('records a marker file without counting it as an image', async () => {
    const root = await fixture({ 'a.png': 'xxxx', '.pack-ready': 'y' });
    const measured = measurePackDirectory(root);

    expect(measured).toMatchObject({ fileCount: 1, totalBytes: 4, markers: ['.pack-ready'] });
  });

  it('ignores an OS artifact entirely, so the document is the same on every machine', async () => {
    const root = await fixture({ 'a.png': 'xxxx', '.DS_Store': 'macos-junk' });
    const measured = measurePackDirectory(root);

    expect(measured.markers).toEqual([]);
    expect(measured.totalBytes).toBe(4);
    expect(IGNORED_LOCAL_FILES).toContain('.DS_Store');
  });
});

describe('findPackContractFailures', () => {
  const contract = (packs: unknown[]) => ({ packs }) as never;

  it('says nothing when every pack matches its manifest entry', () => {
    expect(
      findPackContractFailures(
        contract([
          { id: 'a', manifestKey: 'a', measuredFileCount: 3, manifestFileCount: 3 },
        ]),
      ),
    ).toEqual([]);
  });

  it('catches a pack the manifest never mentions', () => {
    const [failure] = findPackContractFailures(
      contract([{ id: 'rogue', manifestKey: null, measuredFileCount: 1, manifestFileCount: null }]),
    );

    expect(failure.kind).toBe('pack-without-manifest-entry');
  });

  it('catches a pack that gained or lost an image', () => {
    const [failure] = findPackContractFailures(
      contract([{ id: 'a', manifestKey: 'a', measuredFileCount: 4, manifestFileCount: 3 }]),
    );

    expect(failure.kind).toBe('pack-file-count-drift');
    expect(failure.detail).toContain('4');
    expect(failure.detail).toContain('3');
  });

  it('does NOT fail on a byte drift, which is recorded rather than enforced', () => {
    expect(
      findPackContractFailures(
        contract([
          {
            id: 'a',
            manifestKey: 'a',
            measuredFileCount: 3,
            manifestFileCount: 3,
            byteDrift: 919,
          },
        ]),
      ),
    ).toEqual([]);
  });
});

describe('buildOfflinePackContract', () => {
  it('carries both numbers and their difference', () => {
    const contract = buildOfflinePackContract({
      packsRoot: path.join('public', 'assets', 'offline-packs'),
      manifest: { packs: [{ id: 'ship-thumbnails', key: 'shipThumbnails', label: 'Ship thumbnails', fileCount: 63, totalBytes: 502_890 }] },
      cacheConfig: null,
    });
    const ships = contract.packs.find((pack) => pack.id === 'ship-thumbnails');

    expect(ships?.manifestBytes).toBe(502_890);
    expect(ships?.measuredBytes).toBe(502_890);
    expect(ships?.byteDrift).toBe(0);
  });
});

describe('the committed contract', () => {
  it('matches the packs on disk', async () => {
    const { readFile } = await import('node:fs/promises');
    const committed = JSON.parse(await readFile('docs/offline-pack-contract.json', 'utf8'));

    expect(committed).toEqual(JSON.parse(JSON.stringify(buildDocument())));
  });

  it('records no OS artifact, so it reads the same in CI as on a developer disk', async () => {
    const { readFile } = await import('node:fs/promises');
    const raw = await readFile('docs/offline-pack-contract.json', 'utf8');

    for (const artifact of IGNORED_LOCAL_FILES) {
      expect(raw).not.toContain(artifact);
    }
  });

  it('records the runtime cache that decides how much of a pack is ever offline', async () => {
    const { readFile } = await import('node:fs/promises');
    const committed = JSON.parse(await readFile('docs/offline-pack-contract.json', 'utf8'));
    const ngsw = JSON.parse(await readFile('ngsw-config.json', 'utf8'));
    const group = ngsw.dataGroups.find((entry: { name: string }) => entry.name === 'runtime-media');

    expect(committed.runtimeCache.maxSize).toBe(group.cacheConfig.maxSize);
    expect(committed.runtimeCache.maxAge).toBe(group.cacheConfig.maxAge);
  });

  it('places the two thumbnail packs in the chain, and the ship pack outside it', async () => {
    const { readFile } = await import('node:fs/promises');
    const source = await readFile('src/app/core/services/optc-repository.service.ts', 'utf8');
    const glo = source.indexOf("thumbnails-glo");
    const jap = source.indexOf("thumbnails-jap");

    /* The order the document claims is the order resolveImageUrl really tries them. */
    expect(glo).toBeGreaterThan(-1);
    expect(jap).toBeGreaterThan(glo);
    expect(PACK_PRECEDENCE['thumbnails-glo']).toBeLessThan(PACK_PRECEDENCE['thumbnails-jap']!);
    expect(PACK_PRECEDENCE['ship-thumbnails']).toBeNull();
  });
});
