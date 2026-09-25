import { describe, expect, it } from 'vitest';

import {
  DEFAULT_RUMBLE_BUFF_FOCUS,
  type RumbleTeamResult,
  type RumbleTeamSlot,
} from '../../core/models/auto-team-builder-rumble.models';
import {
  type RumbleTeamExportPayload,
  buildRumbleTeamExportPayload,
} from './auto-team-builder-rumble-export.utils';
import {
  buildOpponentCharacterIdSlotsFromImportPayload,
  parseRumbleTeamImportPayload,
} from './auto-team-builder-rumble-import.utils';

/*
 * 869f6td6h. An opponent team keeps its board positions through Download team JSON and Import
 * team JSON.
 *
 * In Pirate Rumble a unit's seat matters. The export numbered only the FILLED opponent slots and
 * the import placed them by that number, so active [-, -, 500, -, 501] and bench [-, 502, -] came
 * back as [500, 501, -, -, -] and [502, -, -]. Each opponent unit now carries its board `position`.
 *
 * Two promises are kept and pinned here: a file written before this change imports exactly as it
 * always did, and `schemaVersion` stays 2 - the importer refuses anything else, so a new file must
 * still open on an older app.
 */
describe('Rumble opponent positions through export and import', () => {
  it('brings back gaps in both the active row and the bench', () => {
    const board = {
      active: [null, null, 500, null, 501],
      bench: [null, 502, null],
    };

    expect(roundTrip(board)).toEqual({ ...board, unknownSlotCount: 0 });
  });

  it('brings back a full board and an empty one unchanged', () => {
    const full = { active: [500, 501, 502, 503, 504], bench: [505, 506, 507] };
    const empty = { active: [null, null, null, null, null], bench: [null, null, null] };

    expect(roundTrip(full)).toEqual({ ...full, unknownSlotCount: 0 });
    expect(roundTrip(empty)).toEqual({ ...empty, unknownSlotCount: 0 });
  });

  it('writes the position on opponent units only, and keeps the schema version', () => {
    const payload = exportBoard({ active: [null, 500, null, null, null], bench: [null, null, 501] });

    expect(payload.schemaVersion).toBe(2);
    expect(payload.opponentTeam.team.map((slot) => [slot.role, slot.slotIndex, slot.position])).toEqual([
      ['active', 0, 1],
      ['bench', 1, 2],
    ]);
    expect(payload.team.every((slot) => slot.position === undefined)).toBe(true);
  });

  it('imports a file written before positions exactly as before: packed, in list order', () => {
    const payload = exportBoard({ active: [null, null, 500, null, 501], bench: [null, 502, null] });

    for (const slot of payload.opponentTeam.team) {
      delete slot.position;
    }

    expect(importFile(payload)).toEqual({
      active: [500, 501, null, null, null],
      bench: [502, null, null],
      unknownSlotCount: 0,
    });
  });

  it('keeps every unit of a hand-edited file whose positions are out of range or repeated', () => {
    const payload = exportBoard({ active: [500, 501, 502, null, null], bench: [503, null, null] });
    const [first, second, third] = payload.opponentTeam.activeSlots;

    first!.position = 4;
    second!.position = 4;
    third!.position = 9;
    payload.opponentTeam.benchSlots[0]!.position = -1;

    expect(importFile(payload)).toEqual({
      // 500 takes seat 4; 501 asks for the same seat and falls back to its list order, seat 1;
      // 502 asks for a seat that does not exist and falls back to seat 2.
      active: [null, 501, 502, null, 500],
      bench: [503, null, null],
      unknownSlotCount: 0,
    });
  });

  it('takes the first free seat when the list order is taken too, rather than dropping a unit', () => {
    const payload = exportBoard({ active: [500, 501, null, null, null], bench: [null, null, null] });

    // Both ask for seat 1: 500 gets it, and 501's list order is seat 1 as well.
    payload.opponentTeam.activeSlots[0]!.position = 1;
    payload.opponentTeam.activeSlots[1]!.position = 1;

    expect(importFile(payload).active).toEqual([501, 500, null, null, null]);
  });
});

type Board = { active: Array<number | null>; bench: Array<number | null> };

function roundTrip(board: Board) {
  return importFile(exportBoard(board));
}

function importFile(payload: RumbleTeamExportPayload) {
  return buildOpponentCharacterIdSlotsFromImportPayload(
    parseRumbleTeamImportPayload(JSON.stringify(payload)),
  );
}

/** What the page exports: its opponent seats, empty ones dropped, active row first. */
function exportBoard(board: Board): RumbleTeamExportPayload {
  const seats = (role: RumbleTeamSlot['role'], ids: Array<number | null>) =>
    ids.flatMap((id, index) => (id === null ? [] : [createSlot(role, index, id)]));
  const result = createResult();

  return buildRumbleTeamExportPayload(result, '2026-09-25T00:00:00.000Z', {
    allResults: [result],
    selectedTeamIndex: 0,
    opponentSlots: [...seats('active', board.active), ...seats('bench', board.bench)],
  })!;
}

function createResult(): RumbleTeamResult {
  return {
    activeSlots: [createSlot('active', 0, 1)],
    benchSlots: [],
    candidateCount: 1,
    selectedCount: 1,
    totalScore: 1,
    roleCoverage: [],
    typeCoverage: [],
    classCoverage: [],
    topFactors: [],
    input: {
      types: [],
      selectedClasses: [],
      onlySelectedTypes: false,
      onlySelectedClasses: false,
      favoritesOnly: false,
      favoriteCharacterIds: [],
      characterBoxId: null,
      opponentSlots: [],
      buffFocus: DEFAULT_RUMBLE_BUFF_FOCUS,
      requireFullTeam: true,
    },
    requestedTypes: [],
    requestedClasses: [],
    resolvedTypes: [],
    resolvedClasses: [],
    droppedTypes: [],
    droppedClasses: [],
  };
}

function createSlot(role: RumbleTeamSlot['role'], index: number, id: number): RumbleTeamSlot {
  return {
    role,
    index,
    score: 1,
    reasonChips: [],
    unit: {
      character: { id, name: `Unit ${id}` },
      normalized: { cost: 40 },
      reasonChips: [],
      conflictKeys: [],
    },
  } as unknown as RumbleTeamSlot;
}
