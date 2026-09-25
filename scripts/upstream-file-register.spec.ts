import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { buildDocument, findUpstreamRegisterProblems } from './generate-import-pipeline.mjs';
import { dataImportSources } from './import-optc-data.mjs';
import {
  UNREAD_UPSTREAM_FILES,
  UPSTREAM_REGISTER_REPOSITORY,
  buildUpstreamFileRegister,
  compareUpstreamListingWithRegister,
  extractImporterUpstreamReads,
  fetchUpstreamDataListing,
  findUpstreamRegisterDisagreements,
  readRecordedListing,
  readUpstreamDataFileNames,
} from './lib/upstream-file-register.mjs';

/*
 * 869f63gtp. The register of every file in upstream's common/data. Which files are read comes
 * from the importer's own source; why the others are not is UNREAD_UPSTREAM_FILES; the check fails
 * when the two disagree, and when upstream lists a file nobody classified.
 */

const IMPORTER = `
  /* A comment is not a read: evaluateLegacyFile('common/data/captains.js', source) */
  // Neither is this: evaluateLegacyFile("common/data/events.js", source);
  const a = evaluateLegacyFile('common/data/units.js', source);
  const b = evaluateLegacyFile("common/js/utils.js", source);
  const c = fetchJson(buildSourceFileUrl(source, \`common/data/rumble.json\`), source);
  const d = evaluateLegacyFile('common/data/units.js', source);
`;

function listing(names: string[]) {
  return {
    repository: UPSTREAM_REGISTER_REPOSITORY,
    directory: 'common/data',
    commit: 'c'.repeat(40),
    listedAt: '2026-09-25',
    files: names.map((name) => ({ name, bytes: 10, lastChanged: '2026-09-25T00:00:00Z' })),
  };
}

function jsonResponse(body: unknown, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

describe('extractImporterUpstreamReads', () => {
  it('lists each literal upstream path once, and nothing a comment only mentions', () => {
    expect(extractImporterUpstreamReads(IMPORTER)).toEqual([
      'common/data/rumble.json',
      'common/data/units.js',
      'common/js/utils.js',
    ]);
    expect(readUpstreamDataFileNames(extractImporterUpstreamReads(IMPORTER))).toEqual([
      'rumble.json',
      'units.js',
    ]);
  });

  it('refuses an importer that builds a path at run time, which it could not list', () => {
    const built = "const name = 'units'; fetch(`common/data/${name}.js`);";

    expect(() => extractImporterUpstreamReads(built)).toThrow(/builds an upstream path/u);
  });
});

describe('buildUpstreamFileRegister', () => {
  it('marks what the importer reads as read, and everything else by its classification', () => {
    const register = buildUpstreamFileRegister({
      importerSource: IMPORTER,
      listing: listing(['units.js', 'rumble.json', 'captains.js', 'defenses.js', 'new.js']),
      classifications: {
        'captains.js': { status: 'deliberately-unread', reason: 'executable' },
        'defenses.js': { status: 'never-evaluated', reason: null },
      },
    });

    expect(register.files.map((file: { name: string; status: string }) => [file.name, file.status])).toEqual([
      ['captains.js', 'deliberately-unread'],
      ['defenses.js', 'never-evaluated'],
      ['new.js', 'unclassified'],
      ['rumble.json', 'read'],
      ['units.js', 'read'],
    ]);
    expect(register.statusCounts).toMatchObject({
      read: 2,
      'deliberately-unread': 1,
      'never-evaluated': 1,
      unclassified: 1,
    });
    expect(register.importerAlsoReads).toEqual(['common/js/utils.js']);
    expect(readRecordedListing(register)?.files[0]).toEqual({
      name: 'captains.js',
      bytes: 10,
      lastChanged: '2026-09-25T00:00:00Z',
    });
  });
});

describe('findUpstreamRegisterDisagreements', () => {
  const kinds = (findings: Array<{ kind: string; name: string }>) =>
    findings.map((finding) => `${finding.kind}:${finding.name}`);

  it('finds nothing when the importer, the listing and the classifications agree', () => {
    const classifications = { 'captains.js': { status: 'deliberately-unread', reason: 'executable' } };
    const register = buildUpstreamFileRegister({
      importerSource: IMPORTER,
      listing: listing(['units.js', 'rumble.json', 'captains.js']),
      classifications,
    });

    expect(findUpstreamRegisterDisagreements({ importerSource: IMPORTER, register, classifications })).toEqual(
      [],
    );
  });

  it('names each way they can disagree', () => {
    const classifications = {
      'units.js': { status: 'pending', reason: 'adopted by open work' },
      'gone.js': { status: 'never-evaluated', reason: null },
      'captains.js': { status: 'deliberately-unread', reason: ' ' },
      'odd.js': { status: 'read', reason: 'a status an unread file cannot have' },
    };
    const register = buildUpstreamFileRegister({
      importerSource: IMPORTER,
      listing: listing(['units.js', 'captains.js', 'odd.js', 'new.js']),
      classifications,
    });

    expect(
      kinds(findUpstreamRegisterDisagreements({ importerSource: IMPORTER, register, classifications })).sort(),
    ).toEqual(
      [
        'classification-without-file:gone.js',
        'classification-without-reason:captains.js',
        'classified-file-is-read:units.js',
        'invalid-classification:odd.js',
        'read-file-not-listed:rumble.json',
        'unclassified-file:new.js',
      ].sort(),
    );
  });
});

describe('compareUpstreamListingWithRegister', () => {
  it('names a file upstream added and a registered file upstream removed', () => {
    const register = buildUpstreamFileRegister({
      importerSource: IMPORTER,
      listing: listing(['units.js', 'rumble.json', 'captains.js']),
      classifications: { 'captains.js': { status: 'deliberately-unread', reason: 'executable' } },
    });

    expect(
      compareUpstreamListingWithRegister({
        listedNames: ['units.js', 'rumble.json', 'banners.js'],
        register,
      }),
    ).toEqual({ unclassifiedFiles: ['banners.js'], missingFiles: ['captains.js'] });
  });
});

describe('fetchUpstreamDataListing', () => {
  it('lists the files at a ref in one request, and ignores directories', async () => {
    const urls: string[] = [];
    const result = await fetchUpstreamDataListing({
      ref: 'master',
      token: '',
      fetchImpl: async (url: string) => {
        urls.push(url);
        return jsonResponse([
          { type: 'file', name: 'units.js', size: 5 },
          { type: 'dir', name: 'old' },
          { type: 'file', name: 'aliases.js', size: 7 },
        ]);
      },
    });

    expect(urls).toEqual([
      'https://api.github.com/repos/2Shankz/optc-db.github.io/contents/common/data?ref=master',
    ]);
    expect(result.files).toEqual([
      { name: 'aliases.js', bytes: 7, lastChanged: null },
      { name: 'units.js', bytes: 5, lastChanged: null },
    ]);
  });

  it('asks for each file\'s last change only when told to', async () => {
    const urls: string[] = [];
    const result = await fetchUpstreamDataListing({
      ref: 'abc',
      token: '',
      withLastChange: true,
      fetchImpl: async (url: string) => {
        urls.push(url);
        return url.includes('/contents/')
          ? jsonResponse([{ type: 'file', name: 'units.js', size: 5 }])
          : jsonResponse([{ commit: { committer: { date: '2026-09-18T03:31:09Z' } } }]);
      },
    });

    expect(urls[1]).toBe(
      'https://api.github.com/repos/2Shankz/optc-db.github.io/commits?path=common%2Fdata%2Funits.js&sha=abc&per_page=1',
    );
    expect(result.files).toEqual([{ name: 'units.js', bytes: 5, lastChanged: '2026-09-18T03:31:09Z' }]);
  });

  it('fails loudly on an answer that is not a listing', async () => {
    await expect(
      fetchUpstreamDataListing({ token: '', fetchImpl: async () => jsonResponse({ message: 'Not Found' }, 404) }),
    ).rejects.toThrow(/404/u);
    await expect(
      fetchUpstreamDataListing({ token: '', fetchImpl: async () => jsonResponse({ message: 'a file' }) }),
    ).rejects.toThrow(/directory listing/u);
  });
});

describe('the committed register', () => {
  const committed = JSON.parse(readFileSync('docs/import-pipeline.json', 'utf8')).upstreamFiles;
  const importer = readFileSync('scripts/import-optc-data.mjs', 'utf8');
  const byName = new Map(
    committed.files.map((file: { name: string; status: string; reason: string | null }) => [file.name, file]),
  );

  it("names the importer's default source", () => {
    expect(UPSTREAM_REGISTER_REPOSITORY).toBe(dataImportSources['2shankz'].repository);
    expect(committed.repository).toBe(UPSTREAM_REGISTER_REPOSITORY);
  });

  it('classifies all 32 files upstream listed, and agrees with the importer', () => {
    expect(committed.fileCount).toBe(32);
    expect(committed.statusCounts.unclassified).toBe(0);
    expect(findUpstreamRegisterProblems(buildDocument())).toEqual([]);

    const read = committed.files
      .filter((file: { status: string }) => file.status === 'read')
      .map((file: { name: string }) => file.name);

    expect(read).toEqual(readUpstreamDataFileNames(extractImporterUpstreamReads(importer)));
  });

  it('carries the current status of the four files this wave adopted', () => {
    expect(byName.get('families.js')).toMatchObject({ status: 'read' });

    for (const name of ['aliases.js', 'shops.js', 'banners.js']) {
      const file = byName.get(name) as { status: string; reason: string | null };

      /* 869f63gm1 adopts these; until its importer change merges they are pending, then read. */
      expect(['read', 'pending'], name).toContain(file.status);

      if (file.status === 'pending') {
        expect(file.reason, name).toContain('869f63gm1');
      }
    }
  });

  it('gives every file it leaves unread deliberately a reason', () => {
    for (const file of committed.files) {
      if (['deliberately-unread', 'pending'].includes(file.status)) {
        expect(String(file.reason ?? '').trim().length, file.name).toBeGreaterThan(20);
      }
    }

    expect(Object.keys(UNREAD_UPSTREAM_FILES).every((name) => byName.has(name))).toBe(true);
  });

  it('fails the check the day the importer starts reading a file the register calls unread', () => {
    const readsDefenses = `${importer}\nevaluateLegacyFile('common/data/defenses.js', source);`;

    expect(
      findUpstreamRegisterDisagreements({
        importerSource: readsDefenses,
        register: buildUpstreamFileRegister({
          importerSource: readsDefenses,
          listing: readRecordedListing(committed),
        }),
      }).map((finding: { kind: string; name: string }) => `${finding.kind}:${finding.name}`),
    ).toEqual(['classified-file-is-read:defenses.js']);
  });

  it('fails the check when upstream lists a file nobody classified', () => {
    const recorded = readRecordedListing(committed);
    const withNewFile = {
      ...recorded,
      files: [...recorded.files, { name: 'newfile.js', bytes: 1, lastChanged: null }],
    };

    expect(
      findUpstreamRegisterProblems(buildDocument({ upstreamListing: withNewFile })).map(
        (finding: { kind: string; name: string }) => `${finding.kind}:${finding.name}`,
      ),
    ).toEqual(['unclassified-file:newfile.js']);
  });
});
