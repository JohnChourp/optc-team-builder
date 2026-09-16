# Google Drive Sync Backend

This backend keeps Google Drive sync connected after the browser page closes.
It uses Google OAuth authorization code flow with `access_type=offline`, stores
refresh tokens encrypted at rest, and exposes only an HttpOnly app session cookie
to the browser.

## What proves this code before it is deployed

**Recorded 2026-09-15 · [869f135rt](https://app.clickup.com/t/90121749478/869f135rt).**
This component holds somebody's Google refresh token, so "somebody ran the tests"
is not a good enough answer. This is the whole of it.

### 1. `npm run test:drive-sync-server` — a lane, not a suggestion

`drive-sync-server` is a lane in `scripts/ci-check-routing.mjs`, so it runs on
**every** `npm run verify:local`, not only when somebody remembers this directory.
That was worth confirming rather than assuming, and it holds.

**10 tests.** What they assert:

| # | Asserted |
| --- | --- |
| 1 | `/auth/google/start` uses `access_type=offline` and sets an **HttpOnly** state cookie |
| 2 | only an **encrypted** refresh token is stored, and no token appears in the status response or on disk |
| 3 | an upload refreshes the access token and clears the pending payload |
| 4 | a sync request **without** a session is rejected |
| 5 | the global rate limit returns **429 with `Retry-After`** |
| 6 | the write limit applies **independently** of the global window |
| 7 | an invalid payload becomes a remote check rather than an enqueued upload |
| 8 | a session cookie with a **tampered signature** reads as signed-out |
| 9 | the session cookie carries **`HttpOnly`** and **`SameSite=Lax`** |
| 10 | a JSON body **over the cap** is refused by the cap |

Tests 8-10 were added by 869f135rt. Enumerating what proved this code turned up a
gap rather than an answer: nothing asserted the HMAC that makes a session cookie
trustworthy, nothing asserted the cookie attribute that **section 0's one hard
rule depends on**, and nothing asserted the body cap.

All three are mutation-tested. Making the signature comparison `return true`,
setting `SameSite=None`, and removing the cap each turn exactly one of them red.

Test 10 is worth a warning to whoever edits it next: **it was wrong first.** It
posted an unauthenticated oversized body and asserted a 4xx, which passes whether
the cap exists or not, because `requireSession` rejects long before
`readJsonBody` is reached. Removing the cap left it green. It now authenticates
and asserts the error **message**, because both requests fail in this harness and
the message is the only thing separating "refused for its size" from "failed
further along".

### 2. CodeQL scans `server/`, weekly

`javascript-typescript`, on the `31 3 * * 2` schedule in
`.github/workflows/codeql.yml`. There is **no** `paths` filter and **no** CodeQL
config file, so the default applies and this directory is not excluded.

Confirmed from the run log rather than from the absence of a filter — the
2026-09-15 08:56 run prints:

```text
Extracting .../server/drive-sync-server.mjs
Extracting .../server/drive-sync-server.spec.mjs
CodeQL scanned 407 out of 407 TypeScript files, 125 out of 125 JavaScript files ...
```

Re-check with:

Command status: manual/illustrative.
<!-- docs-command: manual/illustrative -->
```bash
gh run list --repo JohnChourp/optc-team-builder --workflow codeql.yml --limit 1 --json databaseId --jq '.[0].databaseId'
```

then `gh run view <id> --log | grep drive-sync-server`.

### 3. No supply chain

`drive-sync-server.mjs` imports **only Node built-ins** — `node:crypto`,
`node:fs/promises`, `node:http`, `node:path`, `node:url`. Zero third-party
packages, so no dependency advisory can reach the component holding the refresh
token, and `npm audit` has nothing to say about it either way.

Keep it that way. A single dependency here changes this row from a guarantee to a
maintenance obligation.

### What is NOT proven

- **No CI runs any of this automatically.** `test.yml` is `workflow_dispatch`-only
  by policy (`docs/ci-trigger-policy.md`), and nothing runs on a pull request. The
  lane proves this code when a human runs `npm run verify:local`. That is the
  repository-wide trade-off, and it is stated here rather than left implicit,
  because the blast radius in this directory is different from a broken screen.
- **The background refresh worker** has no test. `workerIntervalMs: 0` in the
  suite disables it.
- **Nothing proves the deployment**, only the code. The `curl` checks in section 5
  are the deployment's own evidence and are run by hand.

## Local Setup

1. Create a Google OAuth Web application client.
2. Add `http://localhost:8787/auth/google/callback` as an authorized redirect URI.
3. Copy `.env.example` to `.env.local`.

   **The server requires exactly four** of these, and refuses to start without
   them (`normalizeRequiredString`, `resolveDriveSyncConfig`):

   - `GOOGLE_OAUTH_CLIENT_ID` — or `APP_GOOGLE_WEB_CLIENT_ID`, which the server
     reads as its fallback
   - `GOOGLE_OAUTH_CLIENT_SECRET`
   - `DRIVE_SYNC_SESSION_SECRET`
   - `DRIVE_SYNC_TOKEN_ENCRYPTION_KEY`

   The other two this list used to demand are **not** required:

   - `GOOGLE_OAUTH_REDIRECT_URI` defaults to
     `${DRIVE_SYNC_PUBLIC_BASE_URL}/auth/google/callback`, which is
     `http://localhost:8787/auth/google/callback` locally. Set it only when it
     has to differ.
   - `APP_GOOGLE_DRIVE_BACKEND_URL` is **never read by this server**. It is an
     app build-time variable consumed only by `scripts/write-app-config.mjs:14`,
     and it belongs in `.env.local` for the **Angular** app — which is what makes
     it look like a server setting. Set it to `http://localhost:8787` for step 5.

   Every other variable has a default; see the full table in section 2.
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

**869f135tx.** This table is the complete list: the server reads **20** environment
names in `resolveDriveSyncConfig` (`server/drive-sync-server.mjs:78-131`) and every
one of them is below. It used to name 12, so eight settings — including the body
cap and both rate limits — were configurable by anyone who read the source and
invisible to anyone who read this file.

| Variable | Required | Default | What it does |
| --- | --- | --- | --- |
| `GOOGLE_OAUTH_CLIENT_ID` | **yes** | — | the app's Google **Web** client id |
| `GOOGLE_OAUTH_CLIENT_SECRET` | **yes** | — | that client's secret (from the secret store) |
| `DRIVE_SYNC_SESSION_SECRET` | **yes** | — | HMAC key for the session cookie (`openssl rand -hex 32`) |
| `DRIVE_SYNC_TOKEN_ENCRYPTION_KEY` | **yes** | — | encrypts every stored refresh token — see warning below |
| `APP_GOOGLE_WEB_CLIENT_ID` | — | — | read as the client id **only** when `GOOGLE_OAUTH_CLIENT_ID` is unset |
| `APP_ORIGIN` | — | `http://localhost:4200` | CORS allow-origin + `return_to` allowlist. In production: `https://optcteambuilder.com` |
| `DRIVE_SYNC_APP_ORIGIN` | — | — | second name for `APP_ORIGIN`, read only when that one is unset. Set one, not both |
| `DRIVE_SYNC_PUBLIC_BASE_URL` | — | `http://localhost:${PORT}` | the backend's own public origin. In production: `https://drive-sync.optcteambuilder.com` |
| `GOOGLE_OAUTH_REDIRECT_URI` | — | `${publicBaseUrl}/auth/google/callback` | override only when it must differ from that |
| `PORT` | — | `8787` | the port your proxy forwards to |
| `DRIVE_SYNC_DATA_DIR` | — | `.data/drive-sync`, resolved against the **working directory** | the persistent volume path, e.g. `/data/drive-sync` |
| `DRIVE_SYNC_COOKIE_SECURE` | — | `true` when the redirect URI is `https:` | accepts `1/true/yes/on` and `0/false/no/off`; anything else falls back to the protocol |
| `DRIVE_SYNC_SESSION_DAYS` | — | `30` | rolling session cookie lifetime, refreshed on use |
| `DRIVE_SYNC_SESSION_COOKIE` | — | `optc_drive_session` | session cookie name |
| `DRIVE_SYNC_STATE_COOKIE` | — | `optc_drive_oauth_state` | OAuth state cookie name |
| `DRIVE_SYNC_WORKER_INTERVAL_MS` | — | `900000` (**15 minutes**) | background refresh worker period |
| `DRIVE_SYNC_MAX_JSON_BYTES` | — | `20971520` (**20 MB**) | request body cap; asserted by test 10 |
| `DRIVE_SYNC_RATE_LIMIT_PER_MINUTE` | — | `120` | requests per minute **per client IP** |
| `DRIVE_SYNC_RATE_LIMIT_WRITE_PER_MINUTE` | — | `20` | writes per minute **per client IP**, counted in a window independent of the one above |
| `APP_GOOGLE_DRIVE_FOLDER_NAME` | — | `OPTC Team Builder` | the Drive folder the backup is written into |

Four details the table cannot carry in a cell:

- **"Per client IP" is exact, not approximate.** `createRateLimiter`
  (`:1358`) keys its buckets by `resolveClientKey` (`:1431`) — the first hop of
  `X-Forwarded-For`, else `socket.remoteAddress`, else the literal `unknown`.
  Behind a proxy that does not set `X-Forwarded-For`, every client shares one
  bucket.
- **`0` disables a rate limit** — both checks are guarded by `> 0`. That is the
  only way to turn one off; there is no separate switch.
- **`0` does not disable the worker.** `parseInteger` accepts only integers
  **greater than zero**, so `DRIVE_SYNC_WORKER_INTERVAL_MS=0` silently restores
  the 15-minute default. The suite disables the worker by passing
  `workerIntervalMs: 0` in the config object, which is not reachable from the
  environment.
- **`APP_GOOGLE_DRIVE_BACKEND_URL` is not in this table on purpose.** The server
  never reads it; it is the app's build-time pointer *at* the server, set in step
  4 below.

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
