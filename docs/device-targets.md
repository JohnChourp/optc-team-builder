# Which screens this app supports, and to what standard

**Status:** recorded 2026-09-21 · [869f13err](https://app.clickup.com/t/90121749478/869f13err) ·
owner decision, same day

Until now nothing declared a target, which made every layout question unanswerable.
*"Is this broken at 1366px?"* has no answer if 1366px was never a target, and
*"should I fix it?"* then becomes a matter of taste rather than of contract. This file
is the contract.

## The target set

| Surface | Width | Standard |
| --- | --- | --- |
| **The builders and every in-app screen** | **360–480px** | **designed.** Laid out for this range and verified in it |
| The same screens, wider | 481px and up | **works, not designed.** A defect here is real only if content is unreachable or unreadable — not because a column is centred in white space |
| **The public pages** — 4,619 character pages, the tool pages, the guides | **360–1920px** | **designed at both ends.** These are where strangers arrive from a search result, on a laptop |
| Android split screen | short, not narrow | **works.** Height is the constraint; see the FAQ entry on split screen |

Input is **touch first**, mouse and keyboard supported. The minimum touch target is
**44px in both dimensions** — see the asymmetry note below.

## Why the split is where it is

A player who found this from a search result on a laptop decides in about five seconds
whether the tool is serious, and what they landed on is a **public page** — a character
page or a guide, never a builder. The builders are opened deliberately, by someone who
already decided, and overwhelmingly on a phone.

So the two surfaces genuinely differ, and saying so is the point: it converts *"the app
is phone-shaped on desktop"* from a defect report into a stated scope, and it makes the
public pages' desktop behaviour a real obligation rather than a nice-to-have.

## What this declaration makes answerable

| Question | Answer it now has |
| --- | --- |
| A builder screen looks narrow at 1920px | **Not a defect.** Outside the designed range, and the content is reachable |
| A guide runs to 200-character lines at 1920px | **A defect.** Public pages are designed to 1920 |
| A control is 44px tall and 22px wide | **A defect.** The minimum is both dimensions |
| A screenshot at 1366px of the Auto Team Builder | **Not a defect** unless something is unreachable |

## The asymmetry this was written after

Measured 2026-09-12 and confirmed 2026-09-21: `min-height: 44` appears in **7**
stylesheets and `min-width: 44` in **1**. A control tall enough and narrow enough to miss
is exactly as hard to hit as a short one, and a mobile-first app with dense filter bars,
chips and icon buttons makes narrow the likely shape.

**That count is not itself the finding.** This repository already learned that
*an Ionic custom property never reaches the host*
(`../optc-team-builder-brain/CLAUDE.md`),
so reasoning about rendered size from a stylesheet is the exact trap it documented — an
Ionic component carries its own internal sizing and a host with no rule may still render
large enough. The sizes have to be read from **rendered geometry**, not from the CSS, and
that measurement has not been done. It is named here as open rather than left to be
rediscovered.

## Measured against this contract, 2026-09-21

The declaration above was written first and measured second, in Claude's built-in browser
against a local dev server.

### Public pages at desktop widths — was failing, now fixed

**It was the second of the two predicted shapes: lines run to unreadable length.** Not a
stranded phone column — there was no horizontal overflow at any width, and the page shell
filled the viewport.

| Guide page | Widest text block | Characters per line |
| --- | :-: | :-: |
| 1366px, before | 771px | **98** |
| 1920px, before | 1,325px | **169** |
| 1920px, **after** | 628px | **80** |
| 1366px, after | 628px | **80** |
| 390px, after | 316px | **40**, unchanged |

Readable is **45–75**. The cause was precise and was not a missing breakpoint: every
container from the paragraph up to `ion-content` had `max-width: none`, so the copy simply
took the viewport. The fix is one rule — a `72ch` cap on the hero's reading column in
`seo-content.page.scss` — and the mobile pass is untouched, because a 72ch cap never binds
at 390px.

### Touch targets — measured, and the CSS had it backwards

**The stylesheet predicted the wrong failure.** `min-height: 44` appearing in 7 files against
`min-width: 44` in 1 suggested narrow targets. Rendered geometry on Captain Coverage at
390px says otherwise:

| | Instances |
| --- | :-: |
| Interactive controls rendered | **411** |
| Below 44px in some dimension | **124** |
| Tall enough but **too narrow** | **0** |
| Wide enough but **too short** | 18 |
| **Too small in both** | **106** |

There is no asymmetry to fix. The controls that fail are simply **small**, and one class is
most of it: `button.captain-result__cost`, at **31×28**, **95 instances**. After it come
`.ability-rank-toggle__chip` (59×26) and the five `.character-facet-filter__option` type
buttons (~56×32).

**That fix is not in this change**, and the reason is recorded rather than implied: raising
95 badges and a filter row changes the density of the screen they sit on, which is a visual
decision to be looked at rather than a number to satisfy. It is
[869f13epp](https://app.clickup.com/t/90121749478/869f13epp)'s remaining half.

## What is still open under this contract

1. **Raising the 124 controls** ([869f13epp](https://app.clickup.com/t/90121749478/869f13epp)), and a check that a new one falling short is caught. The measurement above is the input to it.
2. **Binding the visual baselines to this set** rather than to profiles somebody chose once.

## What this file is not

It is not a promise that every screen is beautiful at every width. It is the smaller and
more useful thing: a line that tells you whether what you are looking at is a bug.
