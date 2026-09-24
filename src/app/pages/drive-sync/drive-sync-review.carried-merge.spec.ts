import { describe, expect, it } from 'vitest';

import { buildDriveSyncReviewDraft, buildReviewedAllDataPayload } from './drive-sync-review.utils';
import { type AllDataTransferPayload } from '../settings/all-data-transfer.utils';
import { BUILT_IN_CREW_FORGE_IMAGE_PROFILES } from '../../core/data/crew-forge-built-in-profiles';
import { type CrewForgeImageProfile } from '../../core/models/optc.models';
import { type SavedRumbleOpponent } from '../../core/models/saved-rumble-opponent.models';

/*
 * 869f63gq1. What a reviewed Merge does with the scopes it has no section for.
 *
 * Saved Rumble opponents, Crew Forge profiles and the boost list have no rows in the review, so
 * the reader never chooses them one by one. They used to be taken whole from the device, so a
 * Merge deleted everything only Drive had - from this device AND from the backup it uploaded -
 * while the unreviewed Merge in Settings kept it. Measured before the fix: reviewed Merge left
 * `["opp-local-1"]` on both sides; the unreviewed one left `["opp-local-1","opp-drive-1"]`.
 */

const EXPORTED_AT = '2026-09-24T10:00:00.000Z';

function opponent(id: string, name: string): SavedRumbleOpponent {
  return {
    activeCharacterIds: [1, 2, null, null, null],
    benchCharacterIds: [null, null, null],
    createdAt: EXPORTED_AT,
    id,
    name,
    updatedAt: EXPORTED_AT,
  };
}

function profile(id: string, name: string): CrewForgeImageProfile {
  return { ...BUILT_IN_CREW_FORGE_IMAGE_PROFILES[0], id, name, source: 'user' };
}

function carriedOnly(input: {
  opponents?: SavedRumbleOpponent[];
  profiles?: CrewForgeImageProfile[];
  lastProfileId?: string | null;
  boosts?: number[];
}): AllDataTransferPayload {
  return {
    exportedAt: EXPORTED_AT,
    schemaVersion: 1,
    source: 'all-data',
    ...(input.opponents
      ? {
          savedRumbleOpponents: {
            exportedAt: EXPORTED_AT,
            opponents: input.opponents,
            schemaVersion: 1,
            source: 'saved-rumble-opponents',
          },
        }
      : {}),
    ...(input.profiles
      ? {
          crewForgeProfiles: {
            exportedAt: EXPORTED_AT,
            lastProfileId: input.lastProfileId ?? null,
            profiles: input.profiles,
            schemaVersion: 1,
            source: 'crew-forge-profiles',
          },
        }
      : {}),
    ...(input.boosts
      ? {
          boostedCharacterIds: {
            characterIds: input.boosts,
            exportedAt: EXPORTED_AT,
            schemaVersion: 1,
            source: 'boosted-characters',
          },
        }
      : {}),
  };
}

const DEVICE = carriedOnly({
  opponents: [opponent('opp-local-1', 'Device rival'), opponent('opp-shared', 'Device copy')],
  profiles: [profile('profile-device', 'Phone layout'), profile('profile-shared', 'Device copy')],
  lastProfileId: 'profile-device',
  boosts: [1001],
});

const DRIVE = carriedOnly({
  opponents: [
    opponent('opp-drive-2', 'Drive rival B'),
    opponent('opp-shared', 'Drive copy'),
    opponent('opp-drive-1', 'Drive rival A'),
  ],
  profiles: [profile('profile-shared', 'Drive copy'), profile('profile-drive', 'Tablet layout')],
  lastProfileId: 'profile-drive',
  boosts: [2002],
});

function opponentIds(payload: AllDataTransferPayload): string[] | undefined {
  return payload.savedRumbleOpponents?.opponents.map((entry) => entry.id);
}

function review(
  local: AllDataTransferPayload,
  drive: AllDataTransferPayload,
  action: 'merge-and-upload' | 'replace-cloud' | 'replace-local',
): AllDataTransferPayload {
  return buildReviewedAllDataPayload(buildDriveSyncReviewDraft(local, drive, action), EXPORTED_AT);
}

describe('a reviewed Merge and the scopes the review has no section for (869f63gq1)', () => {
  it('adds the opponents only Drive had, after the device ones and in Drive order', () => {
    expect(opponentIds(review(DEVICE, DRIVE, 'merge-and-upload'))).toEqual([
      'opp-local-1',
      'opp-shared',
      'opp-drive-2',
      'opp-drive-1',
    ]);
  });

  it("keeps this device's copy of an opponent both sides have", () => {
    const merged = review(DEVICE, DRIVE, 'merge-and-upload');

    expect(
      merged.savedRumbleOpponents?.opponents.find((entry) => entry.id === 'opp-shared')?.name,
    ).toBe('Device copy');
  });

  it("adds the Crew Forge profiles only Drive had, and keeps this device's selection", () => {
    const merged = review(DEVICE, DRIVE, 'merge-and-upload');

    expect(merged.crewForgeProfiles?.profiles.map((entry) => [entry.id, entry.name])).toEqual([
      ['profile-device', 'Phone layout'],
      ['profile-shared', 'Device copy'],
      ['profile-drive', 'Tablet layout'],
    ]);
    expect(merged.crewForgeProfiles?.lastProfileId).toBe('profile-device');
  });

  it("never merges two boost lists: a list describes one event, so the device's stands", () => {
    expect(review(DEVICE, DRIVE, 'merge-and-upload').boostedCharacterIds?.characterIds).toEqual([
      1001,
    ]);
  });

  it('takes a scope whole from the only side that has it', () => {
    const deviceWithoutOpponents = carriedOnly({ boosts: [1001] });

    expect(opponentIds(review(deviceWithoutOpponents, DRIVE, 'merge-and-upload'))).toEqual([
      'opp-drive-2',
      'opp-shared',
      'opp-drive-1',
    ]);
    expect(opponentIds(review(DEVICE, carriedOnly({}), 'merge-and-upload'))).toEqual([
      'opp-local-1',
      'opp-shared',
    ]);
  });

  it('leaves both Replace actions taking one side whole, as they did', () => {
    expect(opponentIds(review(DEVICE, DRIVE, 'replace-cloud'))).toEqual([
      'opp-local-1',
      'opp-shared',
    ]);
    expect(opponentIds(review(DEVICE, DRIVE, 'replace-local'))).toEqual([
      'opp-drive-2',
      'opp-shared',
      'opp-drive-1',
    ]);
  });
});
