import {
  AUTO_BUILD_MANUAL_SLOT_ROLES,
  AUTO_BUILD_MANUAL_SUB_SLOT_ROLES,
  type AutoBuildResult,
  type AutoBuildManualSlotRole,
  type AutoBuildManualSlotSelection,
  type AutoTeamBuilderType,
  createEmptyAutoBuildManualSlots,
} from "../../core/models/auto-team-builder.models";
import {
  type AutoBuildAbilityCatalogItem,
  type AutoBuildAbilityRequirement,
  type AutoBuildEnemyMechanicRequirement,
} from "../../core/models/auto-team-builder-ability.models";
import {
  type CharacterDetailRecord,
  type CharacterListItem,
  type ShipRecord,
} from "../../core/models/optc.models";
import { normalizeEnemyMechanicRequirements } from "../../core/services/enemy-mechanic-draft.utils";

type AutoTeamExportRole = AutoBuildResult["slots"][number]["role"];
type AutoTeamExportLeaderAssignment = "captain" | "friendCaptain" | "dual" | null;

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
  source: "auto-team-builder";
  requestedInput: AutoBuildResult["requestedInput"];
  effectiveInput: AutoBuildResult["input"];
  relaxation: AutoBuildResult["relaxation"];
  coverage: AutoBuildResult["coverage"];
  shipSelection: AutoBuildResult["shipSelection"];
  team: AutoTeamExportSlot[];
}

export interface AutoTeamSelectionCharacterSummary {
  id: number;
  name: string;
  type: CharacterListItem["type"];
  primaryClass: CharacterListItem["primaryClass"];
  secondaryClass: CharacterListItem["secondaryClass"];
  imageUrl: CharacterListItem["imageUrl"];
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
  schemaVersion: 1 | 2 | 3 | 4 | 5 | 6;
  exportedAt: string;
  source: "auto-team-builder";
  exportType: "preset";
  filters: {
    selectedTypes: AutoBuildResult["input"]["types"];
    selectedClasses: AutoBuildResult["input"]["selectedClasses"];
    requiredAbilities: AutoBuildResult["input"]["requiredAbilities"];
    enemyMechanics?: AutoBuildEnemyMechanicRequirement[];
    requireAllSelectedTypesInTeam: boolean;
    requireAllSelectedClassesPerCharacter: boolean;
    requireAllSpecialsSupportTeam: boolean;
    favoritesOnly: boolean;
    favoriteCount: number;
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
}

export interface AutoTeamSelectionImportState {
  selectedTypes: AutoTeamBuilderType[];
  selectedClasses: string[];
  requiredAbilities: AutoBuildAbilityRequirement[];
  enemyMechanics: AutoBuildEnemyMechanicRequirement[];
  requireAllSelectedTypesInTeam: boolean;
  requireAllSelectedClassesPerCharacter: boolean;
  requireAllSpecialsSupportTeam: boolean;
  favoritesOnly: boolean;
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
    this.name = "AutoTeamSelectionImportError";
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
  selectedTypes: AutoBuildResult["input"]["types"];
  selectedClasses: AutoBuildResult["input"]["selectedClasses"];
  requiredAbilities: AutoBuildResult["input"]["requiredAbilities"];
  enemyMechanics: AutoBuildResult["input"]["enemyMechanics"];
  requireAllSelectedTypesInTeam: boolean;
  requireAllSelectedClassesPerCharacter: boolean;
  requireAllSpecialsSupportTeam: boolean;
  favoritesOnly: boolean;
  favoriteCount: number;
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
    return "dual";
  }

  if (isCaptainLeader) {
    return "captain";
  }

  if (isFriendLeader) {
    return "friendCaptain";
  }

  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizePositiveInteger(value: unknown): number | null {
  if (typeof value === "number" && Number.isInteger(value) && value > 0) {
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

function buildLegacyManualSlotsFromSelection(
  lockedCharacterIds: number[],
  captainLeaderId: number | null,
  friendCaptainLeaderId: number | null,
): AutoBuildManualSlotSelection[] {
  const manualSlots = createEmptyAutoBuildManualSlots();
  const captainSlot = manualSlots.find((slot) => slot.role === "captain");
  const friendCaptainSlot = manualSlots.find((slot) => slot.role === "friendCaptain");
  const leaderIds = new Set([captainLeaderId, friendCaptainLeaderId].filter(
    (characterId): characterId is number => characterId !== null,
  ));

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
    manualSlots.find((slot) => slot.role === "captain")?.characterIds[0] ?? null;
  const friendCaptainLeaderId =
    manualSlots.find((slot) => slot.role === "friendCaptain")?.characterIds[0] ??
    captainLeaderId;
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
  const roleMap = new Map<AutoBuildManualSlotRole, number[]>();
  let duplicateCount = 0;
  let unknownCount = 0;

  for (const rawSlot of (Array.isArray(value) ? value : [])) {
    if (!isRecord(rawSlot)) {
      continue;
    }

    const role = rawSlot["role"];

    if (typeof role !== "string" || !AUTO_BUILD_MANUAL_SLOT_ROLES.includes(role as AutoBuildManualSlotRole)) {
      continue;
    }

    const normalizedIds = collectPositiveIntegers(
      Array.isArray(rawSlot["characterIds"]) ? rawSlot["characterIds"] : [],
    );
    const currentIds = roleMap.get(role as AutoBuildManualSlotRole) ?? [];
    roleMap.set(role as AutoBuildManualSlotRole, [...currentIds, ...normalizedIds]);
  }

  const usedLeaderIds = new Set<number>();
  const usedSubIds = new Set<number>();

  for (const slot of manualSlots) {
    const nextIds: number[] = [];

    for (const characterId of (roleMap.get(slot.role) ?? [])) {
      if (!availableLockedCharacterMap.has(characterId)) {
        unknownCount += 1;
        continue;
      }

      if (
        AUTO_BUILD_MANUAL_SUB_SLOT_ROLES.includes(
          slot.role as (typeof AUTO_BUILD_MANUAL_SUB_SLOT_ROLES)[number],
        )
      ) {
        if (usedLeaderIds.has(characterId) || usedSubIds.has(characterId) || nextIds.includes(characterId)) {
          duplicateCount += 1;
          continue;
        }

        usedSubIds.add(characterId);
        nextIds.push(characterId);
        continue;
      }

      if (usedSubIds.has(characterId) || nextIds.includes(characterId)) {
        duplicateCount += 1;
        continue;
      }

      usedLeaderIds.add(characterId);
      nextIds.push(characterId);
    }

    slot.characterIds = nextIds;
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
    throw new AutoTeamSelectionImportError("preset.errors.invalidJson");
  }

  if (!isRecord(parsedPayload)) {
    throw new AutoTeamSelectionImportError("preset.errors.invalidPresetJson");
  }

  if (
    (parsedPayload["schemaVersion"] !== 1 &&
      parsedPayload["schemaVersion"] !== 2 &&
      parsedPayload["schemaVersion"] !== 3 &&
      parsedPayload["schemaVersion"] !== 4 &&
      parsedPayload["schemaVersion"] !== 5 &&
      parsedPayload["schemaVersion"] !== 6) ||
    parsedPayload["source"] !== "auto-team-builder" ||
    parsedPayload["exportType"] !== "preset"
  ) {
    throw new AutoTeamSelectionImportError("preset.errors.unsupportedPreset");
  }

  const filters = parsedPayload["filters"];
  const manualSelection = parsedPayload["manualSelection"];

  if (!isRecord(filters) || !isRecord(manualSelection)) {
    throw new AutoTeamSelectionImportError("preset.errors.missingSections");
  }

  if (
    !Array.isArray(filters["selectedTypes"]) ||
    !filters["selectedTypes"].every((type) => typeof type === "string") ||
    !Array.isArray(filters["selectedClasses"]) ||
    !filters["selectedClasses"].every((characterClass) => typeof characterClass === "string") ||
    !Array.isArray(filters["requiredAbilities"]) ||
    !filters["requiredAbilities"].every((requirement) => isRecord(requirement)) ||
    !(
      filters["enemyMechanics"] === undefined ||
      (
        Array.isArray(filters["enemyMechanics"]) &&
        filters["enemyMechanics"].every((mechanic) => isRecord(mechanic))
      )
    ) ||
    typeof filters["requireAllSelectedTypesInTeam"] !== "boolean" ||
    typeof filters["requireAllSelectedClassesPerCharacter"] !== "boolean" ||
    typeof filters["requireAllSpecialsSupportTeam"] !== "boolean" ||
    typeof filters["favoritesOnly"] !== "boolean" ||
    typeof filters["favoriteCount"] !== "number" ||
    !Array.isArray(manualSelection["lockedCharacterIds"]) ||
    !(
      manualSelection["excludedCharacterIds"] === undefined ||
      Array.isArray(manualSelection["excludedCharacterIds"])
    ) ||
    !Array.isArray(manualSelection["selectedLeaderIds"]) ||
    !Array.isArray(manualSelection["characters"]) ||
    !(
      manualSelection["excludedShipIds"] === undefined ||
      Array.isArray(manualSelection["excludedShipIds"])
    ) ||
    !(
      manualSelection["excludedCharacters"] === undefined ||
      Array.isArray(manualSelection["excludedCharacters"])
    ) ||
    !(
      manualSelection["excludedShips"] === undefined ||
      Array.isArray(manualSelection["excludedShips"])
    )
  ) {
    throw new AutoTeamSelectionImportError("preset.errors.schemaMismatch");
  }

  if (
    !manualSelection["lockedCharacterIds"].every((characterId) => typeof characterId === "number") ||
    !(
      manualSelection["excludedCharacterIds"] === undefined ||
      manualSelection["excludedCharacterIds"].every((characterId) => typeof characterId === "number")
    ) ||
    !manualSelection["selectedLeaderIds"].every((characterId) => typeof characterId === "number") ||
    !(
      manualSelection["captainLeaderId"] === null ||
      typeof manualSelection["captainLeaderId"] === "number"
    ) ||
    !(
      manualSelection["friendCaptainLeaderId"] === null ||
      typeof manualSelection["friendCaptainLeaderId"] === "number"
    ) ||
    !(
      manualSelection["manualShipId"] === undefined ||
      manualSelection["manualShipId"] === null ||
      typeof manualSelection["manualShipId"] === "number"
    ) ||
    !(
      manualSelection["excludedShipIds"] === undefined ||
      manualSelection["excludedShipIds"].every((shipId) => typeof shipId === "number")
    )
  ) {
    throw new AutoTeamSelectionImportError("preset.errors.schemaMismatch");
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
    "preset.warnings.unavailableTypes",
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
    "preset.warnings.unavailableClasses",
    rawSelectedClasses.length - selectedClasses.length,
  );

  if (classWarning) {
    warnings.push(classWarning);
  }

  let invalidAbilityCount = 0;
  let adjustedAbilityCount = 0;
  const requiredAbilityMap = new Map<string, AutoBuildAbilityRequirement>();
  const enemyMechanics = normalizeEnemyMechanicRequirements(
    Array.isArray(payload.filters.enemyMechanics) ? payload.filters.enemyMechanics : [],
  );

  for (const rawRequirement of payload.filters.requiredAbilities) {
    const abilityKey = typeof rawRequirement.abilityKey === "string"
      ? rawRequirement.abilityKey.trim()
      : "";
    const abilityCatalogItem = abilityCatalogMap.get(abilityKey);

    if (!abilityCatalogItem) {
      invalidAbilityCount += 1;
      continue;
    }

    const rawMinTurns = normalizePositiveInteger(rawRequirement.minTurns);
    const minTurns = abilityCatalogItem.supportsTurns ? rawMinTurns : null;
    const rawRequiredCharacterCount = normalizePositiveInteger(rawRequirement.requiredCharacterCount);
    const requiredCharacterCount = rawRequiredCharacterCount ?? 1;
    const rawSlotTokens = Array.isArray(rawRequirement.slotTokens)
      ? [...new Set(rawRequirement.slotTokens
          .filter((token): token is string => typeof token === "string")
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

    const identity = `${abilityKey}|${minTurns ?? "none"}|${slotTokens.join(",")}`;
    const existingRequirement = requiredAbilityMap.get(identity);

    if (existingRequirement) {
      existingRequirement.requiredCharacterCount = Math.max(
        existingRequirement.requiredCharacterCount,
        requiredCharacterCount,
      );
      continue;
    }

    requiredAbilityMap.set(identity, {
      abilityKey,
      minTurns,
      slotTokens,
      requiredCharacterCount,
    });
  }
  const requiredAbilities = [...requiredAbilityMap.values()];

  const invalidAbilityWarning = buildWarning(
    "preset.warnings.unsupportedAbilities",
    invalidAbilityCount,
  );

  if (invalidAbilityWarning) {
    warnings.push(invalidAbilityWarning);
  }

  const adjustedAbilityWarning = buildWarning(
    "preset.warnings.adjustedAbilities",
    adjustedAbilityCount,
  );

  if (adjustedAbilityWarning) {
    warnings.push(adjustedAbilityWarning);
  }

  const rawManualSlots = sanitizeManualSlots(
    payload.manualSelection["manualSlots"],
    availableLockedCharacterMap,
  );
  let manualSlots = rawManualSlots.manualSlots;
  const hasManualSlots = manualSlots.some((slot) => slot.characterIds.length > 0);

  if (hasManualSlots) {
    const missingManualSlotWarning = buildWarning(
      "preset.warnings.missingLockedCharacters",
      rawManualSlots.unknownCount,
    );

    if (missingManualSlotWarning) {
      warnings.push(missingManualSlotWarning);
    }

    const duplicateManualSlotWarning = buildWarning(
      "preset.warnings.invalidLeaders",
      rawManualSlots.duplicateCount,
    );

    if (duplicateManualSlotWarning) {
      warnings.push(duplicateManualSlotWarning);
    }
  } else {
    const rawLockedCharacterIds = collectPositiveIntegers(payload.manualSelection.lockedCharacterIds);
    const lockedCharacterIds = rawLockedCharacterIds.filter((characterId) =>
      availableLockedCharacterMap.has(characterId),
    );
    const unknownLockedCount = rawLockedCharacterIds.filter(
      (characterId) => !availableLockedCharacterMap.has(characterId),
    ).length;

    const unknownLockedWarning = buildWarning(
      "preset.warnings.missingLockedCharacters",
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
    const droppedLeaderWarning = buildWarning(
      "preset.warnings.invalidLeaders",
      droppedLeaderCount,
    );

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
      "preset.warnings.lockedLimitExceeded",
      Math.max(0, legacySubCount - AUTO_BUILD_MANUAL_SUB_SLOT_ROLES.length),
    );

    if (unmappedLegacyLockedWarning) {
      warnings.push(unmappedLegacyLockedWarning);
    }
  }

  const normalizedManualSlots = manualSlots.map((slot) => ({
    role: slot.role,
    characterIds: [...slot.characterIds],
  }));
  const derivedManualSelection = deriveLegacyManualSelectionFromManualSlots(normalizedManualSlots);

  const normalizedManualShipId = normalizePositiveInteger(payload.manualSelection.manualShipId);
  const manualShipId =
    normalizedManualShipId && availableShipMap.has(normalizedManualShipId)
      ? normalizedManualShipId
      : null;

  if (normalizedManualShipId && !availableShipMap.has(normalizedManualShipId)) {
    warnings.push({
      key: "preset.warnings.missingManualShip",
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
      availableLockedCharacterMap.has(characterId) && !excludedCharacterConflictSet.has(characterId),
  );
  const conflictingExcludedCharacterCount = rawExcludedCharacterIds.filter((characterId) =>
    excludedCharacterConflictSet.has(characterId),
  ).length;
  const missingExcludedCharacterWarning = buildWarning(
    "preset.warnings.missingExcludedCharacters",
    missingExcludedCharacterCount,
  );

  if (missingExcludedCharacterWarning) {
    warnings.push(missingExcludedCharacterWarning);
  }

  const conflictingExcludedCharacterWarning = buildWarning(
    "preset.warnings.conflictingExcludedCharacters",
    conflictingExcludedCharacterCount,
  );

  if (conflictingExcludedCharacterWarning) {
    warnings.push(conflictingExcludedCharacterWarning);
  }

  const rawExcludedShipIds = collectPositiveIntegers(
    Array.isArray(payload.manualSelection.excludedShipIds) ? payload.manualSelection.excludedShipIds : [],
  );
  const missingExcludedShipCount = rawExcludedShipIds.filter((shipId) => !availableShipMap.has(shipId))
    .length;
  const excludedShipIds = rawExcludedShipIds.filter(
    (shipId) => availableShipMap.has(shipId) && shipId !== manualShipId,
  );
  const conflictingExcludedShipCount =
    manualShipId === null ? 0 : rawExcludedShipIds.filter((shipId) => shipId === manualShipId).length;
  const missingExcludedShipWarning = buildWarning(
    "preset.warnings.missingExcludedShips",
    missingExcludedShipCount,
  );

  if (missingExcludedShipWarning) {
    warnings.push(missingExcludedShipWarning);
  }

  const conflictingExcludedShipWarning = buildWarning(
    "preset.warnings.conflictingExcludedShips",
    conflictingExcludedShipCount,
  );

  if (conflictingExcludedShipWarning) {
    warnings.push(conflictingExcludedShipWarning);
  }

  return {
    state: {
      selectedTypes,
      selectedClasses,
      requiredAbilities,
      enemyMechanics,
      requireAllSelectedTypesInTeam: payload.filters.requireAllSelectedTypesInTeam,
      requireAllSelectedClassesPerCharacter: payload.filters.requireAllSelectedClassesPerCharacter,
      requireAllSpecialsSupportTeam: payload.filters.requireAllSpecialsSupportTeam,
      favoritesOnly: payload.filters.favoritesOnly,
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
    source: "auto-team-builder",
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
  enemyMechanics,
  requireAllSelectedTypesInTeam,
  requireAllSelectedClassesPerCharacter,
  requireAllSpecialsSupportTeam,
  favoritesOnly,
  favoriteCount,
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
  exportedAt = new Date().toISOString(),
}: BuildAutoTeamSelectionExportPayloadOptions): AutoTeamSelectionExportPayload {
  const normalizedManualSlots = manualSlots.map((slot) => ({
    role: slot.role,
    characterIds: [...slot.characterIds],
  }));

  return {
    schemaVersion: 6,
    exportedAt,
    source: "auto-team-builder",
    exportType: "preset",
    filters: {
      selectedTypes: [...selectedTypes],
      selectedClasses: [...selectedClasses],
      requiredAbilities: requiredAbilities.map((requirement) => ({
        ...requirement,
        slotTokens: [...requirement.slotTokens],
      })),
      enemyMechanics: enemyMechanics.map((mechanic) => ({
        ...mechanic,
        triggerTags: [...mechanic.triggerTags],
        responseTags: [...mechanic.responseTags],
        conditionTags: [...mechanic.conditionTags],
      })),
      requireAllSelectedTypesInTeam,
      requireAllSelectedClassesPerCharacter,
      requireAllSpecialsSupportTeam,
      favoritesOnly,
      favoriteCount,
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
  };
}

function buildSafeTimestamp(exportedAt: string): string {
  return exportedAt.replaceAll(/[^a-zA-Z0-9_-]+/g, "-");
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
  urlReference: Pick<typeof URL, "createObjectURL" | "revokeObjectURL"> = URL,
): void {
  if (!payload) {
    return;
  }

  const objectUrl = urlReference.createObjectURL(
    new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json;charset=utf-8",
    }),
  );
  const anchor = documentReference.createElement("a");

  anchor.href = objectUrl;
  anchor.download = filename;
  anchor.style.display = "none";
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
  urlReference: Pick<typeof URL, "createObjectURL" | "revokeObjectURL"> = URL,
): void {
  downloadJsonFile(
    payload,
    payload ? buildAutoTeamExportFilename(payload.exportedAt) : "",
    documentReference,
    urlReference,
  );
}

export function downloadAutoTeamSelectionExport(
  payload: AutoTeamSelectionExportPayload | null,
  documentReference: Document = document,
  urlReference: Pick<typeof URL, "createObjectURL" | "revokeObjectURL"> = URL,
): void {
  downloadJsonFile(
    payload,
    payload ? buildAutoTeamSelectionExportFilename(payload.exportedAt) : "",
    documentReference,
    urlReference,
  );
}
