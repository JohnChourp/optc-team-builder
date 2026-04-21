import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const envFilePaths = [
  resolve(import.meta.dirname, "../.env"),
  resolve(import.meta.dirname, "../.env.local"),
];
const outputPath = resolve(import.meta.dirname, "../public/app-config.js");
const requiredFlags = parseRequiredFlags(process.argv.slice(2));

await loadEnvFiles(envFilePaths);

const ga4MeasurementId = normalizeGa4MeasurementId(process.env["APP_GA4_MEASUREMENT_ID"]);
const googleDriveFolderName = normalizeDriveFolderName(process.env["APP_GOOGLE_DRIVE_FOLDER_NAME"]);
const googleIosClientId = normalizeGoogleClientId(process.env["APP_GOOGLE_IOS_CLIENT_ID"]);
const googleWebClientId = normalizeGoogleClientId(process.env["APP_GOOGLE_WEB_CLIENT_ID"]);

reportMissingGoogleConfig({
  googleIosClientId,
  googleWebClientId,
  requireGoogleIosClientId: requiredFlags.requireGoogleIosClientId,
  requireGoogleWebClientId: requiredFlags.requireGoogleWebClientId,
});

await mkdir(resolve(import.meta.dirname, "../public"), { recursive: true });
await writeFile(
  outputPath,
  `window.__appConfig = ${JSON.stringify(
    {
      ga4MeasurementId,
      googleDriveFolderName,
      googleIosClientId,
      googleWebClientId,
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

function parseRequiredFlags(argv) {
  return {
    requireGoogleIosClientId:
      argv.includes("--require-google-ios-client-id") ||
      parseBooleanEnv(process.env["APP_REQUIRE_GOOGLE_IOS_CLIENT_ID"]),
    requireGoogleWebClientId:
      argv.includes("--require-google-web-client-id") ||
      parseBooleanEnv(process.env["APP_REQUIRE_GOOGLE_WEB_CLIENT_ID"]),
  };
}

function parseBooleanEnv(value) {
  return /^(1|true|yes|on)$/iu.test(String(value ?? "").trim());
}

function reportMissingGoogleConfig({
  googleIosClientId,
  googleWebClientId,
  requireGoogleIosClientId,
  requireGoogleWebClientId,
}) {
  const missingKeys = [];

  if (googleWebClientId.length === 0) {
    missingKeys.push("APP_GOOGLE_WEB_CLIENT_ID");
  }

  if (googleIosClientId.length === 0) {
    missingKeys.push("APP_GOOGLE_IOS_CLIENT_ID");
  }

  if (missingKeys.length === 0) {
    return;
  }

  const message =
    `[config:app] Google sync client IDs missing: ${missingKeys.join(", ")}. ` +
    `The Settings page will show Google Drive sync as unavailable on affected platforms. ` +
    `Set the values in process env, .env, or .env.local.`;

  console.warn(message);

  if (
    (requireGoogleWebClientId && googleWebClientId.length === 0) ||
    (requireGoogleIosClientId && googleIosClientId.length === 0)
  ) {
    throw new Error(
      "[config:app] Required Google sync client IDs are missing for this build. " +
        "For GitHub Pages, provide APP_GOOGLE_WEB_CLIENT_ID as a repository or environment secret. " +
        "For local development, copy .env.example to .env.local and fill in the Google OAuth client IDs.",
    );
  }
}

function normalizeGa4MeasurementId(value) {
  if (typeof value !== "string") {
    return "";
  }

  const normalizedValue = value.trim().toUpperCase();

  return /^G-[A-Z0-9]+$/i.test(normalizedValue) ? normalizedValue : "";
}

function normalizeGoogleClientId(value) {
  if (typeof value !== "string") {
    return "";
  }

  const normalizedValue = value.trim();

  return /^[0-9]+[-a-z0-9_]*\.apps\.googleusercontent\.com$/i.test(normalizedValue)
    ? normalizedValue
    : "";
}

function normalizeDriveFolderName(value) {
  if (typeof value !== "string") {
    return "OPTC Team Builder";
  }

  const normalizedValue = value.trim();

  return normalizedValue.length > 0 ? normalizedValue : "OPTC Team Builder";
}
