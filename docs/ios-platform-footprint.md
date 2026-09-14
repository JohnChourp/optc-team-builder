# The iOS footprint: everything that exists only because of iOS

**Status:** recorded 2026-09-15 · [869f17h6e](https://app.clickup.com/t/90121749478/869f17h6e)

## The decision

**The PWA is the iOS path.** iPhone players install the web app to the home
screen. There is no App Store build, none is planned, and the `ios/` Capacitor
project is kept so the option stays open — not because anything ships from it.

Owner decision, 2026-09-14. Recorded here so the next reader does not have to
infer it from an unbuilt Xcode project.

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
