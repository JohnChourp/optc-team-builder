import '@angular/compiler';
import { describe, expect, it } from 'vitest';

import { CharacterOverridesService } from './character-overrides.service';
import { DriveSyncStateService } from './drive-sync-state.service';
import { OptcbxImportService } from './optcbx-import.service';
import { UserDataTransferService } from './user-data-transfer.service';
import { UserStateService } from './user-state.service';
import { durableStorageKeys } from '../data/browser-storage-keys.data';
import { BUILT_IN_CREW_FORGE_IMAGE_PROFILES } from '../data/crew-forge-built-in-profiles';
import {
  ALL_DATA_TRANSFER_SCOPES,
  type AllDataTransferPayload,
} from '../../pages/settings/all-data-transfer.utils';

/*
 * 869f63gug. Which kinds of the reader's data each list covers, read from ONE register.
 *
 * Four hand-kept lists decided what happens to a player's data, and they disagreed: ready() loaded
 * 8 kinds, a restore cleared 9, the summaries counted 9 and "Local changes pending" knew 6 keys,
 * while the export carried all 10. Two data-loss defects followed from the gaps (869f63gq1). The
 * lists are now a typed record per scope in UserDataTransferService, a typed record per hydration
 * domain in UserStateService, and a pending-flag key set read from `browser-storage-keys.data.ts`.
 *
 * The compiler guards the records' completeness; this spec guards what each entry DOES. It seeds
 * one stored value for every durable key the register names - a new durable key has to get one
 * here - and runs the REAL services over that store, so a loader, an export, a clear, a count or a
 * pending flag that silently does nothing turns a case red.
 */

const STAMP = '2026-09-24T10:00:00.000Z';
const USER_PROFILE_ID = 'crew-forge-user-profile-1';
/* The one durable key whose write leaves the flag down. Pinned: a new exemption is a decision. */
const PENDING_FLAG_EXEMPTIONS = ['crewForgeLastImageProfileId'];

const STORED_DURABLE_VALUES: Record<string, unknown> = {
  favoriteCharacterIds: [1001],
  favoriteShipIds: [9001],
  savedTeams: [
    {
      createdAt: STAMP,
      id: 'team-1',
      name: 'Kaido crew',
      notes: '',
      shipId: null,
      slots: [1001, null, null, null, null, null],
      updatedAt: STAMP,
    },
  ],
  savedRumbleTeams: [
    {
      createdAt: STAMP,
      id: 'rumble-1',
      name: 'Season defence',
      notes: '',
      opponentActiveCharacterIds: [null, null, null, null, null],
      opponentAwarenessEnabled: false,
      opponentBenchCharacterIds: [null, null, null],
      selectedTeamIndex: 0,
      settings: {},
      teams: [],
      updatedAt: STAMP,
    },
  ],
  savedEnemies: [
    {
      createdAt: STAMP,
      enemyMechanics: [],
      id: 'enemy-1',
      imageDataUrl: null,
      name: 'Kaido',
      notes: '',
      rawEnemyText: '',
      requireAllSelectedClassesPerCharacter: false,
      requireAllSelectedTypesInTeam: false,
      requiredAbilities: [],
      selectedClasses: [],
      selectedTypes: [],
      updatedAt: STAMP,
    },
  ],
  savedRumbleOpponents: [
    {
      activeCharacterIds: [1001, null, null, null, null],
      benchCharacterIds: [null, null, null],
      createdAt: STAMP,
      id: 'opponent-1',
      name: 'Season rival',
      updatedAt: STAMP,
    },
  ],
  boostedCharacterIds: [1001, 1002],
  characterBoxes: [
    { characterIds: [1001], createdAt: STAMP, id: 'box-1', name: 'Main box', updatedAt: STAMP },
  ],
  characterOverrides: [
    {
      characterId: 1001,
      classes: ['Fighter'],
      combo: 4,
      cost: 30,
      name: 'Luffy (edited)',
      stars: 5,
      type: 'STR',
    },
  ],
  crewForgeImageProfiles: [
    {
      ...BUILT_IN_CREW_FORGE_IMAGE_PROFILES[0],
      id: USER_PROFILE_ID,
      name: 'Phone layout',
      source: 'user',
    },
  ],
  crewForgeLastImageProfileId: USER_PROFILE_ID,
};

type Device = ReturnType<typeof createDevice>;

/** One write per durable key, through the service that owns it. A new durable key needs one. */
const WRITE_THROUGH_OWNER: Record<string, (device: Device) => Promise<unknown>> = {
  favoriteCharacterIds: (device) => device.userState.toggleFavorite(2002),
  favoriteShipIds: (device) => device.userState.toggleShipFavorite(9002),
  savedTeams: (device) => device.userState.deleteTeam('team-1'),
  savedRumbleTeams: (device) => device.userState.deleteRumbleTeam('rumble-1'),
  savedEnemies: (device) => device.userState.deleteEnemy('enemy-1'),
  savedRumbleOpponents: (device) => device.userState.deleteRumbleOpponent('opponent-1'),
  boostedCharacterIds: (device) => device.userState.toggleBoostedCharacter(2002),
  characterBoxes: (device) => device.userState.deleteCharacterBox('box-1'),
  characterOverrides: (device) => device.characterOverrides.clearAllOverrides(),
  crewForgeImageProfiles: (device) =>
    device.userState.saveCrewForgeImageProfile({
      ...BUILT_IN_CREW_FORGE_IMAGE_PROFILES[0],
      id: USER_PROFILE_ID,
      name: 'Renamed layout',
      source: 'user',
    }),
  crewForgeLastImageProfileId: (device) =>
    device.userState.setCrewForgeLastImageProfileId(BUILT_IN_CREW_FORGE_IMAGE_PROFILES[0].id),
};

class MemoryPreferences {
  public readonly store = new Map<string, string>();
  public readonly writes: string[] = [];

  public constructor(initial: Record<string, unknown>) {
    for (const [key, value] of Object.entries(initial)) {
      this.store.set(key, JSON.stringify(value));
    }
  }

  public async get({ key }: { key: string }): Promise<{ value: string | null }> {
    return { value: this.store.get(key) ?? null };
  }

  public async set({ key, value }: { key: string; value: string }): Promise<void> {
    this.store.set(key, value);
    this.writes.push(key);
  }
}

function createDevice() {
  const preferences = new MemoryPreferences(STORED_DURABLE_VALUES);
  const repository = {
    getCharactersByIds: async (ids: number[]) =>
      ids.map((id) => ({ id, name: `Character ${id}`, number: id })),
    getShips: async () => [{ id: 9001, name: 'Going Merry' }],
  };
  const i18n = { translate: (key: string) => key };
  const driveSyncState = new DriveSyncStateService(preferences as never);
  const userState = new UserStateService(i18n as never, preferences as never, driveSyncState);
  const characterOverrides = new CharacterOverridesService(preferences as never, driveSyncState);
  const transfer = new UserDataTransferService(
    repository as never,
    i18n as never,
    userState,
    characterOverrides,
    new OptcbxImportService(repository as never),
  );

  return { characterOverrides, driveSyncState, preferences, transfer, userState };
}

/** Every section carries its items in exactly one array; read it without the service's counters. */
function itemsIn(payload: AllDataTransferPayload, scope: string): number {
  const sections = payload as unknown as Record<string, Record<string, unknown> | undefined>;
  const section = sections[scope];
  const items = Object.values(section ?? {}).find((value) => Array.isArray(value));

  return Array.isArray(items) ? items.length : 0;
}

async function clearPendingFlag(device: Device): Promise<void> {
  await device.driveSyncState.recordUpload({
    account: null,
    exportedAt: STAMP,
    fileId: 'file-1',
    folderId: 'folder-1',
    remoteModifiedTime: STAMP,
    remoteSummary: device.transfer.getSyncScopeSummary(),
  });
}

const durableKeys = durableStorageKeys().map((record) => record.key);

describe("every kind of the reader's data, read from one register (869f63gug)", () => {
  it('seeds a stored value, and names a writer, for every durable key in the register', () => {
    expect(Object.keys(STORED_DURABLE_VALUES).sort()).toEqual([...durableKeys].sort());
    expect(Object.keys(WRITE_THROUGH_OWNER).sort()).toEqual([...durableKeys].sort());
  });

  it('exports every scope from a session that loaded nothing first', async () => {
    const { transfer } = createDevice();

    const payload = await transfer.buildAllDataPayload(STAMP);

    for (const scope of ALL_DATA_TRANSFER_SCOPES) {
      expect(itemsIn(payload, scope), `${scope} is exported`).toBeGreaterThan(0);
    }
  });

  it('counts every scope, once each, after the loads Settings awaits', async () => {
    const { characterOverrides, transfer, userState } = createDevice();

    await Promise.all([userState.ready(), characterOverrides.ready()]);

    expect(transfer.getSyncScopeSummary()).toEqual({
      favoriteCharacterCount: 1,
      favoriteShipCount: 1,
      savedTeamsCount: 1,
      savedRumbleTeamsCount: 1,
      savedEnemiesCount: 1,
      characterBoxesCount: 1,
      characterOverridesCount: 1,
      // The shipped profiles are counted on the device, and never exported.
      crewForgeProfilesCount: BUILT_IN_CREW_FORGE_IMAGE_PROFILES.length + 1,
      savedRumbleOpponentsCount: 1,
      boostedCharacterCount: 2,
    });
  });

  it('counts every scope a backup carries, once each', async () => {
    const { transfer } = createDevice();
    const payload = await transfer.buildAllDataPayload(STAMP);
    const summary = transfer.getSyncScopeSummaryFromPayload(payload);

    expect(Object.keys(summary)).toHaveLength(ALL_DATA_TRANSFER_SCOPES.length);
    expect(summary).toEqual({
      favoriteCharacterCount: 1,
      favoriteShipCount: 1,
      savedTeamsCount: 1,
      savedRumbleTeamsCount: 1,
      savedEnemiesCount: 1,
      characterBoxesCount: 1,
      characterOverridesCount: 1,
      crewForgeProfilesCount: 1,
      savedRumbleOpponentsCount: 1,
      boostedCharacterCount: 2,
    });
  });

  it('clears every scope, the boost list included, before a restore imports', async () => {
    const { preferences, transfer } = createDevice();

    await transfer.clearSyncScopedData();

    for (const key of durableKeys) {
      expect(JSON.parse(preferences.store.get(key) ?? 'null'), `${key} is cleared`).toSatisfy(
        (value: unknown) => value === null || (Array.isArray(value) && value.length === 0),
      );
    }
    expect(Object.values(transfer.getSyncScopeSummary()).reduce((sum, count) => sum + count)).toBe(
      BUILT_IN_CREW_FORGE_IMAGE_PROFILES.length,
    );
  });

  it('states a reason for every durable key that does not raise the pending flag', () => {
    const exempt = durableStorageKeys().filter((record) => record.pendingFlagExemption);

    expect(exempt.map((record) => record.key)).toEqual(PENDING_FLAG_EXEMPTIONS);

    for (const record of exempt) {
      expect(record.pendingFlagExemption?.length ?? 0, record.key).toBeGreaterThan(40);
    }
  });

  it.each(durableKeys)(
    'raises "Local changes pending" on a write to %s, bar an exemption',
    async (key) => {
      const device = createDevice();

      await Promise.all([device.userState.ready(), device.characterOverrides.ready()]);
      await clearPendingFlag(device);
      device.preferences.writes.length = 0;

      await WRITE_THROUGH_OWNER[key](device);

      const raises = !PENDING_FLAG_EXEMPTIONS.includes(key);

      expect(device.preferences.writes, `the writer for ${key} wrote it`).toContain(key);
      expect(device.driveSyncState.pendingLocalChanges()).toBe(raises);
    },
  );

  it('leaves the flag down for a device-only preference - the control', async () => {
    const device = createDevice();

    await device.userState.ready();
    await clearPendingFlag(device);
    await device.userState.setBuilderIntroDismissed('autoTeamBuilder', true);

    expect(device.preferences.writes).toContain('builderIntroDismissed');
    expect(device.driveSyncState.pendingLocalChanges()).toBe(false);
  });
});
