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

## ⚠️ Three of the four are disclosed nowhere

Measured 2026-09-16 across every privacy and cookie namespace in `public/i18n`, in
both languages:

| Vendor | Mentions in the privacy copy |
| --- | ---: |
| Google Analytics | **18** |
| Google Tag Manager | **0** |
| Microsoft Clarity | **0** |
| Cloudflare | **0** |

This is an **owner decision, and it is open**. The two honest resolutions are to
disclose them or to remove them, and writing privacy copy for a vendor the owner
may prefer to drop would prejudge it. Removing the GTM container removes Clarity
with it, since the container is what injects it.

Until it is resolved, the gap is **declared** in `VENDOR_DISCLOSURE`
(`scripts/check-csp-policy.mjs`) with a reason and a date, so it is visible in the
code rather than merely absent from the copy. The check fails on any origin that is
neither disclosed nor declared — which is the part that did not exist before: a
fifth vendor could have been added and nothing would have asked whether the privacy
page mentions it.

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
