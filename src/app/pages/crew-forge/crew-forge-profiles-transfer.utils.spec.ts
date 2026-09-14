import { describe, expect, it } from 'vitest';

import { type CrewForgeImageProfile } from '../../core/models/optc.models';
import {
  buildCrewForgeProfilesTransferPayload,
  CrewForgeProfilesImportError,
  parseCrewForgeProfilesImportPayloadValue,
  sanitizeCrewForgeProfilesImportPayload,
} from './crew-forge-profiles-transfer.utils';

/** A profile with every field populated, images included - the case the defect describes. */
function createProfile(overrides: Partial<CrewForgeImageProfile> = {}): CrewForgeImageProfile {
  return {
    id: 'profile-1',
    name: 'My Phone 1080x2400',
    source: 'user',
    imageWidth: 1080,
    imageHeight: 2400,
    slotDefinitions: [
      { key: 'leader-1', label: 'Leader 1', role: 'leader', x: 149, y: 856, width: 179, height: 179 },
    ],
    preprocess: {
      fingerprintSize: 16,
      contrast: 1.2,
      brightness: 0.1,
      grayscale: true,
      invert: false,
      blurRadius: 0,
      matchThreshold: 0.88,
      emptyVarianceThreshold: 0.005,
    },
    examples: [
      {
        id: 'example-1',
        name: 'Recruitment screen',
        imageDataUrl: 'data:image/png;base64,AAAA',
        imageWidth: 1080,
        imageHeight: 2400,
        createdAt: '2026-09-01T00:00:00.000Z',
        updatedAt: '2026-09-01T00:00:00.000Z',
      },
    ],
    exemplars: [
      {
        id: 'exemplar-1',
        slotKey: 'leader-1',
        characterId: 4208,
        fingerprint: [0.1, 0.2, 0.3],
        cropDataUrl: 'data:image/png;base64,BBBB',
        createdAt: '2026-09-01T00:00:00.000Z',
        updatedAt: '2026-09-01T00:00:00.000Z',
      },
    ],
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-02T00:00:00.000Z',
    ...overrides,
  };
}

describe('crew forge profiles transfer', () => {
  /*
   * 869f12x4p. The defect in one test: a player tunes a profile, exports "all data", moves device,
   * imports - and the tuning has to still be there. Everything that makes the profile *theirs* is
   * asserted field by field, because "it round-trips" was true of the seven scopes that already
   * worked and false of this one.
   */
  it('carries the whole tuned profile, images included', () => {
    const profile = createProfile();
    const payload = buildCrewForgeProfilesTransferPayload(
      [profile],
      'profile-1',
      '2026-09-14T00:00:00.000Z',
    );
    const restored = sanitizeCrewForgeProfilesImportPayload(
      parseCrewForgeProfilesImportPayloadValue(JSON.parse(JSON.stringify(payload))),
    );

    expect(restored.profiles).toHaveLength(1);
    expect(restored.profiles[0]).toEqual(profile);
    expect(restored.profiles[0].slotDefinitions[0].x).toBe(149);
    expect(restored.profiles[0].preprocess.matchThreshold).toBe(0.88);
    expect(restored.profiles[0].examples[0].imageDataUrl).toBe('data:image/png;base64,AAAA');
    expect(restored.profiles[0].exemplars[0].cropDataUrl).toBe('data:image/png;base64,BBBB');
    expect(restored.profiles[0].exemplars[0].fingerprint).toEqual([0.1, 0.2, 0.3]);
    expect(restored.lastProfileId).toBe('profile-1');
  });

  it('deep-clones, so a later edit cannot reach into an exported payload', () => {
    const profile = createProfile();
    const payload = buildCrewForgeProfilesTransferPayload([profile], null);

    profile.slotDefinitions[0].x = 999;
    profile.exemplars[0].fingerprint[0] = 9;
    profile.examples[0].name = 'changed';

    expect(payload.profiles[0].slotDefinitions[0].x).toBe(149);
    expect(payload.profiles[0].exemplars[0].fingerprint[0]).toBe(0.1);
    expect(payload.profiles[0].examples[0].name).toBe('Recruitment screen');
  });

  it('leaves built-in profiles behind - the app already ships them', () => {
    const payload = buildCrewForgeProfilesTransferPayload(
      [createProfile(), createProfile({ id: 'built-in-1', source: 'built-in' })],
      null,
    );

    expect(payload.profiles.map((profile) => profile.id)).toEqual(['profile-1']);
  });

  it('skips a built-in profile that arrives in a file anyway, and says how many', () => {
    const result = sanitizeCrewForgeProfilesImportPayload({
      schemaVersion: 1,
      source: 'crew-forge-profiles',
      exportedAt: '2026-09-14T00:00:00.000Z',
      profiles: [createProfile({ id: 'built-in-1', source: 'built-in' }), createProfile()],
      lastProfileId: null,
    });

    expect(result.builtInProfileCount).toBe(1);
    expect(result.profiles.map((profile) => profile.id)).toEqual(['profile-1']);
  });

  it('drops a repeated id instead of forking the profile', () => {
    const result = sanitizeCrewForgeProfilesImportPayload({
      schemaVersion: 1,
      source: 'crew-forge-profiles',
      exportedAt: '2026-09-14T00:00:00.000Z',
      profiles: [createProfile({ name: 'First' }), createProfile({ name: 'Second' })],
      lastProfileId: null,
    });

    expect(result.duplicateProfileCount).toBe(1);
    expect(result.profiles.map((profile) => profile.name)).toEqual(['First']);
  });

  it('counts entries that are not profiles at all', () => {
    const result = sanitizeCrewForgeProfilesImportPayload({
      schemaVersion: 1,
      source: 'crew-forge-profiles',
      exportedAt: '2026-09-14T00:00:00.000Z',
      profiles: [null, 'not a profile', { name: '   ' }, createProfile()] as never,
      lastProfileId: null,
    });

    expect(result.invalidProfileCount).toBe(3);
    expect(result.profiles).toHaveLength(1);
  });

  it('forgets a selected profile the file does not actually carry', () => {
    const payload = buildCrewForgeProfilesTransferPayload([createProfile()], 'profile-that-is-gone');

    expect(payload.lastProfileId).toBeNull();

    const result = sanitizeCrewForgeProfilesImportPayload({
      schemaVersion: 1,
      source: 'crew-forge-profiles',
      exportedAt: '2026-09-14T00:00:00.000Z',
      profiles: [createProfile()],
      lastProfileId: 'profile-that-is-gone',
    });

    expect(result.lastProfileId).toBeNull();
  });

  it('rejects a payload from another format, by key so the copy stays translatable', () => {
    expect(() =>
      parseCrewForgeProfilesImportPayloadValue({
        schemaVersion: 1,
        source: 'saved-teams',
        exportedAt: '2026-09-14T00:00:00.000Z',
        profiles: [],
      }),
    ).toThrowError(CrewForgeProfilesImportError);

    try {
      parseCrewForgeProfilesImportPayloadValue({ schemaVersion: 2, source: 'crew-forge-profiles' });
    } catch (error) {
      expect((error as CrewForgeProfilesImportError).key).toBe(
        'management.crewForgeProfiles.errors.unsupportedSchema',
      );
    }

    try {
      parseCrewForgeProfilesImportPayloadValue({
        schemaVersion: 1,
        source: 'crew-forge-profiles',
        exportedAt: '2026-09-14T00:00:00.000Z',
      });
    } catch (error) {
      expect((error as CrewForgeProfilesImportError).key).toBe(
        'management.crewForgeProfiles.errors.invalidPayload',
      );
    }
  });
});
