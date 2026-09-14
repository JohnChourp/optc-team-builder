/**
 * Every browser-storage key this app writes, and what kind of thing it holds.
 *
 * 869f12x56. There were 27 constants named `*_KEY` across `src/`, in five
 * naming conventions, with no registry - and three separate things had to agree
 * on which of them hold a reader's own data:
 *
 *   - Settings "export all data", which enumerated seven scopes by hand;
 *   - Google Drive sync, which carries the same payload;
 *   - storage-quota handling, which must know what it may drop.
 *
 * Nothing connected them, and the cost was measured: `crewForgeImageProfiles`
 * and `crewForgeLastImageProfileId` were real configuration a player had tuned,
 * and a full export silently left them behind (869f12x4p). A player moving
 * device lost them with nothing on screen to say so.
 *
 * Four of those 27 constants are not storage keys at all - `shipThumbnails` is
 * an asset-pack id, `no-captain-ability` is a tier-entry key, and the two
 * `extra_drop_*` are ability tags. Nothing in the code distinguished them from
 * the real ones, because there was nothing to distinguish them in. Now there is:
 * a key is in this file, or it does not touch storage.
 *
 * THE SPELLINGS ARE CANONICAL AND ARE NOT TO BE TIDIED.
 *
 * `optc_google_account_session` is snake_case, `no-captain-ability` is kebab,
 * `optc.captainCoverage.teamDraft` is dotted-with-a-prefix, and most are plain
 * camelCase. That is untidy and it stays: renaming a key is silent data loss for
 * every reader who already has one, with no migration to make it otherwise. The
 * `convention` field records whether a key follows the convention for its
 * backend, so NEW keys can be required to without touching the old ones.
 */

/** Where the value physically lives. */
export type BrowserStorageBackend =
  /** Capacitor `Preferences`: `localStorage` on web, platform preferences on device. */
  | 'preferences'
  | 'local'
  | 'session';

export type BrowserStorageClassification =
  /**
   * The reader's own work. MUST survive an export/import round trip, and must
   * therefore name the `ALL_DATA_TRANSFER_SCOPES` scope that carries it.
   */
  | 'durable-user-data'
  /** A choice about this device or browser, not content. Deliberately not exported. */
  | 'device-preference'
  /** Rebuildable or per-visit. Losing it costs the reader nothing. */
  | 'transient-ui-state'
  /** Sign-in state. Must NEVER be exported, synced, or written to a file. */
  | 'credential';

export interface BrowserStorageKeyRecord {
  /** The literal spelling, exactly as stored. Never changed without a migration. */
  readonly key: string;
  /** The constant that declares it, so a reader can find the code from the key. */
  readonly constantName: string;
  /** The file that owns reads and writes of this key. */
  readonly owner: string;
  readonly backend: BrowserStorageBackend;
  readonly classification: BrowserStorageClassification;
  /**
   * For `durable-user-data` only: the export scope that carries it. Bound to
   * `ALL_DATA_TRANSFER_SCOPES` by `browser-storage-keys.data.spec.ts`, which is
   * what makes "durable means exported" a checkable claim rather than a hope.
   */
  readonly exportedAs?: string;
  /** True when the spelling predates the convention for its backend. */
  readonly legacySpelling?: true;
  readonly note: string;
}

export const BROWSER_STORAGE_KEYS: readonly BrowserStorageKeyRecord[] = [
  {
    key: 'favoriteCharacterIds',
    constantName: 'FAVORITES_KEY',
    owner: 'src/app/core/services/user-state.service.ts',
    backend: 'preferences',
    classification: 'durable-user-data',
    exportedAs: 'favorites',
    note: 'The characters the reader marked. Theirs, and not derivable from anything else.',
  },
  {
    key: 'favoriteShipIds',
    constantName: 'FAVORITE_SHIPS_KEY',
    owner: 'src/app/core/services/user-state.service.ts',
    backend: 'preferences',
    classification: 'durable-user-data',
    exportedAs: 'favoriteShips',
    note: 'As above, for ships.',
  },
  {
    key: 'savedTeams',
    constantName: 'SAVED_TEAMS_KEY',
    owner: 'src/app/core/services/user-state.service.ts',
    backend: 'preferences',
    classification: 'durable-user-data',
    exportedAs: 'savedTeams',
    note: 'The reader’s teams. Its schema lifecycle is docs/saved-team-schema-lifecycle.md.',
  },
  {
    key: 'savedRumbleTeams',
    constantName: 'SAVED_RUMBLE_TEAMS_KEY',
    owner: 'src/app/core/services/user-state.service.ts',
    backend: 'preferences',
    classification: 'durable-user-data',
    exportedAs: 'savedRumbleTeams',
    note: 'The Rumble side of the same thing.',
  },
  {
    key: 'savedEnemies',
    constantName: 'SAVED_ENEMIES_KEY',
    owner: 'src/app/core/services/user-state.service.ts',
    backend: 'preferences',
    classification: 'durable-user-data',
    exportedAs: 'savedEnemies',
    note: 'Enemies the reader described, with their links to teams.',
  },
  {
    key: 'savedRumbleOpponents',
    constantName: 'SAVED_RUMBLE_OPPONENTS_KEY',
    owner: 'src/app/core/services/user-state.service.ts',
    backend: 'preferences',
    classification: 'durable-user-data',
    exportedAs: 'savedRumbleOpponents',
    note: 'Opponent crews the reader saved to face again across a Rumble season. Added by 869f12x45; this guard is what required the export scope before the key could ship.',
  },
  {
    key: 'boostedCharacterIds',
    constantName: 'BOOSTED_CHARACTER_IDS_KEY',
    owner: 'src/app/core/services/user-state.service.ts',
    backend: 'preferences',
    classification: 'durable-user-data',
    exportedAs: 'boostedCharacterIds',
    note: 'Characters the reader marked as boosted for the event they are playing, entered by hand because there is no boost data in the dataset at all and a boost list is event-scoped and time-bound. Durable rather than transient: it is the reader\'s own work and it should survive a reinstall. Added by 869f1q90b.',
  },
  {
    key: 'characterBoxes',
    constantName: 'CHARACTER_BOXES_KEY',
    owner: 'src/app/core/services/user-state.service.ts',
    backend: 'preferences',
    classification: 'durable-user-data',
    exportedAs: 'characterBoxes',
    note: 'What the reader owns, per box.',
  },
  {
    key: 'characterOverrides',
    constantName: 'CHARACTER_OVERRIDES_KEY',
    owner: 'src/app/core/services/character-overrides.service.ts',
    backend: 'preferences',
    classification: 'durable-user-data',
    exportedAs: 'characterOverrides',
    note: 'Local edits to dataset characters. Invisible until something looks wrong, so losing them is worse than losing a team.',
  },
  {
    key: 'crewForgeImageProfiles',
    constantName: 'CREW_FORGE_IMAGE_PROFILES_KEY',
    owner: 'src/app/core/services/user-state.service.ts',
    backend: 'preferences',
    classification: 'durable-user-data',
    exportedAs: 'crewForgeProfiles',
    note: 'The tuning that makes the screenshot importer read THIS reader’s screenshots. Absent from the export until 869f12x4p, which is the defect that produced this registry.',
  },
  {
    key: 'crewForgeLastImageProfileId',
    constantName: 'CREW_FORGE_LAST_IMAGE_PROFILE_ID_KEY',
    owner: 'src/app/core/services/user-state.service.ts',
    backend: 'preferences',
    classification: 'durable-user-data',
    exportedAs: 'crewForgeProfiles',
    note: 'Which of those profiles was selected. Carried inside the same scope, as lastProfileId.',
  },
  {
    key: 'appLanguage',
    constantName: 'APP_LANGUAGE_PREFERENCE_KEY',
    owner: 'src/app/core/i18n/app-i18n.types.ts',
    backend: 'preferences',
    classification: 'device-preference',
    note: 'Which language this device shows. A choice about the device, not content the reader made.',
  },
  {
    key: 'analyticsConsent',
    constantName: 'ANALYTICS_CONSENT_PREFERENCE_KEY',
    owner: 'src/app/core/services/analytics-consent.service.ts',
    backend: 'preferences',
    classification: 'device-preference',
    note: 'Consent is given per browser and must not travel in a file: importing someone else’s export must never turn analytics on.',
  },
  {
    key: 'autoTeamBuilderWorkerPreference',
    constantName: 'AUTO_TEAM_BUILDER_WORKER_PREFERENCE_KEY',
    owner: 'src/app/core/services/user-state.service.ts',
    backend: 'preferences',
    classification: 'device-preference',
    note: 'How many workers to run. Tuned to THIS device’s cores; restoring it on a weaker phone would be wrong.',
  },
  {
    key: 'driveSyncMetadata',
    constantName: 'DRIVE_SYNC_METADATA_KEY',
    owner: 'src/app/core/services/drive-sync-state.service.ts',
    backend: 'preferences',
    classification: 'device-preference',
    note: 'This device’s bookkeeping about its own last sync. Exporting it would describe a sync the importing device never did.',
  },
  {
    key: 'builderIntroDismissed',
    constantName: 'BUILDER_INTRO_DISMISSED_KEY',
    owner: 'src/app/core/services/user-state.service.ts',
    backend: 'preferences',
    classification: 'transient-ui-state',
    note: 'A one-time explainer the reader closed.',
  },
  {
    key: 'installPromptDismissed',
    constantName: 'INSTALL_BANNER_DISMISSED_PREFERENCE_KEY',
    owner: 'src/app/app.component.ts',
    backend: 'preferences',
    classification: 'transient-ui-state',
    note: 'The install banner the reader closed. Per install, by definition.',
  },
  {
    key: 'recentCharacterIds',
    constantName: 'RECENTS_KEY',
    owner: 'src/app/core/services/user-state.service.ts',
    backend: 'preferences',
    classification: 'transient-ui-state',
    note: 'Browsing history, rebuilt by browsing. Deliberately not exported - it is a record of looking, not of choosing.',
  },
  {
    key: 'autoTeamBuilderResultV1',
    constantName: 'AUTO_TEAM_BUILDER_RESULT_KEY',
    owner: 'src/app/pages/auto-team-builder/auto-team-builder-result-snapshot.utils.ts',
    backend: 'preferences',
    classification: 'transient-ui-state',
    note: 'The last built Auto Team Builder team, so a reload does not throw it away - 869f12xbc measured a completed build writing zero bytes and losing the result on a plain reload. Preferences rather than session because the case is a phone killing a backgrounded app, which sessionStorage does not survive. It stores character IDs and re-reads the records, so it is a cache the reader rebuilds by pressing Build; the durable thing is a Saved Team, which is why this is neither exported nor synced. Carries its own V1 because the snapshot shape can change.',
  },
  {
    key: 'optc_google_account_session',
    constantName: 'GOOGLE_ACCOUNT_SESSION_KEY',
    owner: 'src/app/core/services/google-account.service.ts',
    backend: 'local',
    classification: 'credential',
    legacySpelling: true,
    note: 'The signed-in profile. Never exported, never synced, never written to a file.',
  },
  {
    key: 'social_login_oauth_pending',
    constantName: 'SOCIAL_LOGIN_OAUTH_STATE_KEY',
    owner: 'src/app/core/services/google-account.service.ts',
    backend: 'local',
    classification: 'credential',
    legacySpelling: true,
    note: 'The OAuth state parameter, alive only between redirect and return. It is the CSRF defence for that redirect, so it must not be copied anywhere.',
  },
  {
    key: 'optc.captainCoverage.teamDraft',
    constantName: 'CAPTAIN_COVERAGE_TEAM_DRAFT_KEY',
    owner: 'src/app/pages/captain-coverage/captain-coverage.page.ts',
    backend: 'session',
    classification: 'transient-ui-state',
    note: 'An unsaved team the reader is still assembling. Surviving a reload is the point; surviving a device change is not.',
  },
  {
    key: 'optc.manualTeamBuilder.filterDraft',
    constantName: 'MANUAL_TEAM_FILTER_DRAFT_KEY',
    owner: 'src/app/pages/manual-team-builder/manual-team-builder.page.ts',
    backend: 'session',
    classification: 'transient-ui-state',
    note: 'Filters in progress on the manual builder.',
  },
  {
    key: 'optc.savedTeams.viewState',
    constantName: 'SAVED_TEAMS_VIEW_STATE_KEY',
    owner: 'src/app/pages/saved-teams/saved-teams.page.ts',
    backend: 'session',
    classification: 'transient-ui-state',
    note: 'Search text and sort order on the Saved Teams list.',
  },
  {
    key: 'autoTeamBuilder.selectionState.v1',
    constantName: 'AUTO_TEAM_BUILDER_SELECTION_SESSION_KEY',
    owner: 'src/app/pages/auto-team-builder/auto-team-builder-selection-state.utils.ts',
    backend: 'session',
    classification: 'transient-ui-state',
    legacySpelling: true,
    note: 'Carries its own `.v1`, which is how a session key with a changing shape should be done - but it lacks the `optc.` prefix the other session keys use.',
  },
  {
    key: 'autoTeamBuilder.compareState.v1',
    constantName: 'AUTO_TEAM_COMPARE_SESSION_KEY',
    owner: 'src/app/pages/auto-team-builder/auto-team-builder.page.ts',
    backend: 'session',
    classification: 'transient-ui-state',
    legacySpelling: true,
    note: 'As above, for compare mode.',
  },
];

/**
 * Constants named `*_KEY` that are deliberately NOT storage keys.
 *
 * Listed so the guard can tell "this is not storage" from "somebody forgot to
 * register it" - which is the distinction the code could not previously make.
 */
export const NON_STORAGE_KEY_CONSTANTS: readonly { constantName: string; reason: string }[] = [
  {
    constantName: 'SHIP_THUMBNAIL_PACK_KEY',
    reason: 'An asset-pack identifier, looked up in an in-memory Map of installed packs.',
  },
  {
    constantName: 'NO_CAPTAIN_ABILITY_TIER_ENTRY_KEY',
    reason: 'The key of a captain-tier entry in generated data.',
  },
  {
    constantName: 'EXTRA_DROP_ANY_ABILITY_KEY',
    reason: 'An ability tag in the builder’s requirement model.',
  },
  {
    constantName: 'EXTRA_DROP_GUARANTEED_ABILITY_KEY',
    reason: 'An ability tag, as above.',
  },
];

/** Keys whose loss would cost the reader work they cannot redo. */
export function durableStorageKeys(): readonly BrowserStorageKeyRecord[] {
  return BROWSER_STORAGE_KEYS.filter((record) => record.classification === 'durable-user-data');
}

/** Keys that must never leave the device, in a file or over sync. */
export function neverExportedStorageKeys(): readonly BrowserStorageKeyRecord[] {
  return BROWSER_STORAGE_KEYS.filter((record) => record.classification !== 'durable-user-data');
}
