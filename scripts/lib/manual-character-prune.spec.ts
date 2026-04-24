import { access, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  collectManualImageOverrideFiles,
  pruneManualCharactersCoveredByImport,
} from './manual-character-prune.mjs';

describe('manual character import pruning', () => {
  it('removes imported manual records while keeping true custom records and referenced images', async () => {
    const rootDir = await mkdirFixtureWorkspace();
    const overlayPath = path.join(rootDir, 'scripts', 'data', 'manual-characters.json');
    const sourceImageDir = path.join(rootDir, 'scripts', 'data', 'character-images');
    const logs: string[] = [];
    const imageOverrides = new Map([
      [300, { source: 'manual', file: 'override.png' }],
      [301, { source: 'upstream', packKey: 'thumbnailsJapan', relativePath: '0/000/0301.png' }],
    ]);

    await writeFile(
      overlayPath,
      JSON.stringify(
        {
          '100': createRecord({
            id: 100,
            name: 'Direct Manual Override',
            image: { file: 'direct.png', thumbnailFile: 'direct-thumb.jpg' },
            characterId: 100,
          }),
          '900001': createRecord({
            id: 900001,
            name: 'Linked Manual Variant',
            image: { file: 'linked.png', thumbnailFile: 'shared-thumb.jpg' },
            characterId: 200,
          }),
          '900002': createRecord({
            id: 900002,
            name: 'True Custom Character',
            image: { file: 'custom.png', thumbnailFile: 'shared-thumb.jpg' },
            characterId: 900002,
          }),
          '300': createRecord({
            id: 300,
            name: 'Manual Override With Preserved Image Override',
            image: { file: 'override.png' },
            characterId: 300,
          }),
        },
        null,
        2,
      ),
    );

    for (const fileName of [
      'direct.png',
      'direct-thumb.jpg',
      'linked.png',
      'shared-thumb.jpg',
      'custom.png',
      'override.png',
    ]) {
      await writeFile(path.join(sourceImageDir, fileName), fileName);
    }

    const result = await pruneManualCharactersCoveredByImport({
      importedCharacterIds: [100, 200, 300],
      overlayPath,
      sourceImageDir,
      preservedImageFiles: collectManualImageOverrideFiles(imageOverrides),
      logger: (message) => logs.push(message),
    });

    expect(result).toMatchObject({
      pruned: true,
      retainedCount: 1,
      removedImageFiles: ['direct.png', 'direct-thumb.jpg', 'linked.png'],
    });
    expect(result.removedRecords.map((record) => record.id)).toEqual([100, 300, 900001]);
    expect(logs.join('\n')).toContain('100 Direct Manual Override');
    expect(logs.join('\n')).toContain('900001->200 Linked Manual Variant');

    const nextOverlay = JSON.parse(await readFile(overlayPath, 'utf8'));
    expect(Object.keys(nextOverlay)).toEqual(['900002']);
    expect(nextOverlay['900002']).toMatchObject({
      name: 'True Custom Character',
      detail: { characterId: 900002 },
    });

    await expectFileMissing(path.join(sourceImageDir, 'direct.png'));
    await expectFileMissing(path.join(sourceImageDir, 'direct-thumb.jpg'));
    await expectFileMissing(path.join(sourceImageDir, 'linked.png'));
    await expectFileExists(path.join(sourceImageDir, 'shared-thumb.jpg'));
    await expectFileExists(path.join(sourceImageDir, 'custom.png'));
    await expectFileExists(path.join(sourceImageDir, 'override.png'));
  });

  it('does not rewrite the overlay when no manual records are covered by imported ids', async () => {
    const rootDir = await mkdirFixtureWorkspace();
    const overlayPath = path.join(rootDir, 'scripts', 'data', 'manual-characters.json');
    const sourceImageDir = path.join(rootDir, 'scripts', 'data', 'character-images');
    const overlayJson = JSON.stringify(
      {
        '900002': createRecord({
          id: 900002,
          name: 'True Custom Character',
          image: { file: 'custom.png' },
          characterId: 900002,
        }),
      },
      null,
      2,
    );

    await writeFile(overlayPath, overlayJson);
    await writeFile(path.join(sourceImageDir, 'custom.png'), 'custom.png');

    const result = await pruneManualCharactersCoveredByImport({
      importedCharacterIds: [100],
      overlayPath,
      sourceImageDir,
    });

    expect(result.pruned).toBe(false);
    expect(await readFile(overlayPath, 'utf8')).toBe(overlayJson);
    await expectFileExists(path.join(sourceImageDir, 'custom.png'));
  });
});

async function mkdirFixtureWorkspace() {
  const rootDir = await mkdtemp(path.join(tmpdir(), 'optc-manual-prune-'));

  await mkdir(path.join(rootDir, 'scripts', 'data', 'character-images'), { recursive: true });
  return rootDir;
}

function createRecord({
  id,
  name,
  image,
  characterId,
}: {
  id: number;
  name: string;
  image: { file: string; thumbnailFile?: string };
  characterId: number;
}) {
  return {
    id,
    name,
    type: 'STR',
    classes: ['Fighter'],
    stars: 5,
    cost: 30,
    combo: 4,
    minHp: 1,
    minAtk: 1,
    minRcv: 1,
    maxHp: 1,
    maxAtk: 1,
    maxRcv: 1,
    growth: 0,
    image,
    detail: {
      characterId,
      specialText: null,
    },
  };
}

async function expectFileExists(filePath: string) {
  await expect(access(filePath)).resolves.toBeUndefined();
}

async function expectFileMissing(filePath: string) {
  await expect(access(filePath)).rejects.toMatchObject({ code: 'ENOENT' });
}
