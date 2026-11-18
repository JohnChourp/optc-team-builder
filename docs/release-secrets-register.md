# Release secrets: what each one is for, and what happens when it changes

**869f13gbv · 869f13gbj.** Measured 2026-09-22 against `.github/workflows/release-android.yml`.
**869f63gu4** added [which `app-config.js` each build gets](#which-app-configjs-each-build-gets),
generated, on 2026-09-25.

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

> **2026-11-18 (1amndjnq718): six are read now.** Google sign-in and Drive sync were removed, so
> no build reads `APP_GOOGLE_WEB_CLIENT_ID` or `APP_GOOGLE_IOS_CLIENT_ID` any more. The web one can be
> deleted from the repository and the `github-pages` environment, and its OAuth client disabled in
> Google Cloud - both are the owner's actions. The rows below keep the history.
>
> **2026-11-18, the same task: `RELEASE_PUSH_TOKEN` was deleted** on the owner's word, so five
> remain. It had expired, and every `Release Android` run from 2026-10-02 to 2026-11-18 stopped at
> its first step (see the correction below). `release-android.yml` now uses `github.token`, which is
> enough: the `main` ruleset only forbids force pushes and deletion, and the workflow has
> `contents: write`. Not yet proved by a real run - the next release is the proof.

The subtask that opened this said five. There are **eight**. The register exists partly because
the count itself was wrong in three places.

**Corrected 2026-09-25 (869f63gu4): the workflows name eight, and seven exist.** `gh secret list`,
names only, shows seven repository secrets, and `APP_GA4_MEASUREMENT_ID` and
`APP_GOOGLE_WEB_CLIENT_ID` again in the `github-pages` environment. `APP_GOOGLE_IOS_CLIENT_ID`
exists in neither, so every build that names it gets an empty string. This table also called the
analytics secret `APP_GA`, a name no workflow reads.

| Secret | Consumed by | What it does | Consequence of rotation |
| --- | --- | --- | --- |
| `ANDROID_KEYSTORE_B64` | `release-android.yml` | the signing keystore, base64 | **Permanent.** See above |
| `ANDROID_SIGNING_STORE_PASSWORD` | `release-android.yml` | opens that keystore | tied to the keystore |
| `ANDROID_SIGNING_KEY_ALIAS` | `release-android.yml` | names the key inside it | tied to the keystore |
| `ANDROID_SIGNING_KEY_PASSWORD` | `release-android.yml` | opens that key | tied to the keystore |
| `RELEASE_PUSH_TOKEN` | **deleted 2026-11-18**; was `release-android.yml` and the sibling checkout of the manual `docs-integrity.yml` | pushed the release commit and tag to `main` | **expiry stopped every release from 2026-10-02** - see below |
| `APP_GOOGLE_WEB_CLIENT_ID` | nothing since 2026-11-18 (was the website build) | was Google sign-in and Drive sync | none - unused |
| `APP_GOOGLE_IOS_CLIENT_ID` | nothing since 2026-11-18 | was the iOS OAuth client id | **does not exist** - see below |
| `APP_GA4_MEASUREMENT_ID` | the builds in [the table below](#which-app-configjs-each-build-gets) - the website, not the APK | analytics id | analytics stops; nothing player-facing breaks |

## What the gate actually covers, and what it does not

`release-android.yml` has a **Validate required release secrets** step, which is more than most
projects do. Measured: it validates **four of the eight** - the keystore and the three signing
secrets. It sits at step 129, **after** `Install dependencies` and **before** `Prepare Android
signing` and `Run Android release`, so it does fail **before anything is built, signed, committed
or tagged**. That was the open question in 869f13gbj and the answer is good.

The four it does not validate fail later and differently:

- `APP_GOOGLE_WEB_CLIENT_ID` (until 2026-11-18, when Google sign-in was removed) was required by the website build, which ran the writer with
  `--require-google-web-client-id`, so an empty one fails the Pages build rather than the gate.
  Later, but still before publication. The APK build requires nothing, so there it fails nothing.
  (Corrected 2026-09-25: this said `scripts/check-app-config.mjs` checks it. That guard refuses
  unknown keys and secret-shaped values; it never required one.)
- `APP_GA4_MEASUREMENT_ID` is required by no build. Without it the id is written empty and
  analytics does not load.
- `APP_GOOGLE_IOS_CLIENT_ID` does not exist and no build requires it (below), so its absence is
  invisible.
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

  **Corrected 2026-11-18 (1amndjnq718): an expired token did stop every release.** The fallback
  runs only when the secret is *empty*. An expired but non-empty token is exported as `GH_TOKEN`,
  `gh auth status` rejects it, and `release-and-tag.sh --require-gh-release` stops with
  *"gh auth is unavailable"* before anything is built. Measured: every run from 2026-10-02 to
  2026-11-18 failed that way, so no release - and none of the daily data chain - shipped after
  v0.7.0 until v0.8.0 was released locally. The secret was then deleted, so the fallback is what
  runs now.

  The manual `docs-integrity.yml` read the private brain with the same secret. `github.token`
  cannot read another private repository, so a manual dispatch of it now fails at its sibling
  checkout - as it already did once the token expired. `npm run verify:local` runs the same check
  locally and is unaffected.

## `APP_GOOGLE_IOS_CLIENT_ID` - inert, and deliberately kept

> **Superseded on 2026-11-18 by 1amndjnq718.** Google sign-in was removed, and the writer, the
> config type and every workflow step stopped naming this key. What follows is the record of why it
> was kept until then.

iOS was dropped on 2026-09-20 (869f13c92). The handoff that opened this session asked whether this
secret is therefore dead. **It is not dead code.** Measured: it is read at runtime -

- `scripts/write-app-config.mjs` writes it into `public/app-config.js`;
- the app's sync config (`app-sync.config.ts`, deleted on 2026-11-18) read it off `window.__appConfig`;
- the Google account service (deleted on 2026-11-18) passed it as `iOSClientId`.

It is **inert** rather than dead: `iOSClientId` is only ever consulted on an iOS platform, and
there is no iOS platform to consult it. Removing it would mean editing the Google sign-in
configuration path - production authentication - to delete something that costs nothing and would
have to be put back by `npx cap add ios`.

**So it stays, and the iOS-drop record is what was incomplete.** This row is that record.

**And the secret itself does not exist** (2026-09-25, names only, repository and `github-pages`
environment). Every build step that names it writes `googleIosClientId` empty: the live site's
was empty on 2026-09-23 while sign-in worked there. That is expected, not a fault -
`GoogleAccountService` decides whether sign-in is available from the iOS client id only on an
`ios` platform, and from the web client id everywhere else. Nothing requires it either: no npm
script passes `--require-google-ios-client-id` and no workflow sets
`APP_REQUIRE_GOOGLE_IOS_CLIENT_ID`.

## Which `app-config.js` each build gets

**869f63gu4.** Each build writes its own `public/app-config.js` with
`scripts/write-app-config.mjs`, from whatever its workflow step supplies. The table below is
generated from the writer, `package.json` and the workflows by `npm run release:contract`, which
also records it in `docs/release-contract.json`. The release-contract lane fails when a build's
environment, the writer or the npm script chain changes without the table following, and when a
workflow names one of the writer's variables anywhere except a listed build step.

A cell names the secret a key comes from, or says the key is empty or holds the writer's default.
Whether a named secret **exists** is GitHub state, measured above. **required** means that build
fails when the key comes out empty.

<!-- generated:app-config-targets start -->

_Generated by `scripts/generate-release-contract.mjs` from `scripts/write-app-config.mjs`, `package.json` and the workflows. Do not edit by hand. It says where each key comes from and whether it is empty - never a value._

| Key | Variable | Website | APK | Guide discoverability build | PWA cache-freshness build |
| --- | --- | --- | --- | --- | --- |
| `ga4MeasurementId` | `APP_GA4_MEASUREMENT_ID` | secret `APP_GA4_MEASUREMENT_ID` | **empty** | secret `APP_GA4_MEASUREMENT_ID` | secret `APP_GA4_MEASUREMENT_ID` |

| Build | Reaches players | Built by | Writer run by | Fails when empty |
| --- | :-: | --- | --- | --- |
| Website - optcteambuilder.com - built on every push to main and again by every release | yes | `.github/workflows/deploy-pages.yml` job `build`, step *Build GitHub Pages artifact* (environment `github-pages`)<br>`.github/workflows/release-android.yml` job `deploy-pages`, step *Build GitHub Pages artifact* (environment `github-pages`) | `build:pages` → `config:app` | nothing |
| APK - the signed APK attached to each GitHub Release | yes | `.github/workflows/release-android.yml` job `release`, step *Run Android release* | `build:ionic` → `config:app` | nothing |
| Guide discoverability build - a verification build, checked and discarded | no | `.github/workflows/guide-discoverability.yml` job `verify`, step *Build GitHub Pages artifact* | `build:pages` → `config:app` | nothing |
| PWA cache-freshness build - a verification build, checked and discarded | no | `.github/workflows/deploy-pages.yml` job `cache-freshness`, step *Verify PWA cache freshness* (environment `github-pages`) | `build:pages` → `config:app` | nothing |

<!-- generated:app-config-targets end -->

**Measured against it, emptiness only, never a value.** On 2026-09-23 the live site's
`app-config.js` carried a non-empty `googleWebClientId`, `ga4MeasurementId` and
`googleDriveFolderName`, and an empty `googleDriveBackendUrl` and `googleIosClientId`. The
published APK - v0.6.4 that day, v0.6.5 after it - carried every key empty except
`googleDriveFolderName`. Both are what the table predicts: the website's two secrets exist and its
iOS one does not, and the APK's build step supplies nothing, so only the writer's default survives.
That is why the APK offered no Google sign-in, no Drive sync and no analytics. Since 2026-11-18
(1amndjnq718) no build carries any Google key: `ga4MeasurementId` is the only one left.
