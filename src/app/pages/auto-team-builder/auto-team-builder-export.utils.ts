import {
  type AutoBuildResult,
  type AutoTeamBuilderType,
} from '../../core/models/auto-team-builder.models';
import {
  type AutoBuildAbilityCatalogItem,
  type AutoBuildAbilityRequirement,
} from '../../core/models/auto-team-builder-ability.models';
import {
  type CharacterDetailRecord,
  type CharacterListItem,
  type ShipRecord,
} from '../../core/models/optc.models';

type AutoTeamExportRole = AutoBuildResult['slots'][number]['role'];
type AutoTeamExportLeaderAssignment = 'captain' | 'friendCaptain' | 'dual' | null;

export interface AutoTeamExportSlot {
  slotIndex: number;
  role: AutoTeamExportRole;
  isLeader: boolean;
  leaderAssignment: AutoTeamExportLeaderAssignment;
  isFavorite: boolean;
  character: CharacterDetailRecord;
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

export interface AutoTeamSelectionCharacterSummary {
  id: number;
  name: string;
  type: CharacterListItem['type'];
  primaryClass: CharacterListItem['primaryClass'];
  secondaryClass: CharacterListItem['secondaryClass'];
  imageUrl: CharacterListItem['imageUrl'];
  isLeader: boolean;
  leaderAssignment: AutoTeamExportLeaderAssignment;
}

export interface AutoTeamSelectionShipSummary {
  id: number;
  name: string;
  thumb: string | null;
  description: string;
}

export interface AutoTeamSelectionExportPayload {
  schemaVersion: 1 | 2 | 3;
  exportedAt: string;
  source: 'auto-team-builder';
  exportType: 'preset';
  filters: {
    selectedTypes: AutoBuildResult['input']['types'];
    selectedClasses: AutoBuildResult['input']['selectedClasses'];
    requiredAbilities: AutoBuildResult['input']['requiredAbilities'];
    requireAllSelectedTypesInTeam: boolean;
    requireAllSelectedClassesPerCharacter: boolean;
    requireAllSpecialsSupportTeam: boolean;
    favoritesOnly: boolean;
    favoriteCount: number;
  };
  manualSelection: {
    lockedCharacterIds: number[];
    selectedLeaderIds: number[];
    captainLeaderId: number | null;
    friendCaptainLeaderId: number | null;
    manualShipId: number | null;
    ship: AutoTeamSelectionShipSummary | null;
    characters: AutoTeamSelectionCharacterSummary[];
  };
}

export interface AutoTeamSelectionImportState {
  selectedTypes: AutoTeamBuilderType[];
  selectedClasses: string[];
  requiredAbilities: AutoBuildAbilityRequirement[];
  requireAllSelectedTypesInTeam: boolean;
  requireAllSelectedClassesPerCharacter: boolean;
  requireAllSpecialsSupportTeam: boolean;
  favoritesOnly: boolean;
  lockedCharacterIds: number[];
  selectedLeaderIds: number[];
  captainLeaderId: number | null;
  manualShipId: number | null;
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
    public readonly params?: Record<string, string | number>,
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
  maxLockedCharacters: number;
  maxLeaderCharacters: number;
}

interface BuildAutoTeamSelectionExportPayloadOptions {
  selectedTypes: AutoBuildResult['input']['types'];
  selectedClasses: AutoBuildResult['input']['selectedClasses'];
  requiredAbilities: AutoBuildResult['input']['requiredAbilities'];
  requireAllSelectedTypesInTeam: boolean;
  requireAllSelectedClassesPerCharacter: boolean;
  requireAllSpecialsSupportTeam: boolean;
  favoritesOnly: boolean;
  favoriteCount: number;
  lockedCharacterIds: number[];
  lockedCharacters: CharacterListItem[];
  selectedLeaderIds: number[];
  captainLeaderId: number | null;
  friendCaptainLeaderId: number | null;
  manualShipId?: number | null;
  manualShip?: ShipRecord | null;
  exportedAt?: string;
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

function normalizePositiveInteger(value: unknown): number | null {
  if (typeof value === 'number' && Number.isInteger(value) && value > 0) {
    return value;
  }

  return null;
}

function collectPositiveIntegers(values: unknown[]): number[] {
  const seen = new Set<number>();
  const normalizedValues: number[] = [];

  values.forEach((value) => {
    const normalizedValue = normalizePositiveInteger(value);

    if (normalizedValue === null || seen.has(normalizedValue)) {
      return;
    }

    seen.add(normalizedValue);
    normalizedValues.push(normalizedValue);
  });

  return normalizedValues;
}

function buildWarning(
  key: string,
  count: number,
  params?: Record<string, string | number>,
): AutoTeamSelectionImportMessage | null {
  if (count <= 0) {
    return null;
  }

  return {
    key,
    params: {
      count,
      ...params,
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
      parsedPayload['schemaVersion'] !== 3) ||
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
    !Array.isArray(filters['requiredAbilities']) ||
    !filters['requiredAbilities'].every((requirement) => isRecord(requirement)) ||
    typeof filters['requireAllSelectedTypesInTeam'] !== 'boolean' ||
    typeof filters['requireAllSelectedClassesPerCharacter'] !== 'boolean' ||
    typeof filters['requireAllSpecialsSupportTeam'] !== 'boolean' ||
    typeof filters['favoritesOnly'] !== 'boolean' ||
    typeof filters['favoriteCount'] !== 'number' ||
    !Array.isArray(manualSelection['lockedCharacterIds']) ||
    !Array.isArray(manualSelection['selectedLeaderIds']) ||
    !Array.isArray(manualSelection['characters'])
  ) {
    throw new AutoTeamSelectionImportError('preset.errors.schemaMismatch');
  }

  if (
    !manualSelection['lockedCharacterIds'].every((characterId) => typeof characterId === 'number') ||
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

  const rawSelectedClasses = [...new Set(payload.filters.selectedClasses.map((characterClass) => characterClass.trim()))]
    .filter((characterClass) => characterClass.length > 0);
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

  let invalidAbilityCount = 0;
  let adjustedAbilityCount = 0;
  const requiredAbilityMap = new Map<string, AutoBuildAbilityRequirement>();

  payload.filters.requiredAbilities.forEach((rawRequirement) => {
    const abilityKey = typeof rawRequirement.abilityKey === 'string'
      ? rawRequirement.abilityKey.trim()
      : '';
    const abilityCatalogItem = abilityCatalogMap.get(abilityKey);

    if (!abilityCatalogItem) {
      invalidAbilityCount += 1;
      return;
    }

    const rawMinTurns = normalizePositiveInteger(rawRequirement.minTurns);
    const minTurns = abilityCatalogItem.supportsTurns ? rawMinTurns : null;
    const rawRequiredCharacterCount = normalizePositiveInteger(rawRequirement.requiredCharacterCount);
    const requiredCharacterCount = rawRequiredCharacterCount ?? 1;
    const rawSlotTokens = Array.isArray(rawRequirement.slotTokens)
      ? [...new Set(rawRequirement.slotTokens
          .filter((token): token is string => typeof token === 'string')
          .map((token) => token.trim().toUpperCase())
          .filter((token) => token.length > 0))]
      : [];
    const slotTokens = abilityCatalogItem.supportsSlotTokens
      ? rawSlotTokens.filter((token) => abilityCatalogItem.availableSlotTokens.includes(token))
      : [];

    if (
      rawSlotTokens.length !== slotTokens.length ||
      (abilityCatalogItem.supportsTurns && rawRequirement.minTurns !== null && rawMinTurns === null) ||
      (!abilityCatalogItem.supportsTurns && rawRequirement.minTurns !== null) ||
      (!abilityCatalogItem.supportsSlotTokens && rawSlotTokens.length > 0) ||
      (
        rawRequirement.requiredCharacterCount !== undefined &&
        rawRequirement.requiredCharacterCount !== null &&
        rawRequiredCharacterCount === null
      )
    ) {
      adjustedAbilityCount += 1;
    }

    const identity = `${abilityKey}|${minTurns ?? 'none'}|${slotTokens.join(',')}`;
    const existingRequirement = requiredAbilityMap.get(identity);

    if (existingRequirement) {
      existingRequirement.requiredCharacterCount = Math.max(
        existingRequirement.requiredCharacterCount,
        requiredCharacterCount,
      );
      return;
    }

    requiredAbilityMap.set(identity, {
      abilityKey,
      minTurns,
      slotTokens,
      requiredCharacterCount,
    });
  });
  const requiredAbilities = [...requiredAbilityMap.values()];

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

  const rawLockedCharacterIds = collectPositiveIntegers(payload.manualSelection.lockedCharacterIds);
  const lockedCharacterIds = rawLockedCharacterIds
    .filter((characterId) => availableLockedCharacterMap.has(characterId))
    .slice(0, options.maxLockedCharacters);
  const unknownLockedCount = rawLockedCharacterIds.filter(
    (characterId) => !availableLockedCharacterMap.has(characterId),
  ).length;
  const truncatedLockedCount = Math.max(0, rawLockedCharacterIds.length - unknownLockedCount - lockedCharacterIds.length);

  const unknownLockedWarning = buildWarning(
    'preset.warnings.missingLockedCharacters',
    unknownLockedCount,
  );

  if (unknownLockedWarning) {
    warnings.push(unknownLockedWarning);
  }

  const truncatedLockedWarning = buildWarning(
    'preset.warnings.lockedLimitExceeded',
    truncatedLockedCount,
    { max: options.maxLockedCharacters },
  );

  if (truncatedLockedWarning) {
    warnings.push(truncatedLockedWarning);
  }

  const lockedCharacterIdSet = new Set(lockedCharacterIds);
  const rawLeaderIds = collectPositiveIntegers(payload.manualSelection.selectedLeaderIds);
  const selectedLeaderIds = rawLeaderIds
    .filter((characterId) => lockedCharacterIdSet.has(characterId))
    .slice(0, options.maxLeaderCharacters);
  const droppedLeaderCount = rawLeaderIds.length - selectedLeaderIds.length;
  const droppedLeaderWarning = buildWarning(
    'preset.warnings.invalidLeaders',
    droppedLeaderCount,
  );

  if (droppedLeaderWarning) {
    warnings.push(droppedLeaderWarning);
  }

  const normalizedCaptainLeaderId = normalizePositiveInteger(
    payload.manualSelection.captainLeaderId,
  );
  let captainLeaderId: number | null = null;

  if (selectedLeaderIds.length === 1) {
    captainLeaderId = selectedLeaderIds[0];
  } else if (selectedLeaderIds.length > 1) {
    captainLeaderId = normalizedCaptainLeaderId && selectedLeaderIds.includes(normalizedCaptainLeaderId)
      ? normalizedCaptainLeaderId
      : selectedLeaderIds[0];
  }

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

  return {
    state: {
      selectedTypes,
      selectedClasses,
      requiredAbilities,
      requireAllSelectedTypesInTeam: payload.filters.requireAllSelectedTypesInTeam,
      requireAllSelectedClassesPerCharacter: payload.filters.requireAllSelectedClassesPerCharacter,
      requireAllSpecialsSupportTeam: payload.filters.requireAllSpecialsSupportTeam,
      favoritesOnly: payload.filters.favoritesOnly,
      lockedCharacterIds,
      selectedLeaderIds,
      captainLeaderId,
      manualShipId,
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
      };
    }),
  };
}

export function buildAutoTeamSelectionExportPayload({
  selectedTypes,
  selectedClasses,
  requiredAbilities,
  requireAllSelectedTypesInTeam,
  requireAllSelectedClassesPerCharacter,
  requireAllSpecialsSupportTeam,
  favoritesOnly,
  favoriteCount,
  lockedCharacterIds,
  lockedCharacters,
  selectedLeaderIds,
  captainLeaderId,
  friendCaptainLeaderId,
  manualShipId = null,
  manualShip = null,
  exportedAt = new Date().toISOString(),
}: BuildAutoTeamSelectionExportPayloadOptions): AutoTeamSelectionExportPayload {
  return {
    schemaVersion: 3,
    exportedAt,
    source: 'auto-team-builder',
    exportType: 'preset',
    filters: {
      selectedTypes: [...selectedTypes],
      selectedClasses: [...selectedClasses],
      requiredAbilities: requiredAbilities.map((requirement) => ({
        ...requirement,
        slotTokens: [...requirement.slotTokens],
      })),
      requireAllSelectedTypesInTeam,
      requireAllSelectedClassesPerCharacter,
      requireAllSpecialsSupportTeam,
      favoritesOnly,
      favoriteCount,
    },
    manualSelection: {
      lockedCharacterIds: [...lockedCharacterIds],
      selectedLeaderIds: [...selectedLeaderIds],
      captainLeaderId,
      friendCaptainLeaderId,
      manualShipId,
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
    },
  };
}

function buildSafeTimestamp(exportedAt: string): string {
  return exportedAt.replace(/[^a-zA-Z0-9_-]+/g, '-');
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
  documentRef: Document = document,
  urlRef: Pick<typeof URL, 'createObjectURL' | 'revokeObjectURL'> = URL,
): void {
  if (!payload) {
    return;
  }

  const objectUrl = urlRef.createObjectURL(
    new Blob([JSON.stringify(payload, null, 2)], {
      type: 'application/json;charset=utf-8',
    }),
  );
  const anchor = documentRef.createElement('a');

  anchor.href = objectUrl;
  anchor.download = filename;
  anchor.style.display = 'none';
  documentRef.body.appendChild(anchor);

  try {
    anchor.click();
  } finally {
    documentRef.body.removeChild(anchor);
    urlRef.revokeObjectURL(objectUrl);
  }
}

export function downloadAutoTeamExport(
  payload: AutoTeamExportPayload | null,
  documentRef: Document = document,
  urlRef: Pick<typeof URL, 'createObjectURL' | 'revokeObjectURL'> = URL,
): void {
  downloadJsonFile(
    payload,
    payload ? buildAutoTeamExportFilename(payload.exportedAt) : '',
    documentRef,
    urlRef,
  );
}

export function downloadAutoTeamSelectionExport(
  payload: AutoTeamSelectionExportPayload | null,
  documentRef: Document = document,
  urlRef: Pick<typeof URL, 'createObjectURL' | 'revokeObjectURL'> = URL,
): void {
  downloadJsonFile(
    payload,
    payload ? buildAutoTeamSelectionExportFilename(payload.exportedAt) : '',
    documentRef,
    urlRef,
  );
}
