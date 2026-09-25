import {
  ALL_DATA_TRANSFER_SCOPES,
  type AllDataTransferPayload,
  type AllDataTransferScope,
} from '../settings/all-data-transfer.utils';

export type DriveSyncReviewAction = 'merge-and-upload' | 'replace-cloud' | 'replace-local';

export type DriveSyncReviewSectionKey =
  | 'characterBoxes'
  | 'characterOverrides'
  | 'favoriteShips'
  | 'favorites'
  | 'savedEnemies'
  | 'savedRumbleTeams'
  | 'savedTeams';

export type DriveSyncReviewChoice = 'device' | 'drive' | 'remove';

export type DriveSyncReviewRowStatus = 'added' | 'changed' | 'kept' | 'removed';

/**
 * 869f6td68. Words the review shows for a row. `text` is the item's own - its name, its id, a
 * number - and is shown as it is; `key` is a phrase in the `settings` scope, filled in from
 * `params`. The fallbacks and counts here were English, and the Account page showed them as they
 * were: "5 slots" and "Saved team" on a Greek screen.
 */
export type DriveSyncReviewText =
  | { readonly text: string }
  | { readonly key: string; readonly params?: Readonly<Record<string, number | string>> };

export interface DriveSyncReviewRow {
  choice: DriveSyncReviewChoice;
  choices: DriveSyncReviewChoice[];
  detail: DriveSyncReviewText;
  deviceItem: unknown | null;
  driveItem: unknown | null;
  key: string;
  label: DriveSyncReviewText;
  section: DriveSyncReviewSectionKey;
  status: DriveSyncReviewRowStatus;
}

export interface DriveSyncReviewSection {
  addedCount: number;
  changedCount: number;
  keptCount: number;
  key: DriveSyncReviewSectionKey;
  removedCount: number;
  rows: DriveSyncReviewRow[];
}

export interface DriveSyncReviewDraft {
  action: DriveSyncReviewAction;
  /**
   * 869f135ru. Scopes the review has no section for, resolved once and carried
   * through to the reviewed payload.
   *
   * The review reconciles the seven scopes a reader can make a per-row decision
   * about. `ALL_DATA_TRANSFER_SCOPES` carries ten. The other three -
   * `crewForgeProfiles`, `savedRumbleOpponents`, `boostedCharacterIds` - have no
   * section, and `buildReviewedAllDataPayload` used to rebuild the payload from
   * the sections alone, so confirming a review UPLOADED A BACKUP WITH THOSE
   * THREE MISSING. `crewForgeProfiles` had just been added to the export by
   * 869f12x4p for exactly this class of loss, and the sync path never got it.
   *
   * This is derived from the scope list rather than listed, so a new scope is
   * carried from the day it exists whether or not anybody remembers this file.
   */
  carried: Partial<AllDataTransferPayload>;
  sections: DriveSyncReviewSection[];
}

interface SectionConfig<T> {
  buildPayload: (items: T[], exportedAt: string) => Partial<AllDataTransferPayload>;
  detail: (item: T) => DriveSyncReviewText;
  getItems: (payload: AllDataTransferPayload) => T[];
  key: DriveSyncReviewSectionKey;
  label: (item: T) => DriveSyncReviewText;
  rowKey: (item: T) => string;
}

/** The item's own name, or id, as it is - or, when it has neither, a phrase to translate. */
function ownOr(own: string, key: string, params?: Record<string, number | string>): DriveSyncReviewText {
  return own ? { text: own } : { key, ...(params ? { params } : {}) };
}

const sectionConfigs: [SectionConfig<never>, ...SectionConfig<never>[]] = [
  {
    buildPayload: (items, _exportedAt) => ({
      favorites: {
        characters: items,
      },
    }),
    detail: (item) => ({ text: `#${readNumber(item, 'number') ?? ''}` }),
    getItems: (payload) => (payload.favorites?.characters ?? []) as never[],
    key: 'favorites',
    label: (item) => ({ text: readString(item, 'name') || `#${readNumber(item, 'number') ?? ''}` }),
    rowKey: (item) => String(readNumber(item, 'number') ?? ''),
  },
  {
    buildPayload: (items, exportedAt) => ({
      favoriteShips: {
        exportedAt,
        schemaVersion: 1,
        ships: items,
        source: 'favorite-ships',
      },
    }),
    detail: (item) => ({ text: `#${readNumber(item, 'id') ?? ''}` }),
    getItems: (payload) => (payload.favoriteShips?.ships ?? []) as never[],
    key: 'favoriteShips',
    label: (item) =>
      ownOr(readString(item, 'name'), 'driveSync.review.rowLabels.ship', {
        id: readNumber(item, 'id') ?? '',
      }),
    rowKey: (item) => String(readNumber(item, 'id') ?? ''),
  },
  {
    buildPayload: (items, exportedAt) => ({
      characterBoxes: {
        boxes: items,
        exportedAt,
        schemaVersion: 1,
        source: 'character-boxes',
      },
    }),
    detail: (item) => ({
      key: 'driveSync.review.rowDetails.characters',
      params: { count: readArray(item, 'characterIds').length },
    }),
    getItems: (payload) => (payload.characterBoxes?.boxes ?? []) as never[],
    key: 'characterBoxes',
    label: (item) =>
      ownOr(
        readString(item, 'name') || readString(item, 'id'),
        'driveSync.review.rowLabels.characterBox',
      ),
    rowKey: (item) => readString(item, 'id'),
  },
  {
    buildPayload: (items, exportedAt) => ({
      characterOverrides: {
        exportedAt,
        overrides: items,
        schemaVersion: 1,
        source: 'character-overrides',
      },
    }),
    detail: (item) => ({ text: `#${readNumber(item, 'characterId') ?? ''}` }),
    getItems: (payload) => (payload.characterOverrides?.overrides ?? []) as never[],
    key: 'characterOverrides',
    label: (item) =>
      ownOr(readString(item, 'name'), 'driveSync.review.rowLabels.character', {
        id: readNumber(item, 'characterId') ?? '',
      }),
    rowKey: (item) => String(readNumber(item, 'characterId') ?? ''),
  },
  {
    buildPayload: (items, exportedAt) => ({
      savedTeams: {
        exportedAt,
        schemaVersion: 1,
        source: 'saved-teams',
        teams: items,
      },
    }),
    detail: (item) => ({
      key: 'driveSync.review.rowDetails.slots',
      params: { count: readArray(item, 'slots').filter((slot) => slot !== null).length },
    }),
    getItems: (payload) => (payload.savedTeams?.teams ?? []) as never[],
    key: 'savedTeams',
    label: (item) =>
      ownOr(readString(item, 'name') || readString(item, 'id'), 'driveSync.review.rowLabels.savedTeam'),
    rowKey: (item) => readString(item, 'id'),
  },
  {
    buildPayload: (items, exportedAt) => ({
      savedRumbleTeams: {
        exportedAt,
        rumbleTeams: items,
        schemaVersion: 1,
        source: 'saved-rumble-teams',
      },
    }),
    detail: (item) => ({
      key: 'driveSync.review.rowDetails.teams',
      params: { count: readArray(item, 'teams').length },
    }),
    getItems: (payload) => (payload.savedRumbleTeams?.rumbleTeams ?? []) as never[],
    key: 'savedRumbleTeams',
    label: (item) =>
      ownOr(
        readString(item, 'name') || readString(item, 'id'),
        'driveSync.review.rowLabels.savedRumbleTeam',
      ),
    rowKey: (item) => readString(item, 'id'),
  },
  {
    buildPayload: (items, exportedAt) => ({
      savedEnemies: {
        enemies: items,
        exportedAt,
        schemaVersion: 1,
        source: 'saved-enemies',
      },
    }),
    detail: (item) => ({
      key: 'driveSync.review.rowDetails.abilitiesAndMechanics',
      params: {
        abilities: readArray(item, 'requiredAbilities').length,
        mechanics: readArray(item, 'enemyMechanics').length,
      },
    }),
    getItems: (payload) => (payload.savedEnemies?.enemies ?? []) as never[],
    key: 'savedEnemies',
    label: (item) =>
      ownOr(readString(item, 'name') || readString(item, 'id'), 'driveSync.review.rowLabels.savedEnemy'),
    rowKey: (item) => readString(item, 'id'),
  },
];

export function buildDriveSyncReviewDraft(
  localPayload: AllDataTransferPayload,
  drivePayload: AllDataTransferPayload,
  action: DriveSyncReviewAction,
): DriveSyncReviewDraft {
  return {
    action,
    carried: collectCarriedScopes(localPayload, drivePayload, action),
    sections: sectionConfigs.map((config) =>
      buildReviewSection(localPayload, drivePayload, action, config),
    ),
  };
}

/**
 * Scopes with no review section, taken from whichever side the action makes authoritative - or,
 * on a Merge, combined by `CARRIED_SCOPE_MERGERS`.
 */
function collectCarriedScopes(
  localPayload: AllDataTransferPayload,
  drivePayload: AllDataTransferPayload,
  action: DriveSyncReviewAction,
): Partial<AllDataTransferPayload> {
  const reviewed = new Set<string>(sectionConfigs.map((config) => config.key));
  const carried: Partial<AllDataTransferPayload> = {};

  for (const scope of ALL_DATA_TRANSFER_SCOPES) {
    if (reviewed.has(scope)) {
      continue;
    }

    /*
     * `replace-local` makes Drive authoritative; the other two push the device.
     * Either way, fall back to the other side rather than dropping a scope that
     * exists on only one of them - losing it is the defect this exists to stop.
     */
    const preferred = action === 'replace-local' ? drivePayload : localPayload;
    const fallback = action === 'replace-local' ? localPayload : drivePayload;
    const value =
      action === 'merge-and-upload'
        ? mergeCarriedScope(scope as CarriedScope, localPayload[scope], drivePayload[scope])
        : (preferred[scope] ?? fallback[scope]);

    if (value !== undefined) {
      assignScope(carried, scope, cloneValue(value));
    }
  }

  return carried;
}

/** The scopes a review has no section for, so no row where the reader could choose. */
type CarriedScope = Exclude<AllDataTransferScope, DriveSyncReviewSectionKey>;

/**
 * 869f63gq1. How a Merge combines a carried scope that BOTH sides hold.
 *
 * Every carried scope used to be taken whole from the device, so a Merge deleted
 * what only Drive had: an opponent saved on the reader's other phone left this
 * device AND the backup the Merge uploaded, while the unreviewed Merge in
 * Settings kept it. Saved items now merge by id - the device's copy wins a
 * clash, and what only Drive had is appended in Drive's order. Typed over every
 * carried scope, so a scope that loses its review section has to say how it
 * merges.
 */
const CARRIED_SCOPE_MERGERS: {
  [Scope in CarriedScope]: (
    device: NonNullable<AllDataTransferPayload[Scope]>,
    drive: NonNullable<AllDataTransferPayload[Scope]>,
  ) => NonNullable<AllDataTransferPayload[Scope]>;
} = {
  crewForgeProfiles: (device, drive) => ({
    ...device,
    profiles: mergeById(device.profiles, drive.profiles),
  }),
  savedRumbleOpponents: (device, drive) => ({
    ...device,
    opponents: mergeById(device.opponents, drive.opponents),
  }),
  /* 869f1q90b. A boost list describes ONE event, so two are never merged: the device's stands. */
  boostedCharacterIds: (device) => device,
};

function mergeCarriedScope(scope: CarriedScope, device: unknown, drive: unknown): unknown {
  if (device === undefined || drive === undefined) {
    return device ?? drive;
  }

  /* TypeScript cannot tie `scope` to its own merger - the one cast SCOPE_CLONERS needs too. */
  return (CARRIED_SCOPE_MERGERS[scope] as (device: unknown, drive: unknown) => unknown)(
    device,
    drive,
  );
}

function mergeById<T extends { id: string }>(deviceItems: T[], driveItems: T[]): T[] {
  const deviceIds = new Set(deviceItems.map((item) => item.id));

  return [...deviceItems, ...driveItems.filter((item) => !deviceIds.has(item.id))];
}

function assignScope(
  target: Partial<AllDataTransferPayload>,
  scope: AllDataTransferScope,
  value: unknown,
): void {
  (target as Record<string, unknown>)[scope] = value;
}

/**
 * 869f135r4. What this sync will actually do, counted from the SAME resolution
 * that builds the payload.
 *
 * The modal already showed counts, at the top, describing the DIFF: how many rows
 * were added, changed, kept or removed. That is the right tool for deciding
 * row by row. It is the wrong tool for the last step before an irreversible
 * overwrite, where the only question is what will be gone afterwards - and
 * `removed` sat as one of four equal-weight buttons, indistinguishable from the
 * three that cost the reader nothing.
 *
 * `lost` is the number that matters, and it is derived rather than declared: a
 * row is lost when this device has it now and the resolved payload will not.
 * That is exactly the condition `buildReviewedAllDataPayload` applies, which is
 * what lets a test pin the summary to the payload instead of to itself.
 */
export interface DriveSyncReviewOutcome {
  /** Rows whose device copy survives. */
  keptFromDevice: number;
  /** Rows where the Drive copy wins. */
  takenFromDrive: number;
  /** Rows this device has now and will not have afterwards. */
  lost: number;
  total: number;
}

export function summariseReviewedDraft(draft: DriveSyncReviewDraft): DriveSyncReviewOutcome {
  const rows = draft.sections.flatMap((section) => section.rows);
  const resolved = rows.map((row) => ({
    row,
    item: row.choice === 'device' ? row.deviceItem : row.choice === 'drive' ? row.driveItem : null,
  }));

  return {
    keptFromDevice: resolved.filter((entry) => entry.row.choice === 'device' && entry.item !== null)
      .length,
    lost: resolved.filter((entry) => entry.row.deviceItem !== null && entry.item === null).length,
    takenFromDrive: resolved.filter((entry) => entry.row.choice === 'drive' && entry.item !== null)
      .length,
    total: rows.length,
  };
}

export function buildReviewedAllDataPayload(
  draft: DriveSyncReviewDraft,
  exportedAt = new Date().toISOString(),
): AllDataTransferPayload {
  return draft.sections.reduce<AllDataTransferPayload>(
    (payload, section) => {
      const config = getSectionConfig(section.key);
      const items = section.rows.flatMap((row) => {
        const item =
          row.choice === 'device' ? row.deviceItem : row.choice === 'drive' ? row.driveItem : null;

        return item === null ? [] : [cloneValue(item)];
      });

      return {
        ...payload,
        ...config.buildPayload(items as never[], exportedAt),
      };
    },
    {
      ...draft.carried,
      exportedAt,
      schemaVersion: 1,
      source: 'all-data',
    },
  );
}

export function updateDriveSyncReviewRowChoice(
  draft: DriveSyncReviewDraft,
  sectionKey: DriveSyncReviewSectionKey,
  rowKey: string,
  choice: DriveSyncReviewChoice,
): DriveSyncReviewDraft {
  return {
    ...draft,
    sections: draft.sections.map((section) => {
      if (section.key !== sectionKey) {
        return section;
      }

      const rows = section.rows.map((row) => {
        if (row.key !== rowKey) {
          return row;
        }

        const nextChoice = row.choices.includes(choice) ? choice : row.choice;

        return {
          ...row,
          choice: nextChoice,
          status: getRowStatus(row.deviceItem, row.driveItem, nextChoice),
        };
      });

      return buildSectionWithCounts(section.key, rows);
    }),
  };
}

function buildReviewSection<T>(
  localPayload: AllDataTransferPayload,
  drivePayload: AllDataTransferPayload,
  action: DriveSyncReviewAction,
  config: SectionConfig<T>,
): DriveSyncReviewSection {
  const localItems = indexItems(config.getItems(localPayload), config.rowKey);
  const driveItems = indexItems(config.getItems(drivePayload), config.rowKey);
  /*
   * 869f6td2j. Not sorted: rows keep this device's order, then what only Drive has, in Drive's
   * order. The payload is rebuilt in row order, so sorting by id brought Saved Teams back
   * oldest-first and favourites by number after every reviewed sync.
   */
  const keys = [...new Set([...localItems.keys(), ...driveItems.keys()])].filter(Boolean);
  const rows = keys.map((key) => {
    const deviceItem = localItems.get(key) ?? null;
    const driveItem = driveItems.get(key) ?? null;
    const choice = getDefaultChoice(action, deviceItem, driveItem);

    return {
      choice,
      choices: getAvailableChoices(deviceItem, driveItem),
      detail: config.detail((driveItem ?? deviceItem) as T),
      deviceItem: cloneValue(deviceItem),
      driveItem: cloneValue(driveItem),
      key,
      label: config.label((driveItem ?? deviceItem) as T),
      section: config.key,
      status: getRowStatus(deviceItem, driveItem, choice),
    };
  });

  return buildSectionWithCounts(config.key, rows);
}

function buildSectionWithCounts(
  key: DriveSyncReviewSectionKey,
  rows: DriveSyncReviewRow[],
): DriveSyncReviewSection {
  return {
    addedCount: rows.filter((row) => row.choice !== 'remove' && row.status === 'added').length,
    changedCount: rows.filter((row) => row.choice !== 'remove' && row.status === 'changed').length,
    keptCount: rows.filter((row) => row.choice !== 'remove' && row.status === 'kept').length,
    key,
    removedCount: rows.filter((row) => row.choice === 'remove').length,
    rows,
  };
}

function cloneValue<T>(value: T): T {
  return value === null || value === undefined ? value : (JSON.parse(JSON.stringify(value)) as T);
}

function getAvailableChoices(
  deviceItem: unknown | null,
  driveItem: unknown | null,
): DriveSyncReviewChoice[] {
  return [
    ...(deviceItem ? (['device'] as const) : []),
    ...(driveItem ? (['drive'] as const) : []),
    'remove',
  ];
}

function getDefaultChoice(
  action: DriveSyncReviewAction,
  deviceItem: unknown | null,
  driveItem: unknown | null,
): DriveSyncReviewChoice {
  if (action === 'replace-cloud') {
    return deviceItem ? 'device' : 'remove';
  }

  return driveItem ? 'drive' : action === 'merge-and-upload' && deviceItem ? 'device' : 'remove';
}

function getRowStatus(
  deviceItem: unknown | null,
  driveItem: unknown | null,
  choice: DriveSyncReviewChoice,
): DriveSyncReviewRowStatus {
  if (choice === 'remove') {
    return 'removed';
  }

  if (!deviceItem || !driveItem) {
    return 'added';
  }

  return stableStringify(deviceItem) === stableStringify(driveItem) ? 'kept' : 'changed';
}

function getSectionConfig(sectionKey: DriveSyncReviewSectionKey): SectionConfig<never> {
  return sectionConfigs.find((config) => config.key === sectionKey) ?? sectionConfigs[0];
}

function indexItems<T>(items: T[], getKey: (item: T) => string): Map<string, T> {
  const indexedItems = new Map<string, T>();

  items.forEach((item) => {
    const key = getKey(item);

    if (key) {
      indexedItems.set(key, item);
    }
  });

  return indexedItems;
}

function readArray(value: unknown, key: string): unknown[] {
  return isRecord(value) && Array.isArray(value[key]) ? value[key] : [];
}

function readNumber(value: unknown, key: string): number | null {
  return isRecord(value) && typeof value[key] === 'number' ? value[key] : null;
}

function readString(value: unknown, key: string): string {
  return isRecord(value) && typeof value[key] === 'string' ? value[key] : '';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function stableStringify(value: unknown): string {
  if (!isRecord(value) && !Array.isArray(value)) {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableStringify(entry)).join(',')}]`;
  }

  return `{${Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
    .join(',')}}`;
}
