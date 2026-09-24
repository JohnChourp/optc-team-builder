import '@angular/compiler';
import { describe, expect, it } from 'vitest';

import { CharacterOverridesService } from '../../core/services/character-overrides.service';
import { DriveSyncStateService } from '../../core/services/drive-sync-state.service';
import { OptcbxImportService } from '../../core/services/optcbx-import.service';
import { UserDataTransferService } from '../../core/services/user-data-transfer.service';
import { UserStateService } from '../../core/services/user-state.service';
import { parseSavedEnemiesImportPayloadValue } from './saved-enemies-transfer.utils';

/*
 * 869f6td37. A single-enemy file (`optc-enemy-skill`) carries no id; the import makes one from the
 * enemy's name. The slug kept only a-z and 0-9, so every Greek or Japanese name - and every blank
 * one - became `enemy-skill-untitled`, and the second such import read "added 0, updated 1" and
 * replaced the first enemy with the second. A Latin name never met it, which is why it survived.
 *
 * Its own file because the collision is only visible through the REAL merge: the id alone looks
 * harmless until a second import reuses it.
 */

class MemoryPreferences {
  private readonly store = new Map<string, string>();

  public async get({ key }: { key: string }): Promise<{ value: string | null }> {
    return { value: this.store.get(key) ?? null };
  }

  public async set({ key, value }: { key: string; value: string }): Promise<void> {
    this.store.set(key, value);
  }
}

function createDevice() {
  const preferences = new MemoryPreferences();
  const repository = {
    getCharactersByIds: async (ids: number[]) =>
      ids.map((id) => ({ id, name: `Character ${id}`, number: id })),
    getShips: async () => [],
  };
  const i18n = { translate: (key: string) => key };
  const driveSyncState = new DriveSyncStateService(preferences as never);
  const userState = new UserStateService(i18n as never, preferences as never, driveSyncState);
  const transfer = new UserDataTransferService(
    repository as never,
    i18n as never,
    userState,
    new CharacterOverridesService(preferences as never, driveSyncState),
    new OptcbxImportService(repository as never),
  );

  return { transfer, userState };
}

function enemyFile(name: string, notes = '') {
  return {
    schemaVersion: 1,
    source: 'optc-enemy-skill',
    exportType: 'enemy',
    enemy: {
      name,
      notes,
      selectedTypes: ['STR'],
      selectedClasses: [],
      requiredAbilities: [],
      enemyMechanics: [],
    },
  };
}

function idOf(name: string, notes = ''): string {
  return parseSavedEnemiesImportPayloadValue(enemyFile(name, notes)).enemies[0]!.id;
}

/** Imports two files into one fresh device and reports what each import did and what is stored. */
async function importBoth(
  first: ReturnType<typeof enemyFile>,
  second: ReturnType<typeof enemyFile>,
) {
  const { transfer, userState } = createDevice();
  const firstSummary = await transfer.importSavedEnemiesPayload(first);
  const secondSummary = await transfer.importSavedEnemiesPayload(second);

  return {
    summaries: [firstSummary, secondSummary].map(
      (summary) => `${summary.addedCount} added, ${summary.updatedCount} updated`,
    ),
    stored: userState.savedEnemies().map((enemy) => ({ id: enemy.id, name: enemy.name })),
  };
}

/* The slug before 869f6td37, kept as the oracle an ASCII name's id must still match. */
function asciiOnlySlug(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/["']/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

describe('Saved Enemies single-enemy import ids (869f6td37)', () => {
  it('keeps two Greek enemies apart', async () => {
    const result = await importBoth(enemyFile('Καΐδο'), enemyFile('Μπιγκ Μαμ'));

    expect(result.summaries).toEqual(['1 added, 0 updated', '1 added, 0 updated']);
    expect(result.stored).toEqual([
      { id: 'enemy-skill-μπιγκ-μαμ', name: 'Μπιγκ Μαμ' },
      { id: 'enemy-skill-καΐδο', name: 'Καΐδο' },
    ]);
  });

  it('keeps two Japanese enemies apart', async () => {
    const result = await importBoth(enemyFile('カイドウ'), enemyFile('ビッグ・マム'));

    expect(result.summaries).toEqual(['1 added, 0 updated', '1 added, 0 updated']);
    expect(result.stored).toEqual([
      { id: 'enemy-skill-ビッグ-マム', name: 'ビッグ・マム' },
      { id: 'enemy-skill-カイドウ', name: 'カイドウ' },
    ]);
  });

  it('keeps two nameless enemies apart, each under a hash of what it describes', async () => {
    // The same empty name on both, so only what the enemy describes can tell them apart.
    const result = await importBoth(enemyFile('', 'Round 1'), enemyFile('', 'Round 2'));
    const [second, first] = result.stored;

    expect(result.summaries).toEqual(['1 added, 0 updated', '1 added, 0 updated']);
    expect(first?.id).toMatch(/^enemy-skill-untitled-[0-9a-z]+$/);
    expect(second?.id).toMatch(/^enemy-skill-untitled-[0-9a-z]+$/);
    expect(first?.id).not.toBe(second?.id);
    expect(idOf('   ', 'Round 1')).toMatch(/^enemy-skill-untitled-[0-9a-z]+$/);
    // Pinned: a file imported by this version and again by the next must still land on one enemy.
    expect(first?.id).toBe('enemy-skill-untitled-v5a7x2');
  });

  it('gives an ASCII name exactly the id it always had', async () => {
    const printable = Array.from({ length: 95 }, (_, index) => String.fromCharCode(32 + index));
    const names = [
      ...printable.map((character) => `Big${character}Mom ${character}2`),
      'Eustass "Captain" Kid Whole Quest',
      "Big Mom's Tea Party!",
      '  --Kaido--  ',
    ];

    expect(names.filter((name) => idOf(name) !== `enemy-skill-${asciiOnlySlug(name)}`)).toEqual([]);
    expect(idOf('Eustass "Captain" Kid Whole Quest')).toBe(
      'enemy-skill-eustass-captain-kid-whole-quest',
    );

    const result = await importBoth(enemyFile('Kaido'), enemyFile('Big Mom'));

    expect(result.summaries).toEqual(['1 added, 0 updated', '1 added, 0 updated']);
    expect(result.stored.map((enemy) => enemy.id)).toEqual([
      'enemy-skill-big-mom',
      'enemy-skill-kaido',
    ]);
  });

  it('keeps every letter of a name that is not plain ASCII, whichever way it was typed', () => {
    expect(idOf('Kaidō')).toBe('enemy-skill-kaidō');
    expect(idOf('Big Mom (ビッグ・マム)')).toBe('enemy-skill-big-mom-ビッグ-マム');
    // NFKC: the same name typed with combining accents, or in full-width letters, is the same id.
    expect(idOf('Και\u0308\u0301δο')).toBe(idOf('Κα\u0390δο'));
    expect(idOf('ＫＡＩＤＯ')).toBe(idOf('Kaido'));
    // A vowel sign is a combining mark, not a letter: dropped, these two Thai words would collide.
    expect(idOf('กิน')).not.toBe(idOf('กัน'));
  });

  it('updates rather than duplicates when the same file is imported twice', async () => {
    for (const name of ['Καΐδο', 'カイドウ', '', 'Kaido']) {
      const result = await importBoth(enemyFile(name, 'Same file'), enemyFile(name, 'Same file'));

      expect(result.summaries, name).toEqual(['1 added, 0 updated', '0 added, 1 updated']);
      expect(result.stored, name).toHaveLength(1);
    }
  });
});
