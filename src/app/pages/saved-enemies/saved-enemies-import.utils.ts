import {
  type AutoBuildAbilityCatalogItem,
  type AutoBuildAbilityRequirement,
  type AutoBuildEnemyMechanicRequirement,
} from '../../core/models/auto-team-builder-ability.models';
import { resolveEnemyMechanicCatalogItem } from '../../core/services/enemy-mechanic-draft.utils';

export interface ImportedEnemyDraft {
  name: string;
  notes: string;
  imageDataUrl: string | null;
  selectedTypes: string[];
  selectedClasses: string[];
  requiredAbilities: AutoBuildAbilityRequirement[];
  enemyMechanics: AutoBuildEnemyMechanicRequirement[];
  requireAllSelectedTypesInTeam: boolean;
  requireAllSelectedClassesPerCharacter: boolean;
  requireAllSpecialsSupportTeam: boolean;
}

export interface EnemyImportPayload {
  schemaVersion: 1;
  source: 'optc-enemy-skill';
  exportType: 'enemy';
  enemy: Record<string, unknown>;
}

export interface EnemyImportMessage {
  key: string;
  params?: Record<string, number>;
}

export interface EnemyImportResult {
  enemy: ImportedEnemyDraft;
  warnings: EnemyImportMessage[];
}

export interface EnemyImportSanitizeOptions {
  untitledEnemyName: string;
  currentImageDataUrl: string | null;
  availableTypes: readonly string[];
  availableClasses: readonly string[];
  abilityCatalogItems: readonly AutoBuildAbilityCatalogItem[];
}

export class EnemyImportError extends Error {
  public constructor(public readonly key: string) {
    super(key);
    this.name = 'EnemyImportError';
  }
}

export function parseEnemyImportPayload(rawContent: string): EnemyImportPayload {
  let parsedPayload: unknown;

  try {
    parsedPayload = JSON.parse(rawContent) as unknown;
  } catch {
    throw new EnemyImportError('editor.import.errors.invalidJson');
  }

  if (!isRecord(parsedPayload)) {
    throw new EnemyImportError('editor.import.errors.invalidPayload');
  }

  if (
    parsedPayload['schemaVersion'] !== 1 ||
    parsedPayload['source'] !== 'optc-enemy-skill' ||
    parsedPayload['exportType'] !== 'enemy'
  ) {
    throw new EnemyImportError('editor.import.errors.unsupportedSchema');
  }

  if (!isRecord(parsedPayload['enemy'])) {
    throw new EnemyImportError('editor.import.errors.invalidPayload');
  }

  return {
    schemaVersion: 1,
    source: 'optc-enemy-skill',
    exportType: 'enemy',
    enemy: parsedPayload['enemy'],
  };
}

export function sanitizeEnemyImportPayload(
  payload: EnemyImportPayload,
  options: EnemyImportSanitizeOptions,
): EnemyImportResult {
  const warnings: EnemyImportMessage[] = [];
  const enemyRecord = payload.enemy;
  const availableTypeSet = new Set(options.availableTypes);
  const availableClassSet = new Set(options.availableClasses);
  const abilityCatalogMap = new Map(
    options.abilityCatalogItems.map((item) => [item.key, item] as const),
  );

  const rawSelectedTypes = hasOwn(enemyRecord, 'selectedTypes')
    ? normalizeStringArray(enemyRecord['selectedTypes'], { mapValue: (value) => value.toUpperCase() })
    : [];
  const selectedTypes = rawSelectedTypes.filter((type) => availableTypeSet.has(type));

  pushWarning(
    warnings,
    'editor.import.warnings.unavailableTypes',
    rawSelectedTypes.length - selectedTypes.length,
  );

  const normalizedSelectedTypes =
    selectedTypes.length > 0 ? selectedTypes : [...options.availableTypes];

  if (!selectedTypes.length && options.availableTypes.length) {
    warnings.push({ key: 'editor.import.warnings.defaultedTypes' });
  }

  const rawSelectedClasses = hasOwn(enemyRecord, 'selectedClasses')
    ? normalizeStringArray(enemyRecord['selectedClasses'])
    : [];
  const selectedClasses = rawSelectedClasses.filter((characterClass) =>
    availableClassSet.has(characterClass),
  );

  pushWarning(
    warnings,
    'editor.import.warnings.unavailableClasses',
    rawSelectedClasses.length - selectedClasses.length,
  );

  const normalizedSelectedClasses =
    selectedClasses.length > 0 ? selectedClasses : [...options.availableClasses];

  if (!selectedClasses.length && options.availableClasses.length) {
    warnings.push({ key: 'editor.import.warnings.defaultedClasses' });
  }

  let unsupportedAbilityCount = 0;
  let adjustedAbilityCount = 0;
  const requiredAbilityMap = new Map<string, AutoBuildAbilityRequirement>();

  if (Array.isArray(enemyRecord['requiredAbilities'])) {
    enemyRecord['requiredAbilities'].forEach((value) => {
      if (!isRecord(value)) {
        unsupportedAbilityCount += 1;
        return;
      }

      const abilityKey = typeof value['abilityKey'] === 'string' ? value['abilityKey'].trim() : '';
      const catalogItem = abilityCatalogMap.get(abilityKey);

      if (!catalogItem) {
        unsupportedAbilityCount += 1;
        return;
      }

      const rawMinTurns = normalizePositiveInteger(value['minTurns']);
      const minTurns = catalogItem.supportsTurns ? rawMinTurns : null;
      const rawRequiredCharacterCount = normalizePositiveInteger(value['requiredCharacterCount']);
      const requiredCharacterCount = rawRequiredCharacterCount ?? 1;
      const rawSlotTokens = normalizeStringArray(value['slotTokens'], {
        mapValue: (token) => token.toUpperCase(),
      });
      const slotTokens = catalogItem.supportsSlotTokens
        ? rawSlotTokens.filter((token) => catalogItem.availableSlotTokens.includes(token))
        : [];

      if (
        (hasOwn(value, 'minTurns') && value['minTurns'] !== null && rawMinTurns === null) ||
        (!catalogItem.supportsTurns && rawMinTurns !== null) ||
        (hasOwn(value, 'requiredCharacterCount') &&
          value['requiredCharacterCount'] !== null &&
          rawRequiredCharacterCount === null) ||
        rawSlotTokens.length !== slotTokens.length ||
        (!catalogItem.supportsSlotTokens && rawSlotTokens.length > 0)
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
  }

  pushWarning(warnings, 'editor.import.warnings.unsupportedAbilities', unsupportedAbilityCount);
  pushWarning(warnings, 'editor.import.warnings.adjustedAbilities', adjustedAbilityCount);

  let unsupportedMechanicCount = 0;
  const normalizedMechanics = new Map<string, AutoBuildEnemyMechanicRequirement>();

  if (Array.isArray(enemyRecord['enemyMechanics'])) {
    enemyRecord['enemyMechanics'].forEach((value) => {
      if (!isRecord(value)) {
        unsupportedMechanicCount += 1;
        return;
      }

      const mechanicKey = typeof value['mechanicKey'] === 'string' ? value['mechanicKey'].trim() : '';
      const catalogItem = resolveEnemyMechanicCatalogItem(mechanicKey);

      if (!catalogItem) {
        unsupportedMechanicCount += 1;
        return;
      }

      const minTurns = catalogItem.supportsTurns ? normalizePositiveInteger(value['minTurns']) : null;
      const triggerTags = normalizeAllowedStringArray(
        value['triggerTags'],
        catalogItem.availableTriggerTags,
      );
      const responseTags = normalizeAllowedStringArray(
        value['responseTags'],
        catalogItem.availableResponseTags,
      );
      const conditionTags = normalizeAllowedStringArray(
        value['conditionTags'],
        catalogItem.availableConditionTags,
      );
      const identity = [
        mechanicKey,
        catalogItem.category,
        minTurns ?? 'none',
        triggerTags.join(','),
        responseTags.join(','),
        conditionTags.join(','),
        catalogItem.derivedAbilityKey ?? 'none',
      ].join('|');

      if (normalizedMechanics.has(identity)) {
        return;
      }

      normalizedMechanics.set(identity, {
        mechanicKey,
        category: catalogItem.category,
        minTurns,
        triggerTags,
        responseTags,
        conditionTags,
        derivedAbilityKey: catalogItem.derivedAbilityKey,
      });
    });
  }

  pushWarning(warnings, 'editor.import.warnings.unsupportedMechanics', unsupportedMechanicCount);

  return {
    enemy: {
      name:
        typeof enemyRecord['name'] === 'string' && enemyRecord['name'].trim().length > 0
          ? enemyRecord['name'].trim()
          : options.untitledEnemyName,
      notes: typeof enemyRecord['notes'] === 'string' ? enemyRecord['notes'].trim() : '',
      imageDataUrl: normalizeImportedImageDataUrl(
        enemyRecord,
        options.currentImageDataUrl,
      ),
      selectedTypes: normalizedSelectedTypes,
      selectedClasses: normalizedSelectedClasses,
      requiredAbilities: [...requiredAbilityMap.values()],
      enemyMechanics: [...normalizedMechanics.values()],
      requireAllSelectedTypesInTeam: Boolean(enemyRecord['requireAllSelectedTypesInTeam']),
      requireAllSelectedClassesPerCharacter: Boolean(
        enemyRecord['requireAllSelectedClassesPerCharacter'],
      ),
      requireAllSpecialsSupportTeam: Boolean(enemyRecord['requireAllSpecialsSupportTeam']),
    },
    warnings,
  };
}

function normalizeImportedImageDataUrl(
  enemyRecord: Record<string, unknown>,
  fallbackImageDataUrl: string | null,
): string | null {
  if (!hasOwn(enemyRecord, 'imageDataUrl')) {
    return fallbackImageDataUrl;
  }

  if (enemyRecord['imageDataUrl'] === null) {
    return null;
  }

  if (typeof enemyRecord['imageDataUrl'] !== 'string') {
    return fallbackImageDataUrl;
  }

  const normalized = enemyRecord['imageDataUrl'].trim();

  return normalized.length > 0 ? normalized : null;
}

function normalizeAllowedStringArray<T extends string>(
  value: unknown,
  allowedValues: readonly T[],
): T[] {
  const allowedValueSet = new Set(allowedValues);
  return normalizeStringArray(value).filter((entry): entry is T => allowedValueSet.has(entry as T));
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
        .filter((entry): entry is string => typeof entry === 'string')
        .map((entry) => entry.trim())
        .filter((entry) => entry.length > 0)
        .map((entry) => (options.mapValue ? options.mapValue(entry) : entry)),
    ),
  ];
}

function normalizePositiveInteger(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : null;
}

function pushWarning(
  warnings: EnemyImportMessage[],
  key: string,
  count: number,
): void {
  if (count <= 0) {
    return;
  }

  warnings.push({
    key,
    params: { count },
  });
}

function hasOwn(value: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
