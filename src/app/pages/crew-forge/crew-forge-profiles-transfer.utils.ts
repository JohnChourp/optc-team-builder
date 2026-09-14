import { type CrewForgeImageProfile } from '../../core/models/optc.models';

/**
 * Crew Forge image profiles as a transfer payload.
 *
 * 869f12x4p. `crewForgeImageProfiles` and `crewForgeLastImageProfileId` were the
 * only durable user data absent from Settings "export all data", which
 * enumerated seven scopes and had never heard of these two. They are real
 * configuration - the slot geometry and thresholds a player tuned so the
 * screenshot importer reads *their* screenshots, plus the exemplars it learned
 * from their corrections - and a player moving device lost all of it with
 * nothing on screen to say so.
 *
 * **The payload is faithful, images included, and that is a decision.** An
 * exemplar carries a `cropDataUrl` and an example carries a full
 * `imageDataUrl`. Measured 2026-09-14 by re-encoding real artwork at the sizes
 * the importer actually stores: one 179x179 exemplar crop is **~86 KB** as a
 * PNG data URL, one 1080x2400 example screenshot is **~1.4 MB**. So a
 * well-used profile makes this the largest scope in the file by a wide margin.
 *
 * It is still right to carry them:
 *
 * - the data already lives in browser storage, and Capacitor `Preferences` is
 *   `localStorage` on the web, so the whole profile set is already bounded by
 *   that quota - the export cannot be much larger than what the player is
 *   already carrying, and `browser-storage-error.utils.ts` exists because that
 *   ceiling has already been met;
 * - a partial export is the exact defect being fixed here. Dropping the images
 *   silently would reproduce it one level down: the player would import and
 *   find their examples gone, again with nothing telling them;
 * - `AllDataTransferPayload` is also what Drive sync carries, and moving device
 *   is precisely the scenario in the defect report.
 *
 * Built-in profiles are deliberately not carried. They ship with the app, the
 * runtime filters them out of the user's profile list on read, and an export
 * that restored them would create duplicates of data the next release owns.
 */
export interface CrewForgeProfilesTransferPayload {
  schemaVersion: 1;
  source: 'crew-forge-profiles';
  exportedAt: string;
  profiles: CrewForgeImageProfile[];
  /** The profile the player had selected, or `null`. Restored only if it is in `profiles`. */
  lastProfileId: string | null;
}

export interface CrewForgeProfilesImportResult {
  profiles: CrewForgeImageProfile[];
  lastProfileId: string | null;
  /** Built-in profiles found in the file and skipped - the app already ships them. */
  builtInProfileCount: number;
  /** Entries that were not usable profile records at all. */
  invalidProfileCount: number;
  /** Later duplicates of an id already seen, dropped so an import cannot fork a profile. */
  duplicateProfileCount: number;
}

export class CrewForgeProfilesImportError extends Error {
  public constructor(public readonly key: string) {
    super(key);
    this.name = 'CrewForgeProfilesImportError';
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}


function cloneProfile(profile: CrewForgeImageProfile): CrewForgeImageProfile {
  return {
    ...profile,
    slotDefinitions: profile.slotDefinitions.map((slot) => ({ ...slot })),
    preprocess: { ...profile.preprocess },
    examples: profile.examples.map((example) => ({ ...example })),
    exemplars: profile.exemplars.map((exemplar) => ({
      ...exemplar,
      fingerprint: [...exemplar.fingerprint],
    })),
  };
}

export function buildCrewForgeProfilesTransferPayload(
  profiles: CrewForgeImageProfile[],
  lastProfileId: string | null,
  exportedAt = new Date().toISOString(),
): CrewForgeProfilesTransferPayload {
  const userProfiles = profiles.filter((profile) => profile.source !== 'built-in').map(cloneProfile);
  const hasLastProfile = userProfiles.some((profile) => profile.id === lastProfileId);

  return {
    schemaVersion: 1,
    source: 'crew-forge-profiles',
    exportedAt,
    profiles: userProfiles,
    lastProfileId: hasLastProfile ? lastProfileId : null,
  };
}

export function parseCrewForgeProfilesImportPayload(
  rawContent: string,
): CrewForgeProfilesTransferPayload {
  let parsedPayload: unknown;

  try {
    parsedPayload = JSON.parse(rawContent) as unknown;
  } catch {
    throw new CrewForgeProfilesImportError('management.crewForgeProfiles.errors.invalidJson');
  }

  return parseCrewForgeProfilesImportPayloadValue(parsedPayload);
}

export function parseCrewForgeProfilesImportPayloadValue(
  parsedPayload: unknown,
): CrewForgeProfilesTransferPayload {
  if (!isRecord(parsedPayload)) {
    throw new CrewForgeProfilesImportError('management.crewForgeProfiles.errors.invalidPayload');
  }

  if (
    parsedPayload['schemaVersion'] !== 1 ||
    parsedPayload['source'] !== 'crew-forge-profiles'
  ) {
    throw new CrewForgeProfilesImportError(
      'management.crewForgeProfiles.errors.unsupportedSchema',
    );
  }

  if (
    typeof parsedPayload['exportedAt'] !== 'string' ||
    !Array.isArray(parsedPayload['profiles'])
  ) {
    throw new CrewForgeProfilesImportError('management.crewForgeProfiles.errors.invalidPayload');
  }

  const rawLastProfileId = parsedPayload['lastProfileId'];

  return {
    schemaVersion: 1,
    source: 'crew-forge-profiles',
    exportedAt: parsedPayload['exportedAt'],
    profiles: parsedPayload['profiles'] as CrewForgeImageProfile[],
    lastProfileId: typeof rawLastProfileId === 'string' ? rawLastProfileId : null,
  };
}

/**
 * Structural sanitation only.
 *
 * The field-level normalisation - slot blueprints, threshold clamping, timestamp
 * repair, dropping an exemplar whose fingerprint does not match the profile's
 * preprocess size - already lives in `UserStateService.saveCrewForgeImageProfile`,
 * which the import calls per profile. Re-implementing it here is how the two
 * would drift.
 */
export function sanitizeCrewForgeProfilesImportPayload(
  payload: CrewForgeProfilesTransferPayload,
): CrewForgeProfilesImportResult {
  const profiles: CrewForgeImageProfile[] = [];
  const seenIds = new Set<string>();
  let builtInProfileCount = 0;
  let invalidProfileCount = 0;
  let duplicateProfileCount = 0;

  for (const candidate of payload.profiles) {
    if (!isRecord(candidate) || typeof candidate['name'] !== 'string' || !candidate['name'].trim()) {
      invalidProfileCount += 1;
      continue;
    }

    if (candidate['source'] === 'built-in') {
      builtInProfileCount += 1;
      continue;
    }

    const candidateId = typeof candidate['id'] === 'string' ? candidate['id'] : '';

    if (candidateId && seenIds.has(candidateId)) {
      duplicateProfileCount += 1;
      continue;
    }

    if (candidateId) {
      seenIds.add(candidateId);
    }

    profiles.push(candidate as unknown as CrewForgeImageProfile);
  }

  const lastProfileId = profiles.some((profile) => profile.id === payload.lastProfileId)
    ? payload.lastProfileId
    : null;

  return {
    profiles,
    lastProfileId,
    builtInProfileCount,
    invalidProfileCount,
    duplicateProfileCount,
  };
}
