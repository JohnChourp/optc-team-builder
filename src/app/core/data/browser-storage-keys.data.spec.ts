import { describe, expect, it } from 'vitest';

import { ALL_DATA_TRANSFER_SCOPES } from '../../pages/settings/all-data-transfer.utils';
import {
  BROWSER_STORAGE_KEYS,
  durableStorageKeys,
  neverExportedStorageKeys,
  NON_STORAGE_KEY_CONSTANTS,
} from './browser-storage-keys.data';

/**
 * The binding that makes "durable means exported" a fact rather than an
 * intention.
 *
 * 869f12x56. `crewForgeImageProfiles` was durable user data that the full-data
 * export had never heard of, and nothing in the codebase could notice: the
 * export knew its seven scopes, the storage layer knew its keys, and the two
 * lists had no relationship. This is that relationship.
 *
 * It lives in a spec rather than in `check-browser-storage-keys.mjs` on purpose
 * - the scope list is TypeScript the app imports, so a spec can compare the two
 * by value instead of by parsing either one.
 */
describe('browser storage key registry', () => {
  it('gives every durable key an export scope that really exists', () => {
    const scopes = new Set<string>(ALL_DATA_TRANSFER_SCOPES);

    expect(durableStorageKeys().length).toBeGreaterThan(5);

    for (const record of durableStorageKeys()) {
      expect(record.exportedAs, `${record.key} names an export scope`).toBeTypeOf('string');
      expect(scopes, `${record.key} -> ${record.exportedAs} is a real scope`).toContain(
        record.exportedAs,
      );
    }
  });

  it('gives every export scope at least one durable key', () => {
    /*
     * The other direction, and the one that catches a scope the storage layer
     * stopped writing: an export that carries a section nothing produces looks
     * complete and restores nothing.
     */
    const claimed = new Set(durableStorageKeys().map((record) => record.exportedAs));

    for (const scope of ALL_DATA_TRANSFER_SCOPES) {
      expect(claimed, `${scope} is produced by some storage key`).toContain(scope);
    }
  });

  it('never lets a non-durable key claim an export scope', () => {
    for (const record of neverExportedStorageKeys()) {
      expect(record.exportedAs, `${record.key} is ${record.classification}`).toBeUndefined();
    }
  });

  it('keeps credentials out of anything that leaves the device', () => {
    const credentials = BROWSER_STORAGE_KEYS.filter(
      (record) => record.classification === 'credential',
    );

    expect(credentials.length).toBeGreaterThan(0);

    for (const record of credentials) {
      expect(record.exportedAs).toBeUndefined();
      expect(record.backend, 'a credential is not a Capacitor preference').not.toBe('preferences');
    }
  });

  it('spells every key exactly once', () => {
    const keys = BROWSER_STORAGE_KEYS.map((record) => record.key);

    expect(new Set(keys).size, 'two records would fight over one key').toBe(keys.length);

    const constants = BROWSER_STORAGE_KEYS.map((record) => record.constantName);

    expect(new Set(constants).size).toBe(constants.length);
  });

  it('keeps the registry and the not-storage list disjoint', () => {
    const registered = new Set(BROWSER_STORAGE_KEYS.map((record) => record.constantName));

    for (const entry of NON_STORAGE_KEY_CONSTANTS) {
      expect(registered, `${entry.constantName} cannot be both`).not.toContain(entry.constantName);
      expect(entry.reason.length).toBeGreaterThan(20);
    }
  });

  it('holds the two keys whose absence from the export started this', () => {
    const crewForge = BROWSER_STORAGE_KEYS.filter((record) =>
      record.key.startsWith('crewForge'),
    );

    expect(crewForge).toHaveLength(2);

    for (const record of crewForge) {
      expect(record.classification).toBe('durable-user-data');
      expect(record.exportedAs).toBe('crewForgeProfiles');
    }
  });

  it('classifies every record as one of the four kinds', () => {
    const kinds = new Set([
      'durable-user-data',
      'device-preference',
      'transient-ui-state',
      'credential',
    ]);

    for (const record of BROWSER_STORAGE_KEYS) {
      expect(kinds, `${record.key} has a known classification`).toContain(record.classification);
      expect(['preferences', 'local', 'session']).toContain(record.backend);
    }
  });
});
