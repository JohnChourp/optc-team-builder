import '@angular/compiler';
import { describe, expect, it } from 'vitest';

import { CharacterOverridesService } from './character-overrides.service';
import { DriveSyncStateService } from './drive-sync-state.service';
import { OptcbxImportService } from './optcbx-import.service';
import { UserDataTransferService } from './user-data-transfer.service';
import { UserStateService } from './user-state.service';
import {
  buildDriveSyncReviewDraft,
  buildReviewedAllDataPayload,
} from '../../pages/drive-sync/drive-sync-review.utils';
import {
  buildAllDataTransferPayload,
  type AllDataTransferPayload,
} from '../../pages/settings/all-data-transfer.utils';
import { type SavedTeam } from '../models/optc.models';
import { type SavedRumbleOpponent } from '../models/saved-rumble-opponent.models';

/*
 * 869f63gq1. A session that never opened Rumble or the Auto Team Builder.
 *
 * Saved Rumble opponents and the boost list travel in every backup, and both used to load only
 * when one of those two pages did. So in a fresh session "Export all data" wrote both as empty,
 * and a reviewed Drive Merge took the empty lists as the device's truth: it cleared the stored
 * ones and uploaded the empty ones, and the reader lost them on the device AND on Drive.
 *
 * Its own file rather than the tail of `user-data-transfer.service.spec.ts`: that suite hands the
 * service a whole mocked UserStateService whose lists are already filled, which is exactly why it
 * never met the empty ones. This one runs the REAL UserStateService over an in-memory store, so
 * "never loaded" is observable, and replays the calls DriveBackupService makes for a reviewed sync.
 */

const EXPORTED_AT = '2026-09-24T10:00:00.000Z';
const DEVICE_BOOSTS = [4551, 4520, 4408];

class MemoryPreferences {
  public readonly store: Map<string, string>;

  public constructor(initial: Record<string, unknown>) {
    this.store = new Map(
      Object.entries(initial).map(([key, value]) => [key, JSON.stringify(value)] as const),
    );
  }

  public async get({ key }: { key: string }): Promise<{ value: string | null }> {
    return { value: this.store.get(key) ?? null };
  }

  public async set({ key, value }: { key: string; value: string }): Promise<void> {
    this.store.set(key, value);
  }

  public read<T>(key: string): T {
    return JSON.parse(this.store.get(key) ?? 'null') as T;
  }
}

function opponent(id: string, name: string): SavedRumbleOpponent {
  return {
    activeCharacterIds: [1, 2, 3, null, null],
    benchCharacterIds: [null, null, null],
    createdAt: '2026-09-10T08:00:00.000Z',
    id,
    name,
    updatedAt: '2026-09-10T08:00:00.000Z',
  };
}

function team(id: string, name: string, leaderId: number): SavedTeam {
  return {
    createdAt: '2026-09-10T08:00:00.000Z',
    id,
    name,
    notes: '',
    shipId: null,
    slots: [leaderId, null, null, null, null, null],
    updatedAt: '2026-09-10T08:00:00.000Z',
  };
}

/** A device holding both kinds, with neither page opened yet in this session. */
function createColdDevice() {
  const preferences = new MemoryPreferences({
    favoriteCharacterIds: [4551],
    savedTeams: [team('crew-local-1', 'Local crew', 4551)],
    savedRumbleOpponents: [
      opponent('opp-local-1', 'Season rival A'),
      opponent('opp-local-2', 'Season rival B'),
    ],
    boostedCharacterIds: DEVICE_BOOSTS,
  });
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

  return { preferences, transfer, userState };
}

/** The reader's other device: one team, one opponent and a boost list this one does not have. */
function drivePayload(): AllDataTransferPayload {
  return buildAllDataTransferPayload(
    {
      savedTeams: {
        exportedAt: EXPORTED_AT,
        schemaVersion: 1,
        source: 'saved-teams',
        teams: [team('crew-drive-1', 'Drive crew', 3000)],
      },
      savedRumbleOpponents: {
        exportedAt: EXPORTED_AT,
        opponents: [opponent('opp-drive-1', 'Rival saved on the other phone')],
        schemaVersion: 1,
        source: 'saved-rumble-opponents',
      },
      boostedCharacterIds: {
        characterIds: [1111],
        exportedAt: EXPORTED_AT,
        schemaVersion: 1,
        source: 'boosted-characters',
      },
    },
    EXPORTED_AT,
  );
}

function opponentIds(payload: AllDataTransferPayload): string[] | undefined {
  return payload.savedRumbleOpponents?.opponents.map((entry) => entry.id);
}

describe('a session that never opened Rumble or the Auto Team Builder (869f63gq1)', () => {
  it('exports the saved Rumble opponents and the boost list this device holds', async () => {
    const { transfer } = createColdDevice();

    const payload = await transfer.buildAllDataPayload(EXPORTED_AT);

    expect(opponentIds(payload)).toEqual(['opp-local-1', 'opp-local-2']);
    expect(payload.boostedCharacterIds?.characterIds).toEqual(DEVICE_BOOSTS);
  });

  it('exports the same lists once both pages have loaded them - the control', async () => {
    const { transfer, userState } = createColdDevice();

    await userState.readySavedRumbleOpponents();
    await userState.readyBoostedCharacterIds();

    const payload = await transfer.buildAllDataPayload(EXPORTED_AT);

    expect(opponentIds(payload)).toEqual(['opp-local-1', 'opp-local-2']);
    expect(payload.boostedCharacterIds?.characterIds).toEqual(DEVICE_BOOSTS);
  });

  it('loads both in UserStateService.ready(), all that Settings awaits to count', async () => {
    const { transfer, userState } = createColdDevice();

    await userState.ready();

    expect(userState.savedRumbleOpponents().map((entry) => entry.id)).toEqual([
      'opp-local-1',
      'opp-local-2',
    ]);
    expect(userState.boostedCharacterIds()).toEqual(DEVICE_BOOSTS);
    expect(transfer.getSyncScopeSummary().savedRumbleOpponentsCount).toBe(2);
  });

  it('keeps both through a reviewed Merge, on this device and in the upload', async () => {
    const { preferences, transfer } = createColdDevice();

    // What DriveBackupService runs: prepareReviewedManualSync, then
    // commitReviewedManualSync('merge-and-upload'), which restores and then uploads.
    const localPayload = await transfer.buildAllDataPayload();
    const draft = buildDriveSyncReviewDraft(localPayload, drivePayload(), 'merge-and-upload');

    await transfer.applyAllDataPayload(buildReviewedAllDataPayload(draft), 'restore');

    const uploaded = await transfer.buildAllDataPayload();
    const mergedOpponents = ['opp-local-1', 'opp-local-2', 'opp-drive-1'];

    expect(
      preferences.read<SavedRumbleOpponent[]>('savedRumbleOpponents').map((entry) => entry.id),
    ).toEqual(mergedOpponents);
    expect(opponentIds(uploaded)).toEqual(mergedOpponents);
    // 869f1q90b. A boost list is never merged, so the device's stands on both sides.
    expect(preferences.read<number[]>('boostedCharacterIds')).toEqual(DEVICE_BOOSTS);
    expect(uploaded.boostedCharacterIds?.characterIds).toEqual(DEVICE_BOOSTS);
  });

  it('uploads both when the reader replaces Drive with this device', async () => {
    const { transfer } = createColdDevice();

    // commitReviewedManualSync('replace-cloud') uploads the reviewed payload as it is.
    const localPayload = await transfer.buildAllDataPayload();
    const uploaded = buildReviewedAllDataPayload(
      buildDriveSyncReviewDraft(localPayload, drivePayload(), 'replace-cloud'),
    );

    expect(opponentIds(uploaded)).toEqual(['opp-local-1', 'opp-local-2']);
    expect(uploaded.boostedCharacterIds?.characterIds).toEqual(DEVICE_BOOSTS);
  });
});
