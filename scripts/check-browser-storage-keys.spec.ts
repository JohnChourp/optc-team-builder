import { globSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  collectKeyConstants,
  collectStorageUsage,
  formatBrowserStorageKeysResult,
  inspectBrowserStorageKeys,
} from './check-browser-storage-keys.mjs';
import { readNonStorageConstants, readStorageRegistry } from './lib/browser-storage-registry.mjs';

const projectRoot = path.resolve(import.meta.dirname, '..');
const files = globSync('src/**/*.ts', { cwd: projectRoot })
  .map((file) => file.split(path.sep).join('/'))
  .filter((file) => !file.endsWith('.spec.ts'));
const readFile = (file: string) => readFileSync(path.join(projectRoot, file), 'utf8');
const constants = collectKeyConstants(files, readFile);
const usage = collectStorageUsage(files, readFile, [...constants.keys()]);
const registry = readStorageRegistry(projectRoot);
const nonStorage = readNonStorageConstants(projectRoot);

const drop = (constantName: string) =>
  registry.filter((record) => record.constantName !== constantName);
const edit = (constantName: string, patch: Record<string, unknown>) =>
  registry.map((record) => (record.constantName === constantName ? { ...record, ...patch } : record));

/**
 * Proven against broken trees.
 *
 * 869f12x56. The case that matters most is M1: it reconstructs the world before
 * 869f12x4p, where `crewForgeImageProfiles` was written to storage and no
 * registry knew it existed - which is exactly how a whole category of a
 * reader's data stayed out of the full-data export.
 */
describe('browser storage key guard', () => {
  it('accepts the repository as it stands', () => {
    const result = inspectBrowserStorageKeys({ registry, nonStorage, constants, usage });

    expect(result.errors).toEqual([]);
    expect(result.registeredCount).toBeGreaterThan(15);
    expect(result.nonStorageCount).toBeGreaterThan(0);
    expect(formatBrowserStorageKeysResult(result)).toContain('declared not-storage');
  });

  it('finds every *_KEY constant and which storage each reaches', () => {
    expect(constants.has('SAVED_TEAMS_KEY')).toBe(true);
    expect([...(usage.get('SAVED_TEAMS_KEY') ?? [])]).toContain('preferences');
    expect([...(usage.get('CAPTAIN_COVERAGE_TEAM_DRAFT_KEY') ?? [])]).toContain('session');
    /*
     * `unresolved`, not `local`, and that is the honest answer. This key is
     * written through `storage.setItem(...)` where `storage` is a local alias
     * for `window.localStorage`, so the backend cannot be read from the call
     * site. What matters is that it is SEEN at all: the first version of the
     * detector matched only the literal `localStorage.` spelling and missed a
     * credential entirely, so an unregistered key written that way would have
     * slipped past registration. Registration is enforced for these; only the
     * backend-equality check is skipped, and the registry states the backend.
     */
    expect([...(usage.get('GOOGLE_ACCOUNT_SESSION_KEY') ?? [])]).toContain('unresolved');
    expect(usage.has('EXTRA_DROP_ANY_ABILITY_KEY'), 'an ability tag reaches no storage').toBe(false);
    expect(usage.has('SHIP_THUMBNAIL_PACK_KEY'), 'an asset-pack id reaches no storage').toBe(false);
  });

  it('goes red when a key is written to storage and registered nowhere', () => {
    const result = inspectBrowserStorageKeys({
      registry: drop('CREW_FORGE_IMAGE_PROFILES_KEY'),
      nonStorage,
      constants,
      usage,
    });

    expect(result.errors.join('\n')).toContain('CREW_FORGE_IMAGE_PROFILES_KEY');
    expect(result.errors.join('\n')).toContain('no way to know what it holds');
  });

  it('sees a key written through an aliased Storage, and still demands registration', () => {
    /*
     * The regression this closes: `GOOGLE_ACCOUNT_SESSION_KEY` is a credential
     * written via a local alias, and the original detector could not see it.
     * Dropping it from the registry must still fail.
     */
    const result = inspectBrowserStorageKeys({
      registry: drop('GOOGLE_ACCOUNT_SESSION_KEY'),
      nonStorage,
      constants,
      usage,
    });

    expect(result.errors.join('\n')).toContain('GOOGLE_ACCOUNT_SESSION_KEY');
    expect(result.errors.join('\n')).toContain('is not in');
  });

  it('goes red when durable data names no export scope', () => {
    const result = inspectBrowserStorageKeys({
      registry: edit('SAVED_TEAMS_KEY', { exportedAs: undefined }),
      nonStorage,
      constants,
      usage,
    });

    expect(result.errors.join('\n')).toContain('names no export scope');
  });

  it('goes red when a credential claims an export scope', () => {
    const result = inspectBrowserStorageKeys({
      registry: edit('GOOGLE_ACCOUNT_SESSION_KEY', { exportedAs: 'savedTeams' }),
      nonStorage,
      constants,
      usage,
    });

    expect(result.errors.join('\n')).toContain('must never travel in a file');
  });

  it('goes red when the registered backend is not where the key really lives', () => {
    const result = inspectBrowserStorageKeys({
      registry: edit('SAVED_TEAMS_KEY', { backend: 'session' }),
      nonStorage,
      constants,
      usage,
    });

    expect(result.errors.join('\n')).toContain('is registered as session storage but is used with');
  });

  it('goes red when a new key breaks its backend convention', () => {
    const result = inspectBrowserStorageKeys({
      registry: edit('BUILDER_INTRO_DISMISSED_KEY', { key: 'builder_intro_dismissed' }),
      nonStorage,
      constants,
      usage,
    });

    expect(result.errors.join('\n')).toContain('does not follow the preferences convention');
  });

  it('leaves the legacy spellings alone', () => {
    /*
     * `optc_google_account_session` and `social_login_oauth_pending` break the
     * convention and must keep doing so: renaming a key is silent data loss for
     * every reader who already has one, and there is no migration that makes it
     * otherwise. The guard has to tolerate them while still rejecting a NEW one.
     */
    const legacy = registry.filter((record) => record.legacySpelling === true);

    expect(legacy.length).toBeGreaterThan(2);

    const result = inspectBrowserStorageKeys({ registry, nonStorage, constants, usage });

    expect(result.errors).toEqual([]);
  });

  it('goes red when the registry names a constant that is gone', () => {
    const result = inspectBrowserStorageKeys({
      registry: [
        ...registry,
        {
          key: 'ghostKey',
          constantName: 'GHOST_KEY',
          owner: 'src/app/nowhere.ts',
          backend: 'preferences',
          classification: 'transient-ui-state',
          note: 'A key that does not exist anywhere in the source at all.',
        },
      ],
      nonStorage,
      constants,
      usage,
    });

    expect(result.errors.join('\n')).toContain('no longer exists in src/');
  });

  it('goes red when the not-storage list claims a real storage key', () => {
    const result = inspectBrowserStorageKeys({
      registry: drop('SAVED_TEAMS_KEY'),
      nonStorage: [...nonStorage, { constantName: 'SAVED_TEAMS_KEY', reason: 'Claimed not to be storage.' }],
      constants,
      usage,
    });

    expect(result.errors.join('\n')).toContain('is listed as not-storage but is written to');
  });

  it('rejects a placeholder note', () => {
    const result = inspectBrowserStorageKeys({
      registry: edit('SAVED_TEAMS_KEY', { note: 'stuff' }),
      nonStorage,
      constants,
      usage,
    });

    expect(result.errors.join('\n')).toContain('needs a real note');
  });

  it('reports an unreadable registry instead of passing on nothing', () => {
    const result = inspectBrowserStorageKeys({
      registry: [],
      nonStorage: [],
      constants: new Map(),
      usage: new Map(),
    });

    expect(result.errors.join('\n')).toContain('No records found');
    expect(result.errors.join('\n')).toContain('No *_KEY constants found');
  });
});
