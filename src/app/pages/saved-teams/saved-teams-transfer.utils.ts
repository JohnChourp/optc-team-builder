import { type SavedTeam } from '../../core/models/optc.models';

export const SAVED_TEAM_SHARE_QUERY_PARAM = 'teamShare';

export interface SavedTeamsTransferPayload {
  schemaVersion: 1;
  source: 'saved-teams';
  exportedAt: string;
  teams: SavedTeam[];
}

export interface SavedTeamSharePayload {
  schemaVersion: 1;
  source: 'saved-team-share';
  exportedAt: string;
  team: SavedTeam;
}

export interface SavedTeamsImportSanitizeOptions {
  now?: string;
  untitledTeamName: string;
}

export interface SavedTeamsImportResult {
  teams: SavedTeam[];
  duplicateIdCount: number;
  invalidTeamCount: number;
}

export interface SavedTeamsUnavailableSlotResult {
  teams: SavedTeam[];
  unknownSlotCount: number;
}

export type SavedTeamsImportDiagnosticCode =
  | 'SAVED_TEAMS_EMPTY_INPUT'
  | 'SAVED_TEAMS_INVALID_JSON'
  | 'SAVED_TEAMS_INVALID_SHARE_CODE'
  | 'SAVED_TEAMS_INVALID_SHARE_JSON'
  | 'SAVED_TEAMS_UNSUPPORTED_SCHEMA'
  | 'SAVED_TEAMS_INVALID_PAYLOAD'
  | 'SAVED_TEAMS_INVALID_SHARE_PAYLOAD'
  | 'SAVED_TEAMS_NO_IMPORTABLE_TEAM';

export interface SavedTeamsImportDiagnostic {
  code: SavedTeamsImportDiagnosticCode;
  recoveryKey: string;
}

const SAVED_TEAMS_IMPORT_DIAGNOSTICS: Record<
  SavedTeamsImportDiagnosticCode,
  SavedTeamsImportDiagnostic
> = {
  SAVED_TEAMS_EMPTY_INPUT: {
    code: 'SAVED_TEAMS_EMPTY_INPUT',
    recoveryKey: 'import.recovery.emptyInput',
  },
  SAVED_TEAMS_INVALID_JSON: {
    code: 'SAVED_TEAMS_INVALID_JSON',
    recoveryKey: 'import.recovery.invalidJson',
  },
  SAVED_TEAMS_INVALID_SHARE_CODE: {
    code: 'SAVED_TEAMS_INVALID_SHARE_CODE',
    recoveryKey: 'import.recovery.invalidShareCode',
  },
  SAVED_TEAMS_INVALID_SHARE_JSON: {
    code: 'SAVED_TEAMS_INVALID_SHARE_JSON',
    recoveryKey: 'import.recovery.invalidShareJson',
  },
  SAVED_TEAMS_UNSUPPORTED_SCHEMA: {
    code: 'SAVED_TEAMS_UNSUPPORTED_SCHEMA',
    recoveryKey: 'import.recovery.unsupportedSchema',
  },
  SAVED_TEAMS_INVALID_PAYLOAD: {
    code: 'SAVED_TEAMS_INVALID_PAYLOAD',
    recoveryKey: 'import.recovery.invalidPayload',
  },
  SAVED_TEAMS_INVALID_SHARE_PAYLOAD: {
    code: 'SAVED_TEAMS_INVALID_SHARE_PAYLOAD',
    recoveryKey: 'import.recovery.invalidSharePayload',
  },
  SAVED_TEAMS_NO_IMPORTABLE_TEAM: {
    code: 'SAVED_TEAMS_NO_IMPORTABLE_TEAM',
    recoveryKey: 'import.recovery.noImportableTeam',
  },
};

export class SavedTeamsImportError extends Error {
  public readonly diagnostic: SavedTeamsImportDiagnostic;
  public readonly diagnosticCode: SavedTeamsImportDiagnosticCode;

  public constructor(
    public readonly key: string,
    diagnosticCode: SavedTeamsImportDiagnosticCode = 'SAVED_TEAMS_INVALID_PAYLOAD',
  ) {
    super(key);
    this.name = 'SavedTeamsImportError';
    this.diagnostic = SAVED_TEAMS_IMPORT_DIAGNOSTICS[diagnosticCode];
    this.diagnosticCode = this.diagnostic.code;
  }
}

export function getSavedTeamsImportDiagnostic(
  code: SavedTeamsImportDiagnosticCode,
): SavedTeamsImportDiagnostic {
  return SAVED_TEAMS_IMPORT_DIAGNOSTICS[code];
}

export function resolveSavedTeamsImportDiagnostic(
  error: Error | unknown,
): SavedTeamsImportDiagnostic | null {
  return error instanceof SavedTeamsImportError ? error.diagnostic : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizePositiveInteger(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : null;
}

function normalizeTimestamp(value: unknown, fallback: string): string {
  if (typeof value !== 'string') {
    return fallback;
  }

  const normalizedValue = value.trim();

  if (!normalizedValue.length || Number.isNaN(Date.parse(normalizedValue))) {
    return fallback;
  }

  return normalizedValue;
}

function padTimestampPart(value: number): string {
  return String(value).padStart(2, '0');
}

function buildExportDate(exportedAt: string): Date {
  const parsedDate = new Date(exportedAt);

  return Number.isNaN(parsedDate.getTime()) ? new Date() : parsedDate;
}

function normalizeImportedTeamSlots(value: unknown): Array<number | null> {
  const slots = Array.isArray(value) ? value : [];

  return Array.from({ length: 6 }, (_, index) => normalizePositiveInteger(slots[index]));
}

function cloneSavedTeam(team: SavedTeam): SavedTeam {
  return {
    ...team,
    slots: Array.isArray(team.slots) ? [...team.slots] : [],
  };
}

function encodeUtf8Base64Url(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = '';

  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });

  return globalThis.btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/u, '');
}

function decodeUtf8Base64Url(value: string): string {
  const normalizedValue = value.trim();

  if (!/^[A-Za-z0-9_-]+$/u.test(normalizedValue)) {
    throw new SavedTeamsImportError(
      'import.errors.invalidShareCode',
      'SAVED_TEAMS_INVALID_SHARE_CODE',
    );
  }

  const base64Value = normalizedValue
    .replace(/-/g, '+')
    .replace(/_/g, '/')
    .padEnd(Math.ceil(normalizedValue.length / 4) * 4, '=');

  try {
    const binary = globalThis.atob(base64Value);
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));

    return new TextDecoder().decode(bytes);
  } catch {
    throw new SavedTeamsImportError(
      'import.errors.invalidShareCode',
      'SAVED_TEAMS_INVALID_SHARE_CODE',
    );
  }
}

function resolveShareUrlOrigin(): string {
  return typeof globalThis.location?.origin === 'string' ? globalThis.location.origin : '';
}

function extractShareCodeFromInput(rawContent: string): string {
  const trimmedContent = rawContent.trim();

  if (!trimmedContent.length) {
    throw new SavedTeamsImportError('import.errors.empty', 'SAVED_TEAMS_EMPTY_INPUT');
  }

  try {
    const baseUrl = resolveShareUrlOrigin() || 'http://localhost';
    const parsedUrl = new URL(trimmedContent, baseUrl);
    const queryParamValue = parsedUrl.searchParams.get(SAVED_TEAM_SHARE_QUERY_PARAM)?.trim() ?? '';

    if (queryParamValue.length) {
      return queryParamValue;
    }
  } catch {
    // Fall through and treat the input as a raw share code or query string.
  }

  if (
    trimmedContent.startsWith('?') ||
    trimmedContent.startsWith(`${SAVED_TEAM_SHARE_QUERY_PARAM}=`)
  ) {
    const queryParams = new URLSearchParams(
      trimmedContent.startsWith('?') ? trimmedContent.slice(1) : trimmedContent,
    );
    const queryParamValue = queryParams.get(SAVED_TEAM_SHARE_QUERY_PARAM)?.trim() ?? '';

    if (queryParamValue.length) {
      return queryParamValue;
    }
  }

  return trimmedContent;
}

export function buildSavedTeamsTransferPayload(
  teams: SavedTeam[],
  exportedAt = new Date().toISOString(),
): SavedTeamsTransferPayload {
  return {
    schemaVersion: 1,
    source: 'saved-teams',
    exportedAt,
    teams: teams.map((team) => cloneSavedTeam(team)),
  };
}

export function buildSavedTeamSharePayload(
  team: SavedTeam,
  exportedAt = new Date().toISOString(),
): SavedTeamSharePayload {
  return {
    schemaVersion: 1,
    source: 'saved-team-share',
    exportedAt,
    team: cloneSavedTeam(team),
  };
}

export function encodeSavedTeamSharePayload(payload: SavedTeamSharePayload): string {
  return encodeUtf8Base64Url(JSON.stringify(payload));
}

export function parseSavedTeamSharePayloadValue(parsedPayload: unknown): SavedTeamSharePayload {
  if (!isRecord(parsedPayload)) {
    throw new SavedTeamsImportError(
      'import.errors.invalidSharePayload',
      'SAVED_TEAMS_INVALID_SHARE_PAYLOAD',
    );
  }

  if (parsedPayload['schemaVersion'] !== 1 || parsedPayload['source'] !== 'saved-team-share') {
    throw new SavedTeamsImportError(
      'import.errors.unsupportedSchema',
      'SAVED_TEAMS_UNSUPPORTED_SCHEMA',
    );
  }

  if (typeof parsedPayload['exportedAt'] !== 'string' || !isRecord(parsedPayload['team'])) {
    throw new SavedTeamsImportError(
      'import.errors.invalidSharePayload',
      'SAVED_TEAMS_INVALID_SHARE_PAYLOAD',
    );
  }

  return {
    schemaVersion: 1,
    source: 'saved-team-share',
    exportedAt: parsedPayload['exportedAt'],
    team: parsedPayload['team'] as unknown as SavedTeam,
  };
}

export function decodeSavedTeamShareCode(shareCode: string): SavedTeamSharePayload {
  let parsedPayload: unknown;

  try {
    parsedPayload = JSON.parse(decodeUtf8Base64Url(shareCode)) as unknown;
  } catch (error) {
    if (error instanceof SavedTeamsImportError) {
      throw error;
    }

    throw new SavedTeamsImportError(
      'import.errors.invalidShareJson',
      'SAVED_TEAMS_INVALID_SHARE_JSON',
    );
  }

  return parseSavedTeamSharePayloadValue(parsedPayload);
}

export function parseSavedTeamShareInput(rawContent: string): SavedTeamSharePayload {
  return decodeSavedTeamShareCode(extractShareCodeFromInput(rawContent));
}

export function buildSavedTeamsTransferPayloadFromSharePayload(
  payload: SavedTeamSharePayload,
): SavedTeamsTransferPayload {
  return buildSavedTeamsTransferPayload([payload.team], payload.exportedAt);
}

export function buildSavedTeamShareUrl(
  team: SavedTeam,
  origin = resolveShareUrlOrigin(),
  exportedAt = new Date().toISOString(),
): string {
  const shareCode = encodeSavedTeamSharePayload(buildSavedTeamSharePayload(team, exportedAt));
  const sharePath = '/tabs/manual-team-builder';

  if (!origin.length) {
    return `${sharePath}?${SAVED_TEAM_SHARE_QUERY_PARAM}=${shareCode}`;
  }

  const shareUrl = new URL(sharePath, origin);

  shareUrl.searchParams.set(SAVED_TEAM_SHARE_QUERY_PARAM, shareCode);

  return shareUrl.toString();
}

export function buildSavedTeamShareCode(
  team: SavedTeam,
  exportedAt = new Date().toISOString(),
): string {
  return encodeSavedTeamSharePayload(buildSavedTeamSharePayload(team, exportedAt));
}

export function buildSavedTeamJson(team: SavedTeam): string {
  return JSON.stringify(buildSavedTeamsTransferPayload([team]), null, 2) + '\n';
}

export function buildSavedTeamsJson(teams: SavedTeam[]): string {
  return JSON.stringify(buildSavedTeamsTransferPayload(teams), null, 2) + '\n';
}

export function parseSavedTeamsImportContent(rawContent: string): SavedTeamsTransferPayload {
  const trimmedContent = rawContent.trim();

  if (!trimmedContent.length) {
    throw new SavedTeamsImportError('import.errors.empty', 'SAVED_TEAMS_EMPTY_INPUT');
  }

  if (trimmedContent.startsWith('{') || trimmedContent.startsWith('[')) {
    let parsedPayload: unknown;

    try {
      parsedPayload = JSON.parse(trimmedContent) as unknown;
    } catch {
      throw new SavedTeamsImportError('import.errors.invalidJson', 'SAVED_TEAMS_INVALID_JSON');
    }

    if (isRecord(parsedPayload) && parsedPayload['source'] === 'saved-team-share') {
      return buildSavedTeamsTransferPayloadFromSharePayload(
        parseSavedTeamSharePayloadValue(parsedPayload),
      );
    }

    return parseSavedTeamsImportPayloadValue(parsedPayload);
  }

  return buildSavedTeamsTransferPayloadFromSharePayload(parseSavedTeamShareInput(trimmedContent));
}

export function resolveSavedTeamFromShareInput(
  rawContent: string,
  options: SavedTeamsImportSanitizeOptions,
): SavedTeam {
  const sanitizedImport = sanitizeSavedTeamsImportPayload(
    buildSavedTeamsTransferPayloadFromSharePayload(parseSavedTeamShareInput(rawContent)),
    options,
  );
  const [team] = sanitizedImport.teams;

  if (!team) {
    throw new SavedTeamsImportError(
      'import.errors.noImportableTeam',
      'SAVED_TEAMS_NO_IMPORTABLE_TEAM',
    );
  }

  return cloneSavedTeam(team);
}

export function buildSavedTeamsExportFilename(exportedAt: string): string {
  const exactTimestampMatch = exportedAt.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})/);

  if (exactTimestampMatch) {
    const [, year, month, day, hours, minutes, seconds] = exactTimestampMatch;

    return `saved-teams-${year}${month}${day}-${hours}${minutes}${seconds}.json`;
  }

  const exportDate = buildExportDate(exportedAt);

  return (
    `saved-teams-${exportDate.getFullYear()}` +
    `${padTimestampPart(exportDate.getMonth() + 1)}` +
    `${padTimestampPart(exportDate.getDate())}-` +
    `${padTimestampPart(exportDate.getHours())}` +
    `${padTimestampPart(exportDate.getMinutes())}` +
    `${padTimestampPart(exportDate.getSeconds())}.json`
  );
}

export function downloadSavedTeamsExport(
  payload: SavedTeamsTransferPayload | null,
  documentRef: Document = document,
  urlRef: Pick<typeof URL, 'createObjectURL' | 'revokeObjectURL'> = URL,
): void {
  if (!payload) {
    return;
  }

  const objectUrl = urlRef.createObjectURL(
    new Blob([JSON.stringify(payload, null, 2) + '\n'], {
      type: 'application/json;charset=utf-8',
    }),
  );
  const anchor = documentRef.createElement('a');

  anchor.href = objectUrl;
  anchor.download = buildSavedTeamsExportFilename(payload.exportedAt);
  anchor.style.display = 'none';
  documentRef.body.appendChild(anchor);

  try {
    anchor.click();
  } finally {
    documentRef.body.removeChild(anchor);
    urlRef.revokeObjectURL(objectUrl);
  }
}

export function parseSavedTeamsImportPayload(rawContent: string): SavedTeamsTransferPayload {
  let parsedPayload: unknown;

  try {
    parsedPayload = JSON.parse(rawContent) as unknown;
  } catch {
    throw new SavedTeamsImportError('import.errors.invalidJson', 'SAVED_TEAMS_INVALID_JSON');
  }

  return parseSavedTeamsImportPayloadValue(parsedPayload);
}

export function parseSavedTeamsImportPayloadValue(
  parsedPayload: unknown,
): SavedTeamsTransferPayload {
  if (!isRecord(parsedPayload)) {
    throw new SavedTeamsImportError('import.errors.invalidPayload', 'SAVED_TEAMS_INVALID_PAYLOAD');
  }

  if (parsedPayload['schemaVersion'] !== 1 || parsedPayload['source'] !== 'saved-teams') {
    throw new SavedTeamsImportError(
      'import.errors.unsupportedSchema',
      'SAVED_TEAMS_UNSUPPORTED_SCHEMA',
    );
  }

  if (typeof parsedPayload['exportedAt'] !== 'string' || !Array.isArray(parsedPayload['teams'])) {
    throw new SavedTeamsImportError('import.errors.invalidPayload', 'SAVED_TEAMS_INVALID_PAYLOAD');
  }

  return {
    schemaVersion: 1,
    source: 'saved-teams',
    exportedAt: parsedPayload['exportedAt'],
    teams: parsedPayload['teams'] as SavedTeam[],
  };
}

export function sanitizeSavedTeamsImportPayload(
  payload: SavedTeamsTransferPayload,
  options: SavedTeamsImportSanitizeOptions,
): SavedTeamsImportResult {
  const fallbackTimestamp = normalizeTimestamp(
    payload.exportedAt,
    options.now ?? new Date().toISOString(),
  );
  const sanitizedTeams = new Map<string, SavedTeam>();
  let invalidTeamCount = 0;
  let duplicateIdCount = 0;

  payload.teams.forEach((team) => {
    if (!isRecord(team)) {
      invalidTeamCount += 1;
      return;
    }

    const normalizedTeamId = typeof team['id'] === 'string' ? team['id'].trim() : '';

    if (!normalizedTeamId.length) {
      invalidTeamCount += 1;
      return;
    }

    const sanitizedTeam: SavedTeam = {
      id: normalizedTeamId,
      name:
        typeof team['name'] === 'string' && team['name'].trim().length
          ? team['name'].trim()
          : options.untitledTeamName,
      notes: typeof team['notes'] === 'string' ? team['notes'].trim() : '',
      shipId: normalizePositiveInteger(team['shipId']),
      slots: normalizeImportedTeamSlots(team['slots']),
      createdAt: normalizeTimestamp(team['createdAt'], fallbackTimestamp),
      updatedAt: normalizeTimestamp(team['updatedAt'], fallbackTimestamp),
    };

    if (sanitizedTeams.has(sanitizedTeam.id)) {
      duplicateIdCount += 1;
      sanitizedTeams.delete(sanitizedTeam.id);
    }

    sanitizedTeams.set(sanitizedTeam.id, sanitizedTeam);
  });

  return {
    teams: [...sanitizedTeams.values()],
    duplicateIdCount,
    invalidTeamCount,
  };
}

export function clearUnavailableSavedTeamSlots(
  teams: SavedTeam[],
  availableCharacterIds: Set<number>,
): SavedTeamsUnavailableSlotResult {
  let unknownSlotCount = 0;

  return {
    teams: teams.map((team) => ({
      ...team,
      slots: team.slots.map((slotId) => {
        if (typeof slotId !== 'number') {
          return null;
        }

        if (availableCharacterIds.has(slotId)) {
          return slotId;
        }

        unknownSlotCount += 1;
        return null;
      }),
    })),
    unknownSlotCount,
  };
}
