import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const outputPath = resolve(import.meta.dirname, "../public/app-config.js");
const ga4MeasurementId = normalizeGa4MeasurementId(process.env["APP_GA4_MEASUREMENT_ID"]);

await mkdir(resolve(import.meta.dirname, "../public"), { recursive: true });
await writeFile(
  outputPath,
  `window.__appConfig = ${JSON.stringify({ ga4MeasurementId }, null, 2)};\n`,
  "utf8",
);

function normalizeGa4MeasurementId(value) {
  if (typeof value !== "string") {
    return "";
  }

  const normalizedValue = value.trim().toUpperCase();

  return /^G-[A-Z0-9]+$/i.test(normalizedValue) ? normalizedValue : "";
}
