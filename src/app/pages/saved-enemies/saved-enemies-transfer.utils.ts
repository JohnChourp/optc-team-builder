import { type SavedEnemy } from "../../core/models/optc.models";
import {
  normalizeAbilityEffectTargetScope,
  normalizeAbilityRequirementEffectValue,
  normalizeAbilityRequirementSourceScope,
} from "../../core/models/auto-team-builder-ability.models";
import {
  cloneBattleRequirements,
  normalizeBattleRequirementsWithLegacyFallback,
} from "../../core/services/auto-team-builder-battle.utils";
import {
  cloneRequiredCharacterGroups,
  expandRequiredAbilitiesToCharacterGroups,
} from "../../core/services/required-character-groups.utils";

export interface SavedEnemiesTransferPayload {
  schemaVersion: 1;
  source: "saved-enemies";
  exportedAt: string;
  enemies: SavedEnemy[];
}

export interface SavedEnemiesImportSanitizeOptions {
  now?: string;
  untitledEnemyName: string;
}

export interface SavedEnemiesImportResult {
  enemies: SavedEnemy[];
  duplicateIdCount: number;
  invalidEnemyCount: number;
}

export class SavedEnemiesImportError extends Error {
  public constructor(public readonly key: string) {
    super(key);
    this.name = "SavedEnemiesImportError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function padTimestampPart(value: number): string {
  return String(value).padStart(2, "0");
}

function buildExportDate(exportedAt: string): Date {
  const parsedDate = new Date(exportedAt);

  return Number.isNaN(parsedDate.getTime()) ? new Date() : parsedDate;
}

function buildTimestampSegment(exportedAt: string): string {
  const exactTimestampMatch = exportedAt.match(
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})/,
  );

  if (exactTimestampMatch) {
    const [, year, month, day, hours, minutes, seconds] = exactTimestampMatch;

    return `${year}${month}${day}-${hours}${minutes}${seconds}`;
  }

  const exportDate = buildExportDate(exportedAt);

  return (
    `${exportDate.getFullYear()}` +
    `${padTimestampPart(exportDate.getMonth() + 1)}` +
    `${padTimestampPart(exportDate.getDate())}-` +
    `${padTimestampPart(exportDate.getHours())}` +
    `${padTimestampPart(exportDate.getMinutes())}` +
    `${padTimestampPart(exportDate.getSeconds())}`
  );
}

function normalizePositiveInteger(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : null;
}

function normalizeAbilitySlotScope(value: unknown): SavedEnemy["requiredAbilities"][number]["slotScope"] {
  return value === "leader" || value === "sub" ? value : "any";
}

function normalizeAbilitySourceScope(
  value: unknown,
): SavedEnemy["requiredAbilities"][number]["sourceScope"] | null {
  return typeof value === "string" ? normalizeAbilityRequirementSourceScope(value) : null;
}

function normalizeEffectTargetScope(
  value: unknown,
): SavedEnemy["requiredAbilities"][number]["effectTargetScope"] | null {
  const scope = typeof value === "string" ? normalizeAbilityEffectTargetScope(value) : "any";

  return scope === "any" ? null : scope;
}

function normalizeEffectValue(value: unknown): number | null {
  return typeof value === "number" || typeof value === "string"
    ? normalizeAbilityRequirementEffectValue(value)
    : null;
}

function normalizeTimestamp(value: unknown, fallback: string): string {
  if (typeof value !== "string") {
    return fallback;
  }

  const normalizedValue = value.trim();

  if (!normalizedValue.length || Number.isNaN(Date.parse(normalizedValue))) {
    return fallback;
  }

  return normalizedValue;
}

function normalizeRawEnemyText(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function normalizeStringArray(
  value: unknown,
  options: { mapValue?: (value: string) => string } = {},
): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return [
    ...new Set(
      value
        .filter((entry): entry is string => typeof entry === "string")
        .map((entry) => entry.trim())
        .filter((entry) => entry.length > 0)
        .map((entry) => (options.mapValue ? options.mapValue(entry) : entry)),
    ),
  ];
}

function normalizeEnemyImageDataUrl(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalizedValue = value.trim();

  if (!normalizedValue.startsWith("data:image/")) {
    return null;
  }

  return normalizedValue.includes(";base64,") ? normalizedValue : null;
}

function normalizeEntityIdSegment(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/["']/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function buildImportedEnemyId(name: string): string {
  const normalizedNameSegment = normalizeEntityIdSegment(name);

  return `enemy-skill-${normalizedNameSegment || "untitled"}`;
}

function normalizeRequiredAbilities(value: unknown): SavedEnemy["requiredAbilities"] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((entry) => {
    if (!isRecord(entry)) {
      return [];
    }

    const abilityKey =
      typeof entry["abilityKey"] === "string" ? entry["abilityKey"].trim() : "";

    if (!abilityKey.length) {
      return [];
    }

    const slotScope = normalizeAbilitySlotScope(entry["slotScope"]);
    const sourceScope = normalizeAbilitySourceScope(entry["sourceScope"]);
    const minEffectValue = normalizeEffectValue(entry["minEffectValue"]);
    const effectTargetScope = normalizeEffectTargetScope(entry["effectTargetScope"]);

    return [
      {
        abilityKey,
        minTurns: normalizePositiveInteger(entry["minTurns"]),
        slotTokens: normalizeStringArray(entry["slotTokens"], {
          mapValue: (token) => token.toUpperCase(),
        }),
        requiredCharacterCount: normalizePositiveInteger(entry["requiredCharacterCount"]) ?? 1,
        ...(slotScope !== "any" ? { slotScope } : {}),
        ...(sourceScope ? { sourceScope } : {}),
        ...(minEffectValue !== null ? { minEffectValue } : {}),
        ...(effectTargetScope ? { effectTargetScope } : {}),
      },
    ];
  });
}

function normalizeRequiredCharacterGroups(
  value: unknown,
  fallbackRequiredAbilities: SavedEnemy["requiredAbilities"],
): SavedEnemy["requiredCharacterGroups"] {
  if (!Array.isArray(value)) {
    return expandRequiredAbilitiesToCharacterGroups(fallbackRequiredAbilities).groups;
  }

  const groups = cloneRequiredCharacterGroups(
    value.flatMap((entry, index) => {
      if (!isRecord(entry)) {
        return [];
      }

      return [
        {
          id:
            typeof entry["id"] === "string" && entry["id"].trim().length > 0
              ? entry["id"].trim()
              : `imported-${index + 1}`,
          abilities: normalizeRequiredAbilities(entry["abilities"]),
        },
      ];
    }),
  );

  return groups.length > 0
    ? groups
    : expandRequiredAbilitiesToCharacterGroups(fallbackRequiredAbilities).groups;
}

function normalizeEnemyMechanics(value: unknown): SavedEnemy["enemyMechanics"] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((entry) => {
    if (!isRecord(entry)) {
      return [];
    }

    const mechanicKey =
      typeof entry["mechanicKey"] === "string" ? entry["mechanicKey"].trim() : "";
    const category =
      typeof entry["category"] === "string" ? entry["category"].trim() : "enemyDefense";

    if (!mechanicKey.length || !category.length) {
      return [];
    }

    return [
      {
        mechanicKey,
        category: category as SavedEnemy["enemyMechanics"][number]["category"],
        minTurns: normalizePositiveInteger(entry["minTurns"]),
        requiredCharacterCount: normalizePositiveInteger(entry["requiredCharacterCount"]) ?? undefined,
        triggerTags: normalizeStringArray(entry["triggerTags"]) as SavedEnemy["enemyMechanics"][number]["triggerTags"],
        responseTags: normalizeStringArray(entry["responseTags"]) as SavedEnemy["enemyMechanics"][number]["responseTags"],
        conditionTags: normalizeStringArray(entry["conditionTags"]) as SavedEnemy["enemyMechanics"][number]["conditionTags"],
        derivedAbilityKey:
          typeof entry["derivedAbilityKey"] === "string" && entry["derivedAbilityKey"].trim().length > 0
            ? entry["derivedAbilityKey"].trim()
            : null,
      },
    ];
  });
}

function cloneSavedEnemy(enemy: SavedEnemy): SavedEnemy {
  const requiredCharacterGroups = cloneRequiredCharacterGroups(enemy.requiredCharacterGroups);

  return {
    ...enemy,
    selectedTypes: [...enemy.selectedTypes],
    selectedClasses: [...enemy.selectedClasses],
    selectedCharacterTags: [...(enemy.selectedCharacterTags ?? [])],
    selectedCharacterNames: [...(enemy.selectedCharacterNames ?? [])],
    requiredAbilities: enemy.requiredAbilities.map((requirement) => ({
      ...requirement,
      slotTokens: [...requirement.slotTokens],
    })),
    ...(requiredCharacterGroups.length ? { requiredCharacterGroups } : {}),
    ...(enemy.battleRequirements?.length
      ? { battleRequirements: cloneBattleRequirements(enemy.battleRequirements) }
      : {}),
    enemyMechanics: enemy.enemyMechanics.map((mechanic) => ({
      ...mechanic,
      triggerTags: [...mechanic.triggerTags],
      responseTags: [...mechanic.responseTags],
      conditionTags: [...mechanic.conditionTags],
    })),
    ...(enemy.associatedTeamIds?.length
      ? { associatedTeamIds: [...enemy.associatedTeamIds] }
      : {}),
  };
}

function normalizeAssociatedTeamIds(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const seen = new Set<string>();
  const result: string[] = [];

  value.forEach((entry) => {
    if (typeof entry !== "string") {
      return;
    }

    const normalized = entry.trim();

    if (!normalized.length || seen.has(normalized)) {
      return;
    }

    seen.add(normalized);
    result.push(normalized);
  });

  return result;
}

export function buildSavedEnemiesTransferPayload(
  enemies: SavedEnemy[],
  exportedAt = new Date().toISOString(),
): SavedEnemiesTransferPayload {
  return {
    schemaVersion: 1,
    source: "saved-enemies",
    exportedAt,
    enemies: enemies.map((enemy) => cloneSavedEnemy(enemy)),
  };
}

export function parseSavedEnemiesImportPayload(rawContent: string): SavedEnemiesTransferPayload {
  let parsedPayload: unknown;

  try {
    parsedPayload = JSON.parse(rawContent) as unknown;
  } catch {
    throw new SavedEnemiesImportError("bulkImport.errors.invalidJson");
  }

  return parseSavedEnemiesImportPayloadValue(parsedPayload);
}

export function parseSavedEnemiesImportPayloadValue(
  parsedPayload: unknown,
): SavedEnemiesTransferPayload {
  if (!isRecord(parsedPayload)) {
    throw new SavedEnemiesImportError("bulkImport.errors.invalidPayload");
  }

  if (
    parsedPayload["schemaVersion"] === 1 &&
    parsedPayload["source"] === "optc-enemy-skill" &&
    parsedPayload["exportType"] === "enemy"
  ) {
    const enemy = parsedPayload["enemy"];

    if (!isRecord(enemy)) {
      throw new SavedEnemiesImportError("bulkImport.errors.invalidPayload");
    }

    const exportedAt = new Date().toISOString();
    const normalizedEnemyName =
      typeof enemy["name"] === "string" ? enemy["name"].trim() : "";

    return {
      schemaVersion: 1,
      source: "saved-enemies",
      exportedAt,
      enemies: [
        {
          id: buildImportedEnemyId(normalizedEnemyName),
          name: normalizedEnemyName,
          notes: typeof enemy["notes"] === "string" ? enemy["notes"] : "",
          rawEnemyText: normalizeRawEnemyText(enemy["rawEnemyText"]),
          imageDataUrl: normalizeEnemyImageDataUrl(enemy["imageDataUrl"]),
          selectedTypes: Array.isArray(enemy["selectedTypes"]) ? enemy["selectedTypes"] : [],
          selectedClasses: Array.isArray(enemy["selectedClasses"]) ? enemy["selectedClasses"] : [],
          selectedCharacterTags: Array.isArray(enemy["selectedCharacterTags"])
            ? enemy["selectedCharacterTags"]
            : [],
          selectedCharacterNames: Array.isArray(enemy["selectedCharacterNames"])
            ? enemy["selectedCharacterNames"]
            : [],
          requiredAbilities: Array.isArray(enemy["requiredAbilities"])
            ? enemy["requiredAbilities"]
            : [],
          ...(Array.isArray(enemy["requiredCharacterGroups"])
            ? { requiredCharacterGroups: enemy["requiredCharacterGroups"] }
            : {}),
          ...(Array.isArray(enemy["battleRequirements"])
            ? { battleRequirements: enemy["battleRequirements"] }
            : {}),
          enemyMechanics: Array.isArray(enemy["enemyMechanics"]) ? enemy["enemyMechanics"] : [],
          requireAllSelectedTypesInTeam: Boolean(enemy["requireAllSelectedTypesInTeam"]),
          requireAllSelectedClassesPerCharacter: Boolean(
            enemy["requireAllSelectedClassesPerCharacter"],
          ),
          requireAllSelectedCharacterTagsInTeam: Boolean(
            enemy["requireAllSelectedCharacterTagsInTeam"],
          ),
          requireAllSelectedCharacterNamesInTeam: Boolean(
            enemy["requireAllSelectedCharacterNamesInTeam"],
          ),
          associatedTeamIds: normalizeAssociatedTeamIds(enemy["associatedTeamIds"]),
          createdAt: exportedAt,
          updatedAt: exportedAt,
        },
      ],
    };
  }

  if (parsedPayload["schemaVersion"] !== 1 || parsedPayload["source"] !== "saved-enemies") {
    throw new SavedEnemiesImportError("bulkImport.errors.unsupportedSchema");
  }

  if (
    typeof parsedPayload["exportedAt"] !== "string" ||
    !Array.isArray(parsedPayload["enemies"])
  ) {
    throw new SavedEnemiesImportError("bulkImport.errors.invalidPayload");
  }

  return {
    schemaVersion: 1,
    source: "saved-enemies",
    exportedAt: parsedPayload["exportedAt"],
    enemies: parsedPayload["enemies"] as SavedEnemy[],
  };
}

export function sanitizeSavedEnemiesImportPayload(
  payload: SavedEnemiesTransferPayload,
  options: SavedEnemiesImportSanitizeOptions,
): SavedEnemiesImportResult {
  const fallbackTimestamp = normalizeTimestamp(
    payload.exportedAt,
    options.now ?? new Date().toISOString(),
  );
  const sanitizedEnemies = new Map<string, SavedEnemy>();
  let duplicateIdCount = 0;
  let invalidEnemyCount = 0;

  payload.enemies.forEach((enemy) => {
    if (!isRecord(enemy)) {
      invalidEnemyCount += 1;
      return;
    }

    const normalizedEnemyId = typeof enemy["id"] === "string" ? enemy["id"].trim() : "";

    if (!normalizedEnemyId.length) {
      invalidEnemyCount += 1;
      return;
    }

    const requiredAbilities = normalizeRequiredAbilities(enemy["requiredAbilities"]);
    const enemyMechanics = normalizeEnemyMechanics(enemy["enemyMechanics"]);
    const requiredCharacterGroups = normalizeRequiredCharacterGroups(
      enemy["requiredCharacterGroups"],
      requiredAbilities,
    );
    const sanitizedEnemy: SavedEnemy = {
      id: normalizedEnemyId,
      name:
        typeof enemy["name"] === "string" && enemy["name"].trim().length > 0
          ? enemy["name"].trim()
          : options.untitledEnemyName,
      notes: typeof enemy["notes"] === "string" ? enemy["notes"].trim() : "",
      rawEnemyText: normalizeRawEnemyText(enemy["rawEnemyText"]),
      imageDataUrl: normalizeEnemyImageDataUrl(enemy["imageDataUrl"]),
      selectedTypes: normalizeStringArray(enemy["selectedTypes"], {
        mapValue: (value) => value.toUpperCase(),
      }),
      selectedClasses: normalizeStringArray(enemy["selectedClasses"]),
      selectedCharacterTags: normalizeStringArray(enemy["selectedCharacterTags"]),
      selectedCharacterNames: normalizeStringArray(enemy["selectedCharacterNames"], {
        mapValue: (value) => value.toLowerCase(),
      }),
      requiredAbilities,
      requiredCharacterGroups,
      battleRequirements: normalizeBattleRequirementsWithLegacyFallback({
        battles: Array.isArray(enemy["battleRequirements"])
          ? (enemy["battleRequirements"] as SavedEnemy["battleRequirements"])
          : undefined,
        requiredCharacterGroups,
        enemyMechanics,
      }),
      enemyMechanics,
      requireAllSelectedTypesInTeam: Boolean(enemy["requireAllSelectedTypesInTeam"]),
      requireAllSelectedClassesPerCharacter: Boolean(
        enemy["requireAllSelectedClassesPerCharacter"],
      ),
      requireAllSelectedCharacterTagsInTeam: Boolean(
        enemy["requireAllSelectedCharacterTagsInTeam"],
      ),
      requireAllSelectedCharacterNamesInTeam: Boolean(
        enemy["requireAllSelectedCharacterNamesInTeam"],
      ),
      associatedTeamIds: normalizeAssociatedTeamIds(enemy["associatedTeamIds"]),
      createdAt: normalizeTimestamp(enemy["createdAt"], fallbackTimestamp),
      updatedAt: normalizeTimestamp(enemy["updatedAt"], fallbackTimestamp),
    };

    if (sanitizedEnemies.has(sanitizedEnemy.id)) {
      duplicateIdCount += 1;
      sanitizedEnemies.delete(sanitizedEnemy.id);
    }

    sanitizedEnemies.set(sanitizedEnemy.id, sanitizedEnemy);
  });

  return {
    enemies: [...sanitizedEnemies.values()],
    duplicateIdCount,
    invalidEnemyCount,
  };
}

export function buildSavedEnemiesExportFilename(exportedAt: string): string {
  return `saved-enemies-${buildTimestampSegment(exportedAt)}.json`;
}

export function downloadSavedEnemiesExport(
  payload: SavedEnemiesTransferPayload | null,
  documentReference: Document = document,
  urlReference: Pick<typeof URL, "createObjectURL" | "revokeObjectURL"> = URL,
): void {
  if (!payload) {
    return;
  }

  const objectUrl = urlReference.createObjectURL(
    new Blob([JSON.stringify(payload, null, 2) + "\n"], {
      type: "application/json;charset=utf-8",
    }),
  );
  const anchor = documentReference.createElement("a");

  anchor.href = objectUrl;
  anchor.download = buildSavedEnemiesExportFilename(payload.exportedAt);
  anchor.style.display = "none";
  documentReference.body.append(anchor);

  try {
    anchor.click();
  } finally {
    anchor.remove();
    urlReference.revokeObjectURL(objectUrl);
  }
}
