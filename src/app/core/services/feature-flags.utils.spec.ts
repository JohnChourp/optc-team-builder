import { beforeEach, describe, expect, it } from 'vitest';

import {
  DEFAULT_FEATURE_FLAGS,
  FEATURE_FLAG_STORAGE_KEY,
  type FeatureFlagStorage,
  clearAllFeatureFlagOverrides,
  clearFeatureFlagOverride,
  isFeatureEnabled,
  readFeatureFlagOverrides,
  resolveFeatureFlags,
  setFeatureFlagOverride,
} from './feature-flags.utils';

function createMemoryStorage(initial: Record<string, string> = {}): FeatureFlagStorage & {
  __data: Map<string, string>;
} {
  const data = new Map<string, string>(Object.entries(initial));

  return {
    __data: data,
    getItem(key) {
      return data.has(key) ? (data.get(key) as string) : null;
    },
    setItem(key, value) {
      data.set(key, value);
    },
    removeItem(key) {
      data.delete(key);
    },
  };
}

describe('feature flag overrides', () => {
  let storage: ReturnType<typeof createMemoryStorage>;

  beforeEach(() => {
    storage = createMemoryStorage();
  });

  it('returns defaults when no overrides are stored', () => {
    const flags = resolveFeatureFlags(storage);

    expect(flags).toEqual(DEFAULT_FEATURE_FLAGS);
  });

  it('merges stored overrides over defaults', () => {
    storage.__data.set(
      FEATURE_FLAG_STORAGE_KEY,
      JSON.stringify({ 'teamBuilder.driveSync': false, 'teamBuilder.experimentalScoring': true }),
    );

    const flags = resolveFeatureFlags(storage);

    expect(flags['teamBuilder.driveSync']).toBe(false);
    expect(flags['teamBuilder.experimentalScoring']).toBe(true);
    expect(flags['teamBuilder.enabled']).toBe(true);
  });

  it('drops unknown keys and non-boolean values from overrides', () => {
    storage.__data.set(
      FEATURE_FLAG_STORAGE_KEY,
      JSON.stringify({
        'teamBuilder.unknown': false,
        'teamBuilder.driveSync': 'no',
        'teamBuilder.autoBuilder': false,
      }),
    );

    const overrides = readFeatureFlagOverrides(storage);

    expect(overrides).toEqual({ 'teamBuilder.autoBuilder': false });
  });

  it('writes overrides via setFeatureFlagOverride and clears via clearFeatureFlagOverride', () => {
    setFeatureFlagOverride('teamBuilder.experimentalAuditLog', true, storage);

    expect(isFeatureEnabled('teamBuilder.experimentalAuditLog', storage)).toBe(true);

    clearFeatureFlagOverride('teamBuilder.experimentalAuditLog', storage);

    expect(storage.__data.has(FEATURE_FLAG_STORAGE_KEY)).toBe(false);
    expect(isFeatureEnabled('teamBuilder.experimentalAuditLog', storage)).toBe(false);
  });

  it('clearAllFeatureFlagOverrides removes the storage entry entirely', () => {
    storage.__data.set(FEATURE_FLAG_STORAGE_KEY, JSON.stringify({ 'teamBuilder.driveSync': false }));

    clearAllFeatureFlagOverrides(storage);

    expect(storage.__data.has(FEATURE_FLAG_STORAGE_KEY)).toBe(false);
    expect(isFeatureEnabled('teamBuilder.driveSync', storage)).toBe(true);
  });

  it('ignores malformed JSON in storage and falls back to defaults', () => {
    storage.__data.set(FEATURE_FLAG_STORAGE_KEY, '{not json');

    expect(resolveFeatureFlags(storage)).toEqual(DEFAULT_FEATURE_FLAGS);
  });

  it('returns defaults when storage is null', () => {
    expect(resolveFeatureFlags(null)).toEqual(DEFAULT_FEATURE_FLAGS);
    expect(isFeatureEnabled('teamBuilder.enabled', null)).toBe(true);
  });
});
