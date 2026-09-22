# Release secrets: what each one is for, and what happens when it changes

**869f13gbv · 869f13gbj.** Measured 2026-09-22 against `.github/workflows/release-android.yml`.

The knowledge here is needed at a moment nobody plans for - a token expiring, a machine changing,
a key being regenerated "to be safe". A register is what stops that decision being made casually.

> ## ⛔ `ANDROID_KEYSTORE_B64` IS EFFECTIVELY PERMANENT
>
> **An APK signed with a different key will not install over the existing one.** Android refuses
> the update with `INSTALL_FAILED_UPDATE_INCOMPATIBLE`, and the only way a player gets the new
> version is to **uninstall first, losing every saved team, box, preset and favourite held in app
> storage.** That is the worst outcome available in this project, and it is not reversible.
>
> The three `ANDROID_SIGNING_*` secrets are tied to that keystore and inherit its permanence.
>
> **Do not rotate the keystore.** If it is ever lost, the honest options are a new application id -
> a new listing, and every player starts empty - or nothing. There is no third one.

## The eight

The subtask that opened this said five. There are **eight**. The register exists partly because
the count itself was wrong in three places.

| Secret | Consumed by | What it does | Consequence of rotation |
| --- | --- | --- | --- |
| `ANDROID_KEYSTORE_B64` | `release-android.yml` | the signing keystore, base64 | **Permanent.** See above |
| `ANDROID_SIGNING_STORE_PASSWORD` | `release-android.yml` | opens that keystore | tied to the keystore |
| `ANDROID_SIGNING_KEY_ALIAS` | `release-android.yml` | names the key inside it | tied to the keystore |
| `ANDROID_SIGNING_KEY_PASSWORD` | `release-android.yml` | opens that key | tied to the keystore |
| `RELEASE_PUSH_TOKEN` | `release-android.yml` | pushes the release commit and tag to `main` | **expiry breaks the unattended nightly chain** - see below |
| `APP_GOOGLE_WEB_CLIENT_ID` | `release-android.yml`, `deploy-pages.yml`, `write-app-config.mjs` | Google Drive sync on the web | sync sign-in stops working; not a secret, a client id |
| `APP_GOOGLE_IOS_CLIENT_ID` | `release-android.yml`, `deploy-pages.yml`, `guide-discoverability.yml`, `write-app-config.mjs` | the iOS OAuth client id | **inert today** - see below |
| `APP_GA` | `release-android.yml`, `deploy-pages.yml` | analytics id | analytics stops; nothing player-facing breaks |

## What the gate actually covers, and what it does not

`release-android.yml` has a **Validate required release secrets** step, which is more than most
projects do. Measured: it validates **four of the eight** - the keystore and the three signing
secrets. It sits at step 129, **after** `Install dependencies` and **before** `Prepare Android
signing` and `Run Android release`, so it does fail **before anything is built, signed, committed
or tagged**. That was the open question in 869f13gbj and the answer is good.

The four it does not validate fail later and differently:

- `APP_GOOGLE_WEB_CLIENT_ID` and `APP_GA` are checked by `scripts/check-app-config.mjs` during the
  build, so they fail the build rather than the gate. Later, but still before publication.
- `APP_GOOGLE_IOS_CLIENT_ID` is inert (below), so its absence is currently invisible.
- `RELEASE_PUSH_TOKEN` **does not fail at all**, by design:

  ```yaml
  if [[ -n "${RELEASE_PUSH_TOKEN}" ]]; then
    echo "RELEASE_AUTH_TOKEN=${RELEASE_PUSH_TOKEN}" >> "${GITHUB_ENV}"
  else
    echo "RELEASE_AUTH_TOKEN=${DEFAULT_GITHUB_TOKEN}" >> "${GITHUB_ENV}"
  fi
  ```

  It **falls back to `github.token`**. So an expired `RELEASE_PUSH_TOKEN` does not stop a release;
  it silently changes who pushes. That is better than the failure mode 869f13gbj feared - a
  nightly chain dying unwatched - and it is worth knowing, because it also means **an expired
  token produces no signal at all.** If the fallback's own permissions are ever insufficient the
  failure appears at the push, at the end, after the APK is built.

## `APP_GOOGLE_IOS_CLIENT_ID` - inert, and deliberately kept

iOS was dropped on 2026-09-20 (869f13c92). The handoff that opened this session asked whether this
secret is therefore dead. **It is not dead code.** Measured: it is read at runtime -

- `scripts/write-app-config.mjs` writes it into `public/app-config.js`;
- `src/app/core/sync/app-sync.config.ts` reads it off `window.__appConfig`;
- `src/app/core/services/google-account.service.ts:487` passes it as `iOSClientId`.

It is **inert** rather than dead: `iOSClientId` is only ever consulted on an iOS platform, and
there is no iOS platform to consult it. Removing it would mean editing the Google sign-in
configuration path - production authentication - to delete something that costs nothing and would
have to be put back by `npx cap add ios`.

**So it stays, and the iOS-drop record is what was incomplete.** This row is that record.
