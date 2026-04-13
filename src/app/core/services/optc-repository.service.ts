import { Injectable } from '@angular/core';
import type { Database, SqlJsStatic } from 'sql.js';

import { type AutoBuildCandidateQueryOptions } from '../models/auto-team-builder.models';
import { type AutoBuildAbilityCatalog } from '../models/auto-team-builder-ability.models';
import {
  type CharacterAssets,
  type CharacterDetail,
  type CharacterDetailRecord,
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
    const rawOptions = Array.isArray(record['options'])
      ? (record['options'] as unknown[])
      : [];
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
    rosterBranches,
    hasNonRosterBranches: Boolean(record['hasNonRosterBranches']),
    parserStatus: normalizedParserStatus,
  };
}

@Injectable({ providedIn: 'root' })
export class OptcRepositoryService {
  private readonly sqlPromise: Promise<SqlJsStatic>;
  private readonly databasePromise: Promise<Database>;
  private manifestPromise?: Promise<DatasetManifest>;
  private autoBuilderAbilityCatalogPromise?: Promise<AutoBuildAbilityCatalog>;

  public constructor() {
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
    const allowedCharacterClause = allowedCharacterIds.length
      ? `\n          AND id IN (${allowedCharacterIds.map(() => '?').join(',')})`
      : query.allowedCharacterIds
        ? '\n          AND 1 = 0'
        : '';
    const rows = await this.selectAll(
      `
        SELECT
          id,
          name,
          type,
          primary_class,
          secondary_class,
          classes_json,
          stars,
          cost,
          combo,
          max_level,
          max_experience,
          min_hp,
          min_atk,
          min_rcv,
          max_hp,
          max_atk,
          max_rcv,
          growth,
          region_json,
          assets_json
        FROM characters
        WHERE (? = '' OR search_text LIKE '%' || ? || '%')
          AND (? = '' OR type LIKE '%' || ? || '%')
          AND (? = '' OR primary_class = ? OR secondary_class = ?)
          ${allowedCharacterClause}
        ORDER BY stars DESC, id DESC
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
        query.limit,
        query.offset,
      ],
    );

    return this.decorateCharacterRows(rows);
  }

  public async searchDetailedCharacters(
    query: DetailedCharacterSearchQuery,
  ): Promise<CharacterDetailRecord[]> {
    const normalizedSelectedTypes = [
      ...new Set(query.selectedTypes.map((type) => type.trim())),
    ].filter((type) => type.length);
    const normalizedSelectedClasses = [
      ...new Set(query.selectedClasses.map((characterClass) => characterClass.trim())),
    ].filter((characterClass) => characterClass.length);
    const whereClauses = ["(? = '' OR c.search_text LIKE '%' || ? || '%')"];
    const queryParams: Array<string | number> = [
      query.searchTerm.toLowerCase(),
      query.searchTerm.toLowerCase(),
    ];
    const selectedTypesMatchMode = query.selectedTypesMatchMode ?? 'all';
    const selectedClassesMatchMode = query.selectedClassesMatchMode ?? 'all';
    const orderByClause = query.sortMode === 'newest' ? 'c.id DESC' : 'c.stars DESC, c.id DESC';

    if (normalizedSelectedTypes.length) {
      const typeClauses = normalizedSelectedTypes.map(() => "(',' || c.type || ',') LIKE ?");

      whereClauses.push(
        selectedTypesMatchMode === 'any'
          ? `(${typeClauses.join(' OR ')})`
          : typeClauses.join('\n          AND '),
      );
      queryParams.push(...normalizedSelectedTypes.map((type) => `%,${type},%`));
    }

    if (normalizedSelectedClasses.length) {
      const classClauses = normalizedSelectedClasses.map(() => 'c.classes_json LIKE ?');

      whereClauses.push(
        selectedClassesMatchMode === 'any'
          ? `(${classClauses.join(' OR ')})`
          : classClauses.join('\n          AND '),
      );
      queryParams.push(
        ...normalizedSelectedClasses.map((characterClass) => `%\"${characterClass}\"%`),
      );
    }

    whereClauses.push('1 = 1');
    queryParams.push(query.limit, query.offset);

    const rows = await this.selectAll(
      `
        SELECT
          c.id,
          c.name,
          c.type,
          c.primary_class,
          c.secondary_class,
          c.classes_json,
          c.stars,
          c.cost,
          c.combo,
          c.max_level,
          c.max_experience,
          c.min_hp,
          c.min_atk,
          c.min_rcv,
          c.max_hp,
          c.max_atk,
          c.max_rcv,
          c.growth,
          c.region_json,
          c.assets_json,
          d.detail_json
        FROM characters c
        LEFT JOIN character_details d ON d.character_id = c.id
        WHERE ${whereClauses.join('\n          AND ')}
        ORDER BY ${orderByClause}
        LIMIT ? OFFSET ?
      `,
      queryParams,
    );

    return this.decorateCharacterDetailRows(rows);
  }

  public async getCharacterById(characterId: number): Promise<CharacterDetailRecord | null> {
    const rows = await this.selectAll(
      `
        SELECT
          c.id,
          c.name,
          c.type,
          c.primary_class,
          c.secondary_class,
          c.classes_json,
          c.stars,
          c.cost,
          c.combo,
          c.max_level,
          c.max_experience,
          c.min_hp,
          c.min_atk,
          c.min_rcv,
          c.max_hp,
          c.max_atk,
          c.max_rcv,
          c.growth,
          c.region_json,
          c.assets_json,
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
    limit = 1200,
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
    const excludedCharacterIds = [
      ...new Set(
        (options.excludedCharacterIds ?? []).filter(
          (characterId) => Number.isInteger(characterId) && characterId > 0,
        ),
      ),
    ];
    const typeClauses = typeFilters.map(() => "(',' || c.type || ',') LIKE ?");
    const queryParams: Array<string | number> = typeFilters.map(
      (typeFilter) => `%,${typeFilter},%`,
    );
    let whereClause = `(${typeClauses.join(' OR ')})`;

    if (lockedCharacterIds.length) {
      whereClause = `${whereClause} OR c.id IN (${lockedCharacterIds.map(() => '?').join(',')})`;
      queryParams.push(...lockedCharacterIds);
    }

    const rows = await this.selectAll(
      `
        SELECT
          c.id,
          c.name,
          c.type,
          c.primary_class,
          c.secondary_class,
          c.classes_json,
          c.stars,
          c.cost,
          c.combo,
          c.max_level,
          c.max_experience,
          c.min_hp,
          c.min_atk,
          c.min_rcv,
          c.max_hp,
          c.max_atk,
          c.max_rcv,
          c.growth,
          c.region_json,
          c.assets_json,
          d.detail_json
        FROM characters c
        LEFT JOIN character_details d ON d.character_id = c.id
        WHERE ${whereClause}
        ORDER BY c.id DESC
      `,
      queryParams,
    );
    const detailedRecords = await this.decorateCharacterDetailRows(rows);
    const allowedCharacterIdSet = allowedCharacterIds.length ? new Set(allowedCharacterIds) : null;
    const excludedCharacterIdSet = new Set(excludedCharacterIds);
    const lockedCharacterIdSet = new Set(lockedCharacterIds);
    const filteredRecords = allowedCharacterIdSet
      ? detailedRecords.filter(
          (record) =>
            allowedCharacterIdSet.has(record.id) && !excludedCharacterIdSet.has(record.id),
        )
      : detailedRecords.filter((record) => !excludedCharacterIdSet.has(record.id));

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
          type,
          primary_class,
          secondary_class,
          classes_json,
          stars,
          cost,
          combo,
          max_level,
          max_experience,
          min_hp,
          min_atk,
          min_rcv,
          max_hp,
          max_atk,
          max_rcv,
          growth,
          region_json,
          assets_json
        FROM characters
        WHERE id IN (${placeholders})
      `,
      ids,
    );

    const decorated = await this.decorateCharacterRows(rows);
    const order = new Map(ids.map((id, index) => [id, index]));

    return decorated.sort((left, right) => (order.get(left.id) ?? 0) - (order.get(right.id) ?? 0));
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
    const manifest = await this.getDatasetManifest();
    const installedPacks = new Map(manifest.packs.map((pack) => [pack.key, pack]));

    return rows.map((row) => {
      const assets = this.parseJson<CharacterAssets>(row['assets_json'], {
        exactLocal: null,
        thumbnailGlobal: null,
        thumbnailJapan: null,
        fullTransparent: null,
      });

      const regionAvailability = this.parseJson<RegionAvailability>(row['region_json'], {
        exactLocal: false,
        thumbnailGlobal: false,
        thumbnailJapan: false,
        fullTransparent: false,
      });

      const record: CharacterListItem = {
        id: Number(row['id']),
        name: String(row['name']),
        type: String(row['type']),
        primaryClass: String(row['primary_class']),
        secondaryClass: row['secondary_class'] ? String(row['secondary_class']) : null,
        classes: this.parseJson<string[]>(row['classes_json'], []),
        stars: Number(row['stars']),
        cost: Number(row['cost']),
        combo: Number(row['combo']),
        maxLevel: Number(row['max_level']),
        maxExperience: Number(row['max_experience']),
        stats: {
          min: {
            hp: Number(row['min_hp']),
            atk: Number(row['min_atk']),
            rcv: Number(row['min_rcv']),
          },
          max: {
            hp: Number(row['max_hp']),
            atk: Number(row['max_atk']),
            rcv: Number(row['max_rcv']),
          },
          growth: Number(row['growth']),
        },
        regionAvailability,
        assets,
        imageUrl: this.resolveImageUrl(assets, false, installedPacks),
      };

      return record;
    });
  }

  private async decorateCharacterDetailRows(rows: SqlRow[]): Promise<CharacterDetailRecord[]> {
    const records = await this.decorateCharacterRows(rows);

    return records.map((record, index) => ({
      ...record,
      detail: this.normalizeCharacterDetail(
        this.parseJson<CharacterDetail>(rows[index]['detail_json'], this.emptyDetail(record.id)),
        record.id,
      ),
      detailImageUrl: this.resolveImageUrl(record.assets, true),
    }));
  }

  private resolveImageUrl(
    assets: CharacterAssets,
    preferFullArt: boolean,
    installedPacks?: Map<string, OfflinePackSummary>,
  ): string {
    const packMap = installedPacks ?? new Map();
    const fullArtInstalled = packMap.get('fullTransparent')?.installed ?? false;
    const thumbnailGloInstalled = packMap.get('thumbnailsGlo')?.installed ?? false;
    const thumbnailJapanInstalled = packMap.get('thumbnailsJapan')?.installed ?? false;

    if (preferFullArt && fullArtInstalled && assets.fullTransparent) {
      return this.toLocalAssetPath('full-transparent', assets.fullTransparent);
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

    if (fullArtInstalled && assets.fullTransparent) {
      return this.toLocalAssetPath('full-transparent', assets.fullTransparent);
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
      specialName: null,
      specialText: null,
      specialNotes: null,
      superSpecialText: null,
      superSpecialCriteriaText: null,
      superSpecialNotes: null,
      superSpecialCriteria: null,
      partyConflictKeys: [],
      builderAbilities: [],
      sailorAbilities: [],
      sailorNotes: null,
      limitBreak: [],
      potentialAbilities: [],
      supportData: [],
      swapData: null,
      vsSpecial: null,
      superType: null,
      superClass: null,
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
      supportData: normalizeSupportData(normalizedDetail.supportData),
      superSpecialCriteria: normalizeSuperSpecialCriteria(normalizedDetail.superSpecialCriteria),
      partyConflictKeys: Array.isArray(normalizedDetail.partyConflictKeys)
        ? normalizedDetail.partyConflictKeys
            .map((value) => String(value ?? '').trim())
            .filter((value) => value.length > 0)
        : [],
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
}
