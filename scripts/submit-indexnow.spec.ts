import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { readChangedCharacterIds, selectUrls } from './submit-indexnow.mjs';

/**
 * 869f1zxuy. What IndexNow is sent: the priority set, plus the page of every character a release
 * added or changed, read from the dataset digest's `--changed-ids-output` file and looked up in the
 * sitemap. Before this, a release submitted nothing and the push deploy submitted only the priority
 * set, so a changed character page was never submitted when it changed.
 */

const projectRoot = path.resolve(import.meta.dirname, '..');
const site = 'https://optcteambuilder.com';
const sitemap = [
  `${site}/`,
  `${site}/tabs/characters/`,
  `${site}/tabs/settings/`,
  `${site}/tools/optc-team-builder/`,
  `${site}/guides/how-to-build-an-optc-team/`,
  `${site}/characters/1/`,
  `${site}/characters/2/`,
  `${site}/characters/3/`,
];
const prioritySet = [
  `${site}/`,
  `${site}/tabs/characters/`,
  `${site}/tools/optc-team-builder/`,
  `${site}/guides/how-to-build-an-optc-team/`,
  `${site}/characters/1/`,
];

let tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.map((dir) => rm(dir, { recursive: true, force: true })));
  tempDirs = [];
});

async function makeTempDir() {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'optc-indexnow-'));
  tempDirs.push(dir);
  return dir;
}

function idsFile(characters: { added: number[]; removed: number[]; changed: number[] }) {
  return JSON.stringify({ base: { ref: 'v0.5.0' }, head: { ref: 'HEAD' }, characters });
}

describe('selectUrls', () => {
  it('submits the priority set alone when no character changed', () => {
    expect(selectUrls(sitemap)).toEqual(prioritySet);
    expect(selectUrls(sitemap, { changedCharacterIds: [] })).toEqual(prioritySet);
  });

  it("adds each changed character's page to the priority set rather than replacing it, once each", () => {
    expect(selectUrls(sitemap, { changedCharacterIds: [3, 1, 2] })).toEqual([
      ...prioritySet,
      `${site}/characters/3/`,
      `${site}/characters/2/`,
    ]);
  });

  it('submits the URL the sitemap lists, and invents none for a character without a page', () => {
    const selected = selectUrls(sitemap, { changedCharacterIds: [2, 4999] });

    expect(selected).toContain(`${site}/characters/2/`);
    expect(selected.filter((url) => url.includes('4999'))).toEqual([]);
  });

  it('fails loudly when not one changed character has a page, which means the page URL changed shape', () => {
    const drifted = sitemap.map((url) => url.replace(/\/characters\/(\d+)\/$/u, '/character/$1'));

    expect(() => selectUrls(drifted, { changedCharacterIds: [2, 3] })).toThrow(
      /None of the 2 changed characters has a page/u,
    );
  });

  it('keeps INDEXNOW_URLS a replacement for the priority set, and still adds changed pages to it', () => {
    const explicitUrls = [`${site}/tabs/settings/`];

    expect(selectUrls(sitemap, { explicitUrls })).toEqual(explicitUrls);
    expect(selectUrls(sitemap, { explicitUrls, changedCharacterIds: [2] })).toEqual([
      ...explicitUrls,
      `${site}/characters/2/`,
    ]);
  });
});

describe('readChangedCharacterIds', () => {
  it('reads the added and changed ids and leaves out the removed ones, whose pages no longer exist', async () => {
    const file = path.join(await makeTempDir(), 'ids.json');
    await writeFile(file, idsFile({ added: [301], removed: [201], changed: [101, 102] }));

    await expect(readChangedCharacterIds(file)).resolves.toEqual([301, 101, 102]);
  });

  it('reads nothing when no file is named, which is how the release runs when the digest failed', async () => {
    await expect(readChangedCharacterIds(undefined)).resolves.toEqual([]);
    await expect(readChangedCharacterIds('')).resolves.toEqual([]);
  });

  it("refuses a file that is not the digest's, rather than submitting nothing and saying so", async () => {
    const file = path.join(await makeTempDir(), 'digest.json');
    await writeFile(file, JSON.stringify({ characters: { addedCount: 1, changedCount: 2 } }));

    await expect(readChangedCharacterIds(file)).rejects.toThrow(/not a dataset-change-digest/u);
  });
});

/*
 * The script as the release workflow runs it, over a sitemap the REAL generator wrote - so the page
 * URL a changed id resolves to is the generator's, not a guess in this file. A dry run must list
 * the pages and send nothing: the endpoint is port 0, which nothing can listen on, so a run that
 * tried to POST would fail instead of passing.
 */
describe('submit-indexnow.mjs in a dry run', () => {
  let siteDir = '';

  beforeAll(async () => {
    siteDir = await mkdtemp(path.join(os.tmpdir(), 'optc-indexnow-site-'));
    const seedPath = path.join(siteDir, 'fixture-seed.sql');
    await writeFile(
      path.join(siteDir, 'index.html'),
      '<!doctype html>\n<html lang="en">\n<head>\n  <title>Shell</title>\n</head>\n<body>\n  <app-root></app-root>\n</body>\n</html>\n',
    );
    await writeFile(
      seedPath,
      [1, 2, 4645]
        .map(
          (id) => `INSERT INTO characters (id, name, is_incomplete, type, primary_class, secondary_class, classes_json, stars, cost, assets_json)
VALUES (${id}, 'Fixture ${id}', 0, 'STR', 'Fighter', 'Slasher', '["Fighter","Slasher"]', 5, 30, '{}');
INSERT INTO character_details (character_id, detail_json)
VALUES (${id}, '{"characterId":${id},"captainAbility":null,"specialName":null,"specialText":null,"supportData":[],"partyConflictKeys":[],"rumbleData":null}');`,
        )
        .join('\n'),
    );

    execFileSync(process.execPath, ['scripts/generate-seo-pages.mjs'], {
      cwd: projectRoot,
      env: { ...process.env, SEO_OUTPUT_DIR: siteDir, SEO_SEED_PATH: seedPath, SEO_SITE_BASE_URL: site },
      encoding: 'utf8',
    });
  }, 120_000);

  afterAll(async () => {
    await rm(siteDir, { recursive: true, force: true });
  });

  it("lists the changed characters' pages exactly as the generator wrote them, and sends nothing", async () => {
    const idsPath = path.join(await makeTempDir(), 'ids.json');
    await writeFile(idsPath, idsFile({ added: [4645], removed: [], changed: [2] }));
    const generated = [...(await readFile(path.join(siteDir, 'sitemap.xml'), 'utf8')).matchAll(/<loc>([^<]+)<\/loc>/gu)].map(
      (match) => match[1],
    );

    const run = spawnSync(process.execPath, ['scripts/submit-indexnow.mjs'], {
      cwd: projectRoot,
      env: {
        ...process.env,
        SEO_OUTPUT_DIR: siteDir,
        SEO_SITE_BASE_URL: site,
        INDEXNOW_URLS: '',
        INDEXNOW_CHANGED_IDS_FILE: idsPath,
        INDEXNOW_DRY_RUN: '1',
        INDEXNOW_ENDPOINT: 'http://127.0.0.1:0/indexnow-must-not-be-called',
      },
      encoding: 'utf8',
    });
    const listed = run.stdout.split('\n').filter((line) => line.startsWith('https://'));

    expect(run.status, run.stderr).toBe(0);
    expect(run.stdout).toContain('dry run, nothing sent');
    expect(listed).toContain(`${site}/`);
    expect(listed).toContain(`${site}/characters/2/`);
    expect(listed).toContain(`${site}/characters/4645/`);
    expect(listed.filter((url) => !generated.includes(url))).toEqual([]);
  });
});
