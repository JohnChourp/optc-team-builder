import { JSDOM } from 'jsdom';
import { describe, expect, it, vi } from 'vitest';

import {
  buildRumbleBuilderSettingsExportFilename,
  buildRumbleBuilderSettingsExportPayload,
  buildRumbleTeamExportFilename,
  buildRumbleTeamExportPayload,
  downloadRumbleBuilderSettingsExport,
  downloadRumbleTeamExport,
} from './auto-team-builder-rumble-export.utils';
import {
  DEFAULT_RUMBLE_BUFF_FOCUS,
  type RumbleTeamResult,
} from '../../core/models/auto-team-builder-rumble.models';

describe('auto-team-builder-rumble-export utils', () => {
  it('builds a settings export payload with current filters and worker preference', () => {
    const payload = buildRumbleBuilderSettingsExportPayload({
      exportedAt: '2026-04-29T04:00:00.000Z',
      settings: {
        types: ['DEX', 'STR'],
        selectedClasses: ['Fighter'],
        onlySelectedTypes: true,
        onlySelectedClasses: false,
        favoritesOnly: true,
        favoriteCharacterIds: [101, 202],
        characterBoxId: 'box-1',
        opponentSlots: [],
        buffFocus: [
          { stat: 'ATK', rank: 'primary' },
          { stat: 'HP', rank: 'secondary' },
          { stat: 'DEF', rank: 'ignored' },
          { stat: 'SPD', rank: 'tertiary' },
          { stat: 'RCV', rank: 'ignored' },
          { stat: 'Special CT', rank: 'secondary' },
        ],
        requireFullTeam: false,
      },
      favoriteCount: 2,
      workerPreference: { mode: 'manual', manualCount: 3 },
    });

    expect(payload).toEqual({
      schemaVersion: 2,
      exportedAt: '2026-04-29T04:00:00.000Z',
      source: 'auto-team-builder-rumble',
      exportType: 'settings',
      settings: {
        types: ['DEX', 'STR'],
        selectedClasses: ['Fighter'],
        onlySelectedTypes: true,
        onlySelectedClasses: false,
        favoritesOnly: true,
        favoriteCharacterIds: [101, 202],
        characterBoxId: 'box-1',
        candidateCharacterIds: undefined,
        opponentSlots: [],
        buffFocus: [
          { stat: 'ATK', rank: 'primary' },
          { stat: 'HP', rank: 'secondary' },
          { stat: 'DEF', rank: 'ignored' },
          { stat: 'SPD', rank: 'tertiary' },
          { stat: 'RCV', rank: 'ignored' },
          { stat: 'Special CT', rank: 'secondary' },
        ],
        requireFullTeam: false,
      },
      favoriteCount: 2,
      workerPreference: { mode: 'manual', manualCount: 3 },
    });
  });

  it('builds a team export payload with full slot unit character data', () => {
    const result = createResult();
    const alternateResult = createResult(1000);
    const opponentActiveSlot = createSlot('active', 0, 301);
    const opponentBenchSlot = createSlot('bench', 0, 302);
    const payload = buildRumbleTeamExportPayload(result, '2026-04-29T04:00:00.000Z', {
      allResults: [result, alternateResult],
      selectedTeamIndex: 0,
      opponentSlots: [opponentActiveSlot, opponentBenchSlot],
    });

    expect(payload?.source).toBe('auto-team-builder-rumble');
    expect(payload?.exportType).toBe('team');
    expect(payload?.selectedTeamIndex).toBe(0);
    expect(payload?.requestedInput.requireFullTeam).toBe(true);
    expect(payload?.team).toHaveLength(2);
    expect(payload?.teams).toHaveLength(2);
    expect(payload?.teams[0].isSelected).toBe(true);
    expect(payload?.teams[1].team[0].unit.character.id).toBe(1101);
    expect(payload?.opponentTeam.team.map((slot) => slot.unit.character.id)).toEqual([301, 302]);
    expect(payload?.opponentTeam.totalRumbleCost).toBe(110);
    expect(payload?.totalRumbleCost).toBe(110);
    expect(payload?.team[0].unit.character).toEqual(result.activeSlots[0].unit.character);
    expect(payload?.team[1].unit.character.detail.rumbleData).toEqual({ id: 202 });
  });

  it('does not build a team export payload for blocked or empty results', () => {
    expect(buildRumbleTeamExportPayload(null)).toBeNull();
    expect(buildRumbleTeamExportPayload({ ...createResult(), selectedCount: 0 })).toBeNull();
  });

  it('downloads JSON with the expected filenames', () => {
    const dom = new JSDOM('<body></body>');
    const createdUrls: Blob[] = [];
    const urlRef = {
      createObjectURL: vi.fn((blob: Blob) => {
        createdUrls.push(blob);
        return 'blob:rumble-export';
      }),
      revokeObjectURL: vi.fn(),
    };

    downloadRumbleBuilderSettingsExport(
      buildRumbleBuilderSettingsExportPayload({
        exportedAt: '2026-04-29T04:00:00.000Z',
        settings: {
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
        favoriteCount: 0,
        workerPreference: { mode: 'auto', manualCount: 2 },
      }),
      dom.window.document,
      urlRef,
    );
    downloadRumbleTeamExport(
      buildRumbleTeamExportPayload(createResult(), '2026-04-29T04:00:00.000Z'),
      dom.window.document,
      urlRef,
    );

    expect(urlRef.createObjectURL).toHaveBeenCalledTimes(2);
    expect(urlRef.revokeObjectURL).toHaveBeenCalledWith('blob:rumble-export');
    expect(buildRumbleBuilderSettingsExportFilename('2026-04-29T04:00:00.000Z')).toBe(
      'optc-rumble-builder-settings-2026-04-29T04-00-00-000Z.json',
    );
    expect(buildRumbleTeamExportFilename('2026-04-29T04:00:00.000Z')).toBe(
      'optc-rumble-team-2026-04-29T04-00-00-000Z.json',
    );
    expect(createdUrls).toHaveLength(2);
  });
});

function createResult(offset = 0): RumbleTeamResult {
  return {
    activeSlots: [createSlot('active', 0, 101 + offset)],
    benchSlots: [createSlot('bench', 0, 202 + offset)],
    candidateCount: 2,
    selectedCount: 2,
    totalScore: 300,
    roleCoverage: ['attacker'],
    typeCoverage: ['DEX'],
    classCoverage: ['Fighter'],
    topFactors: ['Core power: Unit 101'],
    input: {
      types: ['DEX'],
      selectedClasses: ['Fighter'],
      onlySelectedTypes: false,
      onlySelectedClasses: false,
      favoritesOnly: false,
      favoriteCharacterIds: [],
      characterBoxId: null,
      opponentSlots: [],
      buffFocus: DEFAULT_RUMBLE_BUFF_FOCUS,
      requireFullTeam: true,
    },
    requestedTypes: ['DEX'],
    requestedClasses: ['Fighter'],
    resolvedTypes: ['DEX'],
    resolvedClasses: ['Fighter'],
    droppedTypes: [],
    droppedClasses: [],
  };
}

function createSlot(
  role: 'active' | 'bench',
  index: number,
  id: number,
): RumbleTeamResult['activeSlots'][number] {
  return {
    role,
    index,
    score: 100,
    reasonChips: ['Damage'],
    unit: {
      character: {
        id,
        name: `Unit ${id}`,
        searchText: `unit ${id}`,
        isIncomplete: false,
        type: 'DEX',
        classes: ['Fighter'],
        primaryClass: 'Fighter',
        secondaryClass: null,
        stars: 6,
        cost: 55,
        combo: 4,
        captainHpBoost: 0,
        captainAtkBoost: 0,
        captainAverageBoost: 0,
        stats: {
          min: { hp: 100, atk: 100, rcv: 100 },
          max: { hp: 1000, atk: 1000, rcv: 100 },
          growth: 3,
        },
        regionAvailability: {
          exactLocal: true,
          thumbnailGlobal: false,
          thumbnailJapan: false,
        },
        assets: {
          exactLocal: null,
          thumbnailLocal: null,
          thumbnailGlobal: null,
          thumbnailJapan: null,
        },
        imageUrl: `assets/${id}.png`,
        detailImageUrl: `assets/detail/${id}.png`,
        detail: {
          characterId: id,
          captainAbility: null,
          captainAbilityVariants: [],
          captainNotes: null,
          specialName: null,
          specialText: null,
          specialNotes: null,
          superSpecialText: null,
          superSpecialCriteriaText: null,
          superSpecialCriteria: null,
          superSpecialNotes: null,
          partyConflictKeys: [],
          builderAbilities: [],
          sailorAbilities: [],
          sailorNotes: null,
          potentialAbilities: [],
          supportData: [],
          swapData: null,
          vsSpecial: null,
          superType: null,
          superClass: null,
          rumbleData: { id },
        },
      },
      normalized: {
        raw: {},
        basedOnId: null,
        rumbleType: 'ATK',
        def: 100,
        spd: 100,
        cost: 55,
        cooldown: 20,
        targetLabel: null,
        patternCount: 0,
        maxPassiveLevel: null,
        maxSpecialLevel: null,
        maxPassiveEffects: [],
        maxSpecialEffects: [],
        maxSpecialCooldown: null,
        baseResistances: [],
        llbResistances: [],
        passiveEffects: [],
        specialEffects: [],
        roleTags: ['attacker'],
      },
      baseScore: 100,
      breakdown: {
        statScore: 50,
        passiveScore: 10,
        specialScore: 20,
        synergyScore: 0,
        recencyScore: 1,
        total: 100,
      },
      reasonChips: ['Damage'],
      conflictKeys: [`character:${id}`],
    },
  };
}
