import {
  type AutoBuildResult,
  type AutoTeamBuilderType,
} from '../../core/models/auto-team-builder.models';
import {
  type AutoBuildAbilityCatalogItem,
  type AutoBuildAbilityRequirement,
} from '../../core/models/auto-team-builder-ability.models';
import { type CharacterDetailRecord, type CharacterListItem } from '../../core/models/optc.models';

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

export interface AutoTeamSelectionExportPayload {
  schemaVersion: 1;
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
}

export interface AutoTeamSelectionImportResult {
  state: AutoTeamSelectionImportState;
  warnings: string[];
}

interface SanitizeAutoTeamSelectionImportOptions {
  availableTypes: readonly AutoTeamBuilderType[];
  availableClasses: readonly string[];
  abilityCatalogItems: AutoBuildAbilityCatalogItem[];
  availableLockedCharacters: CharacterListItem[];
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
  count: number,
  singularMessage: string,
  pluralMessage: string,
): string | null {
  if (count <= 0) {
    return null;
  }

  return `Ignored ${count === 1 ? singularMessage : pluralMessage}.`;
}

export function parseAutoTeamSelectionImportPayload(
  rawContent: string,
): AutoTeamSelectionExportPayload {
  let parsedPayload: unknown;

  try {
    parsedPayload = JSON.parse(rawContent) as unknown;
  } catch {
    throw new Error('The selected file is not valid JSON.');
  }

  if (!isRecord(parsedPayload)) {
    throw new Error('The selected file is not a valid preset JSON.');
  }

  if (
    parsedPayload['schemaVersion'] !== 1 ||
    parsedPayload['source'] !== 'auto-team-builder' ||
    parsedPayload['exportType'] !== 'preset'
  ) {
    throw new Error('The selected file is not a supported Auto Team Builder preset.');
  }

  const filters = parsedPayload['filters'];
  const manualSelection = parsedPayload['manualSelection'];

  if (!isRecord(filters) || !isRecord(manualSelection)) {
    throw new Error('The selected preset is missing required sections.');
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
    throw new Error('The selected preset does not match the current export schema.');
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
    )
  ) {
    throw new Error('The selected preset does not match the current export schema.');
  }

  return parsedPayload as unknown as AutoTeamSelectionExportPayload;
}

export function sanitizeAutoTeamSelectionImportPayload(
  payload: AutoTeamSelectionExportPayload,
  options: SanitizeAutoTeamSelectionImportOptions,
): AutoTeamSelectionImportResult {
  const warnings: string[] = [];
  const availableTypesSet = new Set(options.availableTypes);
  const availableClassesSet = new Set(options.availableClasses);
  const availableLockedCharacterMap = new Map(
    options.availableLockedCharacters.map((character) => [character.id, character] as const),
  );
  const abilityCatalogMap = new Map(
    options.abilityCatalogItems.map((item) => [item.key, item] as const),
  );

  const rawSelectedTypes = [...new Set(payload.filters.selectedTypes)];
  const selectedTypes = rawSelectedTypes.filter((type): type is AutoTeamBuilderType =>
    availableTypesSet.has(type as AutoTeamBuilderType),
  );
  const typeWarning = buildWarning(
    rawSelectedTypes.length - selectedTypes.length,
    '1 unavailable imported type from the preset',
    `${rawSelectedTypes.length - selectedTypes.length} unavailable imported types from the preset`,
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
    rawSelectedClasses.length - selectedClasses.length,
    '1 unavailable imported class from the preset',
    `${rawSelectedClasses.length - selectedClasses.length} unavailable imported classes from the preset`,
  );

  if (classWarning) {
    warnings.push(classWarning);
  }

  let invalidAbilityCount = 0;
  let adjustedAbilityCount = 0;
  const requiredAbilities = payload.filters.requiredAbilities.flatMap((rawRequirement) => {
    const abilityKey = typeof rawRequirement.abilityKey === 'string'
      ? rawRequirement.abilityKey.trim()
      : '';
    const abilityCatalogItem = abilityCatalogMap.get(abilityKey);

    if (!abilityCatalogItem) {
      invalidAbilityCount += 1;
      return [];
    }

    const rawMinTurns = normalizePositiveInteger(rawRequirement.minTurns);
    const minTurns = abilityCatalogItem.supportsTurns ? rawMinTurns : null;
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
      (!abilityCatalogItem.supportsSlotTokens && rawSlotTokens.length > 0)
    ) {
      adjustedAbilityCount += 1;
    }

    return [
      {
        abilityKey,
        minTurns,
        slotTokens,
      },
    ];
  });

  const invalidAbilityWarning = buildWarning(
    invalidAbilityCount,
    '1 unsupported ability requirement from the preset',
    `${invalidAbilityCount} unsupported ability requirements from the preset`,
  );

  if (invalidAbilityWarning) {
    warnings.push(invalidAbilityWarning);
  }

  const adjustedAbilityWarning = buildWarning(
    adjustedAbilityCount,
    '1 ability requirement with unsupported turns or slot tokens',
    `${adjustedAbilityCount} ability requirements with unsupported turns or slot tokens`,
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
    unknownLockedCount,
    '1 locked character that is missing from the current dataset',
    `${unknownLockedCount} locked characters that are missing from the current dataset`,
  );

  if (unknownLockedWarning) {
    warnings.push(unknownLockedWarning);
  }

  const truncatedLockedWarning = buildWarning(
    truncatedLockedCount,
    `1 locked character because the preset exceeds the ${options.maxLockedCharacters}-unit lock limit`,
    `${truncatedLockedCount} locked characters because the preset exceeds the ${options.maxLockedCharacters}-unit lock limit`,
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
    droppedLeaderCount,
    '1 selected leader that is not part of the imported locked characters',
    `${droppedLeaderCount} selected leaders that are not part of the imported locked characters`,
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
  exportedAt = new Date().toISOString(),
}: BuildAutoTeamSelectionExportPayloadOptions): AutoTeamSelectionExportPayload {
  return {
    schemaVersion: 1,
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
