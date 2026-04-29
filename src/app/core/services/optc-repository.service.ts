import { Injectable } from '@angular/core';
import type { Database, SqlJsStatic } from 'sql.js';

import {
  DEFAULT_AUTO_TEAM_CANDIDATE_LIMIT,
  type AutoBuildCandidateQueryOptions,
} from '../models/auto-team-builder.models';
import { type AutoBuildAbilityCatalog } from '../models/auto-team-builder-ability.models';
import {
  type CharacterAssets,
  type CharacterDetail,
  type CharacterDetailRecord,
  type CharacterRecord,
  type CharacterSupportEntry,
  type DetailedCharacterSearchQuery,
  type CharacterListItem,
  type CharacterSearchQuery,
  type DatasetManifest,
  type NormalizedSuperSpecialCriteria,
  type OfflinePackSummary,
  type RegionAvailability,
  type ShipRecord,
  type SuperCriteriaBranch,
} from '../models/optc.models';
import { CharacterOverridesService } from './character-overrides.service';
import {
  applyOverrideToCharacterDetailRecord,
  applyOverrideToCharacterListItem,
} from './character-overrides.utils';

interface SqlRow {
  [key: string]: string | number | null;
}

const SQL_WASM_PATH = 'assets/vendor/sql.js/sql-wasm.wasm';
const SQL_SEED_PATH = 'assets/data/optc-seed.sql';
const DATASET_MANIFEST_PATH = 'assets/data/optc-manifest.json';
const AUTO_TEAM_BUILDER_ABILITY_CATALOG_PATH = 'assets/data/optc-auto-builder-abilities.json';
const FALLBACK_CHARACTER_IMAGE = 'assets/placeholders/character-card.svg';
const INVALID_CLASS_PATTERN = /^Class\d+$/i;
const SHIP_THUMBNAIL_PACK_ID = 'ship-thumbnails';
const SHIP_THUMBNAIL_PACK_KEY = 'shipThumbnails';

function buildCharacterPowerFirstOrderByClause(alias: string): string {
  const prefix = alias ? `${alias}.` : '';
  return `${prefix}id DESC`;
}

function buildCharacterBoostOrderByClause(alias: string, columnName: string): string {
  const prefix = alias ? `${alias}.` : '';
  return `${prefix}${columnName} DESC, ${prefix}id DESC, ${prefix}cost DESC, ${prefix}name COLLATE NOCASE ASC`;
}

function buildCharacterListOrderByClause(
  alias: string,
  sortMode: CharacterSearchQuery['sortMode'] | 'catalog',
): string {
  const prefix = alias ? `${alias}.` : '';

  if (sortMode === 'captainHpBoost') {
    return buildCharacterBoostOrderByClause(alias, 'captain_hp_boost');
  }

  if (sortMode === 'captainAtkBoost') {
    return buildCharacterBoostOrderByClause(alias, 'captain_atk_boost');
  }

  if (sortMode === 'captainAverageBoost') {
    return buildCharacterBoostOrderByClause(alias, 'captain_average_boost');
  }

  return `${prefix}stars DESC, ${prefix}id DESC`;
}

function buildDetailedCharacterOrderByClause(
  alias: string,
  sortMode: DetailedCharacterSearchQuery['sortMode'] | 'catalog',
): string {
  if (sortMode === 'captainHpBoost') {
    return buildCharacterBoostOrderByClause(alias, 'captain_hp_boost');
  }

  if (sortMode === 'captainAtkBoost') {
    return buildCharacterBoostOrderByClause(alias, 'captain_atk_boost');
  }

  if (sortMode === 'captainAverageBoost') {
    return buildCharacterBoostOrderByClause(alias, 'captain_average_boost');
  }

  if (sortMode === 'nameAsc') {
    return `${alias}.name COLLATE NOCASE ASC, ${alias}.id ASC`;
  }

  if (sortMode === 'nameDesc') {
    return `${alias}.name COLLATE NOCASE DESC, ${alias}.id DESC`;
  }

  if (sortMode === 'idAsc') {
    return `${alias}.id ASC`;
  }

  if (sortMode === 'idDesc' || sortMode === 'newest' || sortMode === 'powerFirst') {
    return buildCharacterPowerFirstOrderByClause(alias);
  }

  return `${alias}.stars DESC, ${alias}.id DESC`;
}

function normalizeStringList(value: unknown): string[] {
  return (Array.isArray(value) ? value : [])
    .map((entry) => String(entry ?? '').trim())
    .filter((entry) => entry.length > 0);
}

function normalizeSupportData(value: unknown): CharacterSupportEntry[] {
  return (Array.isArray(value) ? value : [])
    .map((entry) => {
      const record =
        entry && typeof entry === 'object' && !Array.isArray(entry)
          ? (entry as Record<string, unknown>)
          : null;
      const supportedCharactersText = String(
        record?.['supportedCharactersText'] ?? record?.['Characters'] ?? '',
      ).trim();
      const levelDescriptions = normalizeStringList(
        record?.['levelDescriptions'] ?? record?.['description'],
      );

      if (!supportedCharactersText.length && levelDescriptions.length === 0) {
        return null;
      }

      return {
        supportedCharactersText,
        levelDescriptions,
      };
    })
    .filter((entry): entry is CharacterSupportEntry => Boolean(entry));
}

function normalizeSuperCriteriaBranch(value: unknown): SuperCriteriaBranch | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  const record = value as Record<string, unknown>;
  const branchType = String(record['branchType'] ?? '').trim();

  if (branchType === 'character_count_any') {
    const requiredCount = Number(record['requiredCount']);
    const rawOptions = Array.isArray(record['options']) ? (record['options'] as unknown[]) : [];
    const options = rawOptions
      .map((entry: unknown) => {
        if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
          return null;
        }

        const entryRecord = entry as Record<string, unknown>;
        const label = String(entryRecord['label'] ?? '').trim();
        const acceptedKeys = normalizeStringList(entryRecord['acceptedKeys']);

        if (!label.length || acceptedKeys.length === 0) {
          return null;
        }

        return {
          label,
          acceptedKeys,
        };
      })
      .filter(
        (
          entry,
        ): entry is {
          label: string;
          acceptedKeys: string[];
        } => Boolean(entry),
      );

    return Number.isInteger(requiredCount) && requiredCount > 0 && options.length > 0
      ? {
          branchType,
          requiredCount,
          matchMode: record['matchMode'] === 'any_candidate' ? 'any_candidate' : 'unique_options',
          options,
        }
      : null;
  }

  if (branchType === 'class_or_type_count_any') {
    const requiredCount = Number(record['requiredCount']);
    const allowedClasses = normalizeStringList(record['allowedClasses']);
    const allowedTypes = normalizeStringList(record['allowedTypes']);

    return Number.isInteger(requiredCount) &&
      requiredCount > 0 &&
      (allowedClasses.length > 0 || allowedTypes.length > 0)
      ? {
          branchType,
          requiredCount,
          allowedClasses,
          allowedTypes,
        }
      : null;
  }

  if (branchType === 'class_or_type_presence_all') {
    const requiredClasses = normalizeStringList(record['requiredClasses']);
    const requiredTypes = normalizeStringList(record['requiredTypes']);

    return requiredClasses.length > 0 || requiredTypes.length > 0
      ? {
          branchType,
          requiredClasses,
          requiredTypes,
        }
      : null;
  }

  return null;
}

function normalizeSuperSpecialCriteria(value: unknown): NormalizedSuperSpecialCriteria | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  const record = value as Record<string, unknown>;
  const rawText = String(record['rawText'] ?? '').trim();
  const rawRosterBranches = Array.isArray(record['rosterBranches'])
    ? (record['rosterBranches'] as unknown[])
    : [];
  const rosterBranches = rawRosterBranches
    .map((branch: unknown) => normalizeSuperCriteriaBranch(branch))
    .filter((branch): branch is SuperCriteriaBranch => Boolean(branch));
  const parserStatus = String(record['parserStatus'] ?? '').trim();
  const normalizedParserStatus =
    parserStatus === 'roster_only' ||
    parserStatus === 'mixed' ||
    parserStatus === 'non_roster_only' ||
    parserStatus === 'unsupported'
      ? parserStatus
      : rosterBranches.length > 0
        ? 'roster_only'
        : 'unsupported';

  if (!rawText.length) {
    return null;
  }

  return {
    rawText,
    requiresCaptain: Boolean(record['requiresCaptain']),
    excludesSelf: Boolean(record['excludesSelf']),
    rosterBranches,
    hasNonRosterBranches: Boolean(record['hasNonRosterBranches']),
    parserStatus: normalizedParserStatus,
  };
}

function parseNullableNumber(value: string | number | null): number | null {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseBoostNumber(value: string | number | null): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function compareBoostSortedCharacters(
  left: CharacterRecord,
  right: CharacterRecord,
  key: 'captainHpBoost' | 'captainAtkBoost' | 'captainAverageBoost',
): number {
  const boostDifference = right[key] - left[key];

  if (boostDifference !== 0) {
    return boostDifference;
  }

  const idDifference = right.id - left.id;

  if (idDifference !== 0) {
    return idDifference;
  }

  const costDifference = right.cost - left.cost;

  if (costDifference !== 0) {
    return costDifference;
  }

  return left.name.localeCompare(right.name, undefined, { sensitivity: 'base' });
}

function normalizeCandidateCostRange(range: AutoBuildCandidateQueryOptions['costRange']): {
  min: number | null;
  max: number | null;
} {
  return {
    min: normalizeCandidateCostRangeBound(range?.min),
    max: normalizeCandidateCostRangeBound(range?.max),
  };
}

function normalizeCandidateCostRangeBound(value: unknown): number | null {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const parsedValue = Number(value);

  return Number.isInteger(parsedValue) && parsedValue >= 0 ? parsedValue : null;
}

function recordMatchesCandidateCostRange(
  record: Pick<CharacterDetailRecord, 'cost'>,
  range: { min: number | null; max: number | null },
): boolean {
  if (range.min !== null && record.cost < range.min) {
    return false;
  }

  if (range.max !== null && record.cost > range.max) {
    return false;
  }

  return true;
}

@Injectable({ providedIn: 'root' })
export class OptcRepositoryService {
  private readonly sqlPromise: Promise<SqlJsStatic>;
  private readonly databasePromise: Promise<Database>;
  private manifestPromise?: Promise<DatasetManifest>;
  private autoBuilderAbilityCatalogPromise?: Promise<AutoBuildAbilityCatalog>;

  public constructor(private readonly characterOverrides: CharacterOverridesService) {
    this.sqlPromise = import('sql.js').then((module) =>
      module.default({
        locateFile: () => SQL_WASM_PATH,
      }),
    );
    this.databasePromise = this.createDatabase();
  }

  public async getDatasetManifest(): Promise<DatasetManifest> {
    this.manifestPromise ??= this.fetchJson<DatasetManifest>(DATASET_MANIFEST_PATH).then(
      (manifest) => this.normalizeManifest(manifest),
    );
    return this.manifestPromise;
  }

  public async getAutoBuilderAbilityCatalog(): Promise<AutoBuildAbilityCatalog> {
    this.autoBuilderAbilityCatalogPromise ??= this.fetchJson<AutoBuildAbilityCatalog>(
      AUTO_TEAM_BUILDER_ABILITY_CATALOG_PATH,
    );
    return this.autoBuilderAbilityCatalogPromise;
  }

  public async searchCharacters(query: CharacterSearchQuery): Promise<CharacterListItem[]> {
    const allowedCharacterIds = [
      ...new Set(
        (query.allowedCharacterIds ?? []).filter(
          (characterId) => Number.isInteger(characterId) && characterId > 0,
        ),
      ),
    ];
    const excludedCharacterIds = [
      ...new Set(
        (query.excludedCharacterIds ?? []).filter(
          (characterId) => Number.isInteger(characterId) && characterId > 0,
        ),
      ),
    ];
    const allowedCharacterClause = allowedCharacterIds.length
      ? `\n          AND id IN (${allowedCharacterIds.map(() => '?').join(',')})`
      : query.allowedCharacterIds
        ? '\n          AND 1 = 0'
        : '';
    const excludedCharacterClause = excludedCharacterIds.length
      ? `\n          AND id NOT IN (${excludedCharacterIds.map(() => '?').join(',')})`
      : '';
    const orderByClause = buildCharacterListOrderByClause('', query.sortMode ?? 'catalog');
    const rows = await this.selectAll(
      `
        SELECT
          id,
          name,
          is_incomplete,
          type,
          primary_class,
          secondary_class,
          classes_json,
          stars,
          cost,
          combo,
          min_hp,
          min_atk,
          min_rcv,
          max_hp,
          max_atk,
          max_rcv,
          growth,
          captain_hp_boost,
          captain_atk_boost,
          captain_average_boost,
          region_json,
          assets_json,
          search_text
        FROM characters
        WHERE (? = '' OR search_text LIKE '%' || ? || '%')
          AND (? = '' OR type LIKE '%' || ? || '%')
          AND (? = '' OR primary_class = ? OR secondary_class = ?)
          ${allowedCharacterClause}
          ${excludedCharacterClause}
        ORDER BY ${orderByClause}
        LIMIT ? OFFSET ?
      `,
      [
        query.searchTerm.toLowerCase(),
        query.searchTerm.toLowerCase(),
        query.typeFilter,
        query.typeFilter,
        query.classFilter,
        query.classFilter,
        query.classFilter,
        ...allowedCharacterIds,
        ...excludedCharacterIds,
        query.limit,
        query.offset,
      ],
    );

    return this.decorateCharacterRows(rows);
  }

  public async getAllCharacters(): Promise<CharacterListItem[]> {
    const rows = await this.selectAll(
      `
        SELECT
          id,
          name,
          is_incomplete,
          type,
          primary_class,
          secondary_class,
          classes_json,
          stars,
          cost,
          combo,
          min_hp,
          min_atk,
          min_rcv,
          max_hp,
          max_atk,
          max_rcv,
          growth,
          captain_hp_boost,
          captain_atk_boost,
          captain_average_boost,
          region_json,
          assets_json,
          search_text
        FROM characters
        ORDER BY stars DESC, id DESC
      `,
    );

    return this.decorateCharacterRows(rows);
  }

  public async searchDetailedCharacters(
    query: DetailedCharacterSearchQuery,
  ): Promise<CharacterDetailRecord[]> {
    await this.characterOverrides.ready();
    const overridesByCharacterId = this.characterOverrides.overridesByCharacterId();

    if (overridesByCharacterId.size === 0) {
      const normalizedSearchTerm = query.searchTerm.trim().toLowerCase();
      const normalizedSelectedTypes = [
        ...new Set(query.selectedTypes.map((type) => type.trim().toUpperCase())),
      ].filter((type) => type.length > 0);
      const normalizedSelectedClasses = [
        ...new Set(query.selectedClasses.map((characterClass) => characterClass.trim())),
      ].filter((characterClass) => characterClass.length > 0);
      const allowedCharacterIds = [
        ...new Set(
          (query.allowedCharacterIds ?? []).filter(
            (characterId) => Number.isInteger(characterId) && characterId > 0,
          ),
        ),
      ];
      const excludedCharacterIds = [
        ...new Set(
          (query.excludedCharacterIds ?? []).filter(
            (characterId) => Number.isInteger(characterId) && characterId > 0,
          ),
        ),
      ];
      const whereClauses: string[] = [];
      const queryParams: Array<string | number> = [];

      if (normalizedSearchTerm.length > 0) {
        whereClauses.push(`c.search_text LIKE '%' || ? || '%'`);
        queryParams.push(normalizedSearchTerm);
      }

      if (normalizedSelectedTypes.length > 0) {
        const typeClauses = normalizedSelectedTypes.map(() => "(',' || c.type || ',') LIKE ?");

        whereClauses.push(
          query.selectedTypesMatchMode === 'any'
            ? `(${typeClauses.join(' OR ')})`
            : `(${typeClauses.join(' AND ')})`,
        );
        queryParams.push(...normalizedSelectedTypes.map((type) => `%,${type},%`));
      }

      if (normalizedSelectedClasses.length > 0) {
        const classClauses = normalizedSelectedClasses.map(() => 'c.classes_json LIKE ?');

        whereClauses.push(
          query.selectedClassesMatchMode === 'any'
            ? `(${classClauses.join(' OR ')})`
            : `(${classClauses.join(' AND ')})`,
        );
        queryParams.push(
          ...normalizedSelectedClasses.map((selectedClass) => `%\"${selectedClass}\"%`),
        );
      }

      if (allowedCharacterIds.length > 0) {
        whereClauses.push(`c.id IN (${allowedCharacterIds.map(() => '?').join(',')})`);
        queryParams.push(...allowedCharacterIds);
      } else if (query.allowedCharacterIds !== undefined) {
        whereClauses.push('1 = 0');
      }

      if (excludedCharacterIds.length > 0) {
        whereClauses.push(`c.id NOT IN (${excludedCharacterIds.map(() => '?').join(',')})`);
        queryParams.push(...excludedCharacterIds);
      }

      const orderByClause = buildDetailedCharacterOrderByClause('c', query.sortMode ?? 'catalog');
      const whereClause =
        whereClauses.length > 0 ? `WHERE ${whereClauses.join('\n          AND ')}` : '';
      const rows = await this.selectAll(
        `
          SELECT
            c.id,
            c.name,
            c.is_incomplete,
            c.type,
            c.primary_class,
            c.secondary_class,
            c.classes_json,
            c.stars,
            c.cost,
            c.combo,
            c.min_hp,
            c.min_atk,
            c.min_rcv,
            c.max_hp,
            c.max_atk,
            c.max_rcv,
            c.growth,
            c.captain_hp_boost,
            c.captain_atk_boost,
            c.captain_average_boost,
            c.region_json,
            c.assets_json,
            c.search_text,
            d.detail_json
          FROM characters c
          LEFT JOIN character_details d ON d.character_id = c.id
          ${whereClause}
          ORDER BY ${orderByClause}
          LIMIT ? OFFSET ?
        `,
        [...queryParams, query.limit, query.offset],
      );

      return this.decorateCharacterDetailRows(rows);
    }

    const records = await this.getAllDetailedCharacters();
    const normalizedSelectedTypes = [
      ...new Set(query.selectedTypes.map((type) => type.trim().toUpperCase())),
    ].filter((type) => type.length > 0);
    const normalizedSelectedClasses = [
      ...new Set(query.selectedClasses.map((characterClass) => characterClass.trim())),
    ].filter((characterClass) => characterClass.length > 0);
    const allowedCharacterIdSet =
      query.allowedCharacterIds === undefined
        ? null
        : new Set(
            query.allowedCharacterIds.filter(
              (characterId) => Number.isInteger(characterId) && characterId > 0,
            ),
          );
    const excludedCharacterIdSet = new Set(
      (query.excludedCharacterIds ?? []).filter(
        (characterId) => Number.isInteger(characterId) && characterId > 0,
      ),
    );
    const filteredRecords = this.sortDetailedRecords(
      records.filter((record) => {
        if (allowedCharacterIdSet && !allowedCharacterIdSet.has(record.id)) {
          return false;
        }

        if (excludedCharacterIdSet.has(record.id)) {
          return false;
        }

        if (!this.matchesSearchTerm(record, query.searchTerm)) {
          return false;
        }

        if (
          !this.matchesTypes(record, normalizedSelectedTypes, query.selectedTypesMatchMode ?? 'all')
        ) {
          return false;
        }

        if (
          !this.matchesClasses(
            record,
            normalizedSelectedClasses,
            query.selectedClassesMatchMode ?? 'all',
          )
        ) {
          return false;
        }

        return true;
      }),
      query.sortMode ?? 'catalog',
    );

    return filteredRecords.slice(query.offset, query.offset + query.limit);
  }

  public async getCharacterById(characterId: number): Promise<CharacterDetailRecord | null> {
    const rows = await this.selectAll(
      `
        SELECT
          c.id,
          c.name,
          c.is_incomplete,
          c.type,
          c.primary_class,
          c.secondary_class,
          c.classes_json,
          c.stars,
          c.cost,
          c.combo,
          c.min_hp,
          c.min_atk,
          c.min_rcv,
          c.max_hp,
          c.max_atk,
          c.max_rcv,
          c.growth,
          c.captain_hp_boost,
          c.captain_atk_boost,
          c.captain_average_boost,
          c.region_json,
          c.assets_json,
          c.search_text,
          d.detail_json
        FROM characters c
        LEFT JOIN character_details d ON d.character_id = c.id
        WHERE c.id = ?
      `,
      [characterId],
    );

    if (!rows.length) {
      return null;
    }

    const [record] = await this.decorateCharacterDetailRows(rows);

    return record ?? null;
  }

  public async getAutoBuilderCandidates(
    typeFilters: string[],
    limit: number | null = DEFAULT_AUTO_TEAM_CANDIDATE_LIMIT,
    options: AutoBuildCandidateQueryOptions = {},
  ): Promise<CharacterDetailRecord[]> {
    if (!typeFilters.length) {
      return [];
    }

    const lockedCharacterIds = [
      ...new Set(
        (options.lockedCharacterIds ?? []).filter(
          (characterId) => Number.isInteger(characterId) && characterId > 0,
        ),
      ),
    ];
    const allowedCharacterIds = [
      ...new Set(
        (options.allowedCharacterIds ?? []).filter(
          (characterId) => Number.isInteger(characterId) && characterId > 0,
        ),
      ),
    ];
    const selectedClasses = [
      ...new Set(
        (options.selectedClasses ?? [])
          .map((selectedClass) => selectedClass.trim())
          .filter((selectedClass) => selectedClass.length > 0),
      ),
    ];
    const excludedCharacterIds = [
      ...new Set(
        (options.excludedCharacterIds ?? []).filter(
          (characterId) => Number.isInteger(characterId) && characterId > 0,
        ),
      ),
    ];
    const normalizedTypeFilters = [
      ...new Set(typeFilters.map((type) => type.trim().toUpperCase())),
    ];
    const costRange = normalizeCandidateCostRange(options.costRange);
    await this.characterOverrides.ready();
    const overridesByCharacterId = this.characterOverrides.overridesByCharacterId();
    const allowedCharacterIdSet = allowedCharacterIds.length ? new Set(allowedCharacterIds) : null;
    const excludedCharacterIdSet = new Set(excludedCharacterIds);
    const lockedCharacterIdSet = new Set(lockedCharacterIds);

    let filteredRecords: CharacterDetailRecord[];

    if (overridesByCharacterId.size === 0) {
      const typeClauses = normalizedTypeFilters.map(() => "(',' || c.type || ',') LIKE ?");
      const queryParams: Array<string | number> = normalizedTypeFilters.map(
        (typeFilter) => `%,${typeFilter},%`,
      );
      const classClauses = selectedClasses.map(() => 'c.classes_json LIKE ?');
      let whereClause = `(${typeClauses.join(' OR ')})`;

      if (classClauses.length > 0) {
        whereClause = `(${whereClause} AND (${classClauses.join(' OR ')}))`;
        queryParams.push(...selectedClasses.map((selectedClass) => `%\"${selectedClass}\"%`));
      }

      if (costRange.min !== null) {
        whereClause = `(${whereClause} AND c.cost >= ?)`;
        queryParams.push(costRange.min);
      }

      if (costRange.max !== null) {
        whereClause = `(${whereClause} AND c.cost <= ?)`;
        queryParams.push(costRange.max);
      }

      if (lockedCharacterIds.length > 0) {
        whereClause = `(${whereClause} OR c.id IN (${lockedCharacterIds.map(() => '?').join(',')}))`;
        queryParams.push(...lockedCharacterIds);
      }

      if (allowedCharacterIds.length > 0) {
        const scopedIds = [...new Set([...allowedCharacterIds, ...lockedCharacterIds])];

        whereClause = `(${whereClause}) AND c.id IN (${scopedIds.map(() => '?').join(',')})`;
        queryParams.push(...scopedIds);
      }

      if (excludedCharacterIds.length > 0) {
        whereClause = `(${whereClause}) AND c.id NOT IN (${excludedCharacterIds
          .map(() => '?')
          .join(',')})`;
        queryParams.push(...excludedCharacterIds);
      }

      const rows = await this.selectAll(
        `
          SELECT
            c.id,
            c.name,
            c.is_incomplete,
            c.type,
            c.primary_class,
            c.secondary_class,
            c.classes_json,
            c.stars,
            c.cost,
            c.combo,
            c.min_hp,
            c.min_atk,
            c.min_rcv,
            c.max_hp,
            c.max_atk,
            c.max_rcv,
            c.growth,
            c.captain_hp_boost,
            c.captain_atk_boost,
            c.captain_average_boost,
            c.region_json,
            c.assets_json,
            c.search_text,
            d.detail_json
          FROM characters c
          LEFT JOIN character_details d ON d.character_id = c.id
          WHERE ${whereClause}
          ORDER BY ${buildCharacterPowerFirstOrderByClause('c')}
        `,
        queryParams,
      );

      const decoratedRows = await this.decorateCharacterDetailRows(rows);
      const scopedAllowedCharacterIdSet = allowedCharacterIdSet
        ? new Set([...allowedCharacterIds, ...lockedCharacterIds])
        : null;

      filteredRecords = this.sortDetailedRecords(decoratedRows, 'powerFirst').filter((record) => {
        if (excludedCharacterIdSet.has(record.id)) {
          return false;
        }

        if (
          !lockedCharacterIdSet.has(record.id) &&
          !recordMatchesCandidateCostRange(record, costRange)
        ) {
          return false;
        }

        return !scopedAllowedCharacterIdSet || scopedAllowedCharacterIdSet.has(record.id);
      });
    } else {
      const detailedRecords = this.sortDetailedRecords(
        await this.getAllDetailedCharacters(),
        'powerFirst',
      );
      filteredRecords = detailedRecords.filter((record) => {
        if (excludedCharacterIdSet.has(record.id)) {
          return false;
        }

        if (
          allowedCharacterIdSet &&
          !allowedCharacterIdSet.has(record.id) &&
          !lockedCharacterIdSet.has(record.id)
        ) {
          return false;
        }

        if (
          !lockedCharacterIdSet.has(record.id) &&
          !this.matchesTypes(record, normalizedTypeFilters, 'any')
        ) {
          return false;
        }

        if (
          !lockedCharacterIdSet.has(record.id) &&
          selectedClasses.length > 0 &&
          !this.matchesClasses(record, selectedClasses, 'any')
        ) {
          return false;
        }

        if (
          !lockedCharacterIdSet.has(record.id) &&
          !recordMatchesCandidateCostRange(record, costRange)
        ) {
          return false;
        }

        return true;
      });
    }
    if (limit === null) {
      return filteredRecords;
    }

    return filteredRecords.filter(
      (record, index) => index < limit || lockedCharacterIdSet.has(record.id),
    );
  }

  public async getCharactersByIds(ids: number[]): Promise<CharacterListItem[]> {
    if (!ids.length) {
      return [];
    }

    const placeholders = ids.map(() => '?').join(',');
    const rows = await this.selectAll(
      `
        SELECT
          id,
          name,
          is_incomplete,
          type,
          primary_class,
          secondary_class,
          classes_json,
          stars,
          cost,
          combo,
          min_hp,
          min_atk,
          min_rcv,
          max_hp,
          max_atk,
          max_rcv,
          growth,
          captain_hp_boost,
          captain_atk_boost,
          captain_average_boost,
          region_json,
          assets_json,
          search_text
        FROM characters
        WHERE id IN (${placeholders})
      `,
      ids,
    );

    const decorated = await this.decorateCharacterRows(rows);
    const order = new Map(ids.map((id, index) => [id, index]));

    return decorated.sort((left, right) => (order.get(left.id) ?? 0) - (order.get(right.id) ?? 0));
  }

  public async getDetailedCharactersByIds(ids: number[]): Promise<CharacterDetailRecord[]> {
    if (!ids.length) {
      return [];
    }

    const placeholders = ids.map(() => '?').join(',');
    const rows = await this.selectAll(
      `
        SELECT
          c.id,
          c.name,
          c.is_incomplete,
          c.type,
          c.primary_class,
          c.secondary_class,
          c.classes_json,
          c.stars,
          c.cost,
          c.combo,
          c.min_hp,
          c.min_atk,
          c.min_rcv,
          c.max_hp,
          c.max_atk,
          c.max_rcv,
          c.growth,
          c.captain_hp_boost,
          c.captain_atk_boost,
          c.captain_average_boost,
          c.region_json,
          c.assets_json,
          c.search_text,
          d.detail_json
        FROM characters c
        LEFT JOIN character_details d ON d.character_id = c.id
        WHERE c.id IN (${placeholders})
      `,
      ids,
    );

    const decorated = await this.decorateCharacterDetailRows(rows);
    const order = new Map(ids.map((id, index) => [id, index]));

    return decorated.sort((left, right) => (order.get(left.id) ?? 0) - (order.get(right.id) ?? 0));
  }

  public async getRumbleBuilderCandidates(): Promise<CharacterDetailRecord[]> {
    const records = await this.getAllDetailedCharacters();

    return records.filter((record) => this.hasUsableRumbleData(record.detail.rumbleData));
  }

  public async getShips(): Promise<ShipRecord[]> {
    const manifest = await this.getDatasetManifest();
    const installedPacks = new Map(manifest.packs.map((pack) => [pack.key, pack]));

    const rows = await this.selectAll(
      `
        SELECT id, name, thumb, description
        FROM ships
        ORDER BY id ASC
      `,
    );

    return rows.map((row) => ({
      id: Number(row['id']),
      name: String(row['name']),
      thumb: row['thumb'] ? String(row['thumb']) : null,
      thumbUrl: this.resolveShipThumbUrl(
        row['thumb'] ? String(row['thumb']) : null,
        installedPacks,
      ),
      description: String(row['description']),
    }));
  }

  private async createDatabase(): Promise<Database> {
    const sql = await this.sqlPromise;
    const seed = await this.fetchText(SQL_SEED_PATH);
    const database = new sql.Database();
    const statements = seed
      .split(/;\s*\n/)
      .map((statement) => statement.trim())
      .filter(Boolean);

    for (const statement of statements) {
      database.run(`${statement};`);
    }

    return database;
  }

  private async selectAll(query: string, params: Array<string | number> = []): Promise<SqlRow[]> {
    const database = await this.databasePromise;
    const result = database.exec(query, params);

    if (!result.length) {
      return [];
    }

    const [statement] = result;

    return (statement.values as Array<Array<string | number | null>>).map((valueRow) =>
      (statement.columns as string[]).reduce<SqlRow>((row, column, index) => {
        row[column] = valueRow[index] ?? null;
        return row;
      }, {}),
    );
  }

  private async decorateCharacterRows(rows: SqlRow[]): Promise<CharacterListItem[]> {
    await this.characterOverrides.ready();
    const manifest = await this.getDatasetManifest();
    const installedPacks = new Map(manifest.packs.map((pack) => [pack.key, pack]));
    const overridesByCharacterId = this.characterOverrides.overridesByCharacterId();

    return rows.map((row) => {
      const assets = this.parseJson<CharacterAssets>(row['assets_json'], {
        exactLocal: null,
        thumbnailLocal: null,
        thumbnailGlobal: null,
        thumbnailJapan: null,
      });

      const regionAvailability = this.parseJson<RegionAvailability>(row['region_json'], {
        exactLocal: false,
        thumbnailGlobal: false,
        thumbnailJapan: false,
      });

      const record: CharacterListItem = {
        id: Number(row['id']),
        name: String(row['name']),
        searchText: this.resolveSearchText(row),
        isIncomplete: Number(row['is_incomplete']) === 1,
        type: String(row['type']),
        primaryClass: String(row['primary_class']),
        secondaryClass: row['secondary_class'] ? String(row['secondary_class']) : null,
        classes: this.parseJson<string[]>(row['classes_json'], []),
        stars: Number(row['stars']),
        cost: Number(row['cost']),
        combo: Number(row['combo']),
        captainHpBoost: parseBoostNumber(row['captain_hp_boost']),
        captainAtkBoost: parseBoostNumber(row['captain_atk_boost']),
        captainAverageBoost: parseBoostNumber(row['captain_average_boost']),
        stats: {
          min: {
            hp: parseNullableNumber(row['min_hp']),
            atk: parseNullableNumber(row['min_atk']),
            rcv: parseNullableNumber(row['min_rcv']),
          },
          max: {
            hp: parseNullableNumber(row['max_hp']),
            atk: parseNullableNumber(row['max_atk']),
            rcv: parseNullableNumber(row['max_rcv']),
          },
          growth: parseNullableNumber(row['growth']),
        },
        regionAvailability,
        assets,
        imageUrl: this.resolveImageUrl(assets, { preferExactLocal: false, installedPacks }),
      };

      return applyOverrideToCharacterListItem(
        record,
        overridesByCharacterId.get(record.id) ?? null,
      );
    });
  }

  private async decorateCharacterDetailRows(rows: SqlRow[]): Promise<CharacterDetailRecord[]> {
    const records = await this.decorateCharacterRows(rows);
    const manifest = await this.getDatasetManifest();
    const installedPacks = new Map(manifest.packs.map((pack) => [pack.key, pack]));
    const overridesByCharacterId = this.characterOverrides.overridesByCharacterId();

    return records.map((record, index) =>
      applyOverrideToCharacterDetailRecord(
        {
          ...record,
          detail: this.normalizeCharacterDetail(
            this.parseJson<CharacterDetail>(
              rows[index]['detail_json'],
              this.emptyDetail(record.id),
            ),
            record.id,
          ),
          detailImageUrl: this.resolveImageUrl(record.assets, {
            preferExactLocal: true,
            installedPacks,
          }),
        },
        overridesByCharacterId.get(record.id) ?? null,
      ),
    );
  }

  private async getAllDetailedCharacters(): Promise<CharacterDetailRecord[]> {
    const rows = await this.selectAll(
      `
        SELECT
          c.id,
          c.name,
          c.is_incomplete,
          c.type,
          c.primary_class,
          c.secondary_class,
          c.classes_json,
          c.stars,
          c.cost,
          c.combo,
          c.min_hp,
          c.min_atk,
          c.min_rcv,
          c.max_hp,
          c.max_atk,
          c.max_rcv,
          c.growth,
          c.captain_hp_boost,
          c.captain_atk_boost,
          c.captain_average_boost,
          c.region_json,
          c.assets_json,
          c.search_text,
          d.detail_json
        FROM characters c
        LEFT JOIN character_details d ON d.character_id = c.id
        ORDER BY c.stars DESC, c.id DESC
      `,
    );

    return this.decorateCharacterDetailRows(rows);
  }

  private sortDetailedRecords(
    records: CharacterDetailRecord[],
    sortMode: DetailedCharacterSearchQuery['sortMode'] | 'catalog',
  ): CharacterDetailRecord[] {
    return [...records].sort((left, right) => {
      if (sortMode === 'captainHpBoost') {
        return compareBoostSortedCharacters(left, right, 'captainHpBoost');
      }

      if (sortMode === 'captainAtkBoost') {
        return compareBoostSortedCharacters(left, right, 'captainAtkBoost');
      }

      if (sortMode === 'captainAverageBoost') {
        return compareBoostSortedCharacters(left, right, 'captainAverageBoost');
      }

      if (sortMode === 'newest') {
        return right.id - left.id;
      }

      if (sortMode === 'powerFirst' || sortMode === 'idDesc') {
        return right.id - left.id;
      }

      if (sortMode === 'idAsc') {
        return left.id - right.id;
      }

      if (sortMode === 'nameAsc') {
        const nameDifference = left.name.localeCompare(right.name, undefined, {
          sensitivity: 'base',
        });

        return nameDifference || left.id - right.id;
      }

      if (sortMode === 'nameDesc') {
        const nameDifference = right.name.localeCompare(left.name, undefined, {
          sensitivity: 'base',
        });

        return nameDifference || right.id - left.id;
      }

      if (right.stars !== left.stars) {
        return right.stars - left.stars;
      }

      return right.id - left.id;
    });
  }

  private matchesSearchTerm(record: CharacterRecord, searchTerm: string): boolean {
    const normalizedSearchTerm = searchTerm.trim().toLowerCase();

    if (!normalizedSearchTerm.length) {
      return true;
    }

    return this.buildSearchableRecordText(record).includes(normalizedSearchTerm);
  }

  private matchesTypes(
    record: CharacterRecord,
    selectedTypes: string[],
    matchMode: 'all' | 'any',
  ): boolean {
    if (!selectedTypes.length) {
      return true;
    }

    const recordTypes = new Set(
      record.type
        .split(',')
        .map((type) => type.trim().toUpperCase())
        .filter((type) => type.length > 0),
    );

    return matchMode === 'any'
      ? selectedTypes.some((type) => recordTypes.has(type))
      : selectedTypes.every((type) => recordTypes.has(type));
  }

  private matchesClasses(
    record: CharacterRecord,
    selectedClasses: string[],
    matchMode: 'all' | 'any',
  ): boolean {
    if (!selectedClasses.length) {
      return true;
    }

    const recordClasses = new Set(record.classes.map((characterClass) => characterClass.trim()));

    return matchMode === 'any'
      ? selectedClasses.some((characterClass) => recordClasses.has(characterClass))
      : selectedClasses.every((characterClass) => recordClasses.has(characterClass));
  }

  private hasUsableRumbleData(rumbleData: Record<string, unknown> | null): boolean {
    if (!rumbleData || typeof rumbleData !== 'object' || Array.isArray(rumbleData)) {
      return false;
    }

    return Object.keys(rumbleData).some((key) => key !== 'id');
  }

  private resolveImageUrl(
    assets: CharacterAssets,
    options: {
      preferExactLocal: boolean;
      installedPacks?: Map<string, OfflinePackSummary>;
    },
  ): string {
    const packMap = options.installedPacks ?? new Map();
    const thumbnailGloInstalled = packMap.get('thumbnailsGlo')?.installed ?? false;
    const thumbnailJapanInstalled = packMap.get('thumbnailsJapan')?.installed ?? false;

    if (options.preferExactLocal && assets.exactLocal) {
      return this.normalizeAssetUrl(assets.exactLocal);
    }

    if (assets.thumbnailLocal) {
      return this.normalizeAssetUrl(assets.thumbnailLocal);
    }

    if (assets.exactLocal) {
      return this.normalizeAssetUrl(assets.exactLocal);
    }

    if (thumbnailGloInstalled && assets.thumbnailGlobal) {
      return this.toLocalAssetPath('thumbnails-glo', assets.thumbnailGlobal);
    }

    if (thumbnailJapanInstalled && assets.thumbnailJapan) {
      return this.toLocalAssetPath('thumbnails-jap', assets.thumbnailJapan);
    }

    return FALLBACK_CHARACTER_IMAGE;
  }

  private toLocalAssetPath(packId: string, relativePath: string): string {
    return `assets/offline-packs/${packId}/${relativePath}`;
  }

  private normalizeAssetUrl(assetUrl: string): string {
    return assetUrl.startsWith('/assets/') ? assetUrl.slice(1) : assetUrl;
  }

  private resolveShipThumbUrl(
    thumb: string | null,
    installedPacks?: Map<string, OfflinePackSummary>,
  ): string | null {
    const trimmedThumb = thumb?.trim() ?? '';

    if (!trimmedThumb.length) {
      return null;
    }

    if (
      trimmedThumb.startsWith('assets/') ||
      trimmedThumb.startsWith('/assets/') ||
      trimmedThumb.startsWith('http://') ||
      trimmedThumb.startsWith('https://') ||
      trimmedThumb.startsWith('data:')
    ) {
      return this.normalizeAssetUrl(trimmedThumb);
    }

    const shipThumbnailsInstalled =
      (installedPacks ?? new Map()).get(SHIP_THUMBNAIL_PACK_KEY)?.installed ?? false;

    return shipThumbnailsInstalled
      ? this.toLocalAssetPath(SHIP_THUMBNAIL_PACK_ID, trimmedThumb)
      : null;
  }

  private emptyDetail(characterId: number): CharacterDetail {
    return {
      characterId,
      captainAbility: null,
      captainAbilityVariants: [],
      captainNotes: null,
      specialName: null,
      specialText: null,
      specialNotes: null,
      superSpecialText: null,
      superSpecialCriteriaText: null,
      superSpecialNotes: null,
      superSpecialCriteria: null,
      partyConflictKeys: [],
      characterTags: [],
      builderAbilities: [],
      sailorAbilities: [],
      sailorNotes: null,
      limitBreak: [],
      potentialAbilities: [],
      supportData: [],
      swapData: null,
      vsSpecial: null,
      exSuperData: null,
      superType: null,
      superTandemData: null,
      finalTapData: null,
      rushSugoSpecialData: null,
      superClass: null,
      switchEffectData: null,
      captainShiftData: null,
      rumbleData: null,
    };
  }

  private normalizeCharacterDetail(detail: CharacterDetail, characterId: number): CharacterDetail {
    const normalizedDetail = detail as CharacterDetail & {
      specialAbilities?: CharacterDetail['builderAbilities'];
    };

    return {
      ...this.emptyDetail(characterId),
      ...normalizedDetail,
      characterId,
      captainAbilityVariants: Array.isArray(normalizedDetail.captainAbilityVariants)
        ? normalizedDetail.captainAbilityVariants
            .map((entry) => {
              if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
                return null;
              }

              const key = String(entry.key ?? '').trim();
              const label = String(entry.label ?? '').trim();
              const text = String(entry.text ?? '').trim();

              if (!key.length || !label.length || !text.length) {
                return null;
              }

              return { key, label, text };
            })
            .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry))
        : [],
      captainNotes:
        typeof normalizedDetail.captainNotes === 'string' &&
        normalizedDetail.captainNotes.trim().length
          ? normalizedDetail.captainNotes.trim()
          : null,
      supportData: normalizeSupportData(normalizedDetail.supportData),
      exSuperData:
        normalizedDetail.exSuperData &&
        typeof normalizedDetail.exSuperData === 'object' &&
        !Array.isArray(normalizedDetail.exSuperData)
          ? normalizedDetail.exSuperData
          : null,
      superSpecialCriteria: normalizeSuperSpecialCriteria(normalizedDetail.superSpecialCriteria),
      partyConflictKeys: Array.isArray(normalizedDetail.partyConflictKeys)
        ? normalizedDetail.partyConflictKeys
            .map((value) => String(value ?? '').trim())
            .filter((value) => value.length > 0)
        : [],
      characterTags: Array.isArray(normalizedDetail.characterTags)
        ? normalizedDetail.characterTags
            .map((value) => String(value ?? '').trim())
            .filter((value) => value.length > 0)
        : [],
      superTandemData:
        normalizedDetail.superTandemData &&
        typeof normalizedDetail.superTandemData === 'object' &&
        !Array.isArray(normalizedDetail.superTandemData)
          ? normalizedDetail.superTandemData
          : null,
      finalTapData:
        normalizedDetail.finalTapData &&
        typeof normalizedDetail.finalTapData === 'object' &&
        !Array.isArray(normalizedDetail.finalTapData)
          ? normalizedDetail.finalTapData
          : null,
      rushSugoSpecialData:
        normalizedDetail.rushSugoSpecialData &&
        typeof normalizedDetail.rushSugoSpecialData === 'object' &&
        !Array.isArray(normalizedDetail.rushSugoSpecialData)
          ? normalizedDetail.rushSugoSpecialData
          : null,
      switchEffectData:
        normalizedDetail.switchEffectData &&
        typeof normalizedDetail.switchEffectData === 'object' &&
        !Array.isArray(normalizedDetail.switchEffectData)
          ? normalizedDetail.switchEffectData
          : null,
      captainShiftData:
        normalizedDetail.captainShiftData &&
        typeof normalizedDetail.captainShiftData === 'object' &&
        !Array.isArray(normalizedDetail.captainShiftData)
          ? normalizedDetail.captainShiftData
          : null,
      builderAbilities:
        normalizedDetail.builderAbilities ?? normalizedDetail.specialAbilities ?? [],
    };
  }

  private parseJson<T>(value: string | number | null | undefined, fallback: T): T {
    if (typeof value !== 'string' || !value.length) {
      return fallback;
    }

    try {
      return JSON.parse(value) as T;
    } catch {
      return fallback;
    }
  }

  private async fetchText(path: string): Promise<string> {
    const response = await fetch(path);

    if (!response.ok) {
      throw new Error(`Failed to fetch ${path}: ${response.status}`);
    }

    return response.text();
  }

  private async fetchJson<T>(path: string): Promise<T> {
    const response = await fetch(path);

    if (!response.ok) {
      throw new Error(`Failed to fetch ${path}: ${response.status}`);
    }

    return (await response.json()) as T;
  }
  private normalizeManifest(manifest: DatasetManifest): DatasetManifest {
    return {
      ...manifest,
      availableTypes: this.normalizeManifestValues(manifest.availableTypes),
      availableClasses: this.normalizeManifestValues(
        manifest.availableClasses,
        INVALID_CLASS_PATTERN,
      ),
    };
  }

  private normalizeManifestValues(values: unknown[], excludePattern?: RegExp): string[] {
    return [...new Set(this.flattenValues(values))]
      .map((value) => String(value ?? '').trim())
      .filter((value) => value.length > 0)
      .filter((value) => !excludePattern?.test(value))
      .sort((left, right) => left.localeCompare(right));
  }

  private flattenValues(values: unknown): unknown[] {
    if (!Array.isArray(values)) {
      return [values];
    }

    return values.flatMap((value) => this.flattenValues(value));
  }

  private resolveSearchText(row: SqlRow): string {
    if (typeof row['search_text'] === 'string' && row['search_text'].trim().length > 0) {
      return row['search_text'].trim().toLowerCase();
    }

    return [
      row['id'],
      row['name'],
      row['type'],
      row['primary_class'],
      row['secondary_class'] ?? '',
      ...this.parseJson<string[]>(row['classes_json'], []),
    ]
      .join(' ')
      .toLowerCase();
  }

  private buildSearchableRecordText(record: CharacterRecord): string {
    return [
      record.searchText ?? '',
      record.id,
      record.name,
      record.type,
      record.primaryClass,
      record.secondaryClass ?? '',
      ...record.classes,
    ]
      .join(' ')
      .toLowerCase();
  }
}
