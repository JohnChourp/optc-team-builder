import { type AutoTeamBuilderWorkerPreference } from '../../core/services/user-state.service';
import {
  type RumbleBuildInput,
  type RumbleTeamResult,
  type RumbleTeamSlot,
} from '../../core/models/auto-team-builder-rumble.models';

export interface RumbleBuilderSettingsExportPayload {
  schemaVersion: 2;
  exportedAt: string;
  source: 'auto-team-builder-rumble';
  exportType: 'settings';
  settings: RumbleBuildInput;
  favoriteCount: number;
  workerPreference: AutoTeamBuilderWorkerPreference;
}

export interface RumbleTeamExportSlot {
  slotIndex: number;
  role: RumbleTeamSlot['role'];
  score: number;
  reasonChips: string[];
  unit: RumbleTeamSlot['unit'];
}

export interface RumbleTeamExportResult {
  resultIndex: number;
  isSelected: boolean;
  requestedInput: RumbleTeamResult['input'];
  requestedTypes: RumbleTeamResult['requestedTypes'];
  requestedClasses: RumbleTeamResult['requestedClasses'];
  resolvedTypes: RumbleTeamResult['resolvedTypes'];
  resolvedClasses: RumbleTeamResult['resolvedClasses'];
  droppedTypes: RumbleTeamResult['droppedTypes'];
  droppedClasses: RumbleTeamResult['droppedClasses'];
  candidateCount: number;
  selectedCount: number;
  totalScore: number;
  totalRumbleCost: number;
  roleCoverage: RumbleTeamResult['roleCoverage'];
  typeCoverage: RumbleTeamResult['typeCoverage'];
  classCoverage: RumbleTeamResult['classCoverage'];
  topFactors: string[];
  activeSlots: RumbleTeamExportSlot[];
  benchSlots: RumbleTeamExportSlot[];
  team: RumbleTeamExportSlot[];
}

export interface RumbleOpponentTeamExport {
  selectedCount: number;
  totalRumbleCost: number;
  activeSlots: RumbleTeamExportSlot[];
  benchSlots: RumbleTeamExportSlot[];
  team: RumbleTeamExportSlot[];
}

export interface RumbleTeamExportPayload {
  schemaVersion: 2;
  exportedAt: string;
  source: 'auto-team-builder-rumble';
  exportType: 'team';
  selectedTeamIndex: number;
  requestedInput: RumbleTeamResult['input'];
  requestedTypes: RumbleTeamResult['requestedTypes'];
  requestedClasses: RumbleTeamResult['requestedClasses'];
  resolvedTypes: RumbleTeamResult['resolvedTypes'];
  resolvedClasses: RumbleTeamResult['resolvedClasses'];
  droppedTypes: RumbleTeamResult['droppedTypes'];
  droppedClasses: RumbleTeamResult['droppedClasses'];
  candidateCount: number;
  selectedCount: number;
  totalScore: number;
  totalRumbleCost: number;
  roleCoverage: RumbleTeamResult['roleCoverage'];
  typeCoverage: RumbleTeamResult['typeCoverage'];
  classCoverage: RumbleTeamResult['classCoverage'];
  topFactors: string[];
  team: RumbleTeamExportSlot[];
  teams: RumbleTeamExportResult[];
  opponentTeam: RumbleOpponentTeamExport;
}

type RumbleExportPayload = RumbleBuilderSettingsExportPayload | RumbleTeamExportPayload;

export function buildRumbleBuilderSettingsExportPayload({
  exportedAt = new Date().toISOString(),
  settings,
  favoriteCount,
  workerPreference,
}: {
  exportedAt?: string;
  settings: RumbleBuildInput;
  favoriteCount: number;
  workerPreference: AutoTeamBuilderWorkerPreference;
}): RumbleBuilderSettingsExportPayload {
  return {
    schemaVersion: 2,
    exportedAt,
    source: 'auto-team-builder-rumble',
    exportType: 'settings',
    settings: cloneRumbleBuildInput(settings),
    favoriteCount,
    workerPreference: { ...workerPreference },
  };
}

export function buildRumbleTeamExportPayload(
  result: RumbleTeamResult | null,
  exportedAt = new Date().toISOString(),
  options: {
    allResults?: RumbleTeamResult[];
    selectedTeamIndex?: number;
    opponentSlots?: RumbleTeamSlot[];
  } = {},
): RumbleTeamExportPayload | null {
  if (!result || result.selectedCount <= 0) {
    return null;
  }

  const exportResults = resolveExportResults(result, options.allResults);
  const selectedTeamIndex = resolveSelectedTeamIndex(
    exportResults,
    result,
    options.selectedTeamIndex,
  );
  const selectedTeam = buildRumbleTeamExportResult(
    exportResults[selectedTeamIndex] ?? result,
    selectedTeamIndex,
    true,
  );

  return {
    schemaVersion: 2,
    exportedAt,
    source: 'auto-team-builder-rumble',
    exportType: 'team',
    selectedTeamIndex,
    requestedInput: selectedTeam.requestedInput,
    requestedTypes: selectedTeam.requestedTypes,
    requestedClasses: selectedTeam.requestedClasses,
    resolvedTypes: selectedTeam.resolvedTypes,
    resolvedClasses: selectedTeam.resolvedClasses,
    droppedTypes: selectedTeam.droppedTypes,
    droppedClasses: selectedTeam.droppedClasses,
    candidateCount: selectedTeam.candidateCount,
    selectedCount: selectedTeam.selectedCount,
    totalScore: selectedTeam.totalScore,
    totalRumbleCost: selectedTeam.totalRumbleCost,
    roleCoverage: selectedTeam.roleCoverage,
    typeCoverage: selectedTeam.typeCoverage,
    classCoverage: selectedTeam.classCoverage,
    topFactors: selectedTeam.topFactors,
    team: selectedTeam.team,
    teams: exportResults.map((teamResult, resultIndex) =>
      buildRumbleTeamExportResult(teamResult, resultIndex, resultIndex === selectedTeamIndex),
    ),
    opponentTeam: buildRumbleOpponentTeamExport(options.opponentSlots ?? []),
  };
}

export function buildRumbleBuilderSettingsExportFilename(exportedAt: string): string {
  return `optc-rumble-builder-settings-${buildSafeTimestamp(exportedAt)}.json`;
}

export function buildRumbleTeamExportFilename(exportedAt: string): string {
  return `optc-rumble-team-${buildSafeTimestamp(exportedAt)}.json`;
}

export function downloadRumbleBuilderSettingsExport(
  payload: RumbleBuilderSettingsExportPayload | null,
  documentReference: Document = document,
  urlReference: Pick<typeof URL, 'createObjectURL' | 'revokeObjectURL'> = URL,
): void {
  downloadJsonFile(
    payload,
    payload ? buildRumbleBuilderSettingsExportFilename(payload.exportedAt) : '',
    documentReference,
    urlReference,
  );
}

export function downloadRumbleTeamExport(
  payload: RumbleTeamExportPayload | null,
  documentReference: Document = document,
  urlReference: Pick<typeof URL, 'createObjectURL' | 'revokeObjectURL'> = URL,
): void {
  downloadJsonFile(
    payload,
    payload ? buildRumbleTeamExportFilename(payload.exportedAt) : '',
    documentReference,
    urlReference,
  );
}

function cloneRumbleBuildInput(input: RumbleBuildInput): RumbleBuildInput {
  return {
    types: [...input.types],
    selectedClasses: [...input.selectedClasses],
    onlySelectedTypes: input.onlySelectedTypes,
    onlySelectedClasses: input.onlySelectedClasses,
    favoritesOnly: input.favoritesOnly,
    favoriteCharacterIds: [...input.favoriteCharacterIds],
    candidateCharacterIds: input.candidateCharacterIds
      ? [...input.candidateCharacterIds]
      : undefined,
    opponentSlots: (input.opponentSlots ?? []).map((slot) => ({ ...slot })),
    buffFocus: input.buffFocus.map((preference) => ({ ...preference })),
    requireFullTeam: input.requireFullTeam,
  };
}

function resolveExportResults(
  result: RumbleTeamResult,
  allResults: RumbleTeamResult[] | undefined,
): RumbleTeamResult[] {
  const validResults = (allResults ?? []).filter((teamResult) => teamResult.selectedCount > 0);

  return validResults.length ? validResults : [result];
}

function resolveSelectedTeamIndex(
  exportResults: RumbleTeamResult[],
  result: RumbleTeamResult,
  selectedTeamIndex: number | undefined,
): number {
  if (
    typeof selectedTeamIndex === 'number' &&
    selectedTeamIndex >= 0 &&
    selectedTeamIndex < exportResults.length
  ) {
    return selectedTeamIndex;
  }

  const resultIndex = exportResults.indexOf(result);

  return resultIndex >= 0 ? resultIndex : 0;
}

function buildRumbleTeamExportResult(
  result: RumbleTeamResult,
  resultIndex: number,
  isSelected: boolean,
): RumbleTeamExportResult {
  const activeSlots = result.activeSlots.map((slot, slotIndex) =>
    buildRumbleTeamExportSlot(slot, slotIndex),
  );
  const benchSlots = result.benchSlots.map((slot, slotIndex) =>
    buildRumbleTeamExportSlot(slot, result.activeSlots.length + slotIndex),
  );
  const team = [...activeSlots, ...benchSlots];

  return {
    resultIndex,
    isSelected,
    requestedInput: cloneRumbleBuildInput(result.input),
    requestedTypes: [...result.requestedTypes],
    requestedClasses: [...result.requestedClasses],
    resolvedTypes: [...result.resolvedTypes],
    resolvedClasses: [...result.resolvedClasses],
    droppedTypes: [...result.droppedTypes],
    droppedClasses: [...result.droppedClasses],
    candidateCount: result.candidateCount,
    selectedCount: result.selectedCount,
    totalScore: result.totalScore,
    totalRumbleCost: resolveTotalRumbleCost([...result.activeSlots, ...result.benchSlots]),
    roleCoverage: [...result.roleCoverage],
    typeCoverage: [...result.typeCoverage],
    classCoverage: [...result.classCoverage],
    topFactors: [...result.topFactors],
    activeSlots,
    benchSlots,
    team,
  };
}

function buildRumbleOpponentTeamExport(slots: RumbleTeamSlot[]): RumbleOpponentTeamExport {
  const activeSlots = slots
    .filter((slot) => slot.role === 'active')
    .map((slot, slotIndex) => buildRumbleTeamExportSlot(slot, slotIndex));
  const benchSlots = slots
    .filter((slot) => slot.role === 'bench')
    .map((slot, slotIndex) => buildRumbleTeamExportSlot(slot, activeSlots.length + slotIndex));
  const team = [...activeSlots, ...benchSlots];

  return {
    selectedCount: team.length,
    totalRumbleCost: resolveTotalRumbleCost(slots),
    activeSlots,
    benchSlots,
    team,
  };
}

function buildRumbleTeamExportSlot(
  slot: RumbleTeamSlot,
  slotIndex: number,
): RumbleTeamExportSlot {
  return {
    slotIndex,
    role: slot.role,
    score: slot.score,
    reasonChips: [...slot.reasonChips],
    unit: {
      ...slot.unit,
      reasonChips: [...slot.unit.reasonChips],
      conflictKeys: [...slot.unit.conflictKeys],
    },
  };
}

function resolveTotalRumbleCost(slots: RumbleTeamSlot[]): number {
  return slots.reduce((total, slot) => total + resolveSlotRumbleCost(slot), 0);
}

function resolveSlotRumbleCost(slot: RumbleTeamSlot): number {
  const cost = slot.unit.normalized.cost;

  return typeof cost === 'number' && Number.isFinite(cost) && cost > 0 ? cost : 0;
}

function buildSafeTimestamp(exportedAt: string): string {
  return exportedAt.replaceAll(/[^a-zA-Z0-9_-]+/g, '-');
}

function downloadJsonFile(
  payload: RumbleExportPayload | null,
  filename: string,
  documentReference: Document,
  urlReference: Pick<typeof URL, 'createObjectURL' | 'revokeObjectURL'>,
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
