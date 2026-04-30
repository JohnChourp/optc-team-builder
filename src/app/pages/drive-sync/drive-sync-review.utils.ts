import { type AllDataTransferPayload } from '../settings/all-data-transfer.utils';

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

export interface DriveSyncReviewRow {
  choice: DriveSyncReviewChoice;
  choices: DriveSyncReviewChoice[];
  detail: string;
  deviceItem: unknown | null;
  driveItem: unknown | null;
  key: string;
  label: string;
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
  sections: DriveSyncReviewSection[];
}

interface SectionConfig<T> {
  buildPayload: (items: T[], exportedAt: string) => Partial<AllDataTransferPayload>;
  detail: (item: T) => string;
  getItems: (payload: AllDataTransferPayload) => T[];
  key: DriveSyncReviewSectionKey;
  label: (item: T) => string;
  rowKey: (item: T) => string;
}

const sectionOrder: DriveSyncReviewSectionKey[] = [
  'favorites',
  'favoriteShips',
  'characterBoxes',
  'characterOverrides',
  'savedTeams',
  'savedRumbleTeams',
  'savedEnemies',
];

const sectionConfigs: SectionConfig<never>[] = [
  {
    buildPayload: (items, _exportedAt) => ({
      favorites: {
        characters: items,
      },
    }),
    detail: (item) => `#${readNumber(item, 'number') ?? ''}`,
    getItems: (payload) => (payload.favorites?.characters ?? []) as never[],
    key: 'favorites',
    label: (item) => readString(item, 'name') || `#${readNumber(item, 'number') ?? ''}`,
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
    detail: (item) => `#${readNumber(item, 'id') ?? ''}`,
    getItems: (payload) => (payload.favoriteShips?.ships ?? []) as never[],
    key: 'favoriteShips',
    label: (item) => readString(item, 'name') || `Ship #${readNumber(item, 'id') ?? ''}`,
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
    detail: (item) => `${readArray(item, 'characterIds').length} characters`,
    getItems: (payload) => (payload.characterBoxes?.boxes ?? []) as never[],
    key: 'characterBoxes',
    label: (item) => readString(item, 'name') || readString(item, 'id') || 'Character box',
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
    detail: (item) => `#${readNumber(item, 'characterId') ?? ''}`,
    getItems: (payload) => (payload.characterOverrides?.overrides ?? []) as never[],
    key: 'characterOverrides',
    label: (item) =>
      readString(item, 'name') || `Character #${readNumber(item, 'characterId') ?? ''}`,
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
    detail: (item) => `${readArray(item, 'slots').filter((slot) => slot !== null).length} slots`,
    getItems: (payload) => (payload.savedTeams?.teams ?? []) as never[],
    key: 'savedTeams',
    label: (item) => readString(item, 'name') || readString(item, 'id') || 'Saved team',
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
    detail: (item) => `${readArray(item, 'teams').length} teams`,
    getItems: (payload) => (payload.savedRumbleTeams?.rumbleTeams ?? []) as never[],
    key: 'savedRumbleTeams',
    label: (item) => readString(item, 'name') || readString(item, 'id') || 'Saved Rumble team',
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
    detail: (item) =>
      `${readArray(item, 'requiredAbilities').length} abilities, ${readArray(item, 'enemyMechanics').length} mechanics`,
    getItems: (payload) => (payload.savedEnemies?.enemies ?? []) as never[],
    key: 'savedEnemies',
    label: (item) => readString(item, 'name') || readString(item, 'id') || 'Saved enemy',
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
    sections: sectionConfigs.map((config) =>
      buildReviewSection(localPayload, drivePayload, action, config),
    ),
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

        return {
          ...row,
          choice: row.choices.includes(choice) ? choice : row.choice,
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
  const keys = [...new Set([...localItems.keys(), ...driveItems.keys()])].filter(Boolean).sort();
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

export function getDriveSyncReviewSectionKeys(): DriveSyncReviewSectionKey[] {
  return [...sectionOrder];
}
