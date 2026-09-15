/*
 * 869f13287. The complete set of keys `public/app-config.js` may carry. The real file is
 * gitignored and written by `npm run config:app`; this one documents the shape for anyone filling
 * it in by hand. `npm run security:app-config` refuses a published file with a key that is not
 * here, and `scripts/check-app-config.spec.ts` asserts this file, the generator and the allowlist
 * all name the same five keys.
 *
 * Everything here is public by design: a GA4 measurement id and OAuth *client* ids are meant to be
 * visible in a browser. Never put a client secret, API key or token in this file - it is served to
 * every visitor at /app-config.js.
 */
window.__appConfig = {
  ga4MeasurementId: "",
  googleDriveBackendUrl: "",
  googleDriveFolderName: "OPTC Team Builder",
  googleIosClientId: "",
  googleWebClientId: "",
};
