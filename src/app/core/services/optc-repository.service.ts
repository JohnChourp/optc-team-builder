import { Injectable } from "@angular/core";
import type { Database, SqlJsStatic } from "sql.js";

import {
  type CharacterAssets,
  type CharacterDetail,
  type CharacterDetailRecord,
  type CharacterListItem,
  type CharacterRecord,
  type CharacterSearchQuery,
  type DatasetManifest,
  type OfflinePackSummary,
  type RegionAvailability,
  type ShipRecord,
} from "../models/optc.models";

interface SqlRow {
  [key: string]: string | number | null;
}

const SQL_WASM_PATH = "assets/vendor/sql.js/sql-wasm.wasm";
const SQL_SEED_PATH = "assets/data/optc-seed.sql";
const DATASET_MANIFEST_PATH = "assets/data/optc-manifest.json";
const FALLBACK_CHARACTER_IMAGE = "assets/placeholders/character-card.svg";

@Injectable({ providedIn: "root" })
export class OptcRepositoryService {
  private readonly sqlPromise: Promise<SqlJsStatic>;
  private readonly databasePromise: Promise<Database>;
  private manifestPromise?: Promise<DatasetManifest>;

  public constructor() {
    this.sqlPromise = import("sql.js").then((module) =>
      module.default({
        locateFile: () => SQL_WASM_PATH,
      }),
    );
    this.databasePromise = this.createDatabase();
  }

  public async getDatasetManifest(): Promise<DatasetManifest> {
    this.manifestPromise ??= this.fetchJson<DatasetManifest>(DATASET_MANIFEST_PATH);
    return this.manifestPromise;
  }

  public async searchCharacters(query: CharacterSearchQuery): Promise<CharacterListItem[]> {
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
        query.limit,
        query.offset,
      ],
    );

    return this.decorateCharacterRows(rows);
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

    const [record] = await this.decorateCharacterRows(rows);
    const detail = this.parseJson<CharacterDetail>(rows[0]["detail_json"], this.emptyDetail(characterId));

    return {
      ...record,
      detail,
      detailImageUrl: this.resolveImageUrl(record.assets, true),
    };
  }

  public async getCharactersByIds(ids: number[]): Promise<CharacterListItem[]> {
    if (!ids.length) {
      return [];
    }

    const placeholders = ids.map(() => "?").join(",");
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
    const rows = await this.selectAll(
      `
        SELECT id, name, thumb, description
        FROM ships
        ORDER BY id ASC
      `,
    );

    return rows.map((row) => ({
      id: Number(row["id"]),
      name: String(row["name"]),
      thumb: row["thumb"] ? String(row["thumb"]) : null,
      description: String(row["description"]),
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
      const assets = this.parseJson<CharacterAssets>(row["assets_json"], {
        thumbnailGlobal: null,
        thumbnailJapan: null,
        fullTransparent: null,
      });

      const regionAvailability = this.parseJson<RegionAvailability>(row["region_json"], {
        thumbnailGlobal: false,
        thumbnailJapan: false,
        fullTransparent: false,
      });

      const record: CharacterListItem = {
        id: Number(row["id"]),
        name: String(row["name"]),
        type: String(row["type"]),
        primaryClass: String(row["primary_class"]),
        secondaryClass: row["secondary_class"] ? String(row["secondary_class"]) : null,
        classes: this.parseJson<string[]>(row["classes_json"], []),
        stars: Number(row["stars"]),
        cost: Number(row["cost"]),
        combo: Number(row["combo"]),
        maxLevel: Number(row["max_level"]),
        maxExperience: Number(row["max_experience"]),
        stats: {
          min: {
            hp: Number(row["min_hp"]),
            atk: Number(row["min_atk"]),
            rcv: Number(row["min_rcv"]),
          },
          max: {
            hp: Number(row["max_hp"]),
            atk: Number(row["max_atk"]),
            rcv: Number(row["max_rcv"]),
          },
          growth: Number(row["growth"]),
        },
        regionAvailability,
        assets,
        imageUrl: this.resolveImageUrl(assets, false, installedPacks),
      };

      return record;
    });
  }

  private resolveImageUrl(
    assets: CharacterAssets,
    preferFullArt: boolean,
    installedPacks?: Map<string, OfflinePackSummary>,
  ): string {
    const packMap = installedPacks ?? new Map();
    const fullArtInstalled = packMap.get("fullTransparent")?.installed ?? false;
    const thumbnailGloInstalled = packMap.get("thumbnailsGlo")?.installed ?? false;
    const thumbnailJapanInstalled = packMap.get("thumbnailsJapan")?.installed ?? false;

    if (preferFullArt && fullArtInstalled && assets.fullTransparent) {
      return this.toLocalAssetPath("full-transparent", assets.fullTransparent);
    }

    if (thumbnailGloInstalled && assets.thumbnailGlobal) {
      return this.toLocalAssetPath("thumbnails-glo", assets.thumbnailGlobal);
    }

    if (thumbnailJapanInstalled && assets.thumbnailJapan) {
      return this.toLocalAssetPath("thumbnails-jap", assets.thumbnailJapan);
    }

    if (fullArtInstalled && assets.fullTransparent) {
      return this.toLocalAssetPath("full-transparent", assets.fullTransparent);
    }

    return FALLBACK_CHARACTER_IMAGE;
  }

  private toLocalAssetPath(packId: string, relativePath: string): string {
    return `assets/offline-packs/${packId}/${relativePath}`;
  }

  private emptyDetail(characterId: number): CharacterDetail {
    return {
      characterId,
      captainAbility: null,
      specialName: null,
      specialText: null,
      specialNotes: null,
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

  private parseJson<T>(value: string | number | null | undefined, fallback: T): T {
    if (typeof value !== "string" || !value.length) {
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
}
