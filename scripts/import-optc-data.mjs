#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const publicDir = path.join(rootDir, "public");
const dataDir = path.join(publicDir, "assets", "data");
const offlineDir = path.join(publicDir, "assets", "offline-packs");

const sourceRepoBase = "https://raw.githubusercontent.com/optc-db/optc-db.github.io/master";
const githubApiBase = "https://api.github.com/repos/optc-db/optc-db.github.io";
const githubHeaders = {
  "User-Agent": "optc-team-builder-importer",
  Accept: "application/vnd.github+json",
};

const packDefinitions = [
  {
    key: "thumbnailsGlo",
    id: "thumbnails-glo",
    label: "Global thumbnails",
    listingPath: "api/images/thumbnail",
    entryName: "glo",
  },
  {
    key: "thumbnailsJapan",
    id: "thumbnails-jap",
    label: "Japan thumbnails",
    listingPath: "api/images/thumbnail",
    entryName: "jap",
  },
  {
    key: "fullTransparent",
    id: "full-transparent",
    label: "Transparent full art",
    listingPath: "api/images/full",
    entryName: "transparent",
  },
];

const validTypes = new Set(["STR", "DEX", "QCK", "PSY", "INT"]);

const noop = () => undefined;

function parseArgs() {
  const args = process.argv.slice(2);
  const defaults = {
    downloadImages: "none",
  };

  for (const arg of args) {
    if (arg.startsWith("--download-images=")) {
      defaults.downloadImages = arg.split("=")[1];
    }
  }

  return defaults;
}

async function fetchText(url) {
  return withRetries(async () => {
    const response = await fetch(url, { headers: githubHeaders });

    if (!response.ok) {
      throw new Error(`Failed to fetch ${url}: ${response.status}`);
    }

    return response.text();
  });
}

async function fetchJson(url) {
  return withRetries(async () => {
    const response = await fetch(url, { headers: githubHeaders });

    if (!response.ok) {
      throw new Error(`Failed to fetch ${url}: ${response.status}`);
    }

    return response.json();
  });
}

async function withRetries(operation, attempts = 4) {
  let lastError = null;

  for (let index = 0; index < attempts; index += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 500 * (index + 1)));
    }
  }

  throw lastError;
}

function createSandbox() {
  const target = {
    window: {},
    console: {
      log: noop,
      warn: noop,
      error: noop,
    },
    UnitUtils: new Proxy(
      {},
      {
        get: () => noop,
      },
    ),
    calcGhostStartID: 0,
    calcDualStartID: 0,
    calcSwapStartID: 0,
    calcVSStartID: 0,
    calcSuperStartID: 0,
    calcSupportStartID: 0,
    calcLastTapStartID: 0,
    calcLinkStartID: 0,
  };

  target.global = target;
  target.globalThis = target;
  target.self = target.window;

  return new Proxy(target, {
    get(currentTarget, property) {
      if (property in currentTarget) {
        return currentTarget[property];
      }

      return noop;
    },
    has() {
      return true;
    },
    set(currentTarget, property, value) {
      currentTarget[property] = value;
      return true;
    },
  });
}

async function evaluateLegacyFile(relativePath) {
  const source = await fetchText(`${sourceRepoBase}/${relativePath}`);
  const sandbox = createSandbox();
  vm.runInNewContext(source, sandbox, { timeout: 20_000 });
  return sandbox.window;
}

async function fetchVersion() {
  const source = await fetchText(`${sourceRepoBase}/common/data/version.js`);
  const match = source.match(/dbVersion\s*=\s*["']([^"']+)["']/);
  return match?.[1] ?? "unknown";
}

function normalizePackPaths(tree, pack) {
  return tree.tree
    .filter((entry) => entry.type === "blob" && entry.path.endsWith(".png"))
    .map((entry) => ({
      localPath: entry.path,
      bytes: entry.size,
      url: `${sourceRepoBase}/${pack.listingPath}/${pack.entryName}/${entry.path}`,
    }));
}

async function buildPackTrees() {
  const packTrees = [];

  for (const pack of packDefinitions) {
    const listing = await fetchJson(`${githubApiBase}/contents/${pack.listingPath}?ref=master`);
    const directory = listing.find((entry) => entry.name === pack.entryName);

    if (!directory) {
      throw new Error(`Missing GitHub tree for ${pack.id}`);
    }

    const tree = await fetchJson(`${githubApiBase}/git/trees/${directory.sha}?recursive=1`);
    packTrees.push({
      ...pack,
      files: normalizePackPaths(tree, pack),
    });
  }

  return packTrees;
}

function shouldDownloadPack(mode, packId) {
  if (mode === "all") {
    return true;
  }

  if (mode === "thumbnails") {
    return packId === "thumbnails-glo" || packId === "thumbnails-jap";
  }

  return mode === packId;
}

async function fileExists(targetPath) {
  try {
    await stat(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function downloadPackFiles(pack, mode) {
  const targetRoot = path.join(offlineDir, pack.id);
  const shouldDownload = shouldDownloadPack(mode, pack.id);

  await mkdir(targetRoot, { recursive: true });

  if (!shouldDownload) {
    return {
      installed: await fileExists(path.join(targetRoot, ".pack-ready")),
      downloadedCount: 0,
    };
  }

  let downloadedCount = 0;
  const concurrency = 8;
  let index = 0;

  async function worker() {
    while (index < pack.files.length) {
      const fileIndex = index;
      index += 1;
      const file = pack.files[fileIndex];
      const targetPath = path.join(targetRoot, file.localPath);

      if (await fileExists(targetPath)) {
        continue;
      }

      await mkdir(path.dirname(targetPath), { recursive: true });
      const response = await fetch(file.url, { headers: githubHeaders });

      if (!response.ok) {
        throw new Error(`Failed to download ${file.url}: ${response.status}`);
      }

      const buffer = Buffer.from(await response.arrayBuffer());
      await writeFile(targetPath, buffer);
      downloadedCount += 1;
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  await writeFile(path.join(targetRoot, ".pack-ready"), `${new Date().toISOString()}\n`);

  return {
    installed: true,
    downloadedCount,
  };
}

function escapeSql(value) {
  return String(value).replaceAll("'", "''");
}

function sqlValue(value) {
  if (value === null || value === undefined) {
    return "NULL";
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? String(value) : "NULL";
  }

  return `'${escapeSql(value)}'`;
}

function buildCharacterAssetsMap(packs) {
  const assetMap = new Map();

  for (const pack of packs) {
    for (const file of pack.files) {
      const match = file.localPath.match(/(\d{4})\.png$/);

      if (!match) {
        continue;
      }

      const characterId = Number(match[1]);
      const current = assetMap.get(characterId) ?? {
        thumbnailGlobal: null,
        thumbnailJapan: null,
        fullTransparent: null,
      };

      if (pack.key === "thumbnailsGlo") {
        current.thumbnailGlobal = file.localPath;
      }

      if (pack.key === "thumbnailsJapan") {
        current.thumbnailJapan = file.localPath;
      }

      if (pack.key === "fullTransparent") {
        current.fullTransparent = file.localPath;
      }

      assetMap.set(characterId, current);
    }
  }

  return assetMap;
}

function normalizeCharacters(units, details, rumbleUnits, assetsById) {
  const rumbleById = new Map(rumbleUnits.map((entry) => [entry.id, entry]));
  const toNumber = (value) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  };

  return units.map((entry, index) => {
    const characterId = index + 1;
    const classes = Array.isArray(entry[2]) ? entry[2] : [entry[2]];
    const assets = assetsById.get(characterId) ?? {
      thumbnailGlobal: null,
      thumbnailJapan: null,
      fullTransparent: null,
    };

    const detail = details[characterId] ?? {};
    const normalizedDetail = {
      characterId,
      captainAbility: detail.captain ?? null,
      specialName: detail.specialName ?? null,
      specialText: detail.special ?? null,
      specialNotes: detail.specialNotes ?? null,
      sailorAbilities: detail.sailor ? Object.values(detail.sailor) : [],
      sailorNotes: detail.sailorNotes ?? null,
      limitBreak: detail.limit ?? [],
      potentialAbilities: detail.potential ?? [],
      supportData: detail.support ?? [],
      swapData: detail.swap ?? null,
      vsSpecial: detail.vsSpecial ?? null,
      superType: detail.superType ?? null,
      superClass: detail.superClass ?? null,
      rumbleData: rumbleById.get(characterId) ?? null,
    };

    return {
      id: characterId,
      name: entry[0],
      type: entry[1],
      primaryClass: classes[0] ?? "",
      secondaryClass: classes[1] ?? null,
      classes,
      stars: toNumber(entry[3]),
      cost: toNumber(entry[4]),
      combo: toNumber(entry[5]),
      maxSockets: toNumber(entry[6]),
      evolutionStage: toNumber(entry[7]),
      maxLevel: toNumber(entry[8]),
      maxExperience: toNumber(entry[9]),
      minHp: toNumber(entry[10]),
      minAtk: toNumber(entry[11]),
      minRcv: toNumber(entry[12]),
      maxHp: toNumber(entry[13]),
      maxAtk: toNumber(entry[14]),
      maxRcv: toNumber(entry[15]),
      growth: toNumber(entry[16]),
      searchText: `${entry[0]} ${entry[1]} ${classes.join(" ")}`.toLowerCase(),
      regionAvailability: {
        thumbnailGlobal: Boolean(assets.thumbnailGlobal),
        thumbnailJapan: Boolean(assets.thumbnailJapan),
        fullTransparent: Boolean(assets.fullTransparent),
      },
      assets,
      detail: normalizedDetail,
    };
  });
}

function normalizeShips(ships) {
  return ships.map((entry, index) => ({
    id: index + 1,
    name: entry.name,
    thumb: entry.thumb ?? null,
    description: entry.description ?? "",
  }));
}

function createSqlSeed(characters, ships, manifest) {
  const statements = [
    "PRAGMA foreign_keys = OFF;",
    "DROP TABLE IF EXISTS characters;",
    "DROP TABLE IF EXISTS character_details;",
    "DROP TABLE IF EXISTS ships;",
    "DROP TABLE IF EXISTS meta;",
    `
      CREATE TABLE characters (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        type TEXT NOT NULL,
        primary_class TEXT NOT NULL,
        secondary_class TEXT,
        classes_json TEXT NOT NULL,
        stars INTEGER NOT NULL,
        cost INTEGER NOT NULL,
        combo INTEGER NOT NULL,
        max_level INTEGER NOT NULL,
        max_experience INTEGER NOT NULL,
        min_hp INTEGER NOT NULL,
        min_atk INTEGER NOT NULL,
        min_rcv INTEGER NOT NULL,
        max_hp INTEGER NOT NULL,
        max_atk INTEGER NOT NULL,
        max_rcv INTEGER NOT NULL,
        growth REAL NOT NULL,
        region_json TEXT NOT NULL,
        assets_json TEXT NOT NULL,
        search_text TEXT NOT NULL
      );
    `,
    `
      CREATE TABLE character_details (
        character_id INTEGER PRIMARY KEY,
        detail_json TEXT NOT NULL
      );
    `,
    `
      CREATE TABLE ships (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        thumb TEXT,
        description TEXT NOT NULL
      );
    `,
    `
      CREATE TABLE meta (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `,
  ];

  for (const character of characters) {
    statements.push(`
      INSERT INTO characters (
        id, name, type, primary_class, secondary_class, classes_json, stars, cost, combo, max_level,
        max_experience, min_hp, min_atk, min_rcv, max_hp, max_atk, max_rcv, growth, region_json,
        assets_json, search_text
      ) VALUES (
        ${sqlValue(character.id)},
        ${sqlValue(character.name)},
        ${sqlValue(character.type)},
        ${sqlValue(character.primaryClass)},
        ${sqlValue(character.secondaryClass)},
        ${sqlValue(JSON.stringify(character.classes))},
        ${sqlValue(character.stars)},
        ${sqlValue(character.cost)},
        ${sqlValue(character.combo)},
        ${sqlValue(character.maxLevel)},
        ${sqlValue(character.maxExperience)},
        ${sqlValue(character.minHp)},
        ${sqlValue(character.minAtk)},
        ${sqlValue(character.minRcv)},
        ${sqlValue(character.maxHp)},
        ${sqlValue(character.maxAtk)},
        ${sqlValue(character.maxRcv)},
        ${sqlValue(character.growth)},
        ${sqlValue(JSON.stringify(character.regionAvailability))},
        ${sqlValue(JSON.stringify(character.assets))},
        ${sqlValue(character.searchText)}
      );
    `);

    statements.push(`
      INSERT INTO character_details (character_id, detail_json)
      VALUES (${sqlValue(character.id)}, ${sqlValue(JSON.stringify(character.detail))});
    `);
  }

  for (const ship of ships) {
    statements.push(`
      INSERT INTO ships (id, name, thumb, description)
      VALUES (
        ${sqlValue(ship.id)},
        ${sqlValue(ship.name)},
        ${sqlValue(ship.thumb)},
        ${sqlValue(ship.description)}
      );
    `);
  }

  statements.push(`
    INSERT INTO meta (key, value)
    VALUES ('manifest', ${sqlValue(JSON.stringify(manifest))});
  `);

  return statements.join("\n");
}

async function hashFile(targetPath) {
  const content = await readFile(targetPath);
  return createHash("sha1").update(content).digest("hex");
}

async function main() {
  const { downloadImages } = parseArgs();

  await mkdir(dataDir, { recursive: true });
  await mkdir(offlineDir, { recursive: true });

  const [unitsWindow, detailsWindow, shipsWindow, rumble, sourceVersion, packTrees] = await Promise.all([
    evaluateLegacyFile("common/data/units.js"),
    evaluateLegacyFile("common/data/details.js"),
    evaluateLegacyFile("common/data/ships.js"),
    fetchJson(`${sourceRepoBase}/common/data/rumble.json`),
    fetchVersion(),
    buildPackTrees(),
  ]);

  const assetsById = buildCharacterAssetsMap(packTrees);
  const characters = normalizeCharacters(unitsWindow.units, detailsWindow.details, rumble.units ?? [], assetsById);
  const ships = normalizeShips(shipsWindow.ships);

  const packStatuses = [];
  for (const pack of packTrees) {
    const status = await downloadPackFiles(pack, downloadImages);
    const targetRoot = path.join(offlineDir, pack.id);
    const samplePath = path.join(targetRoot, pack.files[0]?.localPath ?? "");
    const sampleHash = status.installed && pack.files[0] ? await hashFile(samplePath) : null;

    packStatuses.push({
      key: pack.key,
      id: pack.id,
      label: pack.label,
      localBasePath: `assets/offline-packs/${pack.id}`,
      fileCount: pack.files.length,
      totalBytes: pack.files.reduce((total, file) => total + file.bytes, 0),
      installed: status.installed,
      checksum: sampleHash,
    });
  }

  const manifest = {
    generatedAt: new Date().toISOString(),
    sourceVersion,
    characterCount: characters.length,
    detailCount: characters.filter((character) => character.detail.specialText || character.detail.captainAbility).length,
    shipCount: ships.length,
    rumbleCount: rumble.units?.length ?? 0,
    availableTypes: [
      ...new Set(
        characters.flatMap((character) =>
          String(character.type)
            .split(",")
            .map((type) => type.trim())
            .filter((type) => validTypes.has(type)),
        ),
      ),
    ].sort(),
    availableClasses: [...new Set(characters.flatMap((character) => character.classes))].sort(),
    packs: packStatuses,
  };

  const sqlSeed = createSqlSeed(characters, ships, manifest);

  await Promise.all([
    writeFile(path.join(dataDir, "optc-manifest.json"), JSON.stringify(manifest, null, 2)),
    writeFile(path.join(dataDir, "optc-seed.sql"), sqlSeed),
    writeFile(
      path.join(dataDir, "optc-preview.json"),
      JSON.stringify(
        {
          generatedAt: manifest.generatedAt,
          characters: characters.slice(0, 24),
          ships: ships.slice(0, 12),
        },
        null,
        2,
      ),
    ),
  ]);

  console.log(`Imported ${manifest.characterCount} characters, ${manifest.shipCount} ships, ${manifest.rumbleCount} rumble entries.`);
  console.log(`Packs: ${manifest.packs.map((pack) => `${pack.id}=${pack.installed ? "installed" : "missing"}`).join(", ")}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
