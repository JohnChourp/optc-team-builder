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
  parseSavedTeamsImportContent,
  parseSavedTeamShareInput,
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
  slotIds: Array<number | null>;
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
  public constructor(public readonly key: string) {
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
    slotIds: normalizeSlotIds(team.slots),
  };
}

function buildSeedFromAutoTeamExport(
  payload: Pick<AutoTeamExportPayload, 'team' | 'shipSelection'>,
): AutoTeamCompareImportedSeed {
  const slotIds: Array<number | null> = Array.from(
    { length: AUTO_BUILD_MANUAL_SLOT_ROLES.length },
    () => null,
  );

  for (const slot of payload.team ?? []) {
    const slotIndex = normalizeSlotIndex(slot.slotIndex);

    if (slotIndex !== null) {
      slotIds[slotIndex] = normalizePositiveInteger(slot.character?.id);
    }
  }

  return {
    label: 'Imported generated team',
    shipId: normalizePositiveInteger(payload.shipSelection?.ship.id),
    slotIds,
  };
}

function buildSeedFromAutoTeamSelection(
  payload: AutoTeamSelectionExportPayload,
): AutoTeamCompareImportedSeed {
  const embeddedSavedTeam = payload.savedTeamImport?.teams?.[0];

  if (embeddedSavedTeam) {
    return buildSeedFromSavedTeam(embeddedSavedTeam);
  }

  if (payload.generatedTeamExport) {
    return buildSeedFromAutoTeamExport(payload.generatedTeamExport);
  }

  throw new AutoTeamCompareImportError('compare.import.errors.noTeam');
}

function parseJson(rawContent: string): unknown {
  try {
    return JSON.parse(rawContent) as unknown;
  } catch {
    throw new AutoTeamCompareImportError('compare.import.errors.invalid');
  }
}

export function parseAutoTeamCompareImportPayload(
  rawContent: string,
): AutoTeamCompareImportedSeed {
  const trimmedContent = rawContent.trim();

  if (!trimmedContent.length) {
    throw new AutoTeamCompareImportError('compare.import.errors.empty');
  }

  if (!trimmedContent.startsWith('{') && !trimmedContent.startsWith('[')) {
    try {
      return buildSeedFromSavedTeam(parseSavedTeamShareInput(trimmedContent).team);
    } catch {
      throw new AutoTeamCompareImportError('compare.import.errors.invalid');
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
    const savedTeamsPayload = parseSavedTeamsImportContent(trimmedContent);
    const [team] = savedTeamsPayload.teams;

    if (!team) {
      throw new AutoTeamCompareImportError('compare.import.errors.noTeam');
    }

    return buildSeedFromSavedTeam(team);
  } catch (error) {
    if (error instanceof AutoTeamCompareImportError) {
      throw error;
    }

    throw new AutoTeamCompareImportError('compare.import.errors.invalid');
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
    characterMap,
    ship,
    catalogItems,
  });
}

function buildAutoTeamCompareSnapshot(options: {
  id: string;
  label: string;
  source: AutoTeamCompareSource;
  slotIds: Array<number | null>;
  characterMap: ReadonlyMap<number, CharacterDetailRecord>;
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
    ship: options.ship,
    metrics: buildMetrics(characters, options.ship, options.catalogItems),
    missingCharacterCount: slots.filter((slot) => slot.missing).length,
  };
}

function buildMetrics(
  characters: readonly CharacterDetailRecord[],
  ship: ShipRecord | null,
  catalogItems: readonly AutoBuildAbilityCatalogItem[],
): AutoTeamCompareMetricSnapshot[] {
  const catalogMap = new Map(catalogItems.map((item) => [item.key, item] as const));
  const typeSet = new Set<string>();
  const classSet = new Set<string>();
  const abilityKeySet = new Set<string>();
  const categoryCounts = new Map<AutoBuildAbilityCategory, Set<string>>();
  const summary = resolveTeamCoverageSummary({
    captain: characters[0] ?? null,
    friendCaptain: characters[1] ?? null,
    members: characters,
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
    metric('ship', ship ? 1 : 0),
  ];
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
      ...buildMetricRows(a.metrics, b.metrics),
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
  aMetrics: readonly AutoTeamCompareMetricSnapshot[],
  bMetrics: readonly AutoTeamCompareMetricSnapshot[],
): AutoTeamCompareMetricDiffRow[] {
  const bMetricMap = new Map(bMetrics.map((item) => [item.key, item] as const));

  return aMetrics.map((aMetric) => {
    const bMetric = bMetricMap.get(aMetric.key) ?? metric(aMetric.key, 0);
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
