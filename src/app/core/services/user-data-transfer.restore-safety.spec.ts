import '@angular/compiler';
import { signal } from '@angular/core';
import { describe, expect, it, vi } from 'vitest';

import { OptcbxImportService } from './optcbx-import.service';
import { UserDataTransferService } from './user-data-transfer.service';
import {
  ALL_DATA_TRANSFER_SCOPES,
  type AllDataTransferPayload,
} from '../../pages/settings/all-data-transfer.utils';
import { buildSavedEnemiesTransferPayload } from '../../pages/saved-enemies/saved-enemies-transfer.utils';
import { buildSavedTeamsTransferPayload } from '../../pages/saved-teams/saved-teams-transfer.utils';
import { type SavedEnemy, type SavedTeam } from '../models/optc.models';

/*
 * 869f63gpg. A restore must never empty the device before it knows the backup applies.
 *
 * `applyAllDataPayload(payload, 'restore')` - what BOTH Drive paths that restore call, the reviewed
 * commit and an unreviewed "Replace this device" - clears every sync-scoped kind first and imports
 * scope by scope after. Any scope whose parser threw part-way left the device empty, with nothing
 * restored and nothing uploaded. The commonest trigger was the most innocent one: a player with no
 * favourite characters, whose backup carries `{ characters: [] }` - which the OPTCbx parser rejects,
 * correctly, when a player picks an empty FILE, and wrongly here.
 *
 * Its own file rather than the tail of `user-data-transfer.service.spec.ts`: that suite mocks
 * `parseExportPayload`, which is exactly why its restore test never met the throw. This one runs the
 * REAL OptcbxImportService, and its fakes really empty and fill state, so "wiped" is observable.
 */

const LOCAL_TEAM: SavedTeam = {
  createdAt: '2026-09-20T10:00:00.000Z',
  id: 'crew-phone-1',
  name: 'Phone crew',
  notes: 'Stage 3: stall 2 turns',
  shipId: null,
  slots: [1001, 1002, null, null, null, null],
  updatedAt: '2026-09-20T10:00:00.000Z',
};

const DRIVE_TEAM: SavedTeam = {
  ...LOCAL_TEAM,
  id: 'crew-tablet-1',
  name: 'Tablet crew',
  notes: '',
};

const LOCAL_ENEMY: SavedEnemy = {
  createdAt: '2026-09-20T10:00:00.000Z',
  enemyMechanics: [],
  id: 'enemy-phone-1',
  imageDataUrl: null,
  name: 'Kaido',
  notes: '',
  rawEnemyText: '',
  requireAllSelectedClassesPerCharacter: false,
  requireAllSelectedTypesInTeam: false,
  requiredAbilities: [],
  selectedClasses: ['Fighter'],
  selectedTypes: ['DEX'],
  updatedAt: '2026-09-20T10:00:00.000Z',
};

const EXPORTED_AT = '2026-09-24T10:00:00.000Z';

function createHarness(options: { favoriteIds?: number[] } = {}) {
  const favoriteCharacterIds = signal<number[]>(options.favoriteIds ?? []);
  const favoriteShipIds = signal<number[]>([]);
  const savedTeams = signal<SavedTeam[]>([LOCAL_TEAM]);
  const savedEnemies = signal<SavedEnemy[]>([LOCAL_ENEMY]);
  const clearCalls: string[] = [];

  const mergeById = <T extends { id: string }>(current: T[], incoming: T[]) => {
    const byId = new Map(current.map((item) => [item.id, item]));
    let addedCount = 0;
    let updatedCount = 0;

    for (const item of incoming) {
      if (byId.has(item.id)) {
        updatedCount += 1;
      } else {
        addedCount += 1;
      }

      byId.set(item.id, item);
    }

    return { addedCount, merged: [...byId.values()], updatedCount };
  };

  const clearer = (name: string, reset: () => void) =>
    vi.fn(async () => {
      clearCalls.push(name);
      reset();
    });

  const repository = {
    getCharactersByIds: vi.fn(async (ids: number[]) =>
      ids.map((id) => ({ id, name: `Character ${id}`, number: id })),
    ),
    getShips: vi.fn(async () => []),
  };
  const i18n = { translate: vi.fn((key: string) => key) };
  const userState = {
    ready: vi.fn(async () => undefined),
    favoriteCharacterIds,
    favoriteShipIds,
    savedTeams,
    savedEnemies,
    savedRumbleTeams: signal([]),
    characterBoxes: signal([]),
    boostedCharacterIds: signal<number[]>([]),
    crewForgeImageProfiles: () => [],
    crewForgeLastImageProfileId: () => null,
    savedRumbleOpponents: () => [],
    readyCrewForgeImageProfiles: vi.fn(async () => undefined),
    readySavedRumbleOpponents: vi.fn(async () => undefined),
    setFavoriteCharacterIds: vi.fn(async (ids: number[]) => favoriteCharacterIds.set(ids)),
    setFavoriteShipIds: vi.fn(async (ids: number[]) => favoriteShipIds.set(ids)),
    setBoostedCharacterIds: vi.fn(async () => undefined),
    clearAllFavoriteCharacterIds: clearer('favorites', () => favoriteCharacterIds.set([])),
    clearAllFavoriteShipIds: clearer('favoriteShips', () => favoriteShipIds.set([])),
    clearAllCharacterBoxes: clearer('characterBoxes', () => undefined),
    clearAllSavedTeams: clearer('savedTeams', () => savedTeams.set([])),
    clearAllSavedEnemies: clearer('savedEnemies', () => savedEnemies.set([])),
    clearAllSavedRumbleTeams: clearer('savedRumbleTeams', () => undefined),
    clearAllCrewForgeImageProfiles: clearer('crewForgeProfiles', () => undefined),
    clearAllSavedRumbleOpponents: clearer('savedRumbleOpponents', () => undefined),
    mergeImportedTeams: vi.fn(async (incoming: SavedTeam[]) => {
      const result = mergeById(savedTeams(), incoming);
      savedTeams.set(result.merged);
      return { addedCount: result.addedCount, teams: result.merged, updatedCount: result.updatedCount };
    }),
    mergeImportedEnemies: vi.fn(async (incoming: SavedEnemy[]) => {
      const result = mergeById(savedEnemies(), incoming);
      savedEnemies.set(result.merged);
      return {
        addedCount: result.addedCount,
        enemies: result.merged,
        updatedCount: result.updatedCount,
      };
    }),
  };
  const characterOverrides = {
    ready: vi.fn(async () => undefined),
    overrides: signal([]),
    clearAllOverrides: clearer('characterOverrides', () => undefined),
  };
  const service = new UserDataTransferService(
    repository as never,
    i18n as never,
    userState as never,
    characterOverrides as never,
    new OptcbxImportService(repository as never),
  );

  return { clearCalls, service, state: { favoriteCharacterIds, savedEnemies, savedTeams } };
}

function allDataPayload(scopes: Partial<AllDataTransferPayload>): AllDataTransferPayload {
  return { exportedAt: EXPORTED_AT, schemaVersion: 1, source: 'all-data', ...scopes };
}

describe('UserDataTransferService - a restore never empties the device before the backup applies (869f63gpg)', () => {
  it('applies a reviewed backup whose favourites list is empty instead of wiping the device', async () => {
    const { service, state } = createHarness();
    const payload = allDataPayload({
      favorites: { characters: [] },
      savedTeams: buildSavedTeamsTransferPayload([LOCAL_TEAM, DRIVE_TEAM], EXPORTED_AT),
      savedEnemies: buildSavedEnemiesTransferPayload([LOCAL_ENEMY], EXPORTED_AT),
    });

    await expect(service.applyAllDataPayload(payload, 'restore')).resolves.toBeDefined();

    expect(state.savedTeams().map((team) => team.id)).toEqual(['crew-phone-1', 'crew-tablet-1']);
    expect(state.savedEnemies().map((enemy) => enemy.id)).toEqual(['enemy-phone-1']);
    expect(state.favoriteCharacterIds()).toEqual([]);
  });

  it('still merges every other scope when a Drive merge carries an empty favourites list', async () => {
    const { service, state } = createHarness({ favoriteIds: [1001] });
    const payload = allDataPayload({
      favorites: { characters: [] },
      savedTeams: buildSavedTeamsTransferPayload([DRIVE_TEAM], EXPORTED_AT),
    });

    await expect(service.applyAllDataPayload(payload, 'merge')).resolves.toBeDefined();

    expect(state.savedTeams().map((team) => team.id)).toEqual(['crew-phone-1', 'crew-tablet-1']);
    expect(state.favoriteCharacterIds()).toEqual([1001]);
  });

  /*
   * Bound to the declared scope list, so a scope added later is tested here the day it exists.
   * `boostedCharacterIds` is the one scope whose parser never throws: an invalid list is ignored by
   * design (869f1q90b), so there is nothing to fail before the clear.
   */
  const throwingScopes = ALL_DATA_TRANSFER_SCOPES.filter((scope) => scope !== 'boostedCharacterIds');

  it.each(throwingScopes)(
    'rejects a restore whose %s scope does not parse, before clearing anything',
    async (scope) => {
      const { clearCalls, service, state } = createHarness({ favoriteIds: [1001] });
      const payload = allDataPayload({
        favorites: { characters: [{ name: 'Character 1001', number: 1001 }] },
        [scope]: { schemaVersion: 999, source: 'not-this-scope' },
      } as Partial<AllDataTransferPayload>);

      await expect(service.applyAllDataPayload(payload, 'restore')).rejects.toThrow();

      expect(clearCalls).toEqual([]);
      expect(state.savedTeams()).toEqual([LOCAL_TEAM]);
      expect(state.savedEnemies()).toEqual([LOCAL_ENEMY]);
      expect(state.favoriteCharacterIds()).toEqual([1001]);
    },
  );

  it('keeps rejecting an empty OPTCbx file in the Settings favourites import', async () => {
    const { service } = createHarness();

    await expect(service.importFavoritesPayload({ characters: [] })).rejects.toThrow(
      'The OPTCbx export does not contain any character ids.',
    );
  });
});
