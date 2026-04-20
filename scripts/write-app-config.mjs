import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const outputPath = resolve(import.meta.dirname, "../public/app-config.js");
const ga4MeasurementId = normalizeGa4MeasurementId(process.env["APP_GA4_MEASUREMENT_ID"]);
const googleDriveFolderName = normalizeDriveFolderName(process.env["APP_GOOGLE_DRIVE_FOLDER_NAME"]);
const googleIosClientId = normalizeGoogleClientId(process.env["APP_GOOGLE_IOS_CLIENT_ID"]);
const googleWebClientId = normalizeGoogleClientId(process.env["APP_GOOGLE_WEB_CLIENT_ID"]);

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
