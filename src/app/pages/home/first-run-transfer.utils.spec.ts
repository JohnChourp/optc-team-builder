import { describe, expect, it } from 'vitest';

import { type SyncScopeSummary } from '../../core/services/user-data-transfer.service';

import { BUILT_IN_CREW_FORGE_IMAGE_PROFILES } from '../../core/data/crew-forge-built-in-profiles';

import {
  FRESH_INSTALL_BASELINE,
  TRANSFERABLE_SCOPE_COUNTS,
  isEmptyInstallation,
  shouldShowFirstRunTransferNotice,
} from './first-run-transfer.utils';

/**
 * A genuinely fresh installation, NOT an all-zero object.
 *
 * The distinction is the whole point: a fresh install ships a built-in Crew Forge profile,
 * so `crewForgeProfilesCount` is 1 before the reader has done anything. A spec that used
 * zeros here would have passed against an implementation that never showed the notice.
 */
const EMPTY: SyncScopeSummary = {
  characterBoxesCount: 0,
  characterOverridesCount: 0,
  crewForgeProfilesCount: BUILT_IN_CREW_FORGE_IMAGE_PROFILES.length,
  savedRumbleOpponentsCount: 0,
  favoriteCharacterCount: 0,
  favoriteShipCount: 0,
  savedEnemiesCount: 0,
  savedRumbleTeamsCount: 0,
  savedTeamsCount: 0,
};

/*
 * 869f13d6j. A reader can hold the website, the installed PWA and the APK at once, each
 * with its own browser storage and Drive sync as the only bridge. The most likely silent
 * data loss in this product happens when somebody installs the app, finds nothing, and
 * cannot tell whether their teams are gone or simply elsewhere.
 */
describe('the empty-install notice', () => {
  it('covers every scope, so "empty" is not a chosen subset', () => {
    // A reader who has only favourited three characters HAS something, and telling them
    // their install is empty would be plainly false. This is the assertion that stops a
    // future scope being added to the summary and silently left out of the check.
    expect([...TRANSFERABLE_SCOPE_COUNTS].sort()).toEqual(Object.keys(EMPTY).sort());
  });

  it('shows on an installation holding nothing', () => {
    expect(shouldShowFirstRunTransferNotice({ summary: EMPTY, dismissed: false, signedIn: false })).toBe(true);
  });

  it('counts the shipped Crew Forge profile as nothing of the reader\'s', () => {
    // Measured on the emulator, on a genuinely fresh install of the released APK:
    // Settings reported "Crew Forge Image Profiles 1". Comparing that count to zero made
    // the notice unreachable on exactly the installation it exists for.
    expect(BUILT_IN_CREW_FORGE_IMAGE_PROFILES.length).toBeGreaterThan(0);
    expect(FRESH_INSTALL_BASELINE.crewForgeProfilesCount).toBe(BUILT_IN_CREW_FORGE_IMAGE_PROFILES.length);
    expect(isEmptyInstallation(EMPTY)).toBe(true);

    // One MORE than the built-ins is the reader's own work, and stops the notice.
    expect(
      isEmptyInstallation({ ...EMPTY, crewForgeProfilesCount: BUILT_IN_CREW_FORGE_IMAGE_PROFILES.length + 1 }),
    ).toBe(false);
  });

  it('stays away as soon as ANY scope has something', () => {
    for (const key of TRANSFERABLE_SCOPE_COUNTS) {
      const baseline: number = (FRESH_INSTALL_BASELINE as Record<string, number>)[key] ?? 0;
      const summary = { ...EMPTY, [key]: baseline + 1 };

      expect(isEmptyInstallation(summary), key).toBe(false);
      expect(
        shouldShowFirstRunTransferNotice({ summary, dismissed: false, signedIn: false }),
        key,
      ).toBe(false);
    }
  });

  it('stays away once the reader has answered', () => {
    expect(shouldShowFirstRunTransferNotice({ summary: EMPTY, dismissed: true, signedIn: false })).toBe(false);
  });

  it('stays away when the reader is signed in, because Drive has already answered for them', () => {
    // Telling somebody with a connected account to "set up Drive sync" is telling them to
    // do a thing they have done.
    expect(shouldShowFirstRunTransferNotice({ summary: EMPTY, dismissed: false, signedIn: true })).toBe(false);
  });

  it('treats a missing count as zero rather than throwing', () => {
    // getSyncScopeSummary is the real source, but a partial object must not crash the
    // home screen - the notice is the least important thing on it.
    expect(isEmptyInstallation({} as SyncScopeSummary)).toBe(true);
  });

  /*
   * The design constraint, asserted so it cannot drift into a heuristic. The task said to
   * propose only what is genuinely possible and to prefer an honest prompt: reading another
   * origin's storage is impossible, so guessing whether a stranger has data elsewhere would
   * be wrong in both directions - nagging a first-time reader who never had anything, and
   * reassuring one whose teams really are elsewhere.
   */
  it('decides from THIS installation alone, and nothing else', () => {
    const input = { summary: EMPTY, dismissed: false, signedIn: false };

    expect(Object.keys(input).sort()).toEqual(['dismissed', 'signedIn', 'summary']);
    expect(shouldShowFirstRunTransferNotice(input)).toBe(true);
  });
});
