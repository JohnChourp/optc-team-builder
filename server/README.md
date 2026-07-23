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

## Production deployment runbook (seamless, no-popup persistence)

Without this backend the web app uses Google's client-side **implicit token flow**,
which has no refresh token: the access token expires after ~1 hour. The app no longer
signs you out when that happens (it remembers your profile locally and re-mints a token
on the next Drive action), but a fully seamless, never-prompt experience needs this
backend, which holds an `access_type=offline` refresh token server-side and mints fresh
access tokens automatically. The rolling session cookie lasts `DRIVE_SYNC_SESSION_DAYS`
(default 30), refreshed on use.

This exact flow was verified locally on 2026-07-23 (real Google sign-in → encrypted
refresh token stored → fresh access token minted from it with zero interaction → live
Drive read). Follow the steps below to put it in production. Nothing here needs a code
change except step 4 (one workflow env line); everything else is host config + Google
Cloud Console + secrets.

### 0. The one hard rule — host the backend on a **same-site subdomain**

The session cookie is `HttpOnly; Secure; SameSite=Lax`. The app reaches the backend with
`fetch(..., { credentials: 'include' })` for `/auth/google/status` and `/drive/sync/*`.
A `SameSite=Lax` cookie is only sent on such requests when the backend is **same-site**
with the app — i.e. the same registrable domain. So the backend **must** live at a
subdomain of the app's domain, e.g. app `https://optcteambuilder.com` + backend
`https://drive-sync.optcteambuilder.com`.

If you instead put it on a different registrable domain (a raw `*.onrender.com`,
`*.fly.dev`, …) the status/sync fetches are **cross-site**, the Lax cookie is dropped, and
the app stays stuck "signed out" even though sign-in succeeded. If a same-site subdomain is
truly impossible, the only alternative is to patch `setCookie` to emit
`SameSite=None; Secure` for the session (and state) cookie — a code change, HTTPS-only.
Prefer the subdomain.

### 1. Provision the host

- An always-on Node service (Node ≥ 20.6 for `--env-file`, or inject env another way).
- A **persistent disk** mounted at `DRIVE_SYNC_DATA_DIR` — it holds `drive-sync-db.json`
  with every user's **encrypted refresh token**. If this disk is ephemeral, all users get
  logged out on every redeploy. On PaaS, attach a volume; on a VPS, a normal directory.
- **HTTPS** on the public origin (PaaS gives it; on a VPS use nginx + certbot as a TLS
  reverse proxy in front of `PORT`).
- Point DNS `drive-sync.optcteambuilder.com` at the host (PaaS custom domain or VPS A/AAAA).
- Run it: `npm ci` then `npm run server:drive-sync` (or
  `node --env-file=/path/to/prod.env server/drive-sync-server.mjs`).

### 2. Environment (set in the host's secret store — never commit)

| Variable | Value |
| --- | --- |
| `APP_ORIGIN` | `https://optcteambuilder.com` (CORS allow-origin + `return_to` allowlist) |
| `DRIVE_SYNC_PUBLIC_BASE_URL` | `https://drive-sync.optcteambuilder.com` |
| `GOOGLE_OAUTH_REDIRECT_URI` | `https://drive-sync.optcteambuilder.com/auth/google/callback` |
| `GOOGLE_OAUTH_CLIENT_ID` | the app's Google **Web** client id |
| `GOOGLE_OAUTH_CLIENT_SECRET` | that client's secret (from the secret store) |
| `DRIVE_SYNC_SESSION_SECRET` | a fresh random string (`openssl rand -hex 32`) |
| `DRIVE_SYNC_TOKEN_ENCRYPTION_KEY` | a fresh 32-byte key (`openssl rand -hex 32`) — see warning |
| `DRIVE_SYNC_DATA_DIR` | the persistent volume path, e.g. `/data/drive-sync` |
| `DRIVE_SYNC_COOKIE_SECURE` | `true` (auto-true on an https redirect URI; set explicitly to be safe) |
| `PORT` | the port your proxy forwards to |
| `DRIVE_SYNC_SESSION_DAYS` | optional, default `30` |

> ⚠️ **`DRIVE_SYNC_TOKEN_ENCRYPTION_KEY` is permanent.** It decrypts every stored refresh
> token. Rotating it makes all stored tokens unreadable → every user must reconnect. Set it
> once, back it up, never change it casually. Use **fresh** prod secrets — do not reuse any
> local `.env.local` values.

### 3. Google Cloud Console (same Web client)

- **Credentials → the Web client → Authorized redirect URIs**: add
  `https://drive-sync.optcteambuilder.com/auth/google/callback` (keep the localhost one for
  dev). The server already requests `access_type=offline` and forces `prompt=consent` on
  reconnect, so refresh tokens are issued.
- **OAuth consent screen**: `.../auth/drive.file` is a **sensitive** scope. For your own
  account it works immediately; to serve the public without the "Google hasn't verified this
  app" interstitial, submit the app for verification (Search Console domain ownership +
  brand review). It still functions unverified — users just see a click-through warning.

### 4. Point the production app at the backend (one workflow line)

The Pages build generates `public/app-config.js` from env via `config:app`. Add the backend
URL to the build env in `.github/workflows/deploy-pages.yml` (the `Build GitHub Pages
artifact` step, alongside `APP_GOOGLE_WEB_CLIENT_ID`):

```yaml
        env:
          APP_GA4_MEASUREMENT_ID: ${{ secrets.APP_GA4_MEASUREMENT_ID }}
          APP_GOOGLE_WEB_CLIENT_ID: ${{ secrets.APP_GOOGLE_WEB_CLIENT_ID }}
          APP_GOOGLE_IOS_CLIENT_ID: ${{ secrets.APP_GOOGLE_IOS_CLIENT_ID }}
          APP_GOOGLE_DRIVE_BACKEND_URL: ${{ secrets.APP_GOOGLE_DRIVE_BACKEND_URL }}  # add
```

Then set the repo secret `APP_GOOGLE_DRIVE_BACKEND_URL =
https://drive-sync.optcteambuilder.com` and redeploy Pages. The next build bakes the backend
URL into `app-config.js`, and the app switches every user to the server-session path.

### 5. Deploy & verify

Command status: manual/illustrative.
<!-- docs-command: manual/illustrative -->
```bash
# backend is up and healthy (no session yet):
curl -s https://drive-sync.optcteambuilder.com/auth/google/status
# -> {"authenticated":false,"status":"signed-out"}

# /start builds the correct consent URL (302 to accounts.google.com, access_type=offline):
curl -s -o /dev/null -w "%{http_code} %{redirect_url}\n" \
  "https://drive-sync.optcteambuilder.com/auth/google/start?return_to=https://optcteambuilder.com/tabs/account"
```

Then on `https://optcteambuilder.com/tabs/account`: **Sign in with Google** once → the page
should flip to **Connected**. Confirm `drive-sync-db.json` on the volume has a user with a
non-null `encryptedRefreshToken` and `needsReconnect:false`. Reloading hours later stays
connected with no popup.

### 6. Ops

- **Rotate the OAuth secret**: create the new secret in Console, update
  `GOOGLE_OAUTH_CLIENT_SECRET` in the host secret store, restart, verify a sync, then delete
  the old secret. (The client **id** is unchanged, so nothing else moves.)
- **Back up** `DRIVE_SYNC_DATA_DIR` (encrypted-at-rest tokens) and keep
  `DRIVE_SYNC_TOKEN_ENCRYPTION_KEY` archived alongside your other secrets.
- **Rollback / kill switch**: unset (or blank) the `APP_GOOGLE_DRIVE_BACKEND_URL` build
  secret and redeploy Pages. The app instantly reverts to the client-side flow (which keeps
  the never-auto-logout fix). The two paths coexist safely: once
  `APP_GOOGLE_DRIVE_BACKEND_URL` is set, the client-side `optc_google_account_session`
  memory is inert because the server session is authoritative.
