import { describe, expect, it } from 'vitest';

import {
  createEmptyAutoBuildCostRange,
  createEmptyAutoBuildLeaderBoostRanges,
  createEmptyAutoBuildManualSlots,
  type AutoBuildResult,
} from '../../core/models/auto-team-builder.models';
import {
  type AutoBuildAbilityCatalogItem,
  type AutoBuildAbilitySource,
} from '../../core/models/auto-team-builder-ability.models';
import { type CharacterDetailRecord, type SavedTeam, type ShipRecord } from '../../core/models/optc.models';
import {
  buildSavedTeamShareCode,
  buildSavedTeamShareUrl,
  buildSavedTeamsTransferPayload,
} from '../saved-teams/saved-teams-transfer.utils';
import {
  buildAutoTeamExportPayload,
  buildAutoTeamSelectionExportPayload,
} from './auto-team-builder-export.utils';
import {
  buildAutoTeamCompareDiff,
  buildAutoTeamCompareSnapshotFromCurrent,
  buildAutoTeamCompareSnapshotFromImportedSeed,
  buildAutoTeamCompareSnapshotFromSavedTeam,
  collectAutoTeamCompareSeedCharacterIds,
  parseAutoTeamCompareImportPayload,
} from './auto-team-builder-team-compare.utils';

describe('auto-team-builder-team-compare utils', () => {
  it('parses saved-team JSON, share code, and share link into comparable seeds', () => {
    const savedTeam = createSavedTeam('team-1', [101, 102, 103, null, 105, 106], 9001);
    const transferJson = JSON.stringify(
      buildSavedTeamsTransferPayload([savedTeam], '2026-06-25T08:00:00.000Z'),
    );
    const shareCode = buildSavedTeamShareCode(savedTeam, '2026-06-25T08:00:00.000Z');
    const shareLink = buildSavedTeamShareUrl(
      savedTeam,
      'https://optcteambuilder.com',
      '2026-06-25T08:00:00.000Z',
    );

    expect(parseAutoTeamCompareImportPayload(transferJson)).toMatchObject({
      label: 'Saved Team team-1',
      shipId: 9001,
      slotIds: [101, 102, 103, null, 105, 106],
    });
    expect(parseAutoTeamCompareImportPayload(shareCode)).toMatchObject({
      label: 'Saved Team team-1',
      shipId: 9001,
      slotIds: [101, 102, 103, null, 105, 106],
    });
    expect(parseAutoTeamCompareImportPayload(shareLink)).toMatchObject({
      label: 'Saved Team team-1',
      shipId: 9001,
      slotIds: [101, 102, 103, null, 105, 106],
    });
  });

  it('parses auto-builder preset JSON and generated team JSON with zero-based slot indexes', () => {
    const result = createAutoBuildResult();
    const generatedExport = buildAutoTeamExportPayload(
      result,
      [],
      101,
      102,
      '2026-06-25T08:00:00.000Z',
    );
    const presetPayload = buildAutoTeamSelectionExportPayload({
      selectedTypes: result.input.types,
      selectedClasses: result.input.selectedClasses,
      requiredAbilities: [],
      enemyMechanics: [],
      requireAllSelectedTypesInTeam: false,
      requireAllSelectedClassesPerCharacter: false,
      requireAllSlotsInLeaderSuperEffectScope: false,
      requireUniqueBaseCharacterNames: false,
      favoritesOnly: false,
      favoriteCount: 0,
      manualSlots: createEmptyAutoBuildManualSlots(),
      lockedCharacterIds: [],
      lockedCharacters: [],
      selectedLeaderIds: [],
      captainLeaderId: null,
      friendCaptainLeaderId: null,
      generatedTeamExport: generatedExport,
      exportedAt: '2026-06-25T08:00:00.000Z',
    });

    expect(parseAutoTeamCompareImportPayload(JSON.stringify(presetPayload))).toMatchObject({
      label: 'Imported generated team',
      shipId: 9001,
      slotIds: [101, 102, 103, 104, 105, 106],
    });
    expect(parseAutoTeamCompareImportPayload(JSON.stringify(generatedExport))).toMatchObject({
      label: 'Imported generated team',
      shipId: 9001,
      slotIds: [101, 102, 103, 104, 105, 106],
    });
  });

  it('builds slot diffs for changed, unchanged, and one-side-empty slots', () => {
    const catalogItems = createCatalogItems();
    const characterMap = createCharacterMap([101, 102, 103, 104, 105, 106, 107]);
    const current = buildAutoTeamCompareSnapshotFromCurrent(
      createAutoBuildResult(),
      createShipRecord(9001),
      catalogItems,
    );
    const saved = buildAutoTeamCompareSnapshotFromSavedTeam(
      createSavedTeam('team-2', [101, 102, null, 104, 105, 107], 9001),
      characterMap,
      createShipRecord(9001),
      catalogItems,
    );

    const diff = buildAutoTeamCompareDiff(current, saved);

    expect(diff.changedSlotCount).toBe(2);
    expect(diff.slotRows.find((row) => row.role === 'captain')).toMatchObject({
      changed: false,
    });
    expect(diff.slotRows.find((row) => row.role === 'sub1')).toMatchObject({
      changed: true,
      b: { characterId: null, character: null, missing: false },
    });
    expect(diff.slotRows.find((row) => row.role === 'sub4')).toMatchObject({
      changed: true,
      b: { characterId: 107 },
    });
  });

  it('produces signed metric deltas and tolerates missing optional coverage data', () => {
    const catalogItems = createCatalogItems();
    const left = buildAutoTeamCompareSnapshotFromImportedSeed(
      {
        label: 'Left',
        shipId: 9001,
        slotIds: [101, 102, null, null, null, null],
      },
      createCharacterMap([101, 102]),
      createShipRecord(9001),
      catalogItems,
    );
    const right = buildAutoTeamCompareSnapshotFromImportedSeed(
      {
        label: 'Right',
        shipId: null,
        slotIds: [101, 102, 103, 104, null, null],
      },
      createCharacterMap([101, 102, 103, 104]),
      null,
      catalogItems,
    );

    const diff = buildAutoTeamCompareDiff(left, right);

    expect(diff.metricRows.find((row) => row.key === 'filledSlots')).toMatchObject({
      aValue: 2,
      bValue: 4,
      delta: 2,
      deltaLabel: '+2',
      tone: 'positive',
    });
    expect(diff.metricRows.find((row) => row.key === 'ship')).toMatchObject({
      aValue: 1,
      bValue: 0,
      delta: -1,
      deltaLabel: '-1',
      tone: 'negative',
    });
    expect(diff.metricRows.find((row) => row.key === 'uniqueAbilities')).toMatchObject({
      aValue: 2,
      bValue: 4,
      delta: 2,
      deltaLabel: '+2',
    });
    expect(diff.metricRows.find((row) => row.key === 'captainTierCoverage')).toBeDefined();
  });

  it('keeps missing imported character ids visible as side-specific snapshot warnings', () => {
    const seed = {
      label: 'Partial',
      shipId: null,
      slotIds: [101, 999, null, null, null, null],
    };
    const snapshot = buildAutoTeamCompareSnapshotFromImportedSeed(
      seed,
      createCharacterMap([101]),
      null,
      createCatalogItems(),
    );

    expect(collectAutoTeamCompareSeedCharacterIds(seed)).toEqual([101, 999]);
    expect(snapshot.missingCharacterCount).toBe(1);
    expect(snapshot.slots[1]).toMatchObject({
      characterId: 999,
      character: null,
      missing: true,
    });
  });
});

function createAutoBuildResult(): AutoBuildResult {
  const input: AutoBuildResult['input'] = {
    types: ['DEX', 'PSY'],
    selectedClasses: ['Fighter', 'Slasher'],
    selectedCharacterTags: [],
    selectedCharacterNames: [],
    requiredAbilities: [],
    requiredCharacterGroups: [],
    enemyMechanics: [],
    requireAllSelectedTypesInTeam: false,
    requireAllSelectedClassesPerCharacter: false,
    requireAllSelectedCharacterTagsInTeam: false,
    requireAllSelectedCharacterNamesInTeam: false,
    requireAllSlotsInLeaderSuperEffectScope: false,
    requireFullCaptainAbilityCoverage: false,
    requireBothLeadersFullCaptainAbilityCoverage: false,
    minimumLeaderSuperEffectMatchingSlots: null,
    requireLeaderSuperSpecialCriteria: false,
    strictSuperSpecialCriteriaCoverage: false,
    requireSuperTandemCriteria: false,
    strictSuperTandemCriteriaCoverage: false,
    requireUniqueBaseCharacterNames: false,
    favoritesOnly: false,
    allowAnyFriendCaptainAutoFill: false,
    favoriteShipsOnly: false,
    favoriteShipIds: [],
    leaderBoostFilters: ['HP', 'ATK'],
    leaderBoostRanges: createEmptyAutoBuildLeaderBoostRanges(),
    costRange: createEmptyAutoBuildCostRange(),
    leaderCostRange: createEmptyAutoBuildCostRange(),
    subCostRange: createEmptyAutoBuildCostRange(),
    maxTotalCost: null,
    manualSlots: createEmptyAutoBuildManualSlots(),
    lockedCharacterIds: [],
    excludedCharacterIds: [],
    captainCharacterId: 101,
    friendCaptainCharacterId: 102,
    manualShipId: null,
    requireManualShip: false,
    excludedShipIds: [],
    candidateLimit: null,
  };

  return {
    input,
    requestedInput: {
      ...input,
      types: [...input.types],
      selectedClasses: [...input.selectedClasses],
      selectedCharacterTags: [],
      selectedCharacterNames: [],
      requiredAbilities: [],
      requiredCharacterGroups: [],
      enemyMechanics: [],
      favoriteShipIds: [],
      leaderBoostFilters: [...input.leaderBoostFilters],
      leaderBoostRanges: {
        HP: { ...input.leaderBoostRanges.HP },
        ATK: { ...input.leaderBoostRanges.ATK },
      },
      costRange: { ...input.costRange },
      leaderCostRange: { ...input.leaderCostRange },
      subCostRange: { ...input.subCostRange },
      manualSlots: input.manualSlots.map((slot) => ({
        role: slot.role,
        characterIds: [...slot.characterIds],
      })),
      lockedCharacterIds: [],
      excludedCharacterIds: [],
      excludedShipIds: [],
    },
    relaxation: {
      usedFallback: false,
      droppedTypes: [],
      droppedClasses: [],
      droppedCharacterTags: [],
      droppedCharacterNames: [],
      minimumLeaderSuperEffectMatchingSlots: null,
      allowedLeadersWithSuperEffects: false,
      ignoredLeaderSuperEffectScope: false,
      ignoredLeaderSuperSpecialCriteria: false,
      ignoredSuperTandemCriteria: false,
    },
    shipSelection: {
      ship: createShipRecord(9001),
      source: 'manual',
      reasonChips: ['Manual ship'],
    },
    candidateCount: 12,
    coverage: {
      leaderCriteria: {
        source: 'captainAbility',
        coverageMode: 'simpleBoostScope',
        captainLeaderId: 101,
        friendCaptainLeaderId: 102,
        leaderIds: [101, 102],
        leaderNames: ['Character 101', 'Character 102'],
        leaderBranchSelections: [],
        dualLeaderMode: 'intersection',
        derivedAllowedClasses: ['Fighter', 'Slasher'],
        derivedAllowedTypes: ['DEX', 'PSY'],
        derivedAllowedCharacterTags: [],
        dominantTypeRequirements: [],
        hasCostRestriction: false,
        maxAllowedCost: null,
        hasClassRestriction: true,
        hasTypeRestriction: true,
        hasCharacterTagRestriction: false,
        requiresDominantType: false,
        tagConditionSets: [],
        matchingSlots: 6,
        totalSlots: 6,
        allSlotsMatch: true,
        leaderTierCoverages: [],
        allLeaderTiersCovered: true,
      },
      abilityRequirements: {
        requested: [],
        matched: [],
        missing: [],
        matchesAll: true,
      },
      requiredCharacterGroups: {
        requested: [],
        matched: [],
        missing: [],
        matchesAll: true,
      },
      burst: [],
      consistency: [],
      utility: [],
      coveredSelectedClasses: ['Fighter', 'Slasher'],
      coveredSelectedTypes: ['DEX', 'PSY'],
      coveredSelectedCharacterTags: [],
      coveredSelectedCharacterNames: [],
      coversAllSelectedClasses: true,
      coversAllSelectedTypes: true,
      coversAllSelectedCharacterTags: true,
      coversAllSelectedCharacterNames: true,
      selectedClassMatches: 6,
      selectedTypeMatches: 6,
      selectedCharacterTagMatches: 0,
      selectedCharacterNameMatches: 0,
    },
    slots: [
      { role: 'captain', character: createCharacterRecord(101), reasonChips: [] },
      { role: 'friendCaptain', character: createCharacterRecord(102), reasonChips: [] },
      { role: 'sub', character: createCharacterRecord(103), reasonChips: [] },
      { role: 'sub', character: createCharacterRecord(104), reasonChips: [] },
      { role: 'sub', character: createCharacterRecord(105), reasonChips: [] },
      { role: 'sub', character: createCharacterRecord(106), reasonChips: [] },
    ],
  };
}

function createSavedTeam(id: string, slots: Array<number | null>, shipId: number | null): SavedTeam {
  return {
    id,
    name: `Saved Team ${id}`,
    notes: '',
    shipId,
    slots,
    createdAt: '2026-06-25T08:00:00.000Z',
    updatedAt: '2026-06-25T08:00:00.000Z',
  };
}

function createShipRecord(id: number): ShipRecord {
  return {
    id,
    name: `Ship ${id}`,
    thumb: null,
    thumbUrl: null,
    description: 'Boosts crew ATK.',
  };
}

function createCatalogItems(): AutoBuildAbilityCatalogItem[] {
  return [
    createCatalogItem('remove_bind', 'special'),
    createCatalogItem('sailor_despair', 'crewmate'),
    createCatalogItem('potential_cooldown', 'potential'),
    createCatalogItem('support_heal', 'support'),
  ];
}

function createCatalogItem(
  key: string,
  category: AutoBuildAbilityCatalogItem['category'],
): AutoBuildAbilityCatalogItem {
  return {
    key,
    label: key,
    category,
    supportsTurns: false,
    supportsSlotTokens: false,
    availableSlotTokens: [],
    availableSources: ['specialText'],
    matchCount: 1,
    sampleCharacterIds: [101],
    sampleTexts: [key],
  };
}

function createCharacterMap(ids: number[]): Map<number, CharacterDetailRecord> {
  return new Map(ids.map((id) => [id, createCharacterRecord(id)]));
}

function createCharacterRecord(id: number): CharacterDetailRecord {
  const abilityKeyById = new Map<number, [string, AutoBuildAbilitySource]>([
    [101, ['remove_bind', 'specialText']],
    [102, ['support_heal', 'supportData']],
    [103, ['sailor_despair', 'sailorAbilities']],
    [104, ['potential_cooldown', 'potentialAbilities']],
  ]);
  const abilityEntry = abilityKeyById.get(id);

  return {
    id,
    name: `Character ${id}`,
    isIncomplete: false,
    type: id % 2 === 0 ? 'DEX' : 'PSY',
    classes: id === 104 ? ['Powerhouse'] : ['Fighter', 'Slasher'],
    primaryClass: id === 104 ? 'Powerhouse' : 'Fighter',
    secondaryClass: id === 104 ? null : 'Slasher',
    stars: 6,
    cost: 55,
    combo: 4,
    captainHpBoost: 1.3,
    captainAtkBoost: 5,
    captainAverageBoost: 3.15,
    stats: {
      min: { hp: 1000, atk: 500, rcv: 100 },
      max: { hp: 4200, atk: 1800, rcv: 320 },
      growth: 2.4,
    },
    regionAvailability: {
      exactLocal: true,
      thumbnailGlobal: true,
      thumbnailJapan: false,
    },
    assets: {
      exactLocal: `assets/characters/${id}.png`,
      thumbnailGlobal: `assets/characters/${id}-thumb.png`,
      thumbnailJapan: null,
    },
    imageUrl: `assets/characters/${id}-thumb.png`,
    detailImageUrl: `assets/characters/${id}.png`,
    detail: {
      characterId: id,
      captainAbility: `Character ${id} captain ability`,
      captainAbilityVariants: [
        {
          key: 'base',
          label: 'Base Captain Ability',
          text: `Character ${id} captain ability`,
        },
      ],
      captainNotes: null,
      specialName: `Character ${id} special`,
      specialText: `Character ${id} special text`,
      specialNotes: null,
      superSpecialText: null,
      superSpecialCriteriaText: null,
      superSpecialNotes: null,
      superSpecialCriteria: null,
      partyConflictKeys: [],
      characterTags: [],
      builderAbilities: abilityEntry
        ? [
            {
              key: abilityEntry[0],
              label: abilityEntry[0],
              minTurns: null,
              isCompleteRemoval: false,
              slotTokens: [],
              source: abilityEntry[1],
            },
          ]
        : [],
      sailorAbilities: [],
      sailorNotes: null,
      potentialAbilities: [],
      supportData: [],
      swapData: null,
      vsSpecial: null,
      superType: null,
      superClass: null,
      rumbleData: null,
    },
  };
}
