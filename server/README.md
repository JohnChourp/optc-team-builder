# Google Drive Sync Backend

This backend keeps Google Drive sync connected after the browser page closes.
It uses Google OAuth authorization code flow with `access_type=offline`, stores
refresh tokens encrypted at rest, and exposes only an HttpOnly app session cookie
to the browser.

## Local Setup

1. Create a Google OAuth Web application client.
2. Add `http://localhost:8787/auth/google/callback` as an authorized redirect URI.
3. Copy `.env.example` to `.env.local` and set:
   - `APP_GOOGLE_DRIVE_BACKEND_URL=http://localhost:8787`
   - `GOOGLE_OAUTH_CLIENT_ID`
   - `GOOGLE_OAUTH_CLIENT_SECRET`
   - `GOOGLE_OAUTH_REDIRECT_URI=http://localhost:8787/auth/google/callback`
   - `DRIVE_SYNC_SESSION_SECRET`
   - `DRIVE_SYNC_TOKEN_ENCRYPTION_KEY`
4. Start the backend with `npm run server:drive-sync`.
5. Start the Angular app with `npm start`.

The Angular app keeps the existing browser/mobile Drive sync path when
`APP_GOOGLE_DRIVE_BACKEND_URL` is empty.

## Production deployment (seamless, no-popup persistence)

Without this backend the web app uses Google's client-side **implicit token flow**,
which has no refresh token: the access token expires after ~1 hour. The app no longer
signs you out when that happens (it remembers your profile locally and re-mints a token
on the next Drive action), but a fully seamless, never-prompt experience needs this
backend, which holds an `access_type=offline` refresh token server-side and mints fresh
access tokens automatically. The rolling session cookie lasts `DRIVE_SYNC_SESSION_DAYS`
(default 30), refreshed on use.

Steps:

1. **Google Cloud console** — on the OAuth Web client, add the production HTTPS redirect
   URI (e.g. `https://drive-sync.optcteambuilder.com/auth/google/callback`). Keep the
   `drive.file`, `email`, `profile`, `openid` scopes. Offline access is requested by the
   server (`access_type=offline`, `prompt=consent` on force).
2. **Host the Node server** (`npm run server:drive-sync`) on a persistent host with a
   stable HTTPS origin and a writable data dir. Set:
   - `DRIVE_SYNC_APP_ORIGIN` (or `APP_ORIGIN`) = the site origin, e.g.
     `https://optcteambuilder.com` (drives CORS + `return_to` sanitization).
   - `DRIVE_SYNC_PUBLIC_BASE_URL` = the backend's public origin.
   - `GOOGLE_OAUTH_REDIRECT_URI` = the exact HTTPS callback registered in step 1.
   - `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`.
   - `DRIVE_SYNC_SESSION_SECRET` (random), `DRIVE_SYNC_TOKEN_ENCRYPTION_KEY`
     (32-byte hex/base64 or a passphrase; encrypts refresh tokens at rest).
   - `DRIVE_SYNC_DATA_DIR` = a persisted volume (holds `drive-sync-db.json`).
   - Optional: `DRIVE_SYNC_SESSION_DAYS`, `DRIVE_SYNC_COOKIE_SECURE` (auto `true` on
     HTTPS), `PORT`.
   Cookies are `HttpOnly; Secure; SameSite=Lax`; the OAuth leg is a top-level redirect
   and the status/sync calls use `credentials: 'include'` with credentialed CORS, so an
   app + backend on sibling subdomains work.
3. **Point the app at the backend** — set `APP_GOOGLE_DRIVE_BACKEND_URL` = the backend's
   public origin at build time; `scripts/write-app-config.mjs` bakes it into
   `public/app-config.js`. The app then auto-switches to the backend session path.

Once `APP_GOOGLE_DRIVE_BACKEND_URL` is set, the client-side `optc_google_account_session`
memory is inert (the server session is authoritative), so the client-side fix and this
backend coexist safely.
