# The project's position on measurement

**Status:** recorded 2026-09-16 · [869f135w2](https://app.clickup.com/t/90121749478/869f135w2)
· measured on v0.4.51

The question this file answers is *"how would we know the app actually helps?"* —
and the honest answer is **not by collecting more**.

## The position

**No new event stream.** The app sends exactly one analytics event, `page_view`,
and it should keep sending exactly one. Anything that would answer "does this app
help" by watching what readers do is a behavioural stream this project has no
appetite to hold, no place to store, and no way to disclose proportionately.

Where a question can be answered from data the reader already stores on their own
device, answer it there — locally, visibly, and without a network call.

## What actually ships

Four browser measurement surfaces, which is more than most readers of this
repository would guess:

| Surface | Injected by | What it sends |
| --- | --- | --- |
| **GA4** (`gtag.js`) | `src/index.html` directly | `page_view` only, consent-gated, refused on native |
| **Google Tag Manager** `GTM-TBW6L4T` | `src/index.html`, `public/404.html`, and `scripts/generate-seo-pages.mjs` — so every generated SEO page too | a container; whatever it is configured to load |
| **Microsoft Clarity** | the GTM container, not this repository | session behaviour |
| **Cloudflare Web Analytics** | Cloudflare at the edge — not in this repository at all | page-level beacon |

Only the first is in the app's own code as an analytics call. The other three are
*containers and edges*: two of them cannot be found by reading `src/`, which is why
`scripts/check-csp-policy.mjs` asserts their origins from a list rather than
discovering them.

## All four are disclosed — as of 2026-09-16

They were not. Measured that morning across every privacy and cookie namespace in
`public/i18n`, in both languages: **Google Analytics 18 mentions, Google Tag
Manager 0, Microsoft Clarity 0, Cloudflare 0.** Three of the four surfaces this app
ships were named nowhere a reader could see.

The owner's answer was **disclose**, and the copy was written the same day — the
privacy page's *Recipients* and *What data may be processed* sections, its
*International transfers* paragraph, and the cookie page's *Optional analytics*
section, in English and Greek.

Two things that copy had to get right, because both are easy to state falsely and
a privacy page is the worst place to be loosely worded:

- **The GTM container loads on every page regardless of consent.** What consent
  gates is `analytics_storage`, which is defaulted to `denied` *before* the
  container loads and granted only on acceptance. "Nothing loads until you
  consent" would have been untrue of the container.
- **Cloudflare Web Analytics is added at the edge**, not by the app, so it is
  present whatever the reader chooses on the cookie page. It is cookieless, which
  is why that is defensible — but it still had to be said.

`VENDOR_DISCLOSURE` in `scripts/check-csp-policy.mjs` now records all five origins
as disclosed, and the check fails if the copy ever stops naming one. The reverse
direction is what actually fired here: every row began `disclosed: false`, and
without the "flip the flag" branch they would have stayed that way while the pages
named all four.

## The cheaper thing that already works

*"You built 11 teams this month"* needs **zero** new collection. `SavedTeam.createdAt`
and `SavedRumbleTeam.createdAt` both exist and both persist, on the reader's own
device. A local summary is answerable today, shows the reader something true about
their own use, and sends nothing anywhere.

That is the shape any future answer to this question should take: read what is
already stored locally, render it locally, transmit nothing.

## What would change this position

- The owner deciding the four surfaces should become one, or none. That is a
  reduction and needs no new position.
- A concrete question that genuinely cannot be answered from local data **and**
  matters enough to justify disclosure. None has been named yet; the subtask that
  prompted this file offered *"the honest answer may be no"* as a legitimate
  outcome, and the evidence supported it.

## What this file is not

It is not a privacy policy — `public/i18n/privacy-policy/` is. It is not a ban on
ever measuring anything. It is the reason the default answer to *"should we track
this?"* is **no**, so that a future yes has to argue for itself.
