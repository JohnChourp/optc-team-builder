import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import {
  buildPackListingUrl,
  buildSourceFileUrl,
  dataImportSources,
  packDefinitions,
  parseArgs,
  pinImportSourceToCommit,
  resolveSourceCommit,
  STALE_SOURCE_FLAG,
} from './import-optc-data.mjs';
import { buildDatasetDatabaseBytes, loadSqlJs } from './lib/dataset-binary.mjs';
import { buildDatasetIntegrityReport } from './lib/dataset-integrity.mjs';
import { DERIVED_COLUMNS } from './lib/dataset-provenance.mjs';
import { applyManualCharacterOverlay } from './lib/manual-character-apply.mjs';
import {
  buildAutoBuilderAbilityCatalog,
  buildManifest,
  buildPreviewPayload,
  createSqlSeed,
  createUnresolvedCatalog,
  keepGeneratedAtWhenOnlyTimestampChanged,
  readGeneratedDatasetFiles,
  writeGeneratedDatasetFiles,
} from './lib/optc-dataset.mjs';

/*
 * 869f63gtc. The dataset could not say which upstream built it: both candidate repositories report
 * `dbVersion 36`. The importer now resolves the source's branch to a commit, reads every file at
 * that commit, and records the repository and the commit in the manifest - and refuses the source
 * that stopped changing in 2024 unless a flag says so.
 */

const COMMIT_A = 'a'.repeat(40);
const COMMIT_B = 'b'.repeat(40);
const LIVE = dataImportSources['2shankz'];
const STALE = dataImportSources['optc-db'];
const EARLIER = '2026-09-01T10:00:00.000Z';
const LATER = '2026-09-25T12:00:00.000Z';

let tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.map((dir) => rm(dir, { recursive: true, force: true })));
  tempDirs = [];
});

async function makeDir(prefix: string) {
  const dir = await mkdtemp(path.join(os.tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

function textResponse(text: string, status = 200) {
  return { ok: status >= 200 && status < 300, status, text: async () => text };
}

function character(id: number, name: string) {
  return {
    id,
    name,
    type: 'STR',
    classes: ['Fighter'],
    primaryClass: 'Fighter',
    secondaryClass: null,
    stars: 5,
    starsLabel: '5',
    cost: 20,
    combo: 4,
    minHp: 1,
    minAtk: 1,
    minRcv: 1,
    maxHp: 2,
    maxAtk: 2,
    maxRcv: 2,
    growth: 1,
    regionArtwork: { exactLocal: false, thumbnailGlobal: false, thumbnailJapan: false },
    regionRelease: { availableOnGlobal: true },
    assets: { exactLocal: null, thumbnailLocal: null, thumbnailGlobal: null, thumbnailJapan: null },
    searchText: name.toLowerCase(),
    families: [],
    detail: { characterId: id, specialText: 'Deals damage', captainAbility: null },
  };
}

function outputsFor(
  characters: ReturnType<typeof character>[],
  generatedAt: string,
  sourceProvenance: { repository: string; commit: string } | null,
) {
  const manifest = buildManifest(characters, [], '36', [], generatedAt, sourceProvenance);

  return {
    manifest,
    sqlSeed: createSqlSeed(characters, [], manifest),
    unresolvedCatalog: createUnresolvedCatalog(characters, [], '36', generatedAt),
    autoBuilderAbilityCatalog: buildAutoBuilderAbilityCatalog(generatedAt, '36', []),
    preview: buildPreviewPayload(generatedAt, characters, []),
  };
}

async function writeOutputs(dataDir: string, outputs: ReturnType<typeof outputsFor>) {
  await writeGeneratedDatasetFiles(
    dataDir,
    outputs.manifest,
    outputs.sqlSeed,
    outputs.unresolvedCatalog,
    outputs.autoBuilderAbilityCatalog,
    outputs.preview,
  );
}

describe('the stale source', () => {
  it('is refused without the flag, and the refusal says why and how', () => {
    expect(() => parseArgs(['--source=optc-db'])).toThrow(/Refusing --source=optc-db/u);
    expect(() => parseArgs(['--source=optc-db'])).toThrow(/2024-08-14/u);
    expect(() => parseArgs(['--source=optc-db'])).toThrow(/dbVersion 36/u);
    expect(() => parseArgs(['--source=optc-db'])).toThrow(STALE_SOURCE_FLAG);
  });

  it('is imported when the flag says the stale data is intended', () => {
    expect(parseArgs(['--source=optc-db', STALE_SOURCE_FLAG])).toMatchObject({
      source: 'optc-db',
      allowStaleSource: true,
    });
  });

  it('is the only source marked stale - the live one needs no flag', () => {
    expect(STALE.stale?.since).toBe('2024-08-14');
    expect('stale' in LIVE).toBe(false);
    expect(parseArgs(['--source=2shankz'])).toMatchObject({ source: '2shankz', ref: null });
  });

  it('reads --ref, so a dataset can be rebuilt from the commit its manifest records', () => {
    expect(parseArgs([`--ref=${COMMIT_A}`]).ref).toBe(COMMIT_A);
    expect(parseArgs(['--ref=']).ref).toBeNull();
  });
});

describe('resolveSourceCommit', () => {
  it('asks the GitHub API for the commit the branch names', async () => {
    const calls: Array<{ url: string; accept: string }> = [];
    const commit = await resolveSourceCommit(LIVE, {
      fetchImpl: async (url: string, init: { headers: Record<string, string> }) => {
        calls.push({ url, accept: init.headers.Accept });
        return textResponse(`${COMMIT_A}\n`);
      },
      listRemoteRef: async () => {
        throw new Error('git must not be asked when the API answered');
      },
    });

    expect(commit).toBe(COMMIT_A);
    expect(calls).toEqual([
      {
        url: 'https://api.github.com/repos/2Shankz/optc-db.github.io/commits/master',
        accept: 'application/vnd.github.sha',
      },
    ]);
  });

  it('asks for the ref it is given instead of the branch', async () => {
    const urls: string[] = [];

    await resolveSourceCommit(LIVE, {
      ref: 'c62e993b',
      fetchImpl: async (url: string) => {
        urls.push(url);
        return textResponse(COMMIT_B);
      },
      listRemoteRef: async () => {
        throw new Error('git must not be asked when the API answered');
      },
    });

    expect(urls).toEqual(['https://api.github.com/repos/2Shankz/optc-db.github.io/commits/c62e993b']);
  });

  it('falls back to git ls-remote when the API cannot answer', async () => {
    const commit = await resolveSourceCommit(LIVE, {
      fetchImpl: async () => textResponse('API rate limit exceeded', 403),
      listRemoteRef: async (source: { repository: string }, ref: string) => {
        expect([source.repository, ref]).toEqual(['2Shankz/optc-db.github.io', 'master']);
        return COMMIT_B;
      },
    });

    expect(commit).toBe(COMMIT_B);
  });

  it('refuses to guess when neither answers a commit', async () => {
    const attempt = resolveSourceCommit(LIVE, {
      fetchImpl: async () => textResponse('<html>not a sha</html>'),
      listRemoteRef: async () => '',
    });

    await expect(attempt).rejects.toThrow(/2Shankz\/optc-db\.github\.io@master/u);
    await expect(
      resolveSourceCommit(LIVE, {
        fetchImpl: async () => {
          throw new Error('offline');
        },
        listRemoteRef: async () => {
          throw new Error('no git');
        },
      }),
    ).rejects.toThrow(/offline.*no git/u);
  });

  it('takes a full commit as given, asking nobody', async () => {
    const commit = await resolveSourceCommit(LIVE, {
      ref: COMMIT_A,
      fetchImpl: async () => {
        throw new Error('must not fetch');
      },
      listRemoteRef: async () => {
        throw new Error('must not list');
      },
    });

    expect(commit).toBe(COMMIT_A);
  });
});

describe('pinImportSourceToCommit', () => {
  it('reads data files and image listings at the commit, never at the branch', () => {
    const pinned = pinImportSourceToCommit(LIVE, COMMIT_A);
    const thumbnails = packDefinitions.find((pack) => pack.id === 'thumbnails-glo');

    expect(buildSourceFileUrl(pinned, 'common/data/units.js')).toBe(
      `https://raw.githubusercontent.com/2Shankz/optc-db.github.io/${COMMIT_A}/common/data/units.js`,
    );
    expect(buildPackListingUrl(pinned, thumbnails)).toBe(
      `https://api.github.com/repos/2Shankz/optc-db.github.io/contents/api/images/thumbnail?ref=${COMMIT_A}`,
    );
    expect(pinned).toMatchObject({ repository: LIVE.repository, commit: COMMIT_A });
    expect(LIVE.ref).toBe('master');
  });

  it('refuses anything that is not a full commit', () => {
    expect(() => pinImportSourceToCommit(LIVE, 'master')).toThrow(/40-character/u);
    expect(() => pinImportSourceToCommit(LIVE, 'c62e993b')).toThrow(/40-character/u);
  });
});

describe('the manifest', () => {
  it('names the repository and the commit, next to the version they disambiguate', () => {
    const manifest = buildManifest([character(1, 'Luffy')], [], '36', [], LATER, {
      repository: LIVE.repository,
      commit: COMMIT_A,
    });

    expect(manifest).toMatchObject({ sourceRepository: LIVE.repository, sourceCommit: COMMIT_A });
    expect(Object.keys(manifest).slice(0, 5)).toEqual([
      'schemaVersion',
      'generatedAt',
      'sourceVersion',
      'sourceRepository',
      'sourceCommit',
    ]);
  });

  it('writes neither field without a source, rather than a null that looks recorded', () => {
    const manifest = buildManifest([character(1, 'Luffy')], [], '36', [], LATER);

    expect(manifest).not.toHaveProperty('sourceRepository');
    expect(manifest).not.toHaveProperty('sourceCommit');
  });

  it('fails the integrity check on half a pair or a commit that cannot be rebuilt from', () => {
    const characters = [character(1, 'Luffy')];
    const catalog = buildAutoBuilderAbilityCatalog(LATER, '36', []);
    const report = (manifest: Record<string, unknown>) =>
      buildDatasetIntegrityReport({
        characters,
        ships: [],
        manifest,
        autoBuilderAbilityCatalog: catalog,
      }).errors.filter((error: string) => error.includes('manifest.source'));
    const base = buildManifest(characters, [], '36', [], LATER);

    expect(report({ ...base, sourceRepository: LIVE.repository, sourceCommit: COMMIT_A })).toEqual(
      [],
    );
    expect(report(base)).toEqual([]);
    expect(report({ ...base, sourceRepository: LIVE.repository })).toEqual([
      'manifest.sourceCommit must be a full commit sha, received undefined.',
    ]);
    expect(report({ ...base, sourceRepository: LIVE.repository, sourceCommit: 'c62e993b' })).toHaveLength(
      1,
    );
    expect(report({ ...base, sourceRepository: 'optc-db', sourceCommit: COMMIT_A })).toHaveLength(1);
  });

  it('keeps both through the manual-character overlay, which rebuilds the manifest', async () => {
    /*
     * The overlay rebuilds the manifest from the fields it names and writes the seed again - the
     * round trip that silently dropped `max_sockets` once (869f1935z). A manual character forces the
     * second write.
     */
    const rootDir = await makeDir('optc-source-commit-');
    const dataDir = path.join(rootDir, 'public', 'assets', 'data');
    const scriptsDataDir = path.join(rootDir, 'scripts', 'data');
    const sourceImageDir = path.join(scriptsDataDir, 'character-images');

    await mkdir(dataDir, { recursive: true });
    await mkdir(sourceImageDir, { recursive: true });
    await writeOutputs(
      dataDir,
      outputsFor([character(1, 'Luffy')], EARLIER, { repository: LIVE.repository, commit: COMMIT_A }),
    );
    await writeFile(path.join(scriptsDataDir, 'builder-ability-corrections.json'), '{}');
    await writeFile(
      path.join(scriptsDataDir, 'manual-characters.json'),
      JSON.stringify({
        900000: {
          id: 900000,
          name: 'Manual Luffy',
          type: 'STR',
          classes: ['Fighter'],
          stars: 6,
          cost: 55,
          combo: 4,
          minHp: 1000,
          minAtk: 500,
          minRcv: 100,
          maxHp: 3000,
          maxAtk: 1500,
          maxRcv: 300,
          growth: 0,
          image: { file: '900000.png' },
          detail: { characterId: 900000 },
        },
      }),
    );
    await writeFile(path.join(sourceImageDir, '900000.png'), 'manual-png');

    const result = await applyManualCharacterOverlay({
      rootDir,
      dataDir,
      overlayPath: path.join(scriptsDataDir, 'manual-characters.json'),
      sourceImageDir,
      exactImagesDir: path.join(rootDir, 'public', 'assets', 'exact-character-images'),
      logger: null,
    });
    const manifestFile = JSON.parse(await readFile(path.join(dataDir, 'optc-manifest.json'), 'utf8'));
    const SQL = await loadSqlJs();
    const database = new SQL.Database(
      buildDatasetDatabaseBytes(SQL, await readFile(path.join(dataDir, 'optc-seed.sql'), 'utf8')),
    );
    const [rows] = database.exec("SELECT value FROM meta WHERE key = 'manifest'");

    database.close();

    const seedManifest = JSON.parse(String(rows?.values[0]?.[0]));

    expect(result.written).toBe(true);
    expect(manifestFile.characterCount).toBe(2);
    expect(manifestFile).toMatchObject({ sourceRepository: LIVE.repository, sourceCommit: COMMIT_A });
    expect(seedManifest).toMatchObject({ sourceRepository: LIVE.repository, sourceCommit: COMMIT_A });
  });
});

describe('keepGeneratedAtWhenOnlyTimestampChanged and the recorded commit', () => {
  const roster = [character(1, 'Monkey D. Luffy'), character(2, 'Nami')];

  /*
   * The trap the decision named: the seed embeds the manifest, and upstream commits filters and
   * events the importer never reads, so a commit that moves on every release would have made every
   * installed client download the whole seed again for nothing.
   */
  it('puts the previous files back when only the timestamp and the commit moved', async () => {
    const dataDir = await makeDir('optc-kept-commit-');
    await writeOutputs(dataDir, outputsFor(roster, EARLIER, { repository: LIVE.repository, commit: COMMIT_A }));
    const previousFiles = await readGeneratedDatasetFiles(dataDir);

    await writeOutputs(dataDir, outputsFor(roster, LATER, { repository: LIVE.repository, commit: COMMIT_B }));
    expect((await readGeneratedDatasetFiles(dataDir)).sqlSeed).toContain(COMMIT_B);

    expect(await keepGeneratedAtWhenOnlyTimestampChanged({ dataDir, previousFiles })).toBe(EARLIER);
    expect(await readGeneratedDatasetFiles(dataDir)).toEqual(previousFiles);
  });

  it('lets a new commit stand when the data changed with it', async () => {
    const dataDir = await makeDir('optc-kept-commit-');
    await writeOutputs(dataDir, outputsFor(roster, EARLIER, { repository: LIVE.repository, commit: COMMIT_A }));
    const previousFiles = await readGeneratedDatasetFiles(dataDir);

    await writeOutputs(
      dataDir,
      outputsFor([...roster, character(3, 'Zoro')], LATER, { repository: LIVE.repository, commit: COMMIT_B }),
    );

    expect(await keepGeneratedAtWhenOnlyTimestampChanged({ dataDir, previousFiles })).toBeNull();
    expect(JSON.parse((await readGeneratedDatasetFiles(dataDir)).manifest).sourceCommit).toBe(COMMIT_B);
  });

  it('never keeps the old files when the repository changed, even with identical data', async () => {
    const dataDir = await makeDir('optc-kept-commit-');
    await writeOutputs(dataDir, outputsFor(roster, EARLIER, { repository: LIVE.repository, commit: COMMIT_A }));
    const previousFiles = await readGeneratedDatasetFiles(dataDir);

    await writeOutputs(dataDir, outputsFor(roster, LATER, { repository: STALE.repository, commit: COMMIT_B }));

    expect(await keepGeneratedAtWhenOnlyTimestampChanged({ dataDir, previousFiles })).toBeNull();
    expect(JSON.parse((await readGeneratedDatasetFiles(dataDir)).manifest).sourceRepository).toBe(
      STALE.repository,
    );
  });

  it('records the commit the first time, over files that recorded none', async () => {
    const dataDir = await makeDir('optc-kept-commit-');
    await writeOutputs(dataDir, outputsFor(roster, EARLIER, null));
    const previousFiles = await readGeneratedDatasetFiles(dataDir);

    await writeOutputs(dataDir, outputsFor(roster, LATER, { repository: LIVE.repository, commit: COMMIT_B }));

    expect(await keepGeneratedAtWhenOnlyTimestampChanged({ dataDir, previousFiles })).toBeNull();
    expect(JSON.parse((await readGeneratedDatasetFiles(dataDir)).manifest).sourceCommit).toBe(COMMIT_B);
  });
});

describe('the provenance of `id`', () => {
  it('describes the key upstream really uses, not a row position', () => {
    expect(DERIVED_COLUMNS.id).toMatch(/^The key of the upstream units\.js entry/u);
    expect(DERIVED_COLUMNS.id).toContain('keyed by id');
    expect(DERIVED_COLUMNS.id).toContain('1983-1');
  });
});
