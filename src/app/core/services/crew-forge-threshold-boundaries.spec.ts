import '@angular/compiler';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { type PreferencesAdapterService } from './preferences-adapter.service';
import { UserStateService } from './user-state.service';

/**
 * 869f13gbg. `matchThreshold` is a player-editable number that decides whether the
 * Crew Forge importer works at all: the service resolves a slot to `null` when the
 * best candidate's confidence falls below it. At 1 it rejects everything, and the
 * symptom - nothing matched - is indistinguishable from bad screenshots.
 *
 * `normalizeUnitInterval(…, 0.92)` clamps it to `[0,1]` on the read path, which is
 * the right place: a stored profile can arrive from an older version, a hand-edited
 * export, or a future format, so validating only on write leaves the door open.
 *
 * **The clamp existed and nothing drove it out of range.** Eleven specs mention
 * `matchThreshold` and every one of them passes a value already inside `[0,1]`, so
 * the clamp had only ever seen correct input - which this project's own rule says is
 * not a test. Each case below is one boundary, and each would pass unchanged if the
 * clamp were deleted *except* for the reason it is here: the assertion is on the
 * clamped output, not on the call.
 *
 * Its own file rather than appended to `user-state.service.spec.ts`: that suite is
 * 1,400 lines about saved teams, enemies and boxes, and these are about one number.
 */

let preferences: { get: ReturnType<typeof vi.fn>; set: ReturnType<typeof vi.fn> };

const SLOT_KEYS = [
  'leader-1',
  'leader-2',
  'leader-3',
  'leader-4',
  'sub-1',
  'sub-2',
  'sub-3',
  'sub-4',
  'sub-5',
  'sub-6',
  'sub-7',
  'sub-8',
];

function createProfile(matchThreshold: unknown) {
  return {
    id: 'profile-1',
    name: 'Profile',
    source: 'user' as const,
    imageWidth: 1080,
    imageHeight: 1920,
    slotDefinitions: SLOT_KEYS.map((key) => ({
      key,
      label: key,
      role: key.startsWith('leader') ? ('leader' as const) : ('sub' as const),
      x: 10,
      y: 10,
      width: 120,
      height: 120,
    })),
    preprocess: {
      fingerprintSize: 16,
      contrast: 1,
      brightness: 0,
      grayscale: true,
      invert: false,
      blurRadius: 0,
      matchThreshold,
      emptyVarianceThreshold: 0.005,
    },
    examples: [],
    exemplars: [],
    createdAt: '2026-03-29T10:00:00.000Z',
    updatedAt: '2026-03-29T10:05:00.000Z',
  };
}

/** Hydrates the service from storage, which is the path a corrupt profile arrives by. */
async function readBackThreshold(storedThreshold: unknown): Promise<number> {
  const store = new Map<string, string>([
    ['crewForgeImageProfiles', JSON.stringify([createProfile(storedThreshold)])],
    ['crewForgeLastImageProfileId', JSON.stringify('profile-1')],
  ]);

  preferences.get.mockImplementation(async ({ key }: { key: string }) => ({
    value: store.get(key) ?? null,
  }));
  preferences.set.mockImplementation(async () => undefined);

  const service = new UserStateService(
    { translate: vi.fn((key: string) => key) } as never,
    preferences as unknown as PreferencesAdapterService,
  );

  await service.ready();

  const profile = service.crewForgeImageProfiles().find((entry) => entry.id === 'profile-1');

  expect(profile, 'the stored profile must survive hydration at all').toBeDefined();

  return profile!.preprocess.matchThreshold;
}

describe('crew forge matchThreshold boundaries', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    preferences = {
      get: vi.fn().mockResolvedValue({ value: null }),
      set: vi.fn().mockResolvedValue(undefined),
    };
  });

  /* The control. Without this row the cases below prove only that something changed. */
  it('leaves an in-range threshold exactly as stored', async () => {
    await expect(readBackThreshold(0.5)).resolves.toBe(0.5);
    await expect(readBackThreshold(0.92)).resolves.toBe(0.92);
  });

  it('keeps both ends of the interval, which are legal values', async () => {
    await expect(readBackThreshold(0)).resolves.toBe(0);
    await expect(readBackThreshold(1)).resolves.toBe(1);
  });

  it('clamps a threshold above 1 rather than rejecting every candidate forever', async () => {
    await expect(readBackThreshold(1.5)).resolves.toBe(1);
    await expect(readBackThreshold(42)).resolves.toBe(1);
  });

  it('clamps a negative threshold rather than accepting the first candidate always', async () => {
    await expect(readBackThreshold(-0.2)).resolves.toBe(0);
    await expect(readBackThreshold(-99)).resolves.toBe(0);
  });

  /*
   * These are what an older version, a hand-edited export or a future format actually
   * produce. A missing key is the most likely of the three, because the field was added
   * after the profile format existed.
   */
  it('falls back to the documented default for a value that is not a number', async () => {
    for (const nonsense of [undefined, null, 'high', '', {}, [], Number.NaN]) {
      await expect(readBackThreshold(nonsense)).resolves.toBe(0.92);
    }
  });

  it('falls back to the default for an infinite threshold', async () => {
    await expect(readBackThreshold(Number.POSITIVE_INFINITY)).resolves.toBe(0.92);
    await expect(readBackThreshold(Number.NEGATIVE_INFINITY)).resolves.toBe(0.92);
  });
});
