import { type SavedTeam } from '../models/optc.models';

export const SAVED_TEAM_AUDIT_LOG_MAX_ENTRIES = 200;

export type SavedTeamAuditAction = 'create' | 'update' | 'delete';

export type SavedTeamAuditFieldChange =
  | 'name'
  | 'shipId'
  | 'slots'
  | 'notesLength';

export interface SavedTeamAuditEntry {
  id: string;
  timestamp: string;
  teamId: string;
  teamName: string;
  action: SavedTeamAuditAction;
  actorId: string | null;
  changedFields: SavedTeamAuditFieldChange[];
  slotsBefore: Array<number | null> | null;
  slotsAfter: Array<number | null> | null;
  shipIdBefore: number | null;
  shipIdAfter: number | null;
  notesLengthBefore: number | null;
  notesLengthAfter: number | null;
}

export interface SavedTeamAuditDiffInput {
  previous: readonly SavedTeam[];
  next: readonly SavedTeam[];
  timestamp: string;
  actorId?: string | null;
  idFactory: () => string;
}

export interface SavedTeamAuditAppendOptions {
  maxEntries?: number;
}

function indexById(teams: readonly SavedTeam[]): Map<string, SavedTeam> {
  const map = new Map<string, SavedTeam>();

  teams.forEach((team) => {
    if (team && typeof team.id === 'string' && team.id.length > 0) {
      map.set(team.id, team);
    }
  });

  return map;
}

function arraysEqual(left: Array<number | null>, right: Array<number | null>): boolean {
  if (left.length !== right.length) {
    return false;
  }

  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) {
      return false;
    }
  }

  return true;
}

function resolveNotesLength(notes: string | null | undefined): number {
  return typeof notes === 'string' ? notes.length : 0;
}

function detectChangedFields(before: SavedTeam, after: SavedTeam): SavedTeamAuditFieldChange[] {
  const changes: SavedTeamAuditFieldChange[] = [];

  if (before.name !== after.name) {
    changes.push('name');
  }

  if (before.shipId !== after.shipId) {
    changes.push('shipId');
  }

  if (!arraysEqual(before.slots, after.slots)) {
    changes.push('slots');
  }

  if (resolveNotesLength(before.notes) !== resolveNotesLength(after.notes)) {
    changes.push('notesLength');
  }

  return changes;
}

export function diffSavedTeams(input: SavedTeamAuditDiffInput): SavedTeamAuditEntry[] {
  const previousById = indexById(input.previous);
  const nextById = indexById(input.next);
  const entries: SavedTeamAuditEntry[] = [];
  const actorId = typeof input.actorId === 'string' && input.actorId.length ? input.actorId : null;

  nextById.forEach((team, id) => {
    const previous = previousById.get(id);

    if (!previous) {
      entries.push({
        id: input.idFactory(),
        timestamp: input.timestamp,
        teamId: id,
        teamName: team.name,
        action: 'create',
        actorId,
        changedFields: ['name', 'shipId', 'slots', 'notesLength'].filter((field) => {
          if (field === 'notesLength') {
            return resolveNotesLength(team.notes) > 0;
          }

          return true;
        }) as SavedTeamAuditFieldChange[],
        slotsBefore: null,
        slotsAfter: [...team.slots],
        shipIdBefore: null,
        shipIdAfter: team.shipId,
        notesLengthBefore: null,
        notesLengthAfter: resolveNotesLength(team.notes),
      });

      return;
    }

    const changedFields = detectChangedFields(previous, team);

    if (!changedFields.length) {
      return;
    }

    entries.push({
      id: input.idFactory(),
      timestamp: input.timestamp,
      teamId: id,
      teamName: team.name,
      action: 'update',
      actorId,
      changedFields,
      slotsBefore: changedFields.includes('slots') ? [...previous.slots] : null,
      slotsAfter: changedFields.includes('slots') ? [...team.slots] : null,
      shipIdBefore: changedFields.includes('shipId') ? previous.shipId : null,
      shipIdAfter: changedFields.includes('shipId') ? team.shipId : null,
      notesLengthBefore: changedFields.includes('notesLength')
        ? resolveNotesLength(previous.notes)
        : null,
      notesLengthAfter: changedFields.includes('notesLength')
        ? resolveNotesLength(team.notes)
        : null,
    });
  });

  previousById.forEach((team, id) => {
    if (nextById.has(id)) {
      return;
    }

    entries.push({
      id: input.idFactory(),
      timestamp: input.timestamp,
      teamId: id,
      teamName: team.name,
      action: 'delete',
      actorId,
      changedFields: [],
      slotsBefore: [...team.slots],
      slotsAfter: null,
      shipIdBefore: team.shipId,
      shipIdAfter: null,
      notesLengthBefore: resolveNotesLength(team.notes),
      notesLengthAfter: null,
    });
  });

  return entries;
}

export function appendAuditEntries(
  currentLog: readonly SavedTeamAuditEntry[],
  entries: readonly SavedTeamAuditEntry[],
  options: SavedTeamAuditAppendOptions = {},
): SavedTeamAuditEntry[] {
  if (!entries.length) {
    return [...currentLog];
  }

  const maxEntries = Math.max(0, options.maxEntries ?? SAVED_TEAM_AUDIT_LOG_MAX_ENTRIES);
  const combined = [...entries, ...currentLog];

  return maxEntries > 0 ? combined.slice(0, maxEntries) : combined;
}

export function normalizeAuditEntry(value: unknown): SavedTeamAuditEntry | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  const record = value as Record<string, unknown>;
  const rawId = record['id'];
  const rawTeamId = record['teamId'];
  const rawTimestamp = record['timestamp'];
  const id = typeof rawId === 'string' && rawId.trim().length ? rawId : null;
  const teamId = typeof rawTeamId === 'string' && rawTeamId.trim().length ? rawTeamId : null;
  const timestamp = typeof rawTimestamp === 'string' ? rawTimestamp : null;
  const action = record['action'];

  if (!id || !teamId || !timestamp) {
    return null;
  }

  if (action !== 'create' && action !== 'update' && action !== 'delete') {
    return null;
  }

  const rawTeamName = record['teamName'];
  const rawActorId = record['actorId'];
  const teamName = typeof rawTeamName === 'string' ? rawTeamName : '';
  const actorId = typeof rawActorId === 'string' && rawActorId.length ? rawActorId : null;
  const rawChangedFields = record['changedFields'];

  const changedFields = Array.isArray(rawChangedFields)
    ? (rawChangedFields.filter(
        (field): field is SavedTeamAuditFieldChange =>
          field === 'name' || field === 'shipId' || field === 'slots' || field === 'notesLength',
      ) as SavedTeamAuditFieldChange[])
    : [];

  return {
    id,
    timestamp,
    teamId,
    teamName,
    action,
    actorId,
    changedFields,
    slotsBefore: normalizeSlotArray(record['slotsBefore']),
    slotsAfter: normalizeSlotArray(record['slotsAfter']),
    shipIdBefore: normalizeShipId(record['shipIdBefore']),
    shipIdAfter: normalizeShipId(record['shipIdAfter']),
    notesLengthBefore: normalizeNonNegativeInteger(record['notesLengthBefore']),
    notesLengthAfter: normalizeNonNegativeInteger(record['notesLengthAfter']),
  };
}

export function normalizeAuditLog(value: unknown): SavedTeamAuditEntry[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => normalizeAuditEntry(entry))
    .filter((entry): entry is SavedTeamAuditEntry => entry !== null);
}

function normalizeSlotArray(value: unknown): Array<number | null> | null {
  if (!Array.isArray(value)) {
    return null;
  }

  return value.map((entry) => {
    if (typeof entry !== 'number' || !Number.isInteger(entry) || entry <= 0) {
      return null;
    }

    return entry;
  });
}

function normalizeShipId(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : null;
}

function normalizeNonNegativeInteger(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : null;
}
