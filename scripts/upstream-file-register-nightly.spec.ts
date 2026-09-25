import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  buildReleaseTriggerReport,
  checkOptcReleaseNeeded,
  checkUpstreamFileRegister,
  formatReleaseTriggerSummary,
  formatUpstreamFileRegister,
} from './check-optc-release-needed.mjs';
import { dataImportSources } from './import-optc-data.mjs';

/*
 * 869f63gtp. The nightly release check fetches upstream's common/data listing and reports - never
 * blocks on - a file the register does not classify. flags.js, drops.js and banners.js each
 * appeared upstream and sat unread with nobody told; this is the look that names the next one.
 */

const SOURCE = dataImportSources['2shankz'];

let tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.map((dir) => rm(dir, { recursive: true, force: true })));
  tempDirs = [];
});

async function writeWorkspace() {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'optc-upstream-register-'));
  tempDirs.push(dir);
  const registerPath = path.join(dir, 'import-pipeline.json');
  const manifestPath = path.join(dir, 'optc-manifest.json');
  const seedPath = path.join(dir, 'optc-seed.sql');

  await writeFile(
    registerPath,
    JSON.stringify({
      upstreamFiles: {
        repository: SOURCE.repository,
        files: [
          { name: 'units.js', status: 'read' },
          { name: 'version.js', status: 'read' },
          { name: 'captains.js', status: 'deliberately-unread' },
        ],
      },
    }),
  );
  await writeFile(manifestPath, '{ "sourceVersion": "36" }\n');
  await writeFile(
    seedPath,
    "CREATE TABLE characters (id INTEGER PRIMARY KEY, name TEXT);\nINSERT INTO characters (id, name) VALUES (1, 'Fixture Luffy');\n",
  );

  return { registerPath, manifestPath, seedPath };
}

function listingFetch(names: string[], calls: string[] = []) {
  return async (url: string) => {
    calls.push(url);

    if (url.includes('/contents/common/data')) {
      return {
        ok: true,
        status: 200,
        json: async () => names.map((name) => ({ type: 'file', name, size: 1 })),
        text: async () => '',
      };
    }

    const text = url.endsWith('/common/data/version.js')
      ? 'var dbVersion = "36";\n'
      : 'window.units = { "1": { id: "1", name: "Fixture Luffy", type: "STR", class: ["Fighter"], stars: "5" }, "2": { id: "2", name: "Fixture Zoro", type: "DEX", class: ["Slasher"], stars: "5" } };\n';

    return { ok: true, status: 200, text: async () => text };
  };
}

describe('checkUpstreamFileRegister', () => {
  it('names a file upstream added that the register does not classify, without blocking', async () => {
    const { registerPath } = await writeWorkspace();
    const finding = await checkUpstreamFileRegister({
      source: SOURCE,
      registerPath,
      fetchImpl: listingFetch(['units.js', 'version.js', 'captains.js', 'banners.js']),
    });

    expect(finding).toEqual({
      blocking: false,
      status: 'drift',
      unclassifiedFiles: ['banners.js'],
      missingFiles: [],
    });
  });

  it('names a registered file upstream no longer has', async () => {
    const { registerPath } = await writeWorkspace();
    const finding = await checkUpstreamFileRegister({
      source: SOURCE,
      registerPath,
      fetchImpl: listingFetch(['units.js', 'version.js']),
    });

    expect(finding).toMatchObject({ status: 'drift', unclassifiedFiles: [], missingFiles: ['captains.js'] });
  });

  it('passes when upstream lists exactly what the register classifies', async () => {
    const { registerPath } = await writeWorkspace();

    expect(
      await checkUpstreamFileRegister({
        source: SOURCE,
        registerPath,
        fetchImpl: listingFetch(['units.js', 'version.js', 'captains.js']),
      }),
    ).toMatchObject({ status: 'passed', blocking: false });
  });

  it('reports an unreachable listing as unavailable, and never throws', async () => {
    const { registerPath } = await writeWorkspace();
    const finding = await checkUpstreamFileRegister({
      source: SOURCE,
      registerPath,
      fetchImpl: async () => {
        throw new Error('network down');
      },
    });

    expect(finding).toMatchObject({ status: 'unavailable', blocking: false, reason: 'network down' });
  });

  it('never reaches the network for a replay of captured files', async () => {
    const calls: string[] = [];
    const finding = await checkUpstreamFileRegister({
      source: SOURCE,
      replay: true,
      fetchImpl: listingFetch([], calls),
    });

    expect(finding.status).toBe('skipped');
    expect(calls).toEqual([]);
  });
});

describe('checkOptcReleaseNeeded', () => {
  it('attaches the finding to the release result and leaves the release decision alone', async () => {
    const { registerPath, manifestPath, seedPath } = await writeWorkspace();
    const calls: string[] = [];
    const result = await checkOptcReleaseNeeded({
      manifestPath,
      seedPath,
      upstreamFileRegisterPath: registerPath,
      fetchImpl: listingFetch(['units.js', 'version.js', 'captains.js', 'banners.js'], calls),
      sleep: async () => undefined,
    });

    expect(result).toMatchObject({
      releaseNeeded: true,
      reason: 'new-upstream-characters',
      newCharacterIds: [2],
      upstreamFileRegister: { status: 'drift', blocking: false, unclassifiedFiles: ['banners.js'] },
    });
    expect(calls.some((url) => url.endsWith('/contents/common/data?ref=master'))).toBe(true);

    const report = buildReleaseTriggerReport({ releaseCheckResult: result });

    expect(report.upstreamFileRegister).toEqual(result.upstreamFileRegister);
    expect(formatReleaseTriggerSummary(report)).toContain(
      '- Upstream file register (never blocks a release): unclassified upstream file(s) banners.js - classify them in scripts/lib/upstream-file-register.mjs',
    );
  });
});

describe('formatUpstreamFileRegister', () => {
  it('says what to do with each kind of finding', () => {
    expect(
      formatUpstreamFileRegister({
        status: 'drift',
        unclassifiedFiles: ['a.js'],
        missingFiles: ['b.js'],
      }),
    ).toBe(
      'unclassified upstream file(s) a.js - classify them in scripts/lib/upstream-file-register.mjs; registered file(s) upstream no longer has: b.js',
    );
    expect(formatUpstreamFileRegister({ status: 'unavailable', reason: 'timeout' })).toBe(
      'unavailable (timeout)',
    );
    expect(formatUpstreamFileRegister({ status: 'passed' })).toBe('passed');
  });
});
