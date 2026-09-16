import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeAll, describe, expect, it } from 'vitest';

import {
  DATASET_BINARY_URL,
  DATASET_SEED_URL,
  LARGE_ASSET_BYTES,
  PREFETCH_CACHED_BUDGET_BYTES,
  extensionOf,
  formatDatasetDeliveryResult,
  inspectDatasetDelivery,
  inspectShippedDataFiles,
  isHostCompressedOrPrecompressed,
  readRuntimeDataFiles,
} from './check-dataset-delivery.mjs';
import {
  buildDatasetDatabaseBytes,
  gzipDatasetDatabase,
  loadSqlJs,
} from './lib/dataset-binary.mjs';

const SEED = `CREATE TABLE characters (id INTEGER PRIMARY KEY, name TEXT NOT NULL);
INSERT INTO characters (id, name) VALUES (1, 'Monkey D. Luffy');
INSERT INTO characters (id, name) VALUES (2, 'Nami');
`;

type SqlJs = Awaited<ReturnType<typeof loadSqlJs>>;

let SQL: SqlJs;
let tempDirs: string[] = [];

beforeAll(async () => {
  SQL = await loadSqlJs();
});

afterEach(async () => {
  await Promise.all(tempDirs.map((dir) => rm(dir, { recursive: true, force: true })));
  tempDirs = [];
});

const LARGE = Buffer.alloc(LARGE_ASSET_BYTES + 1, 0x41);

interface GroupFixture {
  name: string;
  installMode: 'prefetch' | 'lazy';
  urls: string[];
}

/*
 * The shape the real build has: several prefetch groups, nested paths, a lazy group that must be
 * ignored, and more than one file per group - a reader that stopped after the first file or the
 * first group would pass a one-file fixture.
 */
async function makeDist({
  groups,
  files,
  seed = SEED,
  binary = gzipDatasetDatabase(buildDatasetDatabaseBytes(SQL, SEED)),
}: {
  groups?: GroupFixture[];
  files?: Record<string, Buffer | string>;
  seed?: string;
  binary?: Uint8Array | null;
}) {
  const distDir = await mkdtemp(path.join(os.tmpdir(), 'optc-dataset-delivery-'));
  tempDirs.push(distDir);

  const allFiles: Record<string, Buffer | string | Uint8Array> = {
    '/index.html': '<!doctype html>',
    '/main-ABC.js': LARGE,
    '/chunk-DEF.js': 'export {};',
    '/i18n/app/en.json': LARGE,
    '/i18n/app/el.json': '{}',
    '/assets/data/optc-manifest.json': '{}',
    '/assets/vendor/sql.js/sql-wasm.wasm': LARGE,
    '/brand/logo.png': LARGE,
    [DATASET_SEED_URL]: seed,
    ...files,
  };

  if (binary) {
    allFiles[DATASET_BINARY_URL] = binary;
  }

  for (const [url, content] of Object.entries(allFiles)) {
    const filePath = path.join(distDir, url.slice(1));
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, content);
  }

  const assetGroups = groups ?? [
    { name: 'app', installMode: 'prefetch', urls: ['/index.html', '/main-ABC.js', '/chunk-DEF.js'] },
    { name: 'i18n', installMode: 'prefetch', urls: ['/i18n/app/el.json', '/i18n/app/en.json'] },
    {
      name: 'data',
      installMode: 'prefetch',
      urls: ['/assets/data/optc-manifest.json', DATASET_BINARY_URL, '/assets/vendor/sql.js/sql-wasm.wasm'],
    },
    { name: 'assets', installMode: 'lazy', urls: ['/brand/logo.png'] },
  ];

  await writeFile(
    path.join(distDir, 'ngsw.json'),
    JSON.stringify({ configVersion: 1, assetGroups, hashTable: {} }),
  );

  return distDir;
}

function kinds(result: { findings: Array<{ kind: string }> }) {
  return result.findings.map((finding) => finding.kind);
}

describe('check-dataset-delivery', () => {
  it('passes a build that ships the compressed database and prefetches nothing large and raw', async () => {
    const result = await inspectDatasetDelivery({ distDir: await makeDist({}), SQL });

    expect(kinds(result)).toEqual([]);
    expect(result.ok).toBe(true);
    /* The lazy group is not install cost; every prefetch file was read, from all three groups. */
    expect(result.assets.map((asset) => asset.url)).toEqual([
      '/index.html',
      '/main-ABC.js',
      '/chunk-DEF.js',
      '/i18n/app/el.json',
      '/i18n/app/en.json',
      '/assets/data/optc-manifest.json',
      DATASET_BINARY_URL,
      '/assets/vendor/sql.js/sql-wasm.wasm',
    ]);
    expect(formatDatasetDeliveryResult(result)).toContain('Status: passed');
  });

  /* The defect this guard exists for: the seed in the prefetch group, as a type the host ships raw. */
  it('fails when the raw seed is prefetched, and names both problems', async () => {
    const distDir = await makeDist({
      seed: `${SEED}${'-- padding\n'.repeat(30_000)}`,
      groups: [
        { name: 'app', installMode: 'prefetch', urls: ['/index.html', '/main-ABC.js'] },
        {
          name: 'data',
          installMode: 'prefetch',
          urls: ['/assets/data/optc-manifest.json', DATASET_SEED_URL, DATASET_BINARY_URL],
        },
      ],
    });
    const result = await inspectDatasetDelivery({ distDir, SQL });

    expect(kinds(result)).toEqual(['uncompressed-prefetch-asset', 'raw-seed-prefetched']);
    expect(result.findings[0]?.detail).toContain(DATASET_SEED_URL);
    expect(formatDatasetDeliveryResult(result)).toContain('Status: FAILED');
  });

  it('fails on any large prefetched file of a type the host does not compress, in any group', async () => {
    const distDir = await makeDist({
      files: { '/assets/data/extra/catalogue.bin': LARGE },
      groups: [
        { name: 'app', installMode: 'prefetch', urls: ['/index.html', '/main-ABC.js'] },
        {
          name: 'data',
          installMode: 'prefetch',
          urls: [DATASET_BINARY_URL, '/assets/data/extra/catalogue.bin'],
        },
      ],
    });
    const result = await inspectDatasetDelivery({ distDir, SQL });

    expect(kinds(result)).toEqual(['uncompressed-prefetch-asset']);
    expect(result.findings[0]?.detail).toContain('/assets/data/extra/catalogue.bin');
  });

  it('ignores a large file that is only lazily cached', async () => {
    const distDir = await makeDist({
      files: { '/assets/data/extra/catalogue.bin': LARGE },
      groups: [
        { name: 'data', installMode: 'prefetch', urls: [DATASET_BINARY_URL] },
        { name: 'media', installMode: 'lazy', urls: ['/assets/data/extra/catalogue.bin'] },
      ],
    });

    expect(kinds(await inspectDatasetDelivery({ distDir, SQL }))).toEqual([]);
  });

  it('fails when the database is not prefetched', async () => {
    const distDir = await makeDist({
      groups: [{ name: 'app', installMode: 'prefetch', urls: ['/index.html', '/main-ABC.js'] }],
    });

    expect(kinds(await inspectDatasetDelivery({ distDir, SQL }))).toEqual(['dataset-binary-not-prefetched']);
  });

  it('fails when the shipped database is not the shipped seed', async () => {
    const stale = gzipDatasetDatabase(
      buildDatasetDatabaseBytes(SQL, SEED.replace("'Nami'", "'Nico Robin'")),
    );
    const result = await inspectDatasetDelivery({ distDir: await makeDist({ binary: stale }), SQL });

    expect(kinds(result)).toEqual(['dataset-binary-mismatch']);
    expect(result.findings[0]?.detail).toMatch(/is not the database/u);
  });

  it('fails when the database is missing from the build it is prefetched from', async () => {
    const result = await inspectDatasetDelivery({ distDir: await makeDist({ binary: null }), SQL });

    expect(kinds(result)).toEqual(['missing-prefetched-file', 'dataset-binary-mismatch']);
  });

  it('fails when there is no service worker manifest, and when it names nothing', async () => {
    const empty = await mkdtemp(path.join(os.tmpdir(), 'optc-dataset-delivery-'));
    tempDirs.push(empty);

    expect(kinds(await inspectDatasetDelivery({ distDir: empty, SQL }))).toEqual(['missing-ngsw-manifest']);

    const nothing = await makeDist({ groups: [] });
    expect(kinds(await inspectDatasetDelivery({ distDir: nothing, SQL }))).toEqual([
      'no-prefetched-assets',
      'dataset-binary-not-prefetched',
    ]);
  });

  /*
   * 869f138qe. The build shipped a zero-byte optc.db nothing had ever read, and three files only
   * scripts use - two of them prefetched on every visit. The list of what the app reads comes from
   * the app source, so it cannot drift from the code.
   */
  describe('the files the app reads', () => {
    async function makeAppRoot(files: Record<string, string>) {
      const root = await mkdtemp(path.join(os.tmpdir(), 'optc-dataset-runtime-'));
      tempDirs.push(root);

      for (const [relativePath, content] of Object.entries(files)) {
        const filePath = path.join(root, relativePath);
        await mkdir(path.dirname(filePath), { recursive: true });
        await writeFile(filePath, content);
      }

      return root;
    }

    it('reads every quoted assets/data path in app source, in any quote style, and skips specs', async () => {
      const appRoot = await makeAppRoot({
        'src/app/core/services/repository.ts': `const A = 'assets/data/optc-manifest.json';\nconst B = "assets/data/optc-auto-builder-abilities.json";`,
        'src/app/core/services/nested/loader.utils.ts': 'export const C = `/assets/data/optc-seed.sqlite.gz`;',
        'src/app/pages/home/home.page.ts': "const D = 'assets/data/optc-seed.sql';",
        'src/app/pages/home/home.page.spec.ts': "readFileSync('public/assets/data/optc-preview.json');",
        'src/app/pages/home/notes.md': "'assets/data/ignored.json'",
      });

      expect([...readRuntimeDataFiles(appRoot)].sort()).toEqual([
        'optc-auto-builder-abilities.json',
        'optc-manifest.json',
        'optc-seed.sql',
        'optc-seed.sqlite.gz',
      ]);
    });

    it('names a shipped file no app code reads, and a read file the build lacks', async () => {
      const distDir = await makeDist({
        files: {
          '/assets/data/optc-preview.json': '{}',
          '/assets/data/optc.db': '',
        },
      });
      const runtimeDataFiles = new Set(['optc-manifest.json', 'optc-seed.sql', 'optc-seed.sqlite.gz', 'missing.json']);

      const { findings, shipped } = inspectShippedDataFiles({ distDir, runtimeDataFiles });

      expect(shipped.sort()).toEqual([
        'optc-manifest.json',
        'optc-preview.json',
        'optc-seed.sql',
        'optc-seed.sqlite.gz',
        'optc.db',
      ]);
      expect(findings.map((finding) => `${finding.kind} ${finding.detail.split(' ')[0]}`)).toEqual([
        'unused-data-file assets/data/optc-preview.json',
        'unused-data-file assets/data/optc.db',
        'missing-runtime-data-file the',
      ]);
      expect(findings[2]?.detail).toContain('assets/data/missing.json');
    });

    it('passes a build that ships exactly what the app reads, and refuses an empty list', async () => {
      const distDir = await makeDist({});
      const exact = new Set(['optc-manifest.json', 'optc-seed.sql', 'optc-seed.sqlite.gz']);

      expect(inspectShippedDataFiles({ distDir, runtimeDataFiles: exact }).findings).toEqual([]);
      expect(inspectShippedDataFiles({ distDir, runtimeDataFiles: new Set() }).findings.map((f) => f.kind)).toEqual([
        'no-runtime-data-files',
        'unused-data-file',
        'unused-data-file',
        'unused-data-file',
      ]);
    });

    it('reports those findings through the whole check', async () => {
      const distDir = await makeDist({ files: { '/assets/data/optc-preview.json': '{}' } });
      const runtimeDataFiles = new Set(['optc-manifest.json', 'optc-seed.sql', 'optc-seed.sqlite.gz']);

      const result = await inspectDatasetDelivery({ distDir, SQL, runtimeDataFiles });

      expect(kinds(result)).toEqual(['unused-data-file']);
      expect(result.ok).toBe(false);
    });
  });

  /*
   * 869f138qh. The whole prefetch group, as the device caches it. Adding a large file to it is the
   * failure this rule exists for; a file that is only lazily cached does not count.
   */
  it('fails when the prefetch group as a whole goes over its budget, and not before', async () => {
    const distDir = await makeDist({});
    const within = await inspectDatasetDelivery({ distDir, SQL });
    const total = within.assets.reduce((sum, asset) => sum + (asset.bytes ?? 0), 0);

    expect(kinds(within)).toEqual([]);
    expect(kinds(await inspectDatasetDelivery({ distDir, SQL, prefetchBudgetBytes: total }))).toEqual([]);

    const over = await inspectDatasetDelivery({ distDir, SQL, prefetchBudgetBytes: total - 1 });
    expect(kinds(over)).toEqual(['prefetch-over-budget']);
    expect(over.findings[0]?.detail).toContain(`${total} B`);
  });

  it('keeps the budget identical to the one the route-load harness reports', async () => {
    const harness = await readFile(path.resolve(process.cwd(), 'scripts/perf-route-load.mjs'), 'utf8');
    const match = harness.match(/prefetchCachedBytes:\s*([\d_]+),/u);

    expect(match).not.toBeNull();
    expect(Number(match?.[1].replaceAll('_', ''))).toBe(PREFETCH_CACHED_BUDGET_BYTES);
  });

  it('classifies extensions, including names with several dots and no extension', () => {
    expect(extensionOf('/assets/data/optc-seed.sqlite.gz')).toBe('.gz');
    expect(extensionOf('/assets/data/optc-seed.sql')).toBe('.sql');
    expect(extensionOf('/manifest.webmanifest?v=2')).toBe('.webmanifest');
    expect(extensionOf('/LICENSE')).toBe('');
    expect(extensionOf('/.hidden')).toBe('');

    expect(isHostCompressedOrPrecompressed('/main-ABC.js')).toBe(true);
    expect(isHostCompressedOrPrecompressed('/assets/vendor/sql.js/sql-wasm.wasm')).toBe(true);
    expect(isHostCompressedOrPrecompressed('/assets/data/optc-seed.sqlite.gz')).toBe(true);
    expect(isHostCompressedOrPrecompressed('/assets/data/optc-seed.sql')).toBe(false);
    expect(isHostCompressedOrPrecompressed('/assets/data/optc.db')).toBe(false);
    expect(isHostCompressedOrPrecompressed('/LICENSE')).toBe(false);
  });
});
