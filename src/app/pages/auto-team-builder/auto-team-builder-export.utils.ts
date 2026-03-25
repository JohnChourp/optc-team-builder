import { type AutoBuildResult } from '../../core/models/auto-team-builder.models';
import { type CharacterDetailRecord } from '../../core/models/optc.models';

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

export function buildAutoTeamExportFilename(exportedAt: string): string {
  const safeTimestamp = exportedAt.replace(/[^a-zA-Z0-9_-]+/g, '-');

  return `auto-team-builder-${safeTimestamp}.json`;
}

export function downloadAutoTeamExport(
  payload: AutoTeamExportPayload | null,
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
  anchor.download = buildAutoTeamExportFilename(payload.exportedAt);
  anchor.style.display = 'none';
  documentRef.body.appendChild(anchor);

  try {
    anchor.click();
  } finally {
    documentRef.body.removeChild(anchor);
    urlRef.revokeObjectURL(objectUrl);
  }
}
