import { describe, expect, it } from 'vitest';

import {
  DEFAULT_RUMBLE_BUFF_FOCUS,
  type RumbleTeamResult,
} from '../../core/models/auto-team-builder-rumble.models';
import {
  RumbleBuilderImportError,
  buildOpponentCharacterIdSlotsFromImportPayload,
  buildSavedRumbleTeamResultSnapshotsFromImportPayload,
  parseRumbleBuilderSettingsImportPayload,
  parseRumbleTeamImportPayload,
} from './auto-team-builder-rumble-import.utils';
import { buildRumbleTeamExportPayload } from './auto-team-builder-rumble-export.utils';

describe('auto-team-builder-rumble import utils', () => {
  it('parses a valid settings import payload', () => {
    const payload = parseRumbleBuilderSettingsImportPayload(
      JSON.stringify({
        schemaVersion: 2,
        exportedAt: '2026-04-30T09:00:00.000Z',
        source: 'auto-team-builder-rumble',
        exportType: 'settings',
        settings: {
          types: ['DEX'],
          selectedClasses: ['Fighter'],
          onlySelectedTypes: true,
          onlySelectedClasses: false,
          favoritesOnly: false,
          favoriteCharacterIds: [],
          opponentSlots: [],
          buffFocus: DEFAULT_RUMBLE_BUFF_FOCUS,
          requireFullTeam: true,
        },
        favoriteCount: 0,
        workerPreference: { mode: 'auto', manualCount: 2 },
      }),
    );

    expect(payload.settings.types).toEqual(['DEX']);
    expect(payload.exportType).toBe('settings');
  });

  it('parses a valid team import with two teams and opponent ids', () => {
    const result = createResult();
    const activeOnlyResult = { ...result, benchSlots: [], selectedCount: 5 };
    const payload = buildRumbleTeamExportPayload(result, '2026-04-30T09:00:00.000Z', {
      allResults: [result, activeOnlyResult],
      selectedTeamIndex: 1,
      opponentSlots: [createSlot('active', 30), createSlot('bench', 31)],
    })!;
    const parsedPayload = parseRumbleTeamImportPayload(JSON.stringify(payload));
    const snapshots = buildSavedRumbleTeamResultSnapshotsFromImportPayload(parsedPayload);
    const opponentSlots = buildOpponentCharacterIdSlotsFromImportPayload(parsedPayload);

    expect(snapshots).toHaveLength(2);
    expect(snapshots[0]?.activeSlots[0]?.characterId).toBe(1000);
    expect(opponentSlots.active[0]).toBe(1030);
    expect(opponentSlots.bench[0]).toBe(1031);
  });

  it('throws typed errors for invalid json, unsupported schema, and empty teams', () => {
    expect(() => parseRumbleTeamImportPayload('{')).toThrow(RumbleBuilderImportError);
    expect(() =>
      parseRumbleTeamImportPayload(JSON.stringify({ schemaVersion: 1, source: 'saved-teams' })),
    ).toThrow(expect.objectContaining({ key: 'import.errors.unsupportedSchema' }));
    expect(() =>
      buildSavedRumbleTeamResultSnapshotsFromImportPayload({
        schemaVersion: 2,
        exportedAt: '2026-04-30T09:00:00.000Z',
        source: 'auto-team-builder-rumble',
        exportType: 'team',
        selectedTeamIndex: 0,
        requestedInput: createResult().input,
        requestedTypes: [],
        requestedClasses: [],
        resolvedTypes: [],
        resolvedClasses: [],
        droppedTypes: [],
        droppedClasses: [],
        candidateCount: 0,
        selectedCount: 0,
        totalScore: 0,
        totalRumbleCost: 0,
        roleCoverage: [],
        typeCoverage: [],
        classCoverage: [],
        topFactors: [],
        team: [],
        teams: [],
        opponentTeam: {
          selectedCount: 0,
          totalRumbleCost: 0,
          activeSlots: [],
          benchSlots: [],
          team: [],
        },
      }),
    ).toThrow(expect.objectContaining({ key: 'import.errors.emptyTeam' }));
  });
});

function createResult(): RumbleTeamResult {
  const activeSlots = Array.from({ length: 5 }, (_value, index) => createSlot('active', index));
  const benchSlots = Array.from({ length: 3 }, (_value, index) => createSlot('bench', index + 5));

  return {
    activeSlots,
    benchSlots,
    candidateCount: 12,
    selectedCount: 8,
    totalScore: 1200,
    roleCoverage: ['attacker'],
    typeCoverage: ['DEX'],
    classCoverage: ['Fighter'],
    topFactors: ['Core power'],
    input: {
      types: [],
      selectedClasses: [],
      onlySelectedTypes: false,
      onlySelectedClasses: false,
      favoritesOnly: false,
      favoriteCharacterIds: [],
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

function createSlot(
  role: 'active' | 'bench',
  index: number,
): RumbleTeamResult['activeSlots'][number] {
  const id = 1000 + index;

  return {
    role,
    index,
    score: 100 + index,
    reasonChips: ['Damage'],
    unit: {
      character: {
        id,
        name: `Unit ${id}`,
        type: 'DEX',
        primaryClass: 'Fighter',
        classes: ['Fighter'],
        detail: { rumbleData: { id } },
      },
      normalized: {
        raw: {},
        basedOnId: null,
        rumbleType: 'ATK',
        def: 100,
        spd: 100,
        cost: 55,
        cooldown: 25,
        targetLabel: null,
        patternCount: 1,
        maxPassiveLevel: 5,
        maxSpecialLevel: 10,
        maxPassiveEffects: [],
        maxSpecialEffects: [],
        maxSpecialCooldown: 25,
        baseResistances: [],
        llbResistances: [],
        passiveEffects: [],
        specialEffects: [],
        roleTags: ['attacker'],
      },
      baseScore: 100,
      breakdown: {
        statScore: 1,
        passiveScore: 1,
        specialScore: 1,
        synergyScore: 1,
        recencyScore: 1,
        total: 5,
      },
      reasonChips: ['Damage'],
      conflictKeys: [`character:${id}`],
    },
  } as RumbleTeamResult['activeSlots'][number];
}
