import { describe, expect, it } from 'vitest';

import { dataImportSources } from './import-optc-data.mjs';
import {
  buildReleaseCheckResult,
  checkOptcReleaseNeeded,
  evaluateLegacyDataSource,
  extractCharacterIdsFromSeed,
  parseReleaseCheckArgs,
  resolveReleaseCheckOptions,
} from './check-optc-release-needed.mjs';

describe('check-optc-release-needed', () => {
  it('defaults to the 2shankz source and JSON output off', () => {
    expect(parseReleaseCheckArgs([])).toMatchObject({
      source: '2shankz',
      json: false,
    });
  });

  it('resolves bundled fixture paths from the fixture name', () => {
    const options = parseReleaseCheckArgs(['--fixture=no-change', '--json']);

    expect(options).toMatchObject({
      fixture: 'no-change',
      json: true,
    });
    expect(options.manifestPath).toMatch(/scripts[/\\]fixtures[/\\]release-check[/\\]no-change[/\\]local-manifest\.json$/);
    expect(options.seedPath).toMatch(/scripts[/\\]fixtures[/\\]release-check[/\\]no-change[/\\]local-seed\.sql$/);
    expect(options.remoteVersionPath).toMatch(/scripts[/\\]fixtures[/\\]release-check[/\\]no-change[/\\]remote-version\.js$/);
    expect(options.remoteUnitsPath).toMatch(/scripts[/\\]fixtures[/\\]release-check[/\\]no-change[/\\]remote-units\.js$/);
  });

  it('rejects unknown options', () => {
    expect(() => parseReleaseCheckArgs(['--unknown'])).toThrow('Unknown option: --unknown');
  });

  it('rejects ambiguous or incomplete replay inputs', () => {
    expect(() => parseReleaseCheckArgs(['--fixture=no-change', '--fixture-dir=/tmp/replay'])).toThrow(
      'Use either --fixture or --fixture-dir, not both.',
    );
    expect(() => parseReleaseCheckArgs(['--fixture=../no-change'])).toThrow(
      'Invalid fixture name: ../no-change',
    );
    expect(() =>
      resolveReleaseCheckOptions({ remoteVersionPath: '/tmp/version.js' }),
    ).toThrow(
      'Both --remote-version-path and --remote-units-path are required when replaying captured upstream files.',
    );
  });

  it('extracts only character table IDs from the generated SQL seed', () => {
    const ids = extractCharacterIdsFromSeed(`
      CREATE TABLE characters (id INTEGER PRIMARY KEY);
      INSERT INTO characters (id, name) VALUES (2, 'Zoro');
      INSERT INTO character_details (character_id, detail_json) VALUES (9000, '{}');
      INSERT INTO characters (
        id,
        name
      )
      VALUES (
        1,
        'Luffy'
      );
      INSERT INTO characters (id, name) VALUES (2, 'Duplicate');
    `);

    expect(ids).toEqual([1, 2]);
  });

  it('throws when the seed has no generated character rows', () => {
    expect(() => extractCharacterIdsFromSeed('CREATE TABLE ships (id INTEGER);')).toThrow(
      'No character rows found in local optc-seed.sql.',
    );
  });

  it('evaluates upstream legacy data files in a window sandbox', () => {
    const result = evaluateLegacyDataSource(`
      window.units = {
        "1": { id: "1", name: "Luffy", type: "STR", class: ["Fighter"], stars: "5" }
      };
    `);

    expect(result.units['1'].name).toBe('Luffy');
  });

  it('does not request a release for source-version-only changes', () => {
    const result = buildReleaseCheckResult({
      source: dataImportSources['2shankz'],
      localSourceVersion: '36',
      remoteSourceVersion: '37',
      localCharacterIds: [1, 2],
      remoteCharacters: [{ id: 1 }, { id: 2 }],
    });

    expect(result).toMatchObject({
      releaseNeeded: false,
      reason: 'no-new-upstream-characters',
      localCharacterCount: 2,
      remoteCharacterCount: 2,
      newCharacterIds: [],
      newCharacterCount: 0,
    });
  });

  it('requests a release when upstream includes IDs missing from the committed seed', () => {
    const result = buildReleaseCheckResult({
      source: dataImportSources['2shankz'],
      localSourceVersion: '36',
      remoteSourceVersion: '37',
      localCharacterIds: [1, 2, 4],
      remoteCharacters: [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }],
    });

    expect(result).toMatchObject({
      releaseNeeded: true,
      reason: 'new-upstream-characters',
      newCharacterIds: [3],
      newCharacterCount: 1,
    });
  });

  it('checks IDs instead of count so same-size replacements still surface new upstream IDs', () => {
    const result = buildReleaseCheckResult({
      source: dataImportSources['2shankz'],
      localSourceVersion: '36',
      remoteSourceVersion: '36',
      localCharacterIds: [1, 2],
      remoteCharacters: [{ id: 1 }, { id: 3 }],
    });

    expect(result.releaseNeeded).toBe(true);
    expect(result.newCharacterIds).toEqual([3]);
  });

  it('replays the bundled no-change fixture without requesting a release', async () => {
    await expect(checkOptcReleaseNeeded({ fixture: 'no-change' })).resolves.toMatchObject({
      releaseNeeded: false,
      reason: 'no-new-upstream-characters',
      localSourceVersion: '36',
      remoteSourceVersion: '36',
      localCharacterCount: 2,
      remoteCharacterCount: 2,
      newCharacterIds: [],
      newCharacterCount: 0,
    });
  });

  it('replays the bundled new-character fixture and requests a release', async () => {
    await expect(checkOptcReleaseNeeded({ fixture: 'new-character' })).resolves.toMatchObject({
      releaseNeeded: true,
      reason: 'new-upstream-characters',
      localSourceVersion: '36',
      remoteSourceVersion: '37',
      localCharacterCount: 2,
      remoteCharacterCount: 3,
      newCharacterIds: [3],
      newCharacterCount: 1,
    });
  });

  it('fails deterministically for the malformed error fixture', async () => {
    await expect(checkOptcReleaseNeeded({ fixture: 'error' })).rejects.toThrow();
  });
});
