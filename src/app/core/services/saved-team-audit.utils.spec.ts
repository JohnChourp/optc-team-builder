import { describe, expect, it } from 'vitest';

import { type SavedTeam } from '../models/optc.models';
import {
  SAVED_TEAM_AUDIT_LOG_MAX_ENTRIES,
  appendAuditEntries,
  diffSavedTeams,
  normalizeAuditLog,
} from './saved-team-audit.utils';

function createTeam(overrides: Partial<SavedTeam> = {}): SavedTeam {
  return {
    id: overrides.id ?? 'team-1',
    name: overrides.name ?? 'Whitebeard',
    notes: overrides.notes ?? '',
    shipId: overrides.shipId ?? null,
    slots: overrides.slots ?? [1, 2, 3, 4, 5, 6],
    createdAt: overrides.createdAt ?? '2026-05-18T10:00:00.000Z',
    updatedAt: overrides.updatedAt ?? '2026-05-18T10:00:00.000Z',
  };
}

function createIdFactory() {
  let counter = 0;

  return () => `entry-${(counter += 1)}`;
}

describe('diffSavedTeams', () => {
  it('emits a create entry for new teams with slot and ship snapshots', () => {
    const entries = diffSavedTeams({
      previous: [],
      next: [createTeam({ id: 'a', slots: [10, null, null, null, null, null], shipId: 5 })],
      timestamp: '2026-05-18T11:00:00.000Z',
      idFactory: createIdFactory(),
    });

    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      action: 'create',
      teamId: 'a',
      shipIdAfter: 5,
      slotsAfter: [10, null, null, null, null, null],
    });
    expect(entries[0].slotsBefore).toBeNull();
  });

  it('emits an update entry only when content actually changed', () => {
    const before = createTeam({ id: 'a', slots: [1, 2, 3, 4, 5, 6], name: 'Old' });
    const after = createTeam({
      id: 'a',
      slots: [1, 2, 3, 4, 5, 9],
      name: 'New',
      notes: 'hello',
    });

    const entries = diffSavedTeams({
      previous: [before],
      next: [after],
      timestamp: '2026-05-18T11:30:00.000Z',
      idFactory: createIdFactory(),
    });

    expect(entries).toHaveLength(1);
    expect(entries[0].action).toBe('update');
    expect(entries[0].changedFields.sort()).toEqual(['name', 'notesLength', 'slots'].sort());
    expect(entries[0].slotsBefore).toEqual([1, 2, 3, 4, 5, 6]);
    expect(entries[0].slotsAfter).toEqual([1, 2, 3, 4, 5, 9]);
    expect(entries[0].notesLengthBefore).toBe(0);
    expect(entries[0].notesLengthAfter).toBe(5);
  });

  it('emits no entries when nothing changes', () => {
    const team = createTeam({ id: 'a' });
    const entries = diffSavedTeams({
      previous: [team],
      next: [team],
      timestamp: '2026-05-18T11:30:00.000Z',
      idFactory: createIdFactory(),
    });

    expect(entries).toEqual([]);
  });

  it('emits a delete entry with the previous snapshot when a team is removed', () => {
    const removed = createTeam({ id: 'gone', slots: [7, 8, 9, null, null, null] });
    const entries = diffSavedTeams({
      previous: [removed],
      next: [],
      timestamp: '2026-05-18T12:00:00.000Z',
      idFactory: createIdFactory(),
    });

    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      action: 'delete',
      teamId: 'gone',
      slotsBefore: [7, 8, 9, null, null, null],
    });
    expect(entries[0].slotsAfter).toBeNull();
  });

  it('does not embed notes content in audit entries', () => {
    const previous = createTeam({ id: 'a', notes: 'secret notes' });
    const next = createTeam({ id: 'a', notes: 'updated secret notes' });

    const entries = diffSavedTeams({
      previous: [previous],
      next: [next],
      timestamp: '2026-05-18T12:30:00.000Z',
      idFactory: createIdFactory(),
    });

    const serialized = JSON.stringify(entries);

    expect(serialized).not.toContain('secret notes');
    expect(serialized).not.toContain('updated secret notes');
  });
});

describe('appendAuditEntries', () => {
  it('prepends new entries and respects the maxEntries cap', () => {
    const initialLog = Array.from({ length: 3 }, (_value, index) => ({
      id: `existing-${index}`,
      timestamp: '2026-05-17T00:00:00.000Z',
      teamId: 't',
      teamName: 't',
      action: 'update' as const,
      actorId: null,
      changedFields: [],
      slotsBefore: null,
      slotsAfter: null,
      shipIdBefore: null,
      shipIdAfter: null,
      notesLengthBefore: null,
      notesLengthAfter: null,
    }));

    const fresh = diffSavedTeams({
      previous: [],
      next: [createTeam({ id: 'a' })],
      timestamp: '2026-05-18T11:00:00.000Z',
      idFactory: createIdFactory(),
    });

    const combined = appendAuditEntries(initialLog, fresh, { maxEntries: 3 });

    expect(combined).toHaveLength(3);
    expect(combined[0].id).toBe(fresh[0].id);
    expect(combined.at(-1)?.id).toBe('existing-1');
  });

  it('defaults to SAVED_TEAM_AUDIT_LOG_MAX_ENTRIES', () => {
    const initialLog = Array.from({ length: SAVED_TEAM_AUDIT_LOG_MAX_ENTRIES }, (_v, index) => ({
      id: `e-${index}`,
      timestamp: '2026-05-17T00:00:00.000Z',
      teamId: 't',
      teamName: 't',
      action: 'update' as const,
      actorId: null,
      changedFields: [],
      slotsBefore: null,
      slotsAfter: null,
      shipIdBefore: null,
      shipIdAfter: null,
      notesLengthBefore: null,
      notesLengthAfter: null,
    }));

    const fresh = diffSavedTeams({
      previous: [],
      next: [createTeam({ id: 'a' })],
      timestamp: '2026-05-18T12:00:00.000Z',
      idFactory: createIdFactory(),
    });

    const combined = appendAuditEntries(initialLog, fresh);

    expect(combined).toHaveLength(SAVED_TEAM_AUDIT_LOG_MAX_ENTRIES);
    expect(combined[0].id).toBe(fresh[0].id);
  });
});

describe('normalizeAuditLog', () => {
  it('drops entries with malformed shapes and keeps valid ones', () => {
    const log = normalizeAuditLog([
      null,
      'not-an-object',
      { id: 'good', timestamp: '2026-05-18T00:00:00.000Z', teamId: 't', action: 'create' },
      { id: 'bad-action', timestamp: '2026-05-18T00:00:00.000Z', teamId: 't', action: 'fly' },
      {
        id: 'with-slots',
        timestamp: '2026-05-18T00:00:00.000Z',
        teamId: 't',
        action: 'update',
        slotsBefore: [1, 0, 'x', 5, null, null],
      },
    ]);

    expect(log).toHaveLength(2);
    expect(log[0].id).toBe('good');
    expect(log[1].slotsBefore).toEqual([1, null, null, 5, null, null]);
  });
});
