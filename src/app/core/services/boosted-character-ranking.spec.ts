import { describe, expect, it } from 'vitest';

import { normalizeBoostedCharacterIds } from './user-state.service';
import {
  buildBoostedCharactersTransferPayload,
  parseBoostedCharactersTransferPayload,
} from '../../pages/auto-team-builder/boosted-characters-transfer.utils';

/**
 * 869f1q90b. The manual boost list: what it accepts, and what it refuses.
 *
 * The ranking term itself is exercised by the engine spec; this covers the list that feeds it,
 * because a boost list quietly changes which characters the builder prefers and a half-read one
 * would show the reader different teams with nothing on screen to explain why.
 */
describe('boosted character list', () => {
  describe('normalising', () => {
    it('keeps the reader order, because they add units as they read the event screen', () => {
      expect(normalizeBoostedCharacterIds([300, 100, 200])).toEqual([300, 100, 200]);
    });

    it('drops duplicates', () => {
      expect(normalizeBoostedCharacterIds([100, 200, 100])).toEqual([100, 200]);
    });

    it.each([
      ['a non-array', 'nope'],
      ['null', null],
      ['undefined', undefined],
    ])('returns nothing for %s', (_label, value) => {
      expect(normalizeBoostedCharacterIds(value)).toEqual([]);
    });

    it.each([
      ['a string id', ['100']],
      ['a fractional id', [1.5]],
      ['zero', [0]],
      ['a negative id', [-3]],
      ['null inside the list', [null]],
    ])('drops %s rather than repairing it', (_label, value) => {
      expect(normalizeBoostedCharacterIds(value)).toEqual([]);
    });

    it('keeps the good ids when only some are bad', () => {
      expect(normalizeBoostedCharacterIds([100, '200', 300, null])).toEqual([100, 300]);
    });
  });

  describe('the transfer payload', () => {
    it('round-trips through JSON', () => {
      const payload = buildBoostedCharactersTransferPayload([300, 100], '2026-09-14T10:00:00.000Z');

      expect(payload).toMatchObject({
        schemaVersion: 1,
        source: 'boosted-characters',
        exportedAt: '2026-09-14T10:00:00.000Z',
        characterIds: [300, 100],
      });

      const parsed = parseBoostedCharactersTransferPayload(JSON.parse(JSON.stringify(payload)));

      expect(parsed?.characterIds).toEqual([300, 100]);
    });

    it('normalises on the way in as well as on the way out', () => {
      expect(
        parseBoostedCharactersTransferPayload({
          schemaVersion: 1,
          source: 'boosted-characters',
          exportedAt: '2026-09-14T10:00:00.000Z',
          characterIds: [100, '200', 100, -1],
        })?.characterIds,
      ).toEqual([100]);
    });

    it.each([
      ['not an object', 'nope'],
      ['null', null],
      ['a wrong schema version', { schemaVersion: 2, source: 'boosted-characters', characterIds: [] }],
      ['a wrong source', { schemaVersion: 1, source: 'favorites', characterIds: [] }],
      ['no character list', { schemaVersion: 1, source: 'boosted-characters' }],
    ])('refuses %s', (_label, value) => {
      expect(parseBoostedCharactersTransferPayload(value)).toBeNull();
    });

    it('survives a missing exportedAt rather than refusing the list', () => {
      expect(
        parseBoostedCharactersTransferPayload({
          schemaVersion: 1,
          source: 'boosted-characters',
          characterIds: [100],
        })?.characterIds,
      ).toEqual([100]);
    });
  });
});
