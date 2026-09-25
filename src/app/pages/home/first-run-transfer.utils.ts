import { BUILT_IN_CREW_FORGE_IMAGE_PROFILES } from '../../core/data/crew-forge-built-in-profiles';
import { type SyncScopeSummary } from '../../core/services/user-data-transfer.service';

/**
 * Whether a fresh installation should say, plainly, that it is empty.
 *
 * 869f13d6j. A reader can hold the website, the installed PWA and the APK at once - three
 * installations of one product, each with its own browser storage, and the bridges between
 * them are Google Drive sync and an exported file. Saved teams, boxes, enemies, overrides and
 * favourites all live in that storage.
 *
 * 869f63gqt. Drive sync needs Google sign-in, which a build without the Google client id -
 * today the Android app - does not have. There the file is the only bridge, and the notice
 * says so rather than offering a route that ends at a disabled button.
 *
 * So the most likely silent data loss in this product happens at the moment somebody
 * commits to the app: they install it, find nothing, and have no way to know whether their
 * teams are gone or simply elsewhere.
 *
 * THIS DOES NOT DETECT ANYTHING, and that is deliberate. Reading another origin's storage
 * is impossible by design, and the task said to propose only what is genuinely possible and
 * to prefer an honest prompt over a clever heuristic. A heuristic here would be guessing at
 * whether a stranger has data somewhere else and would be wrong in both directions - it
 * would nag a first-time reader who never had anything, and reassure one whose teams really
 * are elsewhere.
 *
 * What it knows is exactly one fact: **this installation is empty**. It says that, says
 * where data could be, and offers the routes that actually work on this build. Then it goes
 * away.
 */

/**
 * What a scope holds on a FRESH install, before the reader has done anything.
 *
 * Almost every scope starts at zero. `crewForgeProfilesCount` does not: the app ships a
 * built-in image profile, so a brand-new installation reports **1**.
 *
 * That very nearly shipped this notice dead. `isEmptyInstallation` compared every count to
 * zero, the built-in profile made the comparison false on exactly the installation the
 * notice exists for, and it would have shown to nobody - silently, with every unit test
 * green, because the tests supplied their own zeroed summary.
 *
 * It was caught by an emulator screenshot of a genuinely fresh install reading
 * "Crew Forge Image Profiles 1", not by any check. Hence this constant, and the assertion
 * in the spec that pins it to the real built-in list rather than to the number 1.
 */
export const FRESH_INSTALL_BASELINE = {
  crewForgeProfilesCount: BUILT_IN_CREW_FORGE_IMAGE_PROFILES.length,
} as const satisfies Partial<Record<keyof SyncScopeSummary, number>>;

/** Every scope whose emptiness means "this install has nothing of the reader's". */
export const TRANSFERABLE_SCOPE_COUNTS = [
  'characterBoxesCount',
  'characterOverridesCount',
  'crewForgeProfilesCount',
  'savedRumbleOpponentsCount',
  'favoriteCharacterCount',
  'favoriteShipCount',
  'savedEnemiesCount',
  'savedRumbleTeamsCount',
  'savedTeamsCount',
  'boostedCharacterCount',
] as const satisfies readonly (keyof SyncScopeSummary)[];

/**
 * True when nothing the reader could have made is present.
 *
 * Every scope, not a chosen few: a reader who has only favourited three characters has
 * *something*, and telling them their install is empty would be plainly false.
 */
export function isEmptyInstallation(summary: SyncScopeSummary): boolean {
  return TRANSFERABLE_SCOPE_COUNTS.every((key) => {
    const baseline: number = FRESH_INSTALL_BASELINE[key as keyof typeof FRESH_INSTALL_BASELINE] ?? 0;

    return (summary[key] ?? 0) <= baseline;
  });
}

/** Per-device, and deliberately not exported data: losing it only re-offers the notice. */
export const FIRST_RUN_TRANSFER_DISMISSED_KEY = 'firstRunTransferNoticeDismissed';

export interface FirstRunTransferInput {
  readonly summary: SyncScopeSummary;
  readonly dismissed: boolean;
  /** True once the reader has connected an account - Drive has already answered for them. */
  readonly signedIn: boolean;
}

/**
 * Whether to show the notice.
 *
 * Three ways to be silent, and each matters:
 *
 *   - the installation has data, so the premise is false;
 *   - the reader dismissed it, so they have answered;
 *   - the reader is signed in, so Drive sync is already available to them and the notice
 *     would be telling them to do something they have done.
 */
export function shouldShowFirstRunTransferNotice(input: FirstRunTransferInput): boolean {
  if (input.dismissed || input.signedIn) {
    return false;
  }

  return isEmptyInstallation(input.summary);
}
