import {
  AUTO_BUILD_MANUAL_SLOT_ROLES,
  type AutoBuildManualSlotRole,
  type AutoBuildResult,
} from '../../core/models/auto-team-builder.models';
import {
  type AutoBuildAbilityCatalogItem,
  type AutoBuildAbilityCategory,
  type NormalizedBuilderAbility,
} from '../../core/models/auto-team-builder-ability.models';
import {
  type CharacterDetailRecord,
  type SavedTeam,
  type ShipRecord,
} from '../../core/models/optc.models';
import { resolveTeamCoverageSummary } from '../../core/services/team-coverage-summary.utils';
import {
  buildSavedTeamsTransferPayloadFromSharePayload,
  getSavedTeamsImportDiagnostic,
  parseSavedTeamsImportPayloadValue,
  parseSavedTeamSharePayloadValue,
  parseSavedTeamShareInput,
  SavedTeamsImportError,
  type SavedTeamsImportDiagnostic,
} from '../saved-teams/saved-teams-transfer.utils';
import {
  parseAutoTeamSelectionImportPayload,
  type AutoTeamExportPayload,
  type AutoTeamSelectionExportPayload,
} from './auto-team-builder-export.utils';

export type AutoTeamCompareSource = 'current' | 'saved' | 'imported';
export type AutoTeamCompareSide = 'a' | 'b';

export interface AutoTeamCompareImportedSeed {
  label: string;
  shipId: number | null;
  ship?: ShipRecord | null;
  slotIds: Array<number | null>;
  characters?: CharacterDetailRecord[];
}

export interface AutoTeamCompareSlotSnapshot {
  role: AutoBuildManualSlotRole;
  characterId: number | null;
  character: CharacterDetailRecord | null;
  missing: boolean;
}

export interface AutoTeamCompareMetricSnapshot {
  key: AutoTeamCompareMetricKey;
  labelKey: string;
  value: number;
}

export interface AutoTeamCompareSnapshot {
  id: string;
  label: string;
  source: AutoTeamCompareSource;
  slots: AutoTeamCompareSlotSnapshot[];
  shipId: number | null;
  ship: ShipRecord | null;
  metrics: AutoTeamCompareMetricSnapshot[];
  missingCharacterCount: number;
}

export interface AutoTeamCompareSlotDiffRow {
  role: AutoBuildManualSlotRole;
  labelKey: string;
  a: AutoTeamCompareSlotSnapshot;
  b: AutoTeamCompareSlotSnapshot;
  changed: boolean;
}

export interface AutoTeamCompareMetricDiffRow {
  key: AutoTeamCompareMetricKey | 'changedSlots';
  labelKey: string;
  aValue: number;
  bValue: number;
  aDisplayValue: string;
  bDisplayValue: string;
  delta: number;
  deltaLabel: string;
  tone: 'positive' | 'negative' | 'neutral';
}

export interface AutoTeamCompareDiff {
  changedSlotCount: number;
  slotRows: AutoTeamCompareSlotDiffRow[];
  metricRows: AutoTeamCompareMetricDiffRow[];
}

export class AutoTeamCompareImportError extends Error {
  public constructor(
    public readonly key: string,
    public readonly diagnostic: SavedTeamsImportDiagnostic | null = null,
  ) {
    super(key);
    this.name = 'AutoTeamCompareImportError';
  }
}

export type AutoTeamCompareMetricKey =
  | 'filledSlots'
  | 'uniqueTypes'
  | 'uniqueClasses'
  | 'uniqueAbilities'
  | 'specialAbilities'
  | 'crewmateAbilities'
  | 'potentialAbilities'
  | 'supportAbilities'
  | 'captainTierCoverage'
  | 'ship';

const AUTO_TEAM_COMPARE_SLOT_LABEL_KEYS: Record<AutoBuildManualSlotRole, string> = {
  captain: 'compare.slots.captain',
  friendCaptain: 'compare.slots.friendCaptain',
  sub1: 'compare.slots.sub1',
  sub2: 'compare.slots.sub2',
  sub3: 'compare.slots.sub3',
  sub4: 'compare.slots.sub4',
};

const AUTO_TEAM_COMPARE_METRIC_LABEL_KEYS: Record<AutoTeamCompareMetricKey, string> = {
  filledSlots: 'compare.metrics.filledSlots',
  uniqueTypes: 'compare.metrics.uniqueTypes',
  uniqueClasses: 'compare.metrics.uniqueClasses',
  uniqueAbilities: 'compare.metrics.uniqueAbilities',
  specialAbilities: 'compare.metrics.specialAbilities',
  crewmateAbilities: 'compare.metrics.crewmateAbilities',
  potentialAbilities: 'compare.metrics.potentialAbilities',
  supportAbilities: 'compare.metrics.supportAbilities',
  captainTierCoverage: 'compare.metrics.captainTierCoverage',
  ship: 'compare.metrics.ship',
};

const ABILITY_CATEGORY_KEYS: AutoBuildAbilityCategory[] = [
  'special',
  'crewmate',
  'potential',
  'support',
];

const catalogMapCache = new WeakMap<
  readonly AutoBuildAbilityCatalogItem[],
  ReadonlyMap<string, AutoBuildAbilityCatalogItem>
>();

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizePositiveInteger(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : null;
}

function normalizeSlotIndex(value: unknown): number | null {
  return typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= 0 &&
    value < AUTO_BUILD_MANUAL_SLOT_ROLES.length
    ? value
    : null;
}

function normalizeSlotIds(values: unknown): Array<number | null> {
  const slots = Array.isArray(values) ? values : [];

  return AUTO_BUILD_MANUAL_SLOT_ROLES.map((_, index) => normalizePositiveInteger(slots[index]));
}

function buildSeedFromSavedTeam(team: SavedTeam): AutoTeamCompareImportedSeed {
  return {
    label: team.name.trim() || 'Imported saved team',
    shipId: normalizePositiveInteger(team.shipId),
    ship: null,
    slotIds: normalizeSlotIds(team.slots),
    characters: [],
  };
}

function buildSeedFromAutoTeamExport(
  payload: Pick<AutoTeamExportPayload, 'team' | 'shipSelection'>,
): AutoTeamCompareImportedSeed {
  const slotIds: Array<number | null> = Array.from(
    { length: AUTO_BUILD_MANUAL_SLOT_ROLES.length },
    () => null,
  );
  const characters: CharacterDetailRecord[] = [];

  for (const slot of payload.team ?? []) {
    const slotIndex = normalizeSlotIndex(slot.slotIndex);
    const characterId = normalizePositiveInteger(slot.character?.id);

    if (slotIndex !== null) {
      slotIds[slotIndex] = characterId;
    }

    if (slot.character && characterId !== null) {
      characters.push(slot.character);
    }
  }

  return {
    label: 'Imported generated team',
    shipId: normalizePositiveInteger(payload.shipSelection?.ship.id),
    ship: payload.shipSelection?.ship ?? null,
    slotIds,
    characters,
  };
}

function buildSeedFromAutoTeamSelection(
  payload: AutoTeamSelectionExportPayload,
): AutoTeamCompareImportedSeed {
  const embeddedSavedTeam = payload.savedTeamImport?.teams?.[0];
  const generatedSeed = payload.generatedTeamExport
    ? buildSeedFromAutoTeamExport(payload.generatedTeamExport)
    : null;

  if (embeddedSavedTeam) {
    const savedSeed = buildSeedFromSavedTeam(embeddedSavedTeam);

    return {
      ...savedSeed,
      shipId: savedSeed.shipId ?? generatedSeed?.shipId ?? null,
      ship: generatedSeed?.ship ?? savedSeed.ship ?? null,
      characters: generatedSeed?.characters ?? savedSeed.characters,
    };
  }

  if (generatedSeed) {
    return generatedSeed;
  }

  throw new AutoTeamCompareImportError(
    'compare.import.errors.noTeam',
    getSavedTeamsImportDiagnostic('SAVED_TEAMS_NO_IMPORTABLE_TEAM'),
  );
}

function parseJson(rawContent: string): unknown {
  try {
    return JSON.parse(rawContent) as unknown;
  } catch {
    throw new AutoTeamCompareImportError(
      'compare.import.errors.invalid',
      getSavedTeamsImportDiagnostic('SAVED_TEAMS_INVALID_JSON'),
    );
  }
}

export function parseAutoTeamCompareImportPayload(
  rawContent: string,
): AutoTeamCompareImportedSeed {
  const trimmedContent = rawContent.trim();

  if (!trimmedContent.length) {
    throw new AutoTeamCompareImportError(
      'compare.import.errors.empty',
      getSavedTeamsImportDiagnostic('SAVED_TEAMS_EMPTY_INPUT'),
    );
  }

  if (!trimmedContent.startsWith('{') && !trimmedContent.startsWith('[')) {
    try {
      return buildSeedFromSavedTeam(parseSavedTeamShareInput(trimmedContent).team);
    } catch (error) {
      throw new AutoTeamCompareImportError(
        'compare.import.errors.invalid',
        error instanceof SavedTeamsImportError ? error.diagnostic : null,
      );
    }
  }

  const parsedPayload = parseJson(trimmedContent);

  if (isRecord(parsedPayload) && parsedPayload['source'] === 'auto-team-builder') {
    if (parsedPayload['exportType'] === 'preset') {
      try {
        return buildSeedFromAutoTeamSelection(parseAutoTeamSelectionImportPayload(trimmedContent));
      } catch (error) {
        if (error instanceof AutoTeamCompareImportError) {
          throw error;
        }

        throw new AutoTeamCompareImportError('compare.import.errors.invalid');
      }
    }

    if (Array.isArray(parsedPayload['team'])) {
      return buildSeedFromAutoTeamExport(parsedPayload as unknown as AutoTeamExportPayload);
    }
  }

  if (isRecord(parsedPayload) && Array.isArray(parsedPayload['slots'])) {
    return buildSeedFromSavedTeam(parsedPayload as unknown as SavedTeam);
  }

  try {
    const savedTeamsPayload =
      isRecord(parsedPayload) && parsedPayload['source'] === 'saved-team-share'
        ? buildSavedTeamsTransferPayloadFromSharePayload(
            parseSavedTeamSharePayloadValue(parsedPayload),
          )
        : parseSavedTeamsImportPayloadValue(parsedPayload);
    const [team] = savedTeamsPayload.teams;

    if (!team) {
      throw new AutoTeamCompareImportError(
        'compare.import.errors.noTeam',
        getSavedTeamsImportDiagnostic('SAVED_TEAMS_NO_IMPORTABLE_TEAM'),
      );
    }

    return buildSeedFromSavedTeam(team);
  } catch (error) {
    if (error instanceof AutoTeamCompareImportError) {
      throw error;
    }

    throw new AutoTeamCompareImportError(
      'compare.import.errors.invalid',
      error instanceof SavedTeamsImportError ? error.diagnostic : null,
    );
  }
}

export function collectAutoTeamCompareSeedCharacterIds(
  seed: AutoTeamCompareImportedSeed,
): number[] {
  return [
    ...new Set(seed.slotIds.filter((characterId): characterId is number => characterId !== null)),
  ];
}

export function buildAutoTeamCompareSnapshotFromCurrent(
  result: AutoBuildResult,
  favoriteShip: ShipRecord | null,
  catalogItems: readonly AutoBuildAbilityCatalogItem[],
): AutoTeamCompareSnapshot {
  let subIndex = 0;
  const slotMap = new Map<AutoBuildManualSlotRole, CharacterDetailRecord>();

  for (const slot of result.slots) {
    const role =
      slot.role === 'sub'
        ? AUTO_BUILD_MANUAL_SLOT_ROLES[2 + subIndex++]
        : (slot.role as AutoBuildManualSlotRole);

    if (role) {
      slotMap.set(role, slot.character);
    }
  }

  return buildAutoTeamCompareSnapshot({
    id: 'current',
    label: 'Current generated team',
    source: 'current',
    slotIds: AUTO_BUILD_MANUAL_SLOT_ROLES.map((role) => slotMap.get(role)?.id ?? null),
    characterMap: new Map([...slotMap.values()].map((character) => [character.id, character])),
    shipId: normalizePositiveInteger(favoriteShip?.id),
    ship: favoriteShip,
    catalogItems,
  });
}

export function buildAutoTeamCompareSnapshotFromSavedTeam(
  team: SavedTeam,
  characterMap: ReadonlyMap<number, CharacterDetailRecord>,
  ship: ShipRecord | null,
  catalogItems: readonly AutoBuildAbilityCatalogItem[],
): AutoTeamCompareSnapshot {
  return buildAutoTeamCompareSnapshot({
    id: team.id,
    label: team.name.trim() || 'Saved team',
    source: 'saved',
    slotIds: normalizeSlotIds(team.slots),
    characterMap,
    shipId: normalizePositiveInteger(team.shipId),
    ship,
    catalogItems,
  });
}

export function buildAutoTeamCompareSnapshotFromImportedSeed(
  seed: AutoTeamCompareImportedSeed,
  characterMap: ReadonlyMap<number, CharacterDetailRecord>,
  ship: ShipRecord | null,
  catalogItems: readonly AutoBuildAbilityCatalogItem[],
): AutoTeamCompareSnapshot {
  return buildAutoTeamCompareSnapshot({
    id: `imported:${seed.label}:${seed.slotIds.join(',')}`,
    label: seed.label,
    source: 'imported',
    slotIds: seed.slotIds,
    characterMap: mergeCharacterMaps(characterMap, seed.characters ?? []),
    shipId: seed.shipId,
    ship: ship ?? seed.ship ?? null,
    catalogItems,
  });
}

function mergeCharacterMaps(
  characterMap: ReadonlyMap<number, CharacterDetailRecord>,
  embeddedCharacters: readonly CharacterDetailRecord[],
): Map<number, CharacterDetailRecord> {
  const mergedMap = new Map(characterMap);

  for (const character of embeddedCharacters) {
    if (!mergedMap.has(character.id)) {
      mergedMap.set(character.id, character);
    }
  }

  return mergedMap;
}

function buildAutoTeamCompareSnapshot(options: {
  id: string;
  label: string;
  source: AutoTeamCompareSource;
  slotIds: Array<number | null>;
  characterMap: ReadonlyMap<number, CharacterDetailRecord>;
  shipId: number | null;
  ship: ShipRecord | null;
  catalogItems: readonly AutoBuildAbilityCatalogItem[];
}): AutoTeamCompareSnapshot {
  const slots = AUTO_BUILD_MANUAL_SLOT_ROLES.map<AutoTeamCompareSlotSnapshot>((role, index) => {
    const characterId = normalizePositiveInteger(options.slotIds[index]);
    const character = characterId ? (options.characterMap.get(characterId) ?? null) : null;

    return {
      role,
      characterId,
      character,
      missing: characterId !== null && character === null,
    };
  });
  const characters = slots
    .map((slot) => slot.character)
    .filter((character): character is CharacterDetailRecord => character !== null);

  return {
    id: options.id,
    label: options.label,
    source: options.source,
    slots,
    shipId: options.shipId,
    ship: options.ship,
    metrics: buildMetrics(slots, options.shipId, options.catalogItems),
    missingCharacterCount: slots.filter((slot) => slot.missing).length,
  };
}

function buildMetrics(
  slots: readonly AutoTeamCompareSlotSnapshot[],
  shipId: number | null,
  catalogItems: readonly AutoBuildAbilityCatalogItem[],
): AutoTeamCompareMetricSnapshot[] {
  const characters = slots
    .map((slot) => slot.character)
    .filter((character): character is CharacterDetailRecord => character !== null);
  const catalogMap = resolveCatalogMap(catalogItems);
  const typeSet = new Set<string>();
  const classSet = new Set<string>();
  const abilityKeySet = new Set<string>();
  const categoryCounts = new Map<AutoBuildAbilityCategory, Set<string>>();
  const summary = resolveTeamCoverageSummary({
    captain: slots[0]?.character ?? null,
    friendCaptain: slots[1]?.character ?? null,
    members: slots.map((slot) => slot.character),
  });

  for (const category of ABILITY_CATEGORY_KEYS) {
    categoryCounts.set(category, new Set());
  }

  for (const character of characters) {
    character.type
      .split(',')
      .map((type) => type.trim())
      .filter(Boolean)
      .forEach((type) => typeSet.add(type));
    character.classes.filter(Boolean).forEach((characterClass) => classSet.add(characterClass));

    for (const ability of resolveDisplayAbilities(character)) {
      const abilityKey = ability.key.trim();

      if (!abilityKey.length) {
        continue;
      }

      abilityKeySet.add(abilityKey);
      const category = catalogMap.get(abilityKey)?.category;

      if (category && categoryCounts.has(category)) {
        categoryCounts.get(category)?.add(abilityKey);
      }
    }
  }

  return [
    metric('filledSlots', characters.length),
    metric('uniqueTypes', typeSet.size),
    metric('uniqueClasses', classSet.size),
    metric('uniqueAbilities', abilityKeySet.size),
    metric('specialAbilities', categoryCounts.get('special')?.size ?? 0),
    metric('crewmateAbilities', categoryCounts.get('crewmate')?.size ?? 0),
    metric('potentialAbilities', categoryCounts.get('potential')?.size ?? 0),
    metric('supportAbilities', categoryCounts.get('support')?.size ?? 0),
    metric(
      'captainTierCoverage',
      summary.tiers.filter((tier) => tier.captureSource !== 'none').length,
    ),
    metric('ship', shipId ? 1 : 0),
  ];
}

function resolveCatalogMap(
  catalogItems: readonly AutoBuildAbilityCatalogItem[],
): ReadonlyMap<string, AutoBuildAbilityCatalogItem> {
  const cachedMap = catalogMapCache.get(catalogItems);

  if (cachedMap) {
    return cachedMap;
  }

  const catalogMap = new Map(catalogItems.map((item) => [item.key, item] as const));

  catalogMapCache.set(catalogItems, catalogMap);

  return catalogMap;
}

function resolveDisplayAbilities(character: CharacterDetailRecord): NormalizedBuilderAbility[] {
  return character.detail.builderAbilities.filter((ability) => ability.source !== 'captainAbility');
}

function metric(key: AutoTeamCompareMetricKey, value: number): AutoTeamCompareMetricSnapshot {
  return {
    key,
    labelKey: AUTO_TEAM_COMPARE_METRIC_LABEL_KEYS[key],
    value,
  };
}

export function buildAutoTeamCompareDiff(
  a: AutoTeamCompareSnapshot,
  b: AutoTeamCompareSnapshot,
): AutoTeamCompareDiff {
  const slotRows = AUTO_BUILD_MANUAL_SLOT_ROLES.map<AutoTeamCompareSlotDiffRow>((role) => {
    const aSlot = a.slots.find((slot) => slot.role === role) ?? createEmptySlot(role);
    const bSlot = b.slots.find((slot) => slot.role === role) ?? createEmptySlot(role);

    return {
      role,
      labelKey: AUTO_TEAM_COMPARE_SLOT_LABEL_KEYS[role],
      a: aSlot,
      b: bSlot,
      changed: aSlot.characterId !== bSlot.characterId,
    };
  });
  const changedSlotCount = slotRows.filter((row) => row.changed).length;

  return {
    changedSlotCount,
    slotRows,
    metricRows: [
      buildChangedSlotMetricRow(changedSlotCount),
      ...buildMetricRows(a, b),
    ],
  };
}

function createEmptySlot(role: AutoBuildManualSlotRole): AutoTeamCompareSlotSnapshot {
  return {
    role,
    characterId: null,
    character: null,
    missing: false,
  };
}

function buildChangedSlotMetricRow(changedSlotCount: number): AutoTeamCompareMetricDiffRow {
  return {
    key: 'changedSlots',
    labelKey: 'compare.metrics.changedSlots',
    aValue: 0,
    bValue: changedSlotCount,
    aDisplayValue: '0',
    bDisplayValue: String(changedSlotCount),
    delta: changedSlotCount,
    deltaLabel: formatDelta(changedSlotCount),
    tone: changedSlotCount === 0 ? 'neutral' : 'negative',
  };
}

function buildMetricRows(
  a: AutoTeamCompareSnapshot,
  b: AutoTeamCompareSnapshot,
): AutoTeamCompareMetricDiffRow[] {
  const bMetricMap = new Map(b.metrics.map((item) => [item.key, item] as const));

  return a.metrics.map((aMetric) => {
    const bMetric = bMetricMap.get(aMetric.key) ?? metric(aMetric.key, 0);

    if (aMetric.key === 'ship') {
      return buildShipMetricRow(a, b, aMetric, bMetric);
    }

    const delta = bMetric.value - aMetric.value;

    return {
      key: aMetric.key,
      labelKey: aMetric.labelKey,
      aValue: aMetric.value,
      bValue: bMetric.value,
      aDisplayValue: formatMetricValue(aMetric.key, aMetric.value),
      bDisplayValue: formatMetricValue(bMetric.key, bMetric.value),
      delta,
      deltaLabel: formatDelta(delta),
      tone: delta > 0 ? 'positive' : delta < 0 ? 'negative' : 'neutral',
    };
  });
}

function buildShipMetricRow(
  a: AutoTeamCompareSnapshot,
  b: AutoTeamCompareSnapshot,
  aMetric: AutoTeamCompareMetricSnapshot,
  bMetric: AutoTeamCompareMetricSnapshot,
): AutoTeamCompareMetricDiffRow {
  const shipChanged = a.shipId !== b.shipId;
  const presenceDelta = bMetric.value - aMetric.value;
  const delta = presenceDelta !== 0 ? presenceDelta : shipChanged ? 1 : 0;

  return {
    key: 'ship',
    labelKey: aMetric.labelKey,
    aValue: aMetric.value,
    bValue: bMetric.value,
    aDisplayValue: formatShipValue(a),
    bDisplayValue: formatShipValue(b),
    delta,
    deltaLabel: presenceDelta !== 0 ? formatDelta(presenceDelta) : shipChanged ? 'changed' : '0',
    tone: delta !== 0 ? 'negative' : 'neutral',
  };
}

function formatShipValue(snapshot: AutoTeamCompareSnapshot): string {
  if (snapshot.ship) {
    return `${snapshot.ship.name} (#${snapshot.ship.id})`;
  }

  if (snapshot.shipId) {
    return `#${snapshot.shipId}`;
  }

  return 'No';
}

function formatMetricValue(key: AutoTeamCompareMetricKey, value: number): string {
  if (key === 'ship') {
    return value > 0 ? 'Yes' : 'No';
  }

  return String(value);
}

function formatDelta(delta: number): string {
  if (delta > 0) {
    return `+${delta}`;
  }

  return String(delta);
}
