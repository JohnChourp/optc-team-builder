export type FeatureFlagKey =
  | 'teamBuilder.enabled'
  | 'teamBuilder.autoBuilder'
  | 'teamBuilder.captainCoverage'
  | 'teamBuilder.crewForge'
  | 'teamBuilder.savedTeams'
  | 'teamBuilder.driveSync'
  | 'teamBuilder.experimentalScoring'
  | 'teamBuilder.experimentalAuditLog';

export type FeatureFlagMap = Record<FeatureFlagKey, boolean>;

export const FEATURE_FLAG_STORAGE_KEY = 'optc.featureFlags';

export const DEFAULT_FEATURE_FLAGS: FeatureFlagMap = {
  'teamBuilder.enabled': true,
  'teamBuilder.autoBuilder': true,
  'teamBuilder.captainCoverage': true,
  'teamBuilder.crewForge': true,
  'teamBuilder.savedTeams': true,
  'teamBuilder.driveSync': true,
  'teamBuilder.experimentalScoring': false,
  'teamBuilder.experimentalAuditLog': false,
};

export const FEATURE_FLAG_KEYS = Object.keys(DEFAULT_FEATURE_FLAGS) as FeatureFlagKey[];

export interface FeatureFlagStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export function isFeatureFlagKey(key: string): key is FeatureFlagKey {
  return FEATURE_FLAG_KEYS.includes(key as FeatureFlagKey);
}

export function readFeatureFlagOverrides(
  storage: FeatureFlagStorage | null | undefined,
): Partial<FeatureFlagMap> {
  if (!storage) {
    return {};
  }

  const raw = storage.getItem(FEATURE_FLAG_STORAGE_KEY);

  if (!raw) {
    return {};
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(raw);
  } catch {
    return {};
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return {};
  }

  const overrides: Partial<FeatureFlagMap> = {};
  const record = parsed as Record<string, unknown>;

  Object.entries(record).forEach(([key, value]) => {
    if (isFeatureFlagKey(key) && typeof value === 'boolean') {
      overrides[key] = value;
    }
  });

  return overrides;
}

export function resolveFeatureFlags(
  storage: FeatureFlagStorage | null | undefined,
  defaults: FeatureFlagMap = DEFAULT_FEATURE_FLAGS,
): FeatureFlagMap {
  const overrides = readFeatureFlagOverrides(storage);

  return {
    ...defaults,
    ...overrides,
  };
}

export function setFeatureFlagOverride(
  key: FeatureFlagKey,
  value: boolean,
  storage: FeatureFlagStorage,
): void {
  const overrides = readFeatureFlagOverrides(storage);

  overrides[key] = value;
  storage.setItem(FEATURE_FLAG_STORAGE_KEY, JSON.stringify(overrides));
}

export function clearFeatureFlagOverride(
  key: FeatureFlagKey,
  storage: FeatureFlagStorage,
): void {
  const overrides = readFeatureFlagOverrides(storage);

  if (!(key in overrides)) {
    return;
  }

  delete overrides[key];

  if (Object.keys(overrides).length === 0) {
    storage.removeItem(FEATURE_FLAG_STORAGE_KEY);
    return;
  }

  storage.setItem(FEATURE_FLAG_STORAGE_KEY, JSON.stringify(overrides));
}

export function clearAllFeatureFlagOverrides(storage: FeatureFlagStorage): void {
  storage.removeItem(FEATURE_FLAG_STORAGE_KEY);
}

export function isFeatureEnabled(
  key: FeatureFlagKey,
  storage: FeatureFlagStorage | null | undefined,
  defaults: FeatureFlagMap = DEFAULT_FEATURE_FLAGS,
): boolean {
  return resolveFeatureFlags(storage, defaults)[key];
}
