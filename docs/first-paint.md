# The first paint

**Status:** recorded 2026-09-15 · [869f135rc](https://app.clickup.com/t/90121749478/869f135rc)
· measured on v0.4.49

## What a reader saw, and for how long

Measured on a throttled **Pixel 5** profile — 1.6 Mbps down, 150 ms latency —
against a locally served production build:

| | Before | After |
| --- | ---: | ---: |
| **First Contentful Paint** | **9,308 ms** | **392 ms** |
| Text on screen | *(none)* | `OPTC Team Builder` + `Loading your characters and teams…` |
| Announced to a screen reader | **no** — `aria-hidden="true"` | `role="status"`, `aria-live="polite"` |

**23.7x faster**, and the reason is not a performance optimisation. Nothing about
the download changed.

## Why the spinner was not a first paint

`index.html` carried an 84px spinner and nothing else: a `<div>` with borders, a
border-radius and an animation.

**A bordered div is not contentful.** First Contentful Paint counts text, images,
canvas and SVG — a CSS-only shape is none of those. So the browser reported no
contentful paint at all until **Angular rendered the first route**, nine seconds
in, while the spinner span on what the metric correctly considered a blank page.

The subtask that found this asked to *"establish what renders first today —
measure it, do not assume"*. That instruction earned its place: the assumption
going in was that the spinner had always satisfied FCP and only its *content* was
at issue. It had not.

## What changed

Text. That is the whole fix:

```html
<div class="app-bootstrap-loader" role="status" aria-live="polite">
  <p class="app-bootstrap-loader__title">OPTC Team Builder</p>
  <div class="app-bootstrap-loader__spinner" aria-hidden="true"></div>
  <p class="app-bootstrap-loader__note">Loading your characters and teams…</p>
</div>
```

**Nothing joins the critical path** — no font, no image, no script. The brand is
text so it paints with the document instead of waiting for a request, which is
the entire point of putting it in `index.html` rather than in the app.

Cost: **+283 bytes gzipped** on `index.html`, which is 4.5% of that file and
0.075% of the 377 KB gzipped initial payload.

The spinner keeps `aria-hidden="true"` — it is decoration, and a screen reader
should hear the status, not the ornament.

## The accessibility half

The old markup was `aria-hidden="true"` on the *only* element on the page, with
`app-root` still empty. A screen-reader user was told **nothing at all** for those
nine seconds — not "loading", not the app's name. `role="status"` with
`aria-live="polite"` announces it once, without interrupting.

## The English is deliberate, and a known limit

`index.html` is static and paints before Angular exists, so transloco cannot reach
it. The app sets `documentElement.lang` only after hydration, and the document
ships as `lang="en"` — so English here is consistent with what the document
claims at that moment. A Greek reader meets two English lines before the app takes
over.

Translating it would mean either shipping both languages and choosing in an inline
script, or an extra request — both of which put something on the critical path to
save one sentence. Recorded as a limit rather than fixed.

## Re-measuring

`scripts/perf-route-load.mjs` now records `firstContentfulPaintMs` per route and
viewport, alongside `readyMs`. It is **recorded, not budgeted**: a budget in this
repository is set from history, and one run is a number rather than a budget.

Note what a timing cannot prove. FCP is now early because the paint contains text;
it would stay early if that text were wrong, absent, or untranslated. The
screenshots under `optc-team-builder-brain/live-artifacts/869f135rc/` are the
evidence of *what* is painted, and the timing is only the guard against a
regression.
