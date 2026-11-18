import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const envFilePaths = [
  resolve(import.meta.dirname, "../.env"),
  resolve(import.meta.dirname, "../.env.local"),
];
const outputPath = resolve(import.meta.dirname, "../public/app-config.js");

await loadEnvFiles(envFilePaths);

/*
 * 1amndjnq718. Google sign-in and Drive sync were removed on 2026-11-18, and with them the four
 * Google keys this file used to write. The GA4 measurement id is the only key left.
 */
const ga4MeasurementId = normalizeGa4MeasurementId(process.env["APP_GA4_MEASUREMENT_ID"]);

await mkdir(resolve(import.meta.dirname, "../public"), { recursive: true });
await writeFile(
  outputPath,
  `window.__appConfig = ${JSON.stringify(
    {
      ga4MeasurementId,
    },
    null,
    2,
  )};\n`,
  "utf8",
);

async function loadEnvFiles(filePaths) {
  for (const filePath of filePaths) {
    if (!(await fileExists(filePath))) {
      continue;
    }

    const fileContents = await readFile(filePath, "utf8");

    for (const [key, value] of parseDotenv(fileContents)) {
      if (typeof process.env[key] === "undefined") {
        process.env[key] = value;
      }
    }
  }
}

async function fileExists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

function parseDotenv(fileContents) {
  const values = new Map();

  for (const rawLine of fileContents.split(/\r?\n/u)) {
    const line = rawLine.trim();

    if (line.length === 0 || line.startsWith("#")) {
      continue;
    }

    const normalizedLine = line.startsWith("export ") ? line.slice(7).trim() : line;
    const separatorIndex = normalizedLine.indexOf("=");

    if (separatorIndex <= 0) {
      continue;
    }

    const key = normalizedLine.slice(0, separatorIndex).trim();

    if (!/^[A-Za-z_][A-Za-z0-9_]*$/u.test(key)) {
      continue;
    }

    const rawValue = normalizedLine.slice(separatorIndex + 1).trim();
    values.set(key, parseDotenvValue(rawValue));
  }

  return values;
}

function parseDotenvValue(rawValue) {
  if (
    (rawValue.startsWith('"') && rawValue.endsWith('"')) ||
    (rawValue.startsWith("'") && rawValue.endsWith("'"))
  ) {
    return rawValue.slice(1, -1);
  }

  const commentIndex = rawValue.search(/\s#/u);

  if (commentIndex >= 0) {
    return rawValue.slice(0, commentIndex).trim();
  }

  return rawValue;
}

function normalizeGa4MeasurementId(value) {
  if (typeof value !== "string") {
    return "";
  }

  const normalizedValue = value.trim().toUpperCase();

  return /^G-[A-Z0-9]+$/i.test(normalizedValue) ? normalizedValue : "";
}
