# What "we support this" means, per platform and per engine

**Status:** recorded 2026-09-15 · [869f17h7w](https://app.clickup.com/t/90121749478/869f17h7w) · [869f17h7a](https://app.clickup.com/t/90121749478/869f17h7a)

Across this backlog the word "support" has been used for five different things at
once: an iOS project that is versioned and never built, a sideloaded Android APK,
engines with automated coverage, engines without, and a PWA installable
everywhere. Most of the open platform questions are really *"which level is
this?"* — and once the levels exist, the answers are cheap.

## The ladder

The levels are about **cadence**, not intent, because cadence is the thing a
check can read.

| Level | Meaning |
| --- | --- |
| **verified** | automated coverage runs with **no human involved** — a schedule, or a release |
| **supported** | automated coverage exists and runs in the standard gate, but only when a person runs or dispatches it |
| **best effort** | expected to mostly work; no automated coverage of its own |
| **not supported** | no claim |

`verified` is the only level a check can prove, which is why it is defined that
way rather than by how confident anyone feels.

## Engines

| Engine | Level | Runs unattended in |
| --- | --- | --- |
| **Chromium** | **verified** | `performance-budgets`, `public-entry-synthetics`, `release-android` |
| **Firefox** | supported | — |
| **WebKit** | supported | — |

**All three have identical coverage in content.** The full e2e suite runs against
each of them in `test.yml`'s browser matrix and in every `npm run verify:local:full`.
What differs is who starts it: **only Chromium is exercised without somebody
deciding to exercise it.**

That distinction is not pedantry. It is the difference between *"we would see this
before a player does"* and *"we would see this if someone looked"*, and getting it
wrong put a false sentence on a player-facing screen — see below.

**WebKit carries more weight than its level suggests.** Apple requires it for
every browser on iOS, so an iPhone player is on WebKit whichever browser they
installed. That is why the iOS platform row is *best effort* while the engine is
*supported*: the rendering is covered, the platform around it is not.

## Platforms

| Platform | Level | Why |
| --- | --- | --- |
| **Web** | **verified** | deployed on every push to `main`, with a post-deploy service-worker freshness check and scheduled synthetics against the live site |
| **Android APK** | supported | built and signed on every release, sideloaded rather than on Google Play, self-updating. **No automated UI test runs on a device or emulator** — the APK is proven to *build* automatically and proven to *work* by hand |
| **iOS via PWA** | best effort | the installed web app is the intended path. The engine is covered; **installing to the home screen, storage eviction and service-worker lifetime on iOS have never been exercised** |
| **iOS native app** | not supported | no App Store build exists and none is planned. See [the iOS footprint](ios-platform-footprint.md) — the `ios/` project is kept, and is load-bearing for the *Android* release |

## A single failing browser run decides nothing

Browser lanes here are flaky. A lane that goes red is not evidence on its own:
take the control on `main`, **twice**, before attributing a failure to a change.
This was measured again during wave 10 — a Chromium failure in a full suite run
passed 3/3 in isolation on the branch and 3/3 on `main`.

The quarantine file exists for tests that earn it, and is currently empty. An
empty quarantine is the healthy state, not a missing feature.

## The claim this ladder was written after

The player-facing screen shipped this sentence in **v0.4.40**:

> Every release is tested automatically on all three major browser engines, not
> just one.

**Only Chromium is installed by a release.** The sentence named the right engines
and was wrong about when they run. The support-claims check could not see it,
because that check compares *lists of engines* and the list was correct.

So `check-support-ladder.mjs` now refuses a cadence promise — *every release*,
*automatically*, *on a schedule*, and the Greek equivalents — in the screen's
browser copy unless **every** engine on the ladder is `verified`. Checked in both
languages, because a claim corrected in one and left in the other is a failure
this project has already had with quoted labels.

## The guard

`npm run platforms:support-ladder` fails when a configured Playwright project has
no level, when a `verified` engine names no unattended workflow or names one that
does not install it, when a `supported` engine **is** installed unattended
(under-claiming is drift too), when a platform's evidence path does not exist, when
the player-facing screen's engine list and this ladder disagree, and when the
screen promises a cadence the ladder does not support.
