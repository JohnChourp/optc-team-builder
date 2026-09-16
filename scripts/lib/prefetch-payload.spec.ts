import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { gzipSync } from 'node:zlib';

import { afterEach, describe, expect, it } from 'vitest';

import { PAYLOAD_FILES, estimateWireBytes, measurePrefetchPayload } from './prefetch-payload.mjs';

let tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.map((dir) => rm(dir, { recursive: true, force: true })));
  tempDirs = [];
});

/* Compressible text, so a wrong wire estimate cannot hide behind incompressible bytes. */
const TEXT = 'optc '.repeat(20_000);

async function makeDist(files: Record<string, string | Buffer>, groups: Array<{ name: string; installMode: string; urls: string[] }>) {
  const distDir = await mkdtemp(path.join(os.tmpdir(), 'optc-prefetch-payload-'));
  tempDirs.push(distDir);

  for (const [url, content] of Object.entries(files)) {
    const filePath = path.join(distDir, url.slice(1));
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, content);
  }

  await writeFile(path.join(distDir, 'ngsw.json'), JSON.stringify({ assetGroups: groups }));
  return distDir;
}

describe('prefetch payload', () => {
  it('sums every prefetched file across groups, cached and over the wire, and skips lazy ones', async () => {
    const database = Buffer.alloc(50_000, 7);
    const distDir = await makeDist(
      {
        '/main-A.js': TEXT,
        '/i18n/app/en.json': TEXT,
        [PAYLOAD_FILES.database]: database,
        [PAYLOAD_FILES.abilityCatalog]: TEXT,
        [PAYLOAD_FILES.sqlWasm]: TEXT,
        '/brand/logo.png': Buffer.alloc(40_000, 1),
      },
      [
        { name: 'app', installMode: 'prefetch', urls: ['/main-A.js'] },
        { name: 'i18n', installMode: 'prefetch', urls: ['/i18n/app/en.json'] },
        {
          name: 'data',
          installMode: 'prefetch',
          urls: [PAYLOAD_FILES.abilityCatalog, PAYLOAD_FILES.database, PAYLOAD_FILES.sqlWasm],
        },
        { name: 'assets', installMode: 'lazy', urls: ['/brand/logo.png'] },
      ],
    );
    const textGzip = gzipSync(Buffer.from(TEXT), { level: 6 }).length;

    const payload = measurePrefetchPayload(distDir);

    expect(payload.fileCount).toBe(5);
    expect(payload.missingFileCount).toBe(0);
    expect(payload.cachedBytes).toBe(TEXT.length * 4 + database.length);
    /* The database is already compressed, so it crosses the wire as it is. */
    expect(payload.wireBytes).toBe(textGzip * 4 + database.length);
    expect(payload.databaseBytes).toBe(database.length);
    expect(payload.abilityCatalogCachedBytes).toBe(TEXT.length);
    expect(payload.abilityCatalogWireBytes).toBe(textGzip);
    expect(payload.sqlWasmCachedBytes).toBe(TEXT.length);
    expect(payload.sqlWasmWireBytes).toBe(textGzip);
  });

  it('counts a file the manifest names but the build lacks, and fails without a manifest', async () => {
    const distDir = await makeDist({ '/main-A.js': TEXT }, [
      { name: 'app', installMode: 'prefetch', urls: ['/main-A.js', '/chunk-missing.js'] },
    ]);

    const payload = measurePrefetchPayload(distDir);

    expect(payload.fileCount).toBe(1);
    expect(payload.missingFileCount).toBe(1);
    expect(payload.databaseBytes).toBeNull();

    const empty = await mkdtemp(path.join(os.tmpdir(), 'optc-prefetch-payload-'));
    tempDirs.push(empty);
    expect(() => measurePrefetchPayload(empty)).toThrow(/ngsw\.json does not exist/u);
  });

  it('estimates the wire size by type: gzip for what the edge compresses, the file otherwise', async () => {
    const distDir = await makeDist({ '/a.json': TEXT, '/b.sql': TEXT, '/c.gz': TEXT }, []);

    expect(estimateWireBytes('/a.json', path.join(distDir, 'a.json'))).toBe(
      gzipSync(Buffer.from(TEXT), { level: 6 }).length,
    );
    expect(estimateWireBytes('/b.sql', path.join(distDir, 'b.sql'))).toBe(TEXT.length);
    expect(estimateWireBytes('/c.gz', path.join(distDir, 'c.gz'))).toBe(TEXT.length);
  });
});
