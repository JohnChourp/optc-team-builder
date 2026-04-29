import { type AutoTeamBuilderWorkerPreference } from '../../core/services/user-state.service';
import {
  type RumbleBuildInput,
  type RumbleTeamResult,
  type RumbleTeamSlot,
} from '../../core/models/auto-team-builder-rumble.models';

export interface RumbleBuilderSettingsExportPayload {
  schemaVersion: 1;
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

export interface RumbleTeamExportPayload {
  schemaVersion: 1;
  exportedAt: string;
  source: 'auto-team-builder-rumble';
  exportType: 'team';
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
  roleCoverage: RumbleTeamResult['roleCoverage'];
  typeCoverage: RumbleTeamResult['typeCoverage'];
  classCoverage: RumbleTeamResult['classCoverage'];
  topFactors: string[];
  team: RumbleTeamExportSlot[];
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
    schemaVersion: 1,
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
): RumbleTeamExportPayload | null {
  if (!result || result.selectedCount <= 0) {
    return null;
  }

  return {
    schemaVersion: 1,
    exportedAt,
    source: 'auto-team-builder-rumble',
    exportType: 'team',
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
    roleCoverage: [...result.roleCoverage],
    typeCoverage: [...result.typeCoverage],
    classCoverage: [...result.classCoverage],
    topFactors: [...result.topFactors],
    team: [...result.activeSlots, ...result.benchSlots].map((slot, slotIndex) => ({
      slotIndex,
      role: slot.role,
      score: slot.score,
      reasonChips: [...slot.reasonChips],
      unit: {
        ...slot.unit,
        reasonChips: [...slot.unit.reasonChips],
        conflictKeys: [...slot.unit.conflictKeys],
      },
    })),
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
  };
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
