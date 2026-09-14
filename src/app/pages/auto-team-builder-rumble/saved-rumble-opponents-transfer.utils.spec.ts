import { describe, expect, it } from 'vitest';

import { countSavedRumbleOpponentSlots } from '../../core/models/saved-rumble-opponent.models';
import {
  buildSavedRumbleOpponentsTransferPayload,
  parseSavedRumbleOpponentsImportPayloadValue,
  sanitizeSavedRumbleOpponentsImportPayload,
  SavedRumbleOpponentsImportError,
} from './saved-rumble-opponents-transfer.utils';

function createOpponent(overrides: Record<string, unknown> = {}) {
  return {
    id: 'rumble-opponent-1',
    name: 'Season 12 wall',
    activeCharacterIds: [4208, null, 4209],
    benchCharacterIds: [5601, null],
    createdAt: '2026-09-14T00:00:00.000Z',
    updatedAt: '2026-09-14T00:00:00.000Z',
    ...overrides,
  };
}

describe('saved rumble opponents transfer', () => {
  it('round-trips an opponent with its empty slots in place', () => {
    const opponent = createOpponent();
    const payload = buildSavedRumbleOpponentsTransferPayload(
      [opponent],
      '2026-09-14T00:00:00.000Z',
    );
    const restored = sanitizeSavedRumbleOpponentsImportPayload(
      parseSavedRumbleOpponentsImportPayloadValue(JSON.parse(JSON.stringify(payload))),
    );

    expect(restored.opponents).toHaveLength(1);
    expect(restored.opponents[0]).toEqual(opponent);
  });

  it('keeps the nulls, because the slots are positional', () => {
    /*
     * 869f12x45. Dropping empty slots would move every later character into the
     * wrong position - the opponent would still have the right units and would
     * be facing them in the wrong places, which is worse than losing it.
     */
    const payload = buildSavedRumbleOpponentsTransferPayload([createOpponent()]);

    expect(payload.opponents[0].activeCharacterIds).toEqual([4208, null, 4209]);
    expect(payload.opponents[0].benchCharacterIds).toEqual([5601, null]);
  });

  it('deep-clones, so a later edit cannot reach into an exported payload', () => {
    const opponent = createOpponent();
    const payload = buildSavedRumbleOpponentsTransferPayload([opponent]);

    opponent.activeCharacterIds[0] = 9999;

    expect(payload.opponents[0].activeCharacterIds[0]).toBe(4208);
  });

  it('counts only the characters a reader actually entered', () => {
    expect(countSavedRumbleOpponentSlots(createOpponent())).toBe(3);
    expect(
      countSavedRumbleOpponentSlots(
        createOpponent({ activeCharacterIds: [null, null], benchCharacterIds: [] }),
      ),
    ).toBe(0);
  });

  it('drops a repeated id instead of forking the opponent', () => {
    const result = sanitizeSavedRumbleOpponentsImportPayload({
      schemaVersion: 1,
      source: 'saved-rumble-opponents',
      exportedAt: '2026-09-14T00:00:00.000Z',
      opponents: [createOpponent({ name: 'First' }), createOpponent({ name: 'Second' })] as never,
      });

    expect(result.duplicateIdCount).toBe(1);
    expect(result.opponents.map((opponent) => opponent.name)).toEqual(['First']);
  });

  it('counts entries that are not opponents at all', () => {
    const result = sanitizeSavedRumbleOpponentsImportPayload({
      schemaVersion: 1,
      source: 'saved-rumble-opponents',
      exportedAt: '2026-09-14T00:00:00.000Z',
      opponents: [null, 'nope', { name: '   ' }, createOpponent()] as never,
    });

    expect(result.invalidOpponentCount).toBe(3);
    expect(result.opponents).toHaveLength(1);
  });

  it('rejects another format by key, so the copy stays translatable', () => {
    expect(() =>
      parseSavedRumbleOpponentsImportPayloadValue({
        schemaVersion: 1,
        source: 'saved-rumble-teams',
        exportedAt: '2026-09-14T00:00:00.000Z',
        opponents: [],
      }),
    ).toThrowError(SavedRumbleOpponentsImportError);

    try {
      parseSavedRumbleOpponentsImportPayloadValue({
        schemaVersion: 2,
        source: 'saved-rumble-opponents',
      });
    } catch (error) {
      expect((error as SavedRumbleOpponentsImportError).key).toBe(
        'management.savedRumbleOpponents.errors.unsupportedSchema',
      );
    }
  });
});
