import { type SavedRumbleTeam } from '../../core/models/saved-rumble-team.models';

export interface SavedRumbleTeamsTransferPayload {
  schemaVersion: 1;
  source: 'saved-rumble-teams';
  exportedAt: string;
  rumbleTeams: SavedRumbleTeam[];
}

export class SavedRumbleTeamsImportError extends Error {
  public constructor(public readonly key: string) {
    super(key);
    this.name = 'SavedRumbleTeamsImportError';
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function buildSavedRumbleTeamsTransferPayload(
  rumbleTeams: SavedRumbleTeam[],
  exportedAt = new Date().toISOString(),
): SavedRumbleTeamsTransferPayload {
  return {
    schemaVersion: 1,
    source: 'saved-rumble-teams',
    exportedAt,
    rumbleTeams: rumbleTeams.map((rumbleTeam) => JSON.parse(JSON.stringify(rumbleTeam))),
  };
}

export function parseSavedRumbleTeamsImportPayloadValue(
  parsedPayload: unknown,
): SavedRumbleTeamsTransferPayload {
  if (!isRecord(parsedPayload)) {
    throw new SavedRumbleTeamsImportError('management.savedRumbleTeams.errors.invalidPayload');
  }

  if (parsedPayload['schemaVersion'] !== 1 || parsedPayload['source'] !== 'saved-rumble-teams') {
    throw new SavedRumbleTeamsImportError('management.savedRumbleTeams.errors.unsupportedSchema');
  }

  if (
    typeof parsedPayload['exportedAt'] !== 'string' ||
    !Array.isArray(parsedPayload['rumbleTeams'])
  ) {
    throw new SavedRumbleTeamsImportError('management.savedRumbleTeams.errors.invalidPayload');
  }

  return {
    schemaVersion: 1,
    source: 'saved-rumble-teams',
    exportedAt: parsedPayload['exportedAt'],
    rumbleTeams: parsedPayload['rumbleTeams'] as SavedRumbleTeam[],
  };
}
