import {
  AUTO_BUILD_LEADER_BOOST_FILTERS,
  AUTO_BUILD_MANUAL_SLOT_ROLES,
  AUTO_BUILD_MANUAL_SUB_SLOT_ROLES,
  type AutoBuildCostRange,
  type AutoBuildCaptainBranchMode,
  type AutoBuildCaptainBranchSelection,
  type AutoBuildLeaderBoostFilter,
  type AutoBuildLeaderBoostRange,
  type AutoBuildLeaderBoostRanges,
  type AutoBuildResult,
  type AutoBuildManualSlotRole,
  type AutoBuildManualSlotSelection,
  type AutoTeamBuilderType,
  createEmptyAutoBuildCostRange,
  createEmptyAutoBuildLeaderBoostRanges,
  createEmptyAutoBuildManualSlots,
} from '../../core/models/auto-team-builder.models';
import {
  normalizeAbilityRequirementSourceScope,
  normalizeAbilityRequirementSlotScope,
  type AutoBuildAbilityCatalogItem,
  type AutoBuildAbilityRequirement,
  type AutoBuildBattleRequirement,
  type AutoBuildEnemyMechanicRequirement,
  type AutoBuildRequiredCharacterGroup,
} from '../../core/models/auto-team-builder-ability.models';
import {
  type CharacterDetailRecord,
  type CharacterListItem,
  type CharacterTagSetSelection,
  type ShipRecord,
} from '../../core/models/optc.models';
import {
  cloneCharacterTagSetSelection,
  createEmptyCharacterTagSetSelection,
  expandCharacterTagsToSets,
  flattenCharacterTagSets,
  normalizeCharacterTagSetSelection,
} from '../../core/services/character-tag-set.utils';
import {
  normalizeAbilityRequirementTurns,
  resolveNonNegativeInteger,
} from '../../core/services/ability-requirement-draft.utils';
import { normalizeEnemyMechanicRequirements } from '../../core/services/enemy-mechanic-draft.utils';
import {
  cloneBattleRequirements,
  normalizeBattleRequirementsWithLegacyFallback,
} from '../../core/services/auto-team-builder-battle.utils';
import {
  cloneRequiredCharacterGroups,
  expandRequiredAbilitiesToCharacterGroups,
  MAX_REQUIRED_CHARACTER_GROUPS,
} from '../../core/services/required-character-groups.utils';
import { type SavedTeamsTransferPayload } from '../saved-teams/saved-teams-transfer.utils';

type AutoTeamExportRole = AutoBuildResult['slots'][number]['role'];
type AutoTeamExportLeaderAssignment = 'captain' | 'friendCaptain' | 'dual' | null;

interface AutoTeamExportSlot {
  slotIndex: number;
  role: AutoTeamExportRole;
  isLeader: boolean;
  leaderAssignment: AutoTeamExportLeaderAssignment;
  isFavorite: boolean;
  character: CharacterDetailRecord;
  captainBranchSelection?: AutoBuildCaptainBranchSelection | null;
}

export interface AutoTeamExportPayload {
  exportedAt: string;
  source: 'auto-team-builder';
  requestedInput: AutoBuildResult['requestedInput'];
  effectiveInput: AutoBuildResult['input'];
  relaxation: AutoBuildResult['relaxation'];
  coverage: AutoBuildResult['coverage'];
  shipSelection: AutoBuildResult['shipSelection'];
  team: AutoTeamExportSlot[];
}

interface AutoTeamSelectionCharacterSummary {
  id: number;
  name: string;
  type: CharacterListItem['type'];
  primaryClass: CharacterListItem['primaryClass'];
  secondaryClass: CharacterListItem['secondaryClass'];
  imageUrl: CharacterListItem['imageUrl'];
  isLeader: boolean;
  leaderAssignment: AutoTeamExportLeaderAssignment;
}

interface AutoTeamSelectionShipSummary {
  id: number;
  name: string;
  thumb: string | null;
  description: string;
}

export interface AutoTeamSelectionExportPayload {
  schemaVersion:
    | 1
    | 2
    | 3
    | 4
    | 5
    | 6
    | 7
    | 8
    | 9
    | 10
    | 11
    | 12
    | 13
    | 14
    | 15
    | 16
    | 17
    | 18
    | 19
    | 20
    | 21
    | 22
    | 23
    | 24
    | 25
    | 26
    | 27
    | 28
    | 29
    | 30
    | 31
    | 32
    | 33;
  exportedAt: string;
  source: 'auto-team-builder';
  exportType: 'preset';
  filters: {
    selectedTypes: AutoBuildResult['input']['types'];
    selectedClasses: AutoBuildResult['input']['selectedClasses'];
    selectedCharacterTags?: string[];
    /**
     * Schema 33+. The flat `selectedCharacterTags` above stays in every payload
     * as the lossy back-compat projection older readers understand; this field
     * is the authoritative AND/OR grouping. A v32 payload has no sets and is
     * back-filled from the flat list plus `requireAllSelectedCharacterTagsInTeam`.
     */
    characterTagSets?: CharacterTagSetSelection;
    selectedCharacterNames?: string[];
    requiredAbilities: AutoBuildResult['input']['requiredAbilities'];
    requiredCharacterGroups?: AutoBuildRequiredCharacterGroup[];
    battleRequirements?: AutoBuildBattleRequirement[];
    enemyMechanics?: AutoBuildEnemyMechanicRequirement[];
    requireAllSelectedTypesInTeam: boolean;
    requireAllSelectedClassesPerCharacter: boolean;
    requireAllSelectedCharacterTagsInTeam?: boolean;
    requireAllSelectedCharacterNamesInTeam?: boolean;
    requireAllSlotsInLeaderSuperEffectScope?: boolean;
    requireFullCaptainAbilityCoverage?: boolean;
    requireBothLeadersFullCaptainAbilityCoverage?: boolean;
    requireSuperSpecialCriteriaCoverage?: boolean;
    requireSuperTandemCriteriaCoverage?: boolean;
    requireUniqueBaseCharacterNames: boolean;
    favoritesOnly: boolean;
    allowAnyFriendCaptainAutoFill?: boolean;
    favoriteCount: number;
    favoriteShipsOnly?: boolean;
    favoriteShipCount?: number;
    leaderBoostFilters?: AutoBuildLeaderBoostFilter[];
    leaderBoostRanges?: AutoBuildLeaderBoostRanges;
    costRange?: AutoBuildCostRange;
    leaderCostRange?: AutoBuildCostRange;
    subCostRange?: AutoBuildCostRange;
    maxTotalCost?: number | null;
  };
  manualSelection: {
    manualSlots: AutoBuildManualSlotSelection[];
    lockedCharacterIds: number[];
    excludedCharacterIds: number[];
    selectedLeaderIds: number[];
    captainLeaderId: number | null;
    friendCaptainLeaderId: number | null;
    manualShipId: number | null;
    excludedShipIds: number[];
    ship: AutoTeamSelectionShipSummary | null;
    characters: AutoTeamSelectionCharacterSummary[];
    excludedCharacters: AutoTeamSelectionCharacterSummary[];
    excludedShips: AutoTeamSelectionShipSummary[];
  };
  generatedTeamExport?: AutoTeamExportPayload;
  savedTeamImport?: SavedTeamsTransferPayload;
}

export interface AutoTeamSelectionImportState {
  selectedTypes: AutoTeamBuilderType[];
  selectedClasses: string[];
  selectedCharacterTags: string[];
  /**
   * Optional so the SavedEnemy and saved-team preset builders — which only ever
   * knew the flat tag list — keep compiling. Hosts back-fill an absent value
   * with `expandCharacterTagsToSets(selectedCharacterTags, requireAll…)`.
   */
  characterTagSets?: CharacterTagSetSelection;
  selectedCharacterNames: string[];
  requiredAbilities: AutoBuildAbilityRequirement[];
  requiredCharacterGroups?: AutoBuildRequiredCharacterGroup[];
  battleRequirements?: AutoBuildBattleRequirement[];
  enemyMechanics: AutoBuildEnemyMechanicRequirement[];
  requireAllSelectedTypesInTeam: boolean;
  requireAllSelectedClassesPerCharacter: boolean;
  requireAllSelectedCharacterTagsInTeam: boolean;
  requireAllSelectedCharacterNamesInTeam: boolean;
  requireAllSlotsInLeaderSuperEffectScope: boolean;
  requireFullCaptainAbilityCoverage: boolean;
  requireBothLeadersFullCaptainAbilityCoverage: boolean;
  requireSuperSpecialCriteriaCoverage: boolean;
  requireSuperTandemCriteriaCoverage: boolean;
  requireUniqueBaseCharacterNames: boolean;
  favoritesOnly: boolean;
  allowAnyFriendCaptainAutoFill: boolean;
  favoriteShipsOnly: boolean;
  leaderBoostFilters: AutoBuildLeaderBoostFilter[];
  leaderBoostRanges: AutoBuildLeaderBoostRanges;
  leaderCostRange: AutoBuildCostRange;
  subCostRange: AutoBuildCostRange;
  maxTotalCost: number | null;
  manualSlots: AutoBuildManualSlotSelection[];
  lockedCharacterIds: number[];
  excludedCharacterIds: number[];
  selectedLeaderIds: number[];
  captainLeaderId: number | null;
  manualShipId: number | null;
  excludedShipIds: number[];
}

export interface AutoTeamSelectionImportResult {
  state: AutoTeamSelectionImportState;
  warnings: AutoTeamSelectionImportMessage[];
}

export interface AutoTeamSelectionImportMessage {
  key: string;
  params?: Record<string, string | number>;
}

export class AutoTeamSelectionImportError extends Error {
  public constructor(
    public readonly key: string,
    public readonly parameters?: Record<string, string | number>,
  ) {
    super(key);
    this.name = 'AutoTeamSelectionImportError';
  }
}

interface SanitizeAutoTeamSelectionImportOptions {
  availableTypes: readonly AutoTeamBuilderType[];
  availableClasses: readonly string[];
  abilityCatalogItems: AutoBuildAbilityCatalogItem[];
  availableLockedCharacters: CharacterListItem[];
  availableShips?: ShipRecord[];
}

interface BuildAutoTeamSelectionExportPayloadOptions {
  selectedTypes: AutoBuildResult['input']['types'];
  selectedClasses: AutoBuildResult['input']['selectedClasses'];
  selectedCharacterTags?: string[];
  characterTagSets?: CharacterTagSetSelection;
  selectedCharacterNames?: string[];
  requiredAbilities: AutoBuildResult['input']['requiredAbilities'];
  requiredCharacterGroups?: AutoBuildRequiredCharacterGroup[];
  battleRequirements?: AutoBuildBattleRequirement[];
  enemyMechanics: AutoBuildResult['input']['enemyMechanics'];
  requireAllSelectedTypesInTeam: boolean;
  requireAllSelectedClassesPerCharacter: boolean;
  requireAllSelectedCharacterTagsInTeam?: boolean;
  requireAllSelectedCharacterNamesInTeam?: boolean;
  requireAllSlotsInLeaderSuperEffectScope: boolean;
  requireFullCaptainAbilityCoverage?: boolean;
  requireBothLeadersFullCaptainAbilityCoverage?: boolean;
  requireSuperSpecialCriteriaCoverage?: boolean;
  requireSuperTandemCriteriaCoverage?: boolean;
  requireUniqueBaseCharacterNames: boolean;
  favoritesOnly: boolean;
  allowAnyFriendCaptainAutoFill?: boolean;
  favoriteCount: number;
  favoriteShipsOnly?: boolean;
  favoriteShipCount?: number;
  leaderBoostFilters?: AutoBuildLeaderBoostFilter[];
  leaderBoostRanges?: Partial<
    Record<AutoBuildLeaderBoostFilter, Partial<AutoBuildLeaderBoostRange> | null>
  >;
  costRange?: Partial<AutoBuildCostRange> | null;
  leaderCostRange?: Partial<AutoBuildCostRange> | null;
  subCostRange?: Partial<AutoBuildCostRange> | null;
  maxTotalCost?: number | null;
  manualSlots: AutoBuildManualSlotSelection[];
  lockedCharacterIds: number[];
  lockedCharacters: CharacterListItem[];
  excludedCharacterIds?: number[];
  excludedCharacters?: CharacterListItem[];
  selectedLeaderIds: number[];
  captainLeaderId: number | null;
  friendCaptainLeaderId: number | null;
  manualShipId?: number | null;
  manualShip?: ShipRecord | null;
  excludedShipIds?: number[];
  excludedShips?: ShipRecord[];
  generatedTeamExport?: AutoTeamExportPayload | null;
  savedTeamImport?: SavedTeamsTransferPayload | null;
  exportedAt?: string;
}

interface SanitizedImportedAbilityRequirement {
  adjusted: boolean;
  invalid: boolean;
  requirement: AutoBuildAbilityRequirement | null;
}

function resolveImportedLeaderSuperEffectScopeState(
  requireAllSlotsInLeaderSuperEffectScope: boolean,
  requireLeadersWithoutSuperEffects: boolean,
): boolean {
  return requireAllSlotsInLeaderSuperEffectScope || requireLeadersWithoutSuperEffects;
}

function sanitizeImportedAbilityRequirement(
  rawRequirement: Partial<AutoBuildAbilityRequirement>,
  abilityCatalogMap: ReadonlyMap<string, AutoBuildAbilityCatalogItem>,
  options: { forceSingleCharacterCount?: boolean } = {},
): SanitizedImportedAbilityRequirement {
  const abilityKey =
    typeof rawRequirement.abilityKey === 'string' ? rawRequirement.abilityKey.trim() : '';
  const abilityCatalogItem = abilityCatalogMap.get(abilityKey);

  if (!abilityCatalogItem) {
    return {
      adjusted: false,
      invalid: true,
      requirement: null,
    };
  }

  const rawMinTurns = resolveNonNegativeInteger(
    typeof rawRequirement.minTurns === 'number' || typeof rawRequirement.minTurns === 'string'
      ? rawRequirement.minTurns
      : null,
  );
  const minTurns = abilityCatalogItem.supportsTurns
    ? normalizeAbilityRequirementTurns(rawRequirement.minTurns ?? null)
    : null;
  const rawRequiredCharacterCount = normalizePositiveInteger(rawRequirement.requiredCharacterCount);
  const requiredCharacterCount = options.forceSingleCharacterCount
    ? 1
    : (rawRequiredCharacterCount ?? 1);
  const slotScope = normalizeAbilityRequirementSlotScope(
    typeof rawRequirement.slotScope === 'string' ? rawRequirement.slotScope : null,
  );
  const sourceScope = normalizeAbilityRequirementSourceScope(
    typeof rawRequirement.sourceScope === 'string' ? rawRequirement.sourceScope : null,
  );
  const rawSlotTokens = Array.isArray(rawRequirement.slotTokens)
    ? [
        ...new Set(
          rawRequirement.slotTokens
            .filter((token): token is string => typeof token === 'string')
            .map((token) => token.trim().toUpperCase())
            .filter((token) => token.length > 0),
        ),
      ]
    : [];
  const slotTokens = abilityCatalogItem.supportsSlotTokens
    ? rawSlotTokens.filter((token) => abilityCatalogItem.availableSlotTokens.includes(token))
    : [];
  const hasInvalidTurns =
    abilityCatalogItem.supportsTurns &&
    rawRequirement.minTurns !== null &&
    rawRequirement.minTurns !== undefined &&
    rawMinTurns === null;
  const hasUnsupportedTurns =
    !abilityCatalogItem.supportsTurns &&
    rawRequirement.minTurns !== null &&
    rawRequirement.minTurns !== undefined;
  const hasInvalidRequiredCharacterCount =
    rawRequirement.requiredCharacterCount !== undefined &&
    rawRequirement.requiredCharacterCount !== null &&
    (rawRequiredCharacterCount === null ||
      (options.forceSingleCharacterCount && rawRequiredCharacterCount !== 1));
  const hasInvalidSlotScope =
    rawRequirement.slotScope !== undefined &&
    rawRequirement.slotScope !== null &&
    rawRequirement.slotScope !== slotScope;
  const hasInvalidSourceScope =
    rawRequirement.sourceScope !== undefined &&
    rawRequirement.sourceScope !== null &&
    rawRequirement.sourceScope !== sourceScope;

  return {
    adjusted:
      rawSlotTokens.length !== slotTokens.length ||
      hasInvalidTurns ||
      hasUnsupportedTurns ||
      (!abilityCatalogItem.supportsSlotTokens && rawSlotTokens.length > 0) ||
      hasInvalidRequiredCharacterCount ||
      hasInvalidSlotScope ||
      hasInvalidSourceScope,
    invalid: false,
    requirement: {
      abilityKey,
      minTurns,
      slotTokens,
      requiredCharacterCount,
      ...(slotScope !== 'any' ? { slotScope } : {}),
      ...(sourceScope ? { sourceScope } : {}),
    },
  };
}

function resolveLeaderAssignment(
  characterId: number,
  captainLeaderId: number | null,
  friendCaptainLeaderId: number | null,
): AutoTeamExportLeaderAssignment {
  const isCaptainLeader = captainLeaderId === characterId;
  const isFriendLeader = friendCaptainLeaderId === characterId;

  if (isCaptainLeader && isFriendLeader) {
    return 'dual';
  }

  if (isCaptainLeader) {
    return 'captain';
  }

  if (isFriendLeader) {
    return 'friendCaptain';
  }

  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isCaptainSourceRequirement(requirement: AutoBuildAbilityRequirement): boolean {
  return normalizeAbilityRequirementSourceScope(requirement.sourceScope) === 'captainAbility';
}

function normalizePositiveInteger(value: unknown): number | null {
  if (typeof value === 'number' && Number.isInteger(value) && value > 0) {
    return value;
  }

  return null;
}

function collectPositiveIntegers(values: unknown[]): number[] {
  const seen = new Set<number>();
  const normalizedValues: number[] = [];

  for (const value of values) {
    const normalizedValue = normalizePositiveInteger(value);

    if (normalizedValue === null || seen.has(normalizedValue)) {
      continue;
    }

    seen.add(normalizedValue);
    normalizedValues.push(normalizedValue);
  }

  return normalizedValues;
}

function isAutoBuildCaptainBranchMode(value: unknown): value is AutoBuildCaptainBranchMode {
  return value === 'character1' || value === 'character2' || value === 'both';
}

function normalizeManualSlotBranchSelections(
  value: unknown,
  characterIds: readonly number[],
): NonNullable<AutoBuildManualSlotSelection['branchSelections']> {
  const selectedIdSet = new Set(characterIds);
  const seenIds = new Set<number>();
  const normalizedSelections: NonNullable<AutoBuildManualSlotSelection['branchSelections']> = [];

  for (const rawSelection of Array.isArray(value) ? value : []) {
    if (!isRecord(rawSelection)) {
      continue;
    }

    const characterId = collectPositiveIntegers([rawSelection['characterId']])[0] ?? null;
    const mode = rawSelection['mode'];

    if (
      characterId === null ||
      !selectedIdSet.has(characterId) ||
      seenIds.has(characterId) ||
      !isAutoBuildCaptainBranchMode(mode)
    ) {
      continue;
    }

    seenIds.add(characterId);
    normalizedSelections.push({ characterId, mode });
  }

  return normalizedSelections;
}

function normalizeStringFilters(value: unknown, options: { lowercase?: boolean } = {}): string[] {
  const seen = new Set<string>();
  const normalizedValues: string[] = [];

  for (const entry of Array.isArray(value) ? value : []) {
    if (typeof entry !== 'string') {
      continue;
    }

    const normalizedValue = entry.trim().replace(/\s+/g, ' ');
    const outputValue = options.lowercase ? normalizedValue.toLowerCase() : normalizedValue;
    const key = outputValue.toLowerCase();

    if (outputValue.length > 0 && !seen.has(key)) {
      seen.add(key);
      normalizedValues.push(outputValue);
    }
  }

  return normalizedValues;
}

function normalizeLeaderBoostFilters(value: unknown): AutoBuildLeaderBoostFilter[] {
  const normalizedFilters = [
    ...new Set(
      (Array.isArray(value) ? value : [])
        .map((entry) => String(entry ?? '').trim())
        .filter((entry): entry is AutoBuildLeaderBoostFilter =>
          AUTO_BUILD_LEADER_BOOST_FILTERS.includes(entry as AutoBuildLeaderBoostFilter),
        ),
    ),
  ];

  return normalizedFilters.length > 0 ? normalizedFilters : [...AUTO_BUILD_LEADER_BOOST_FILTERS];
}

function normalizeLeaderBoostRanges(value: unknown): AutoBuildLeaderBoostRanges {
  const normalizedRanges = createEmptyAutoBuildLeaderBoostRanges();
  const source = isRecord(value) ? value : {};

  for (const filter of AUTO_BUILD_LEADER_BOOST_FILTERS) {
    normalizedRanges[filter] = normalizeLeaderBoostRange(source[filter]);
  }

  return normalizedRanges;
}

function normalizeLeaderBoostRange(value: unknown): AutoBuildLeaderBoostRange {
  const source = isRecord(value) ? value : {};

  return {
    min: normalizeLeaderBoostRangeBound(source['min']),
    max: normalizeLeaderBoostRangeBound(source['max']),
  };
}

function normalizeLeaderBoostRangeBound(value: unknown): number | null {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const parsedValue = Number(value);

  return Number.isFinite(parsedValue) && parsedValue >= 0 ? parsedValue : null;
}

function isLeaderBoostRangesShape(value: unknown): boolean {
  if (value === undefined) {
    return true;
  }

  if (!isRecord(value)) {
    return false;
  }

  return AUTO_BUILD_LEADER_BOOST_FILTERS.every((filter) => {
    const range = value[filter];

    if (range === undefined) {
      return true;
    }

    return (
      isRecord(range) &&
      (range['min'] === undefined || range['min'] === null || typeof range['min'] === 'number') &&
      (range['max'] === undefined || range['max'] === null || typeof range['max'] === 'number')
    );
  });
}

function isCostRangeShape(value: unknown): boolean {
  if (value === undefined) {
    return true;
  }

  return (
    isRecord(value) &&
    (value['min'] === undefined || value['min'] === null || typeof value['min'] === 'number') &&
    (value['max'] === undefined || value['max'] === null || typeof value['max'] === 'number')
  );
}

function buildLegacyManualSlotsFromSelection(
  lockedCharacterIds: number[],
  captainLeaderId: number | null,
  friendCaptainLeaderId: number | null,
): AutoBuildManualSlotSelection[] {
  const manualSlots = createEmptyAutoBuildManualSlots();
  const captainSlot = manualSlots.find((slot) => slot.role === 'captain');
  const friendCaptainSlot = manualSlots.find((slot) => slot.role === 'friendCaptain');
  const leaderIds = new Set(
    [captainLeaderId, friendCaptainLeaderId].filter(
      (characterId): characterId is number => characterId !== null,
    ),
  );

  if (captainSlot && captainLeaderId) {
    captainSlot.characterIds = [captainLeaderId];
  }

  if (friendCaptainSlot && friendCaptainLeaderId) {
    friendCaptainSlot.characterIds = [friendCaptainLeaderId];
  }

  const remainingSubIds = lockedCharacterIds.filter((characterId) => !leaderIds.has(characterId));

  for (const [index, role] of AUTO_BUILD_MANUAL_SUB_SLOT_ROLES.entries()) {
    const slot = manualSlots.find((entry) => entry.role === role);
    const characterId = remainingSubIds[index];

    if (slot && characterId) {
      slot.characterIds = [characterId];
    }
  }

  return manualSlots;
}

function deriveLegacyManualSelectionFromManualSlots(manualSlots: AutoBuildManualSlotSelection[]): {
  lockedCharacterIds: number[];
  selectedLeaderIds: number[];
  captainLeaderId: number | null;
  friendCaptainLeaderId: number | null;
} {
  const captainLeaderId =
    manualSlots.find((slot) => slot.role === 'captain')?.characterIds[0] ?? null;
  const friendCaptainLeaderId =
    manualSlots.find((slot) => slot.role === 'friendCaptain')?.characterIds[0] ?? captainLeaderId;
  const selectedLeaderIds = [
    ...new Set(
      [captainLeaderId, friendCaptainLeaderId].filter(
        (characterId): characterId is number => characterId !== null,
      ),
    ),
  ];
  const lockedCharacterIds = [...new Set(manualSlots.flatMap((slot) => slot.characterIds))];

  return {
    lockedCharacterIds,
    selectedLeaderIds,
    captainLeaderId,
    friendCaptainLeaderId,
  };
}

function sanitizeManualSlots(
  value: unknown,
  availableLockedCharacterMap: Map<number, CharacterListItem>,
): { manualSlots: AutoBuildManualSlotSelection[]; duplicateCount: number; unknownCount: number } {
  const manualSlots = createEmptyAutoBuildManualSlots();
  const roleMap = new Map<
    AutoBuildManualSlotRole,
    {
      characterIds: number[];
      requiredCharacterId: number | null;
      branchSelections: NonNullable<AutoBuildManualSlotSelection['branchSelections']>;
    }
  >();
  let duplicateCount = 0;
  let unknownCount = 0;

  for (const rawSlot of Array.isArray(value) ? value : []) {
    if (!isRecord(rawSlot)) {
      continue;
    }

    const role = rawSlot['role'];

    if (
      typeof role !== 'string' ||
      !AUTO_BUILD_MANUAL_SLOT_ROLES.includes(role as AutoBuildManualSlotRole)
    ) {
      continue;
    }

    const normalizedIds = collectPositiveIntegers(
      Array.isArray(rawSlot['characterIds']) ? rawSlot['characterIds'] : [],
    );
    const normalizedRequiredCharacterId =
      collectPositiveIntegers([rawSlot['requiredCharacterId']])[0] ?? null;
    const currentSelection = roleMap.get(role as AutoBuildManualSlotRole) ?? {
      characterIds: [],
      requiredCharacterId: null,
      branchSelections: [],
    };
    const combinedIds = [...currentSelection.characterIds, ...normalizedIds];

    roleMap.set(role as AutoBuildManualSlotRole, {
      characterIds: combinedIds,
      requiredCharacterId: normalizedRequiredCharacterId ?? currentSelection.requiredCharacterId,
      branchSelections: [
        ...currentSelection.branchSelections,
        ...normalizeManualSlotBranchSelections(rawSlot['branchSelections'], combinedIds),
      ],
    });
  }

  for (const slot of manualSlots) {
    const nextIds: number[] = [];

    const roleSelection = roleMap.get(slot.role);

    for (const characterId of roleSelection?.characterIds ?? []) {
      if (!availableLockedCharacterMap.has(characterId)) {
        unknownCount += 1;
        continue;
      }

      if (nextIds.includes(characterId)) {
        duplicateCount += 1;
        continue;
      }

      nextIds.push(characterId);
    }

    slot.characterIds = nextIds;
    slot.requiredCharacterId =
      roleSelection?.requiredCharacterId && nextIds.includes(roleSelection.requiredCharacterId)
        ? roleSelection.requiredCharacterId
        : null;
    const branchSelections = normalizeManualSlotBranchSelections(
      roleSelection?.branchSelections,
      nextIds,
    );
    slot.branchSelections = branchSelections.length ? branchSelections : undefined;
  }

  return {
    manualSlots,
    duplicateCount,
    unknownCount,
  };
}

function buildWarning(
  key: string,
  count: number,
  parameters?: Record<string, string | number>,
): AutoTeamSelectionImportMessage | null {
  if (count <= 0) {
    return null;
  }

  return {
    key,
    params: {
      count,
      ...parameters,
    },
  };
}

export function parseAutoTeamSelectionImportPayload(
  rawContent: string,
): AutoTeamSelectionExportPayload {
  let parsedPayload: unknown;

  try {
    parsedPayload = JSON.parse(rawContent) as unknown;
  } catch {
    throw new AutoTeamSelectionImportError('preset.errors.invalidJson');
  }

  if (!isRecord(parsedPayload)) {
    throw new AutoTeamSelectionImportError('preset.errors.invalidPresetJson');
  }

  if (
    (parsedPayload['schemaVersion'] !== 1 &&
      parsedPayload['schemaVersion'] !== 2 &&
      parsedPayload['schemaVersion'] !== 3 &&
      parsedPayload['schemaVersion'] !== 4 &&
      parsedPayload['schemaVersion'] !== 5 &&
      parsedPayload['schemaVersion'] !== 6 &&
      parsedPayload['schemaVersion'] !== 7 &&
      parsedPayload['schemaVersion'] !== 8 &&
      parsedPayload['schemaVersion'] !== 9 &&
      parsedPayload['schemaVersion'] !== 10 &&
      parsedPayload['schemaVersion'] !== 11 &&
      parsedPayload['schemaVersion'] !== 12 &&
      parsedPayload['schemaVersion'] !== 13 &&
      parsedPayload['schemaVersion'] !== 14 &&
      parsedPayload['schemaVersion'] !== 15 &&
      parsedPayload['schemaVersion'] !== 16 &&
      parsedPayload['schemaVersion'] !== 17 &&
      parsedPayload['schemaVersion'] !== 18 &&
      parsedPayload['schemaVersion'] !== 19 &&
      parsedPayload['schemaVersion'] !== 20 &&
      parsedPayload['schemaVersion'] !== 21 &&
      parsedPayload['schemaVersion'] !== 22 &&
      parsedPayload['schemaVersion'] !== 23 &&
      parsedPayload['schemaVersion'] !== 24 &&
      parsedPayload['schemaVersion'] !== 25 &&
      parsedPayload['schemaVersion'] !== 26 &&
      parsedPayload['schemaVersion'] !== 27 &&
      parsedPayload['schemaVersion'] !== 28 &&
      parsedPayload['schemaVersion'] !== 29 &&
      parsedPayload['schemaVersion'] !== 30 &&
      parsedPayload['schemaVersion'] !== 31 &&
      parsedPayload['schemaVersion'] !== 32 &&
      parsedPayload['schemaVersion'] !== 33) ||
    parsedPayload['source'] !== 'auto-team-builder' ||
    parsedPayload['exportType'] !== 'preset'
  ) {
    throw new AutoTeamSelectionImportError('preset.errors.unsupportedPreset');
  }

  const filters = parsedPayload['filters'];
  const manualSelection = parsedPayload['manualSelection'];

  if (!isRecord(filters) || !isRecord(manualSelection)) {
    throw new AutoTeamSelectionImportError('preset.errors.missingSections');
  }

  if (
    !Array.isArray(filters['selectedTypes']) ||
    !filters['selectedTypes'].every((type) => typeof type === 'string') ||
    !Array.isArray(filters['selectedClasses']) ||
    !filters['selectedClasses'].every((characterClass) => typeof characterClass === 'string') ||
    !(
      filters['selectedCharacterTags'] === undefined ||
      (Array.isArray(filters['selectedCharacterTags']) &&
        filters['selectedCharacterTags'].every((tag) => typeof tag === 'string'))
    ) ||
    !(
      filters['characterTagSets'] === undefined ||
      (isRecord(filters['characterTagSets']) &&
        Array.isArray((filters['characterTagSets'] as Record<string, unknown>)['sets']))
    ) ||
    !(
      filters['selectedCharacterNames'] === undefined ||
      (Array.isArray(filters['selectedCharacterNames']) &&
        filters['selectedCharacterNames'].every((name) => typeof name === 'string'))
    ) ||
    !Array.isArray(filters['requiredAbilities']) ||
    !filters['requiredAbilities'].every((requirement) => isRecord(requirement)) ||
    !(
      filters['requiredCharacterGroups'] === undefined ||
      (Array.isArray(filters['requiredCharacterGroups']) &&
        filters['requiredCharacterGroups'].every(
          (group) =>
            isRecord(group) &&
            Array.isArray(group['abilities']) &&
            group['abilities'].every((requirement) => isRecord(requirement)),
        ))
    ) ||
    !(
      filters['battleRequirements'] === undefined ||
      (Array.isArray(filters['battleRequirements']) &&
        filters['battleRequirements'].every(
          (battle) =>
            isRecord(battle) &&
            Array.isArray(battle['enemyMechanics']) &&
            battle['enemyMechanics'].every((mechanic) => isRecord(mechanic)) &&
            Array.isArray(battle['requiredCharacterGroups']) &&
            battle['requiredCharacterGroups'].every(
              (group) =>
                isRecord(group) &&
                Array.isArray(group['abilities']) &&
                group['abilities'].every((requirement) => isRecord(requirement)),
            ),
        ))
    ) ||
    !(
      filters['enemyMechanics'] === undefined ||
      (Array.isArray(filters['enemyMechanics']) &&
        filters['enemyMechanics'].every((mechanic) => isRecord(mechanic)))
    ) ||
    typeof filters['requireAllSelectedTypesInTeam'] !== 'boolean' ||
    typeof filters['requireAllSelectedClassesPerCharacter'] !== 'boolean' ||
    !(
      filters['requireAllSelectedCharacterTagsInTeam'] === undefined ||
      typeof filters['requireAllSelectedCharacterTagsInTeam'] === 'boolean'
    ) ||
    !(
      filters['requireAllSelectedCharacterNamesInTeam'] === undefined ||
      typeof filters['requireAllSelectedCharacterNamesInTeam'] === 'boolean'
    ) ||
    !(
      filters['requireAllSlotsInLeaderSuperEffectScope'] === undefined ||
      typeof filters['requireAllSlotsInLeaderSuperEffectScope'] === 'boolean'
    ) ||
    !(
      filters['requireFullCaptainAbilityCoverage'] === undefined ||
      typeof filters['requireFullCaptainAbilityCoverage'] === 'boolean'
    ) ||
    !(
      filters['requireBothLeadersFullCaptainAbilityCoverage'] === undefined ||
      typeof filters['requireBothLeadersFullCaptainAbilityCoverage'] === 'boolean'
    ) ||
    !(
      filters['requireSuperSpecialCriteriaCoverage'] === undefined ||
      typeof filters['requireSuperSpecialCriteriaCoverage'] === 'boolean'
    ) ||
    !(
      filters['requireSuperTandemCriteriaCoverage'] === undefined ||
      typeof filters['requireSuperTandemCriteriaCoverage'] === 'boolean'
    ) ||
    !(
      filters['requireLeadersWithoutSuperEffects'] === undefined ||
      typeof filters['requireLeadersWithoutSuperEffects'] === 'boolean'
    ) ||
    !(
      filters['requireAllSpecialsSupportTeam'] === undefined ||
      typeof filters['requireAllSpecialsSupportTeam'] === 'boolean'
    ) ||
    !(
      filters['requireLeaderSuperSpecialCriteria'] === undefined ||
      typeof filters['requireLeaderSuperSpecialCriteria'] === 'boolean'
    ) ||
    !(
      filters['requireUniqueBaseCharacterNames'] === undefined ||
      typeof filters['requireUniqueBaseCharacterNames'] === 'boolean'
    ) ||
    !(
      filters['requireSameCaptainAndFriendCaptain'] === undefined ||
      typeof filters['requireSameCaptainAndFriendCaptain'] === 'boolean'
    ) ||
    typeof filters['favoritesOnly'] !== 'boolean' ||
    !(
      filters['allowAnyFriendCaptainAutoFill'] === undefined ||
      typeof filters['allowAnyFriendCaptainAutoFill'] === 'boolean'
    ) ||
    typeof filters['favoriteCount'] !== 'number' ||
    !(
      filters['favoriteShipsOnly'] === undefined ||
      typeof filters['favoriteShipsOnly'] === 'boolean'
    ) ||
    !(
      filters['favoriteShipCount'] === undefined || typeof filters['favoriteShipCount'] === 'number'
    ) ||
    !(
      filters['leaderBoostFilters'] === undefined ||
      (Array.isArray(filters['leaderBoostFilters']) &&
        filters['leaderBoostFilters'].every((filter) => typeof filter === 'string'))
    ) ||
    !isLeaderBoostRangesShape(filters['leaderBoostRanges']) ||
    !isCostRangeShape(filters['costRange']) ||
    !isCostRangeShape(filters['leaderCostRange']) ||
    !isCostRangeShape(filters['subCostRange']) ||
    !(
      filters['maxTotalCost'] === undefined ||
      filters['maxTotalCost'] === null ||
      typeof filters['maxTotalCost'] === 'number'
    ) ||
    !Array.isArray(manualSelection['lockedCharacterIds']) ||
    !(
      manualSelection['excludedCharacterIds'] === undefined ||
      Array.isArray(manualSelection['excludedCharacterIds'])
    ) ||
    !Array.isArray(manualSelection['selectedLeaderIds']) ||
    !Array.isArray(manualSelection['characters']) ||
    !(
      manualSelection['excludedShipIds'] === undefined ||
      Array.isArray(manualSelection['excludedShipIds'])
    ) ||
    !(
      manualSelection['excludedCharacters'] === undefined ||
      Array.isArray(manualSelection['excludedCharacters'])
    ) ||
    !(
      manualSelection['excludedShips'] === undefined ||
      Array.isArray(manualSelection['excludedShips'])
    )
  ) {
    throw new AutoTeamSelectionImportError('preset.errors.schemaMismatch');
  }

  if (
    !manualSelection['lockedCharacterIds'].every(
      (characterId) => typeof characterId === 'number',
    ) ||
    !(
      manualSelection['excludedCharacterIds'] === undefined ||
      manualSelection['excludedCharacterIds'].every(
        (characterId) => typeof characterId === 'number',
      )
    ) ||
    !manualSelection['selectedLeaderIds'].every((characterId) => typeof characterId === 'number') ||
    !(
      manualSelection['captainLeaderId'] === null ||
      typeof manualSelection['captainLeaderId'] === 'number'
    ) ||
    !(
      manualSelection['friendCaptainLeaderId'] === null ||
      typeof manualSelection['friendCaptainLeaderId'] === 'number'
    ) ||
    !(
      manualSelection['manualShipId'] === undefined ||
      manualSelection['manualShipId'] === null ||
      typeof manualSelection['manualShipId'] === 'number'
    ) ||
    !(
      manualSelection['excludedShipIds'] === undefined ||
      manualSelection['excludedShipIds'].every((shipId) => typeof shipId === 'number')
    )
  ) {
    throw new AutoTeamSelectionImportError('preset.errors.schemaMismatch');
  }

  return parsedPayload as unknown as AutoTeamSelectionExportPayload;
}

export function sanitizeAutoTeamSelectionImportPayload(
  payload: AutoTeamSelectionExportPayload,
  options: SanitizeAutoTeamSelectionImportOptions,
): AutoTeamSelectionImportResult {
  const warnings: AutoTeamSelectionImportMessage[] = [];
  const availableTypesSet = new Set(options.availableTypes);
  const availableClassesSet = new Set(options.availableClasses);
  const availableLockedCharacterMap = new Map(
    options.availableLockedCharacters.map((character) => [character.id, character] as const),
  );
  const availableShipMap = new Map(
    (options.availableShips ?? []).map((ship) => [ship.id, ship] as const),
  );
  const abilityCatalogMap = new Map(
    options.abilityCatalogItems.map((item) => [item.key, item] as const),
  );

  const rawSelectedTypes = [...new Set(payload.filters.selectedTypes)];
  const selectedTypes = rawSelectedTypes.filter((type): type is AutoTeamBuilderType =>
    availableTypesSet.has(type as AutoTeamBuilderType),
  );
  const typeWarning = buildWarning(
    'preset.warnings.unavailableTypes',
    rawSelectedTypes.length - selectedTypes.length,
  );

  if (typeWarning) {
    warnings.push(typeWarning);
  }

  const rawSelectedClasses = [
    ...new Set(payload.filters.selectedClasses.map((characterClass) => characterClass.trim())),
  ].filter((characterClass) => characterClass.length > 0);
  const selectedClasses = rawSelectedClasses.filter((characterClass) =>
    availableClassesSet.has(characterClass),
  );
  const classWarning = buildWarning(
    'preset.warnings.unavailableClasses',
    rawSelectedClasses.length - selectedClasses.length,
  );

  if (classWarning) {
    warnings.push(classWarning);
  }

  const legacySelectedCharacterTags = normalizeStringFilters(payload.filters.selectedCharacterTags);
  const normalizedCharacterTagSets = normalizeCharacterTagSetSelection(
    payload.filters.characterTagSets,
  );
  // A v32 payload carries no sets, so rebuild the equivalent single set from the
  // flat list and the legacy "require all" boolean rather than silently losing
  // the AND the exporting user had configured.
  const characterTagSets =
    normalizedCharacterTagSets ??
    expandCharacterTagsToSets(
      legacySelectedCharacterTags,
      payload.filters.requireAllSelectedCharacterTagsInTeam === true,
    );
  // Sets win over the flat list whenever both are present: the flat field is the
  // back-compat projection, so a disagreement means the reader is newer. That
  // projection keeps the pre-schema-33 normalisation (case-insensitive dedupe,
  // collapsed inner whitespace) so old readers still see one entry per tag; the
  // sets themselves stay verbatim because tag casing is user-visible there.
  const selectedCharacterTags = normalizeStringFilters(flattenCharacterTagSets(characterTagSets));
  const rawCharacterTagSetCount = Array.isArray(payload.filters.characterTagSets?.sets)
    ? payload.filters.characterTagSets.sets.length
    : 0;
  const characterTagSetWarning = buildWarning(
    'preset.warnings.unavailableCharacterTagSets',
    rawCharacterTagSetCount - (normalizedCharacterTagSets?.sets.length ?? 0),
  );

  if (characterTagSetWarning) {
    warnings.push(characterTagSetWarning);
  }

  const selectedCharacterNames = normalizeStringFilters(payload.filters.selectedCharacterNames, {
    lowercase: true,
  });

  let invalidAbilityCount = 0;
  let adjustedAbilityCount = 0;
  const requiredAbilities: AutoBuildAbilityRequirement[] = [];
  const enemyMechanics = normalizeEnemyMechanicRequirements(
    Array.isArray(payload.filters.enemyMechanics) ? payload.filters.enemyMechanics : [],
  );

  for (const rawRequirement of payload.filters.requiredAbilities) {
    const sanitized = sanitizeImportedAbilityRequirement(rawRequirement, abilityCatalogMap);

    if (sanitized.invalid) {
      invalidAbilityCount += 1;
      continue;
    }

    if (sanitized.adjusted) {
      adjustedAbilityCount += 1;
    }

    requiredAbilities.push(sanitized.requirement!);
  }

  const requiredCharacterGroups: AutoBuildRequiredCharacterGroup[] = [];
  const rawRequiredCharacterGroups = Array.isArray(payload.filters.requiredCharacterGroups)
    ? payload.filters.requiredCharacterGroups
    : [];

  for (const [groupIndex, rawGroup] of rawRequiredCharacterGroups.entries()) {
    if (requiredCharacterGroups.length >= MAX_REQUIRED_CHARACTER_GROUPS) {
      adjustedAbilityCount += 1;
      continue;
    }

    const abilities: AutoBuildAbilityRequirement[] = [];

    for (const rawRequirement of Array.isArray(rawGroup.abilities) ? rawGroup.abilities : []) {
      const sanitized = sanitizeImportedAbilityRequirement(rawRequirement, abilityCatalogMap, {
        forceSingleCharacterCount: true,
      });

      if (sanitized.invalid) {
        invalidAbilityCount += 1;
        continue;
      }

      if (sanitized.adjusted) {
        adjustedAbilityCount += 1;
      }

      abilities.push(sanitized.requirement!);
    }

    if (abilities.length > 0) {
      requiredCharacterGroups.push({
        id:
          typeof rawGroup.id === 'string' && rawGroup.id.trim().length > 0
            ? rawGroup.id.trim()
            : `imported-${groupIndex + 1}`,
        abilities,
      });
    }
  }

  const battleScopedRequiredAbilities = requiredAbilities.filter(
    (requirement) => !isCaptainSourceRequirement(requirement),
  );

  if (!requiredCharacterGroups.length && battleScopedRequiredAbilities.length) {
    const migrated = expandRequiredAbilitiesToCharacterGroups(battleScopedRequiredAbilities);
    requiredCharacterGroups.push(...migrated.groups);
    adjustedAbilityCount += migrated.truncatedCount;
  }

  const rawBattleRequirements = Array.isArray(payload.filters.battleRequirements)
    ? payload.filters.battleRequirements
    : [];
  const battleRequirements: AutoBuildBattleRequirement[] = [];

  for (const [battleIndex, rawBattle] of rawBattleRequirements.entries()) {
    if (!isRecord(rawBattle)) {
      continue;
    }

    const battleGroups: AutoBuildRequiredCharacterGroup[] = [];

    for (const [groupIndex, rawGroup] of (Array.isArray(rawBattle['requiredCharacterGroups'])
      ? rawBattle['requiredCharacterGroups']
      : []
    ).entries()) {
      if (!isRecord(rawGroup) || battleGroups.length >= MAX_REQUIRED_CHARACTER_GROUPS) {
        adjustedAbilityCount += 1;
        continue;
      }

      const abilities: AutoBuildAbilityRequirement[] = [];

      for (const rawRequirement of Array.isArray(rawGroup['abilities'])
        ? rawGroup['abilities']
        : []) {
        if (!isRecord(rawRequirement)) {
          continue;
        }

        const sanitized = sanitizeImportedAbilityRequirement(rawRequirement, abilityCatalogMap, {
          forceSingleCharacterCount: true,
        });

        if (sanitized.invalid) {
          invalidAbilityCount += 1;
          continue;
        }

        if (sanitized.adjusted) {
          adjustedAbilityCount += 1;
        }

        abilities.push(sanitized.requirement!);
      }

      if (abilities.length > 0) {
        battleGroups.push({
          id:
            typeof rawGroup['id'] === 'string' && rawGroup['id'].trim().length > 0
              ? rawGroup['id'].trim()
              : `imported-${battleIndex + 1}-${groupIndex + 1}`,
          abilities,
        });
      }
    }

    const enemyMechanics = normalizeEnemyMechanicRequirements(
      Array.isArray(rawBattle['enemyMechanics'])
        ? (rawBattle['enemyMechanics'] as AutoBuildEnemyMechanicRequirement[])
        : [],
    );

    if (battleGroups.length || enemyMechanics.length) {
      battleRequirements.push({
        id:
          typeof rawBattle['id'] === 'string' && rawBattle['id'].trim().length > 0
            ? rawBattle['id'].trim()
            : `battle-${battleIndex + 1}`,
        title:
          typeof rawBattle['title'] === 'string' && rawBattle['title'].trim().length > 0
            ? rawBattle['title'].trim()
            : `Battle ${battleIndex + 1}`,
        enemyMechanics,
        requiredCharacterGroups: battleGroups,
      });
    }
  }

  const normalizedBattleRequirements = normalizeBattleRequirementsWithLegacyFallback({
    battles: battleRequirements,
    requiredCharacterGroups,
    enemyMechanics,
  });

  const invalidAbilityWarning = buildWarning(
    'preset.warnings.unsupportedAbilities',
    invalidAbilityCount,
  );

  if (invalidAbilityWarning) {
    warnings.push(invalidAbilityWarning);
  }

  const adjustedAbilityWarning = buildWarning(
    'preset.warnings.adjustedAbilities',
    adjustedAbilityCount,
  );

  if (adjustedAbilityWarning) {
    warnings.push(adjustedAbilityWarning);
  }

  const rawManualSlots = sanitizeManualSlots(
    payload.manualSelection['manualSlots'],
    availableLockedCharacterMap,
  );
  let manualSlots = rawManualSlots.manualSlots;
  const hasManualSlots = manualSlots.some((slot) => slot.characterIds.length > 0);

  if (hasManualSlots) {
    const missingManualSlotWarning = buildWarning(
      'preset.warnings.missingLockedCharacters',
      rawManualSlots.unknownCount,
    );

    if (missingManualSlotWarning) {
      warnings.push(missingManualSlotWarning);
    }

    const duplicateManualSlotWarning = buildWarning(
      'preset.warnings.invalidLeaders',
      rawManualSlots.duplicateCount,
    );

    if (duplicateManualSlotWarning) {
      warnings.push(duplicateManualSlotWarning);
    }
  } else {
    const rawLockedCharacterIds = collectPositiveIntegers(
      payload.manualSelection.lockedCharacterIds,
    );
    const lockedCharacterIds = rawLockedCharacterIds.filter((characterId) =>
      availableLockedCharacterMap.has(characterId),
    );
    const unknownLockedCount = rawLockedCharacterIds.filter(
      (characterId) => !availableLockedCharacterMap.has(characterId),
    ).length;

    const unknownLockedWarning = buildWarning(
      'preset.warnings.missingLockedCharacters',
      unknownLockedCount,
    );

    if (unknownLockedWarning) {
      warnings.push(unknownLockedWarning);
    }

    const lockedCharacterIdSet = new Set(lockedCharacterIds);
    const rawLeaderIds = collectPositiveIntegers(payload.manualSelection.selectedLeaderIds);
    const selectedLeaderIds = rawLeaderIds
      .filter((characterId) => lockedCharacterIdSet.has(characterId))
      .slice(0, 2);
    const droppedLeaderCount = rawLeaderIds.length - selectedLeaderIds.length;
    const droppedLeaderWarning = buildWarning('preset.warnings.invalidLeaders', droppedLeaderCount);

    if (droppedLeaderWarning) {
      warnings.push(droppedLeaderWarning);
    }

    const normalizedCaptainLeaderId = normalizePositiveInteger(
      payload.manualSelection.captainLeaderId,
    );
    let captainLeaderId: number | null = null;
    let friendCaptainLeaderId: number | null = null;

    if (selectedLeaderIds.length === 1) {
      captainLeaderId = selectedLeaderIds[0];
      friendCaptainLeaderId = selectedLeaderIds[0];
    } else if (selectedLeaderIds.length > 1) {
      captainLeaderId =
        normalizedCaptainLeaderId && selectedLeaderIds.includes(normalizedCaptainLeaderId)
          ? normalizedCaptainLeaderId
          : selectedLeaderIds[0];
      friendCaptainLeaderId =
        selectedLeaderIds.find((characterId) => characterId !== captainLeaderId) ?? captainLeaderId;
    }

    manualSlots = buildLegacyManualSlotsFromSelection(
      lockedCharacterIds,
      captainLeaderId,
      friendCaptainLeaderId,
    );

    const legacySubCount = lockedCharacterIds.filter(
      (characterId) => !selectedLeaderIds.includes(characterId),
    ).length;
    const unmappedLegacyLockedWarning = buildWarning(
      'preset.warnings.lockedLimitExceeded',
      Math.max(0, legacySubCount - AUTO_BUILD_MANUAL_SUB_SLOT_ROLES.length),
    );

    if (unmappedLegacyLockedWarning) {
      warnings.push(unmappedLegacyLockedWarning);
    }
  }

  const normalizedManualSlots = manualSlots.map((slot) => ({
    role: slot.role,
    characterIds: [...slot.characterIds],
    requiredCharacterId:
      slot.requiredCharacterId != null && slot.characterIds.includes(slot.requiredCharacterId)
        ? slot.requiredCharacterId
        : null,
    ...(normalizeManualSlotBranchSelections(slot.branchSelections, slot.characterIds).length
      ? {
          branchSelections: normalizeManualSlotBranchSelections(
            slot.branchSelections,
            slot.characterIds,
          ),
        }
      : {}),
  }));
  const derivedManualSelection = deriveLegacyManualSelectionFromManualSlots(normalizedManualSlots);

  const normalizedManualShipId = normalizePositiveInteger(payload.manualSelection.manualShipId);
  const manualShipId =
    normalizedManualShipId && availableShipMap.has(normalizedManualShipId)
      ? normalizedManualShipId
      : null;

  if (normalizedManualShipId && !availableShipMap.has(normalizedManualShipId)) {
    warnings.push({
      key: 'preset.warnings.missingManualShip',
      params: { count: 1 },
    });
  }

  const rawExcludedCharacterIds = collectPositiveIntegers(
    Array.isArray(payload.manualSelection.excludedCharacterIds)
      ? payload.manualSelection.excludedCharacterIds
      : [],
  );
  const missingExcludedCharacterCount = rawExcludedCharacterIds.filter(
    (characterId) => !availableLockedCharacterMap.has(characterId),
  ).length;
  const excludedCharacterConflictSet = new Set(derivedManualSelection.lockedCharacterIds);
  const excludedCharacterIds = rawExcludedCharacterIds.filter(
    (characterId) =>
      availableLockedCharacterMap.has(characterId) &&
      !excludedCharacterConflictSet.has(characterId),
  );
  const conflictingExcludedCharacterCount = rawExcludedCharacterIds.filter((characterId) =>
    excludedCharacterConflictSet.has(characterId),
  ).length;
  const missingExcludedCharacterWarning = buildWarning(
    'preset.warnings.missingExcludedCharacters',
    missingExcludedCharacterCount,
  );

  if (missingExcludedCharacterWarning) {
    warnings.push(missingExcludedCharacterWarning);
  }

  const conflictingExcludedCharacterWarning = buildWarning(
    'preset.warnings.conflictingExcludedCharacters',
    conflictingExcludedCharacterCount,
  );

  if (conflictingExcludedCharacterWarning) {
    warnings.push(conflictingExcludedCharacterWarning);
  }

  const rawExcludedShipIds = collectPositiveIntegers(
    Array.isArray(payload.manualSelection.excludedShipIds)
      ? payload.manualSelection.excludedShipIds
      : [],
  );
  const missingExcludedShipCount = rawExcludedShipIds.filter(
    (shipId) => !availableShipMap.has(shipId),
  ).length;
  const excludedShipIds = rawExcludedShipIds.filter(
    (shipId) => availableShipMap.has(shipId) && shipId !== manualShipId,
  );
  const conflictingExcludedShipCount =
    manualShipId === null
      ? 0
      : rawExcludedShipIds.filter((shipId) => shipId === manualShipId).length;
  const missingExcludedShipWarning = buildWarning(
    'preset.warnings.missingExcludedShips',
    missingExcludedShipCount,
  );

  if (missingExcludedShipWarning) {
    warnings.push(missingExcludedShipWarning);
  }

  const conflictingExcludedShipWarning = buildWarning(
    'preset.warnings.conflictingExcludedShips',
    conflictingExcludedShipCount,
  );

  if (conflictingExcludedShipWarning) {
    warnings.push(conflictingExcludedShipWarning);
  }

  const requireAllSlotsInLeaderSuperEffectScope = resolveImportedLeaderSuperEffectScopeState(
    payload.filters.requireAllSlotsInLeaderSuperEffectScope === true,
    (payload.filters as { requireLeadersWithoutSuperEffects?: boolean })
      .requireLeadersWithoutSuperEffects === true,
  );
  const leaderBoostFilters = normalizeLeaderBoostFilters(payload.filters.leaderBoostFilters);
  const leaderBoostRanges = normalizeLeaderBoostRanges(payload.filters.leaderBoostRanges);

  return {
    state: {
      selectedTypes,
      selectedClasses,
      selectedCharacterTags,
      characterTagSets,
      selectedCharacterNames,
      requiredAbilities,
      requiredCharacterGroups: normalizedBattleRequirements.length ? [] : requiredCharacterGroups,
      battleRequirements: normalizedBattleRequirements,
      enemyMechanics,
      requireAllSelectedTypesInTeam: false,
      requireAllSelectedClassesPerCharacter: false,
      // Preserved rather than forced to false: the operator now lives in
      // `characterTagSets`, and this flag is what back-fills it for v32 payloads.
      requireAllSelectedCharacterTagsInTeam:
        payload.filters.requireAllSelectedCharacterTagsInTeam === true,
      requireAllSelectedCharacterNamesInTeam: false,
      requireAllSlotsInLeaderSuperEffectScope,
      requireFullCaptainAbilityCoverage: payload.filters.requireFullCaptainAbilityCoverage === true,
      requireBothLeadersFullCaptainAbilityCoverage:
        payload.filters.requireBothLeadersFullCaptainAbilityCoverage === true,
      requireSuperSpecialCriteriaCoverage:
        payload.filters.requireSuperSpecialCriteriaCoverage === true,
      requireSuperTandemCriteriaCoverage:
        payload.filters.requireSuperTandemCriteriaCoverage === true,
      requireUniqueBaseCharacterNames: payload.filters.requireUniqueBaseCharacterNames === true,
      favoritesOnly: payload.filters.favoritesOnly,
      allowAnyFriendCaptainAutoFill: payload.filters.allowAnyFriendCaptainAutoFill === true,
      favoriteShipsOnly: payload.filters.favoriteShipsOnly === true,
      leaderBoostFilters,
      leaderBoostRanges,
      leaderCostRange: createEmptyAutoBuildCostRange(),
      subCostRange: createEmptyAutoBuildCostRange(),
      maxTotalCost: null,
      manualSlots: normalizedManualSlots,
      lockedCharacterIds: derivedManualSelection.lockedCharacterIds,
      excludedCharacterIds,
      selectedLeaderIds: derivedManualSelection.selectedLeaderIds,
      captainLeaderId: derivedManualSelection.captainLeaderId,
      manualShipId,
      excludedShipIds,
    },
    warnings,
  };
}

export function buildAutoTeamExportPayload(
  result: AutoBuildResult,
  favoriteCharacterIds: number[],
  captainLeaderId: number | null,
  friendCaptainLeaderId: number | null,
  exportedAt = new Date().toISOString(),
): AutoTeamExportPayload {
  const favoriteCharacterIdSet = new Set(favoriteCharacterIds);

  return {
    exportedAt,
    source: 'auto-team-builder',
    requestedInput: result.requestedInput,
    effectiveInput: result.input,
    relaxation: result.relaxation,
    coverage: result.coverage,
    shipSelection: result.shipSelection
      ? {
          ...result.shipSelection,
          ship: { ...result.shipSelection.ship },
          reasonChips: [...result.shipSelection.reasonChips],
        }
      : null,
    team: result.slots.map((slot, slotIndex) => {
      const leaderAssignment = resolveLeaderAssignment(
        slot.character.id,
        captainLeaderId,
        friendCaptainLeaderId,
      );

      return {
        slotIndex,
        role: slot.role,
        isLeader: leaderAssignment !== null,
        leaderAssignment,
        isFavorite: favoriteCharacterIdSet.has(slot.character.id),
        character: slot.character,
        captainBranchSelection: slot.captainBranchSelection ?? null,
      };
    }),
  };
}

export function buildAutoTeamSelectionExportPayload({
  selectedTypes,
  selectedClasses,
  selectedCharacterTags = [],
  characterTagSets = createEmptyCharacterTagSetSelection(),
  selectedCharacterNames = [],
  requiredAbilities,
  requiredCharacterGroups = [],
  battleRequirements = [],
  enemyMechanics,
  requireAllSelectedTypesInTeam,
  requireAllSelectedClassesPerCharacter,
  requireAllSelectedCharacterTagsInTeam = false,
  requireAllSelectedCharacterNamesInTeam = false,
  requireAllSlotsInLeaderSuperEffectScope,
  requireFullCaptainAbilityCoverage = false,
  requireBothLeadersFullCaptainAbilityCoverage = false,
  requireSuperSpecialCriteriaCoverage = false,
  requireSuperTandemCriteriaCoverage = false,
  requireUniqueBaseCharacterNames,
  favoritesOnly,
  allowAnyFriendCaptainAutoFill = false,
  favoriteCount,
  favoriteShipsOnly = false,
  favoriteShipCount = 0,
  leaderBoostFilters = [...AUTO_BUILD_LEADER_BOOST_FILTERS],
  leaderBoostRanges = createEmptyAutoBuildLeaderBoostRanges(),
  manualSlots,
  lockedCharacterIds,
  lockedCharacters,
  excludedCharacterIds = [],
  excludedCharacters = [],
  selectedLeaderIds,
  captainLeaderId,
  friendCaptainLeaderId,
  manualShipId = null,
  manualShip = null,
  excludedShipIds = [],
  excludedShips = [],
  generatedTeamExport = null,
  savedTeamImport = null,
  exportedAt = new Date().toISOString(),
}: BuildAutoTeamSelectionExportPayloadOptions): AutoTeamSelectionExportPayload {
  const normalizedManualSlots = manualSlots.map((slot) => ({
    role: slot.role,
    characterIds: [...slot.characterIds],
    requiredCharacterId:
      slot.requiredCharacterId != null && slot.characterIds.includes(slot.requiredCharacterId)
        ? slot.requiredCharacterId
        : null,
    ...(normalizeManualSlotBranchSelections(slot.branchSelections, slot.characterIds).length
      ? {
          branchSelections: normalizeManualSlotBranchSelections(
            slot.branchSelections,
            slot.characterIds,
          ),
        }
      : {}),
  }));
  const normalizedBattleRequirements = cloneBattleRequirements(battleRequirements);
  const normalizedCharacterTagSets = cloneCharacterTagSetSelection(characterTagSets);

  return {
    schemaVersion: 33,
    exportedAt,
    source: 'auto-team-builder',
    exportType: 'preset',
    filters: {
      selectedTypes: [...selectedTypes],
      selectedClasses: [...selectedClasses],
      selectedCharacterTags: normalizeStringFilters(selectedCharacterTags),
      ...(normalizedCharacterTagSets.sets.length
        ? { characterTagSets: normalizedCharacterTagSets }
        : {}),
      selectedCharacterNames: normalizeStringFilters(selectedCharacterNames, { lowercase: true }),
      requiredAbilities: requiredAbilities.map((requirement) => ({
        ...requirement,
        slotTokens: [...requirement.slotTokens],
      })),
      requiredCharacterGroups: cloneRequiredCharacterGroups(requiredCharacterGroups),
      ...(normalizedBattleRequirements.length
        ? { battleRequirements: normalizedBattleRequirements }
        : {}),
      enemyMechanics: enemyMechanics.map((mechanic) => ({
        ...mechanic,
        triggerTags: [...mechanic.triggerTags],
        responseTags: [...mechanic.responseTags],
        conditionTags: [...mechanic.conditionTags],
      })),
      requireAllSelectedTypesInTeam,
      requireAllSelectedClassesPerCharacter,
      requireAllSelectedCharacterTagsInTeam,
      requireAllSelectedCharacterNamesInTeam,
      requireAllSlotsInLeaderSuperEffectScope,
      requireFullCaptainAbilityCoverage,
      requireBothLeadersFullCaptainAbilityCoverage,
      requireSuperSpecialCriteriaCoverage,
      requireSuperTandemCriteriaCoverage,
      requireUniqueBaseCharacterNames,
      favoritesOnly,
      allowAnyFriendCaptainAutoFill,
      favoriteCount,
      favoriteShipsOnly,
      favoriteShipCount,
      leaderBoostFilters: normalizeLeaderBoostFilters(leaderBoostFilters),
      leaderBoostRanges: normalizeLeaderBoostRanges(leaderBoostRanges),
      costRange: createEmptyAutoBuildCostRange(),
      leaderCostRange: createEmptyAutoBuildCostRange(),
      subCostRange: createEmptyAutoBuildCostRange(),
      maxTotalCost: null,
    },
    manualSelection: {
      manualSlots: normalizedManualSlots,
      lockedCharacterIds: [...lockedCharacterIds],
      excludedCharacterIds: [...excludedCharacterIds],
      selectedLeaderIds: [...selectedLeaderIds],
      captainLeaderId,
      friendCaptainLeaderId,
      manualShipId,
      excludedShipIds: [...excludedShipIds],
      ship: manualShip
        ? {
            id: manualShip.id,
            name: manualShip.name,
            thumb: manualShip.thumb,
            description: manualShip.description,
          }
        : null,
      characters: lockedCharacters.map((character) => {
        const leaderAssignment = resolveLeaderAssignment(
          character.id,
          captainLeaderId,
          friendCaptainLeaderId,
        );

        return {
          id: character.id,
          name: character.name,
          type: character.type,
          primaryClass: character.primaryClass,
          secondaryClass: character.secondaryClass,
          imageUrl: character.imageUrl,
          isLeader: leaderAssignment !== null,
          leaderAssignment,
        };
      }),
      excludedCharacters: excludedCharacters.map((character) => ({
        id: character.id,
        name: character.name,
        type: character.type,
        primaryClass: character.primaryClass,
        secondaryClass: character.secondaryClass,
        imageUrl: character.imageUrl,
        isLeader: false,
        leaderAssignment: null,
      })),
      excludedShips: excludedShips.map((ship) => ({
        id: ship.id,
        name: ship.name,
        thumb: ship.thumb,
        description: ship.description,
      })),
    },
    ...(generatedTeamExport
      ? { generatedTeamExport: cloneAutoTeamExportPayload(generatedTeamExport) }
      : {}),
    ...(savedTeamImport ? { savedTeamImport: cloneSavedTeamImportPayload(savedTeamImport) } : {}),
  };
}

function cloneAutoTeamExportPayload(payload: AutoTeamExportPayload): AutoTeamExportPayload {
  return {
    ...payload,
    shipSelection: payload.shipSelection
      ? {
          ...payload.shipSelection,
          ship: { ...payload.shipSelection.ship },
          reasonChips: [...payload.shipSelection.reasonChips],
        }
      : null,
    team: payload.team.map((slot) => ({
      ...slot,
      character: slot.character,
    })),
  };
}

function cloneSavedTeamImportPayload(
  payload: SavedTeamsTransferPayload,
): SavedTeamsTransferPayload {
  return {
    ...payload,
    teams: payload.teams.map((team) => ({
      ...team,
      slots: [...team.slots],
    })),
  };
}

function buildSafeTimestamp(exportedAt: string): string {
  return exportedAt.replaceAll(/[^a-zA-Z0-9_-]+/g, '-');
}

export function buildAutoTeamExportFilename(exportedAt: string): string {
  const safeTimestamp = buildSafeTimestamp(exportedAt);

  return `auto-team-builder-${safeTimestamp}.json`;
}

export function buildAutoTeamSelectionExportFilename(exportedAt: string): string {
  const safeTimestamp = buildSafeTimestamp(exportedAt);

  return `auto-team-builder-preset-${safeTimestamp}.json`;
}

function downloadJsonFile(
  payload: AutoTeamExportPayload | AutoTeamSelectionExportPayload | null,
  filename: string,
  documentReference: Document = document,
  urlReference: Pick<typeof URL, 'createObjectURL' | 'revokeObjectURL'> = URL,
): void {
  if (!payload) {
    return;
  }

  const objectUrl = urlReference.createObjectURL(
    new Blob([JSON.stringify(payload, null, 2)], {
      type: 'application/json;charset=utf-8',
    }),
  );
  const anchor = documentReference.createElement('a');

  anchor.href = objectUrl;
  anchor.download = filename;
  anchor.style.display = 'none';
  documentReference.body.append(anchor);

  try {
    anchor.click();
  } finally {
    anchor.remove();
    urlReference.revokeObjectURL(objectUrl);
  }
}

export function downloadAutoTeamExport(
  payload: AutoTeamExportPayload | null,
  documentReference: Document = document,
  urlReference: Pick<typeof URL, 'createObjectURL' | 'revokeObjectURL'> = URL,
): void {
  downloadJsonFile(
    payload,
    payload ? buildAutoTeamExportFilename(payload.exportedAt) : '',
    documentReference,
    urlReference,
  );
}

export function downloadAutoTeamSelectionExport(
  payload: AutoTeamSelectionExportPayload | null,
  documentReference: Document = document,
  urlReference: Pick<typeof URL, 'createObjectURL' | 'revokeObjectURL'> = URL,
): void {
  downloadJsonFile(
    payload,
    payload ? buildAutoTeamSelectionExportFilename(payload.exportedAt) : '',
    documentReference,
    urlReference,
  );
}
