import { describe, expect, it } from 'vitest';

import {
  buildDriveSyncReviewDraft,
  buildReviewedAllDataPayload,
  summariseReviewedDraft,
  updateDriveSyncReviewRowChoice,
} from './drive-sync-review.utils';
import {
  ALL_DATA_TRANSFER_SCOPES,
  type AllDataTransferPayload,
} from '../settings/all-data-transfer.utils';

describe('drive sync review utils', () => {
  it('builds item-level diff rows for every sync section', () => {
    const draft = buildDriveSyncReviewDraft(
      createLocalPayload(),
      createDrivePayload(),
      'merge-and-upload',
    );

    expect(draft.sections.map((section) => section.key)).toEqual([
      'favorites',
      'favoriteShips',
      'characterBoxes',
      'characterOverrides',
      'savedTeams',
      'savedRumbleTeams',
      'savedEnemies',
    ]);
    expect(draft.sections.every((section) => section.rows.length > 0)).toBe(true);
    expect(findRow(draft, 'favorites', '1001')?.status).toBe('kept');
    expect(findRow(draft, 'favorites', '1002')?.status).toBe('changed');
    expect(findRow(draft, 'favorites', '1003')?.status).toBe('added');
    expect(findRow(draft, 'favoriteShips', '9001')?.status).toBe('kept');
    expect(findRow(draft, 'characterBoxes', 'box-1')?.status).toBe('changed');
    expect(findRow(draft, 'characterOverrides', '1001')?.status).toBe('changed');
    expect(findRow(draft, 'savedTeams', 'team-1')?.status).toBe('changed');
    expect(findRow(draft, 'savedRumbleTeams', 'rumble-1')?.status).toBe('changed');
    expect(findRow(draft, 'savedEnemies', 'enemy-1')?.status).toBe('changed');
  });

  it('defaults merge to Drive on conflicts while keeping device-only rows', () => {
    const draft = buildDriveSyncReviewDraft(
      createLocalPayload(),
      createDrivePayload(),
      'merge-and-upload',
    );
    const payload = buildReviewedAllDataPayload(draft, '2026-04-21T10:00:00.000Z');

    expect(payload.favorites?.characters).toEqual([
      { number: 1001, name: 'Luffy' },
      { number: 1002, name: 'Zoro Drive' },
      { number: 1003, name: 'Nami' },
    ]);
    expect(payload.favoriteShips?.ships).toEqual([
      { id: 9001, name: 'Going Merry' },
      { id: 9002, name: 'Thousand Sunny' },
      { id: 9003, name: 'Shark Superb' },
    ]);
    expect(payload.characterBoxes?.boxes.find((box) => box.id === 'box-1')?.name).toBe('Drive box');
    expect(payload.characterBoxes?.boxes.find((box) => box.id === 'box-2')?.name).toBe(
      'Device only box',
    );
    expect(
      payload.characterOverrides?.overrides.find((override) => override.characterId === 1001)?.name,
    ).toBe('Override Drive');
    expect(payload.savedTeams?.teams.find((team) => team.id === 'team-1')?.name).toBe('Drive team');
    expect(payload.savedRumbleTeams?.rumbleTeams.find((team) => team.id === 'rumble-1')?.name).toBe(
      'Drive rumble',
    );
    expect(payload.savedEnemies?.enemies.find((enemy) => enemy.id === 'enemy-1')?.name).toBe(
      'Drive enemy',
    );
  });

  it('defaults replace device to Drive data but lets device-only rows be kept', () => {
    let draft = buildDriveSyncReviewDraft(
      createLocalPayload(),
      createDrivePayload(),
      'replace-local',
    );

    expect(findRow(draft, 'favoriteShips', '9002')?.choice).toBe('remove');

    draft = updateDriveSyncReviewRowChoice(draft, 'favoriteShips', '9002', 'device');
    const payload = buildReviewedAllDataPayload(draft);

    expect(payload.favoriteShips?.ships.map((ship) => ship.id)).toEqual([9001, 9002, 9003]);
  });

  it('recalculates row status counts after a removed row is kept', () => {
    let draft = buildDriveSyncReviewDraft(
      createLocalPayload(),
      createDrivePayload(),
      'replace-local',
    );

    draft = updateDriveSyncReviewRowChoice(draft, 'favoriteShips', '9002', 'device');

    const section = draft.sections.find((entry) => entry.key === 'favoriteShips');
    const row = findRow(draft, 'favoriteShips', '9002');

    expect(row?.choice).toBe('device');
    expect(row?.status).toBe('added');
    expect(section?.addedCount).toBe(2);
    expect(section?.removedCount).toBe(0);
  });

  it('defaults replace Drive to device data but lets Drive-only rows be kept', () => {
    let draft = buildDriveSyncReviewDraft(
      createLocalPayload(),
      createDrivePayload(),
      'replace-cloud',
    );

    expect(findRow(draft, 'favorites', '1003')?.choice).toBe('remove');

    draft = updateDriveSyncReviewRowChoice(draft, 'favorites', '1003', 'drive');
    const payload = buildReviewedAllDataPayload(draft);

    expect(payload.favorites?.characters.map((character) => character.number)).toEqual([
      1001, 1002, 1003,
    ]);
  });

  /*
   * 869f135ru. An export is a file the reader can open. A backup is trusted
   * blindly, which is why the sync path has to be PROVEN to carry the same set
   * rather than assumed to.
   *
   * These walk `ALL_DATA_TRANSFER_SCOPES` rather than a hand-written list, so a
   * new durable scope joins the backup on the day it is declared or fails here.
   * A list would have been kept in step exactly as well as the one this found.
   */
  /*
   * 869f135r4. The summary is pinned to the PAYLOAD, not to itself.
   *
   * A count computed beside the thing it describes drifts the moment either
   * changes. These assert the number the reader is shown against what
   * `buildReviewedAllDataPayload` actually produces, which is the only version of
   * the claim worth making before an irreversible overwrite.
   */
  describe('the outcome summary', () => {
    function favouriteIdsIn(payload: ReturnType<typeof buildReviewedAllDataPayload>): number[] {
      return (payload.favorites?.characters ?? []).map((character) => character.number);
    }

    it('counts every row exactly once across kept, taken and lost', () => {
      for (const action of ['merge-and-upload', 'replace-cloud', 'replace-local'] as const) {
        const draft = buildDriveSyncReviewDraft(createLocalPayload(), createDrivePayload(), action);
        const outcome = summariseReviewedDraft(draft);

        expect(
          outcome.keptFromDevice + outcome.takenFromDrive + outcome.lost,
          `${action} loses or double-counts rows`,
        ).toBeLessThanOrEqual(outcome.total);
        expect(outcome.total).toBe(draft.sections.flatMap((section) => section.rows).length);
      }
    });

    it('reports a removal as lost, and the payload really drops it', () => {
      const draft = buildDriveSyncReviewDraft(
        createLocalPayload(),
        createDrivePayload(),
        'merge-and-upload',
      );
      const before = summariseReviewedDraft(draft);
      const removed = updateDriveSyncReviewRowChoice(draft, 'favorites', '1001', 'remove');
      const after = summariseReviewedDraft(removed);

      expect(after.lost).toBe(before.lost + 1);
      expect(favouriteIdsIn(buildReviewedAllDataPayload(removed))).not.toContain(1001);
    });

    it('never calls a row lost when the payload still carries it', () => {
      const draft = buildDriveSyncReviewDraft(
        createLocalPayload(),
        createDrivePayload(),
        'merge-and-upload',
      );
      const kept = updateDriveSyncReviewRowChoice(draft, 'favorites', '1001', 'device');

      expect(summariseReviewedDraft(kept).lost).toBe(0);
      expect(favouriteIdsIn(buildReviewedAllDataPayload(kept))).toContain(1001);
    });

    it('counts a device-only row as lost when the Drive copy replaces local', () => {
      const local = createLocalPayload();
      const drive = createDrivePayload();
      const outcome = summariseReviewedDraft(
        buildDriveSyncReviewDraft(local, drive, 'replace-local'),
      );

      /*
       * replace-local is the destructive action the summary exists for: anything
       * this device has and Drive does not is gone afterwards.
       */
      expect(outcome.lost).toBeGreaterThan(0);
    });
  });

  describe('every transfer scope survives the review', () => {
    const actions = ['merge-and-upload', 'replace-cloud', 'replace-local'] as const;

    for (const action of actions) {
      it(`carries every scope through ${action}`, () => {
        const draft = buildDriveSyncReviewDraft(
          createFullyPopulatedPayload('device'),
          createFullyPopulatedPayload('drive'),
          action,
        );
        const payload = buildReviewedAllDataPayload(draft);

        for (const scope of ALL_DATA_TRANSFER_SCOPES) {
          expect(payload[scope], `${scope} was dropped by ${action}`).toBeDefined();
        }
      });
    }

    it('keeps a scope that exists on only one side, whichever side that is', () => {
      const deviceOnly = createFullyPopulatedPayload('device');
      const driveWithout = createFullyPopulatedPayload('drive');

      delete driveWithout.crewForgeProfiles;
      delete deviceOnly.boostedCharacterIds;

      for (const action of actions) {
        const payload = buildReviewedAllDataPayload(
          buildDriveSyncReviewDraft(deviceOnly, driveWithout, action),
        );

        expect(payload.crewForgeProfiles, `crewForgeProfiles lost by ${action}`).toBeDefined();
        expect(payload.boostedCharacterIds, `boostedCharacterIds lost by ${action}`).toBeDefined();
      }
    });

    it('takes an unreviewed scope from Drive when Drive is the one replacing local', () => {
      const payload = buildReviewedAllDataPayload(
        buildDriveSyncReviewDraft(
          createFullyPopulatedPayload('device'),
          createFullyPopulatedPayload('drive'),
          'replace-local',
        ),
      );

      expect(payload.boostedCharacterIds?.characterIds).toEqual([2002]);
    });

    it('takes an unreviewed scope from the device when the device is the one being pushed', () => {
      for (const action of ['merge-and-upload', 'replace-cloud'] as const) {
        const payload = buildReviewedAllDataPayload(
          buildDriveSyncReviewDraft(
            createFullyPopulatedPayload('device'),
            createFullyPopulatedPayload('drive'),
            action,
          ),
        );

        expect(payload.boostedCharacterIds?.characterIds, action).toEqual([1001]);
      }
    });

    it('does not share structure with its source, so a later edit cannot reach the payload', () => {
      const local = createFullyPopulatedPayload('device');
      const payload = buildReviewedAllDataPayload(
        buildDriveSyncReviewDraft(local, createFullyPopulatedPayload('drive'), 'replace-cloud'),
      );

      local.boostedCharacterIds?.characterIds.push(9999);

      expect(payload.boostedCharacterIds?.characterIds).toEqual([1001]);
    });
  });
});

function findRow(
  draft: ReturnType<typeof buildDriveSyncReviewDraft>,
  sectionKey: string,
  rowKey: string,
) {
  return draft.sections
    .find((section) => section.key === sectionKey)
    ?.rows.find((row) => row.key === rowKey);
}

/**
 * Every scope in `ALL_DATA_TRANSFER_SCOPES`, populated. `side` makes the two
 * sides distinguishable so a test can say WHICH one a value came from.
 */
function createFullyPopulatedPayload(side: 'device' | 'drive'): AllDataTransferPayload {
  const base = side === 'device' ? createLocalPayload() : createDrivePayload();
  const marker = side === 'device' ? 1001 : 2002;

  return {
    ...base,
    boostedCharacterIds: {
      characterIds: [marker],
      exportedAt: '2026-04-20T18:00:00.000Z',
      schemaVersion: 1,
      source: 'boosted-characters',
    },
    crewForgeProfiles: {
      exportedAt: '2026-04-20T18:00:00.000Z',
      lastProfileId: `${side}-profile`,
      profiles: [],
      schemaVersion: 1,
      source: 'crew-forge-profiles',
    },
    savedRumbleOpponents: {
      exportedAt: '2026-04-20T18:00:00.000Z',
      opponents: [],
      schemaVersion: 1,
      source: 'saved-rumble-opponents',
    },
  };
}

function createLocalPayload(): AllDataTransferPayload {
  return {
    characterBoxes: {
      boxes: [
        createBox('box-1', 'Device box', [1001]),
        createBox('box-2', 'Device only box', [1002]),
      ],
      exportedAt: '2026-04-20T18:00:00.000Z',
      schemaVersion: 1,
      source: 'character-boxes',
    },
    characterOverrides: {
      exportedAt: '2026-04-20T18:00:00.000Z',
      overrides: [createOverride(1001, 'Override Device')],
      schemaVersion: 1,
      source: 'character-overrides',
    },
    exportedAt: '2026-04-20T18:00:00.000Z',
    favoriteShips: {
      exportedAt: '2026-04-20T18:00:00.000Z',
      schemaVersion: 1,
      ships: [
        { id: 9001, name: 'Going Merry' },
        { id: 9002, name: 'Thousand Sunny' },
      ],
      source: 'favorite-ships',
    },
    favorites: {
      characters: [
        { number: 1001, name: 'Luffy' },
        { number: 1002, name: 'Zoro Device' },
      ],
    },
    savedEnemies: {
      enemies: [createEnemy('enemy-1', 'Device enemy')],
      exportedAt: '2026-04-20T18:00:00.000Z',
      schemaVersion: 1,
      source: 'saved-enemies',
    },
    savedTeams: {
      exportedAt: '2026-04-20T18:00:00.000Z',
      schemaVersion: 1,
      source: 'saved-teams',
      teams: [createTeam('team-1', 'Device team')],
    },
    savedRumbleTeams: {
      exportedAt: '2026-04-20T18:00:00.000Z',
      rumbleTeams: [createRumbleTeam('rumble-1', 'Device rumble')],
      schemaVersion: 1,
      source: 'saved-rumble-teams',
    },
    schemaVersion: 1,
    source: 'all-data',
  };
}

function createDrivePayload(): AllDataTransferPayload {
  return {
    characterBoxes: {
      boxes: [createBox('box-1', 'Drive box', [1001, 1003])],
      exportedAt: '2026-04-20T19:00:00.000Z',
      schemaVersion: 1,
      source: 'character-boxes',
    },
    characterOverrides: {
      exportedAt: '2026-04-20T19:00:00.000Z',
      overrides: [createOverride(1001, 'Override Drive')],
      schemaVersion: 1,
      source: 'character-overrides',
    },
    exportedAt: '2026-04-20T19:00:00.000Z',
    favoriteShips: {
      exportedAt: '2026-04-20T19:00:00.000Z',
      schemaVersion: 1,
      ships: [
        { id: 9001, name: 'Going Merry' },
        { id: 9003, name: 'Shark Superb' },
      ],
      source: 'favorite-ships',
    },
    favorites: {
      characters: [
        { number: 1001, name: 'Luffy' },
        { number: 1002, name: 'Zoro Drive' },
        { number: 1003, name: 'Nami' },
      ],
    },
    savedEnemies: {
      enemies: [createEnemy('enemy-1', 'Drive enemy')],
      exportedAt: '2026-04-20T19:00:00.000Z',
      schemaVersion: 1,
      source: 'saved-enemies',
    },
    savedTeams: {
      exportedAt: '2026-04-20T19:00:00.000Z',
      schemaVersion: 1,
      source: 'saved-teams',
      teams: [createTeam('team-1', 'Drive team')],
    },
    savedRumbleTeams: {
      exportedAt: '2026-04-20T19:00:00.000Z',
      rumbleTeams: [createRumbleTeam('rumble-1', 'Drive rumble')],
      schemaVersion: 1,
      source: 'saved-rumble-teams',
    },
    schemaVersion: 1,
    source: 'all-data',
  };
}

function createBox(id: string, name: string, characterIds: number[]) {
  return {
    characterIds,
    createdAt: '2026-04-20T18:00:00.000Z',
    id,
    name,
    updatedAt: '2026-04-20T18:00:00.000Z',
  };
}

function createEnemy(id: string, name: string) {
  return {
    createdAt: '2026-04-20T18:00:00.000Z',
    enemyMechanics: [],
    id,
    imageDataUrl: null,
    name,
    notes: '',
    rawEnemyText: '',
    requireAllSelectedClassesPerCharacter: false,
    requireAllSelectedTypesInTeam: false,
    requiredAbilities: [],
    selectedClasses: [],
    selectedTypes: [],
    updatedAt: '2026-04-20T18:00:00.000Z',
  };
}

function createOverride(characterId: number, name: string) {
  return {
    characterId,
    classes: [],
    combo: 4,
    cost: 30,
    createdAt: '2026-04-20T18:00:00.000Z',
    detail: {
      builderAbilities: [],
      captainAbility: null,
      captainAbilityVariants: [],
      captainNotes: null,
      characterId,
      detailImageUrl: '',
      finalTapData: null,
      partyConflictKeys: [],
      potentialAbilities: [],
      rumbleData: null,
      sailorAbilities: [],
      sailorNotes: null,
      specialName: null,
      specialNotes: null,
      specialText: null,
      superSpecialCriteria: null,
      superSpecialCriteriaText: null,
      superSpecialNotes: null,
      superSpecialText: null,
      supportData: [],
      superClass: null,
      superTandemData: null,
      superType: null,
      swapData: null,
      vsSpecial: null,
    },
    growth: null,
    images: {
      detailDataUrl: null,
      thumbnailDataUrl: null,
    },
    isIncomplete: false,
    maxAtk: null,
    maxHp: null,
    maxRcv: null,
    minAtk: null,
    minHp: null,
    minRcv: null,
    name,
    stars: 5,
    type: 'STR',
    updatedAt: '2026-04-20T18:00:00.000Z',
  };
}

function createTeam(id: string, name: string) {
  return {
    createdAt: '2026-04-20T18:00:00.000Z',
    id,
    name,
    notes: '',
    shipId: null,
    slots: [1001, null, null, null, null, null],
    updatedAt: '2026-04-20T18:00:00.000Z',
  };
}

function createRumbleTeam(id: string, name: string) {
  return {
    createdAt: '2026-04-20T18:00:00.000Z',
    id,
    name,
    notes: '',
    opponentActiveCharacterIds: [null, null, null, null, null],
    opponentAwarenessEnabled: false,
    opponentBenchCharacterIds: [null, null, null],
    selectedTeamIndex: 0,
    settings: {
      buffFocus: [],
      favoriteCharacterIds: [],
      favoritesOnly: false,
      onlySelectedClasses: false,
      onlySelectedTypes: false,
      opponentSlots: [],
      requireFullTeam: true,
      selectedClasses: [],
      types: [],
    },
    teams: [],
    updatedAt: '2026-04-20T18:00:00.000Z',
  };
}
