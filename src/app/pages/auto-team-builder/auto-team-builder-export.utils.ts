import { type AutoBuildResult } from '../../core/models/auto-team-builder.models';
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

interface BuildAutoTeamSelectionExportPayloadOptions {
  selectedTypes: AutoBuildResult['input']['types'];
  selectedClasses: AutoBuildResult['input']['selectedClasses'];
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
  downloadJsonFile(payload, payload ? buildAutoTeamExportFilename(payload.exportedAt) : '', documentRef, urlRef);
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
