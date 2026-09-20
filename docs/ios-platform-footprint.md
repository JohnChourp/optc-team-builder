# The iOS footprint: everything that existed only because of iOS

**Status:** recorded 2026-09-15 · **the project was dropped 2026-09-20** ·
[869f17h6e](https://app.clickup.com/t/90121749478/869f17h6e) ·
[869f13c92](https://app.clickup.com/t/90121749478/869f13c92)

## The decision, and its reversal

**The PWA is the iOS path.** iPhone players install the web app to the home
screen. There is no App Store build and none is planned. That part is unchanged.

What changed is the second half. Until 2026-09-20 the `ios/` Capacitor project was
**kept so the option stayed open**; on 2026-09-19 the owner decided to stop
carrying it, and on 2026-09-20 it was removed — 19 tracked files, `@capacitor/ios`,
the `ios:open` and `ios:sync` scripts, and the pbxproj write in `bump-version.sh`.

**Restoring it is `npx cap add ios`** plus putting that write back. This document is
kept, past tense, because the inventory below is what makes the restoration safe and
the removal reviewable.

### The order mattered, and this document set it

The section *"The release depends on the iOS project, and fails badly without it"*
below said: guard or remove the pbxproj write **first**, prove a release still bumps
cleanly, and only then remove `ios/`. That is exactly the order the removal followed.
`scripts/bump-version.spec.ts` now carries a case that bumps in a workspace with **no
`ios/` at all** and asserts every other file still moved — so the absence is pinned,
not merely untested.

### One entry of the inventory below was wrong

Entry 4 calls the npm `xcode` override iOS-only. **It is not, and removing it
reintroduced three moderate advisories.** `xcode` is a dependency of
`@capacitor/cli`, which the **Android** build needs, so the override protects a
package iOS never owned alone. Measured 2026-09-20: `npm audit` reports **0** on
`main`, **3 moderate** with the override removed, and **0** again once it was put
back. The override stays.

That is the whole reason this document exists — *"anyone removing 'the iOS things'
by name"* would have broken something — and it caught a second instance of its own
warning.

## The complete inventory

Every artifact that exists because of iOS, measured 2026-09-15.

| # | Artifact | Detail |
| :--: | --- | --- |
| 1 | `ios/` Capacitor project | 21 tracked files, 872K, including `App.xcodeproj/project.pbxproj` |
| 2 | `ios:open` | `npx cap open ios` — opens Xcode |
| 3 | `ios:sync` | `npx cap sync ios` |
| 4 | npm override `xcode` | `{"uuid": "^11.1.1"}` — the only override in `package.json` |
| 5 | `bump-version.sh` coupling | writes `MARKETING_VERSION` and `CURRENT_PROJECT_VERSION` into the pbxproj on **every** release |
| 6 | Shared Capacitor scripts | `cap:sync`, `cap:copy`, `build:mobile` — shared with Android, **not** iOS-only |
| 7 | Workflows | **none.** Nothing in `.github/workflows/` references iOS or Xcode |

Entries 2, 3 and 4 are iOS-only and inert. Entry 6 is shared. Entry 7 is the
absence that started the question.

Entry 5 is the one that matters.

## The release depends on the iOS project, and fails badly without it

`scripts/bump-version.sh` reads the Xcode project **unguarded**:

```js
let ios = fs.readFileSync(iosPbxproj, 'utf8');
```

There is no existence check. The read happens **after** `package.json` and
`android/app/build.gradle` have already been written, and the script runs under
`set -euo pipefail`.

So deleting `ios/` without changing `bump-version.sh` first does not produce a
tidy no-op. It aborts the release **mid-bump**, with the version already advanced
in two tracked files and no tag cut.

That inverts the obvious reading of the situation. "Versioned every release and
built by nothing" sounds like dead weight. In fact the iOS project is
**load-bearing for the Android release**, and it is the single reason removing the
footprint is a change rather than a deletion.

If the decision ever reverses, the order is: guard or remove the pbxproj write in
`bump-version.sh` **first**, prove a release still bumps cleanly, and only then
remove `ios/`.

## What is *not* part of the footprint

`APP_GOOGLE_IOS_CLIENT_ID` looks like iOS-native scaffolding and is not. It is
read by `scripts/write-app-config.mjs` and supplied by **four** workflows —
including `deploy-pages.yml`, which builds the website — gated by
`APP_REQUIRE_GOOGLE_IOS_CLIENT_ID`.

Anyone removing "the iOS things" by name would have taken Google sign-in down on
the web app. It stays regardless of what happens to `ios/`.

## What this costs today

Close to nothing, which is why the decision is to keep it:

- no CI minutes — no workflow touches it;
- no bundle bytes — nothing in `ios/` reaches the web build;
- one npm override, which `npm ci` resolves without complaint;
- 872K of repository, and two scripts a developer may run by hand.

The cost is the release coupling in entry 5, and that cost is already paid and
already working.
