# The style-panel pattern: what it is, what it costs, when to use it

**Status:** recorded 2026-09-15 · [869f17h1t](https://app.clickup.com/t/90121749478/869f17h1t) · [869f17h36](https://app.clickup.com/t/90121749478/869f17h36)

82% of this application's `@Component` declarations render nothing. That is the
single largest structural fact about the codebase and nothing described it, so a
reader's first hour goes on deciding whether it is a mistake.

It is not a mistake. It is also not what it looks like.

## What it actually is

Eighteen `*-style-panels.component.ts` files declare **262** components between
them, and the split matters:

- **247 leaf panels** — the famous 82%, each one a stylesheet;
- **15 composing hosts**, which own no stylesheet at all, only the `imports` and
  the template that nests the leaves.

The remaining three of the eighteen files declare no composer; their panels are
imported directly by the page. `262 − 15 = 247` is where the number everyone
quotes comes from, and a check that demanded a stylesheet of the composers
flagged 15 of 18 hosts on its first run — which is how the distinction was found.

Every leaf is identical in shape:

```ts
@Component({
  selector: 'app-ship-picker-layout-panel',
  standalone: true,
  encapsulation: ViewEncapsulation.None,
  template: '<ng-content></ng-content>',
  styleUrl: './ship-picker-layout-panel.component.scss',
  host: { class: 'ship-picker-style-panel', style: 'display: contents;' },
})
export class ShipPickerLayoutPanelComponent {}
```

**`ViewEncapsulation.None` is the whole mechanism.** Angular injects such a
component's stylesheet into the document when the component is first rendered —
and not before. So each panel is a **global stylesheet that loads lazily with the
screen that needs it**, and `display: contents` keeps it out of layout entirely.

Angular has no other way to lazily load a *global* stylesheet. That is the reason
the pattern exists, and it is a real one.

## What the nesting is not

The chain itself is inert. Measured across all 247 panel stylesheets: **4 use
`:host`** and **1** references a `style-panel` class. Every other rule is a plain
global selector like `.ship-picker-header`, which would match identically no
matter which element it was injected from.

So the six-deep nest is **not** a scoping mechanism. One component carrying six
`styleUrls` would load the same stylesheets, in the same order, at the same time.

Say that plainly, because "247 nested components" reads as deliberate scoping and
the scoping is not where it comes from.

## What it costs

Source, measured 2026-09-15: **119 KB** of host `.ts` declarations organising
**289 KB** across **247** panel stylesheets — one `.scss` per leaf, exactly. The
stylesheets would exist whatever the split; the 119 KB is the pattern's own
overhead.

In the DOM, measured against the running app:

| Route | DOM elements | Panel elements | Share | Deepest chain |
| --- | ---: | ---: | ---: | ---: |
| Auto Team Builder | 601 | **74** | **12.3%** | **54** |
| Characters | 865 | 25 | 2.9% | 21 |
| Captain Coverage | 1,697 | 23 | 1.4% | 21 |
| Saved Teams | 253 | 13 | 5.1% | 13 |
| Crew Forge | 265 | 13 | 4.9% | 13 |

**247 components never render at once.** A screen renders one host's chains, which
is 13 to 74 elements. On four of the five screens above that is under 6% of the
DOM and not worth measuring further.

### The shortlist is one host, not eighteen

**Auto Team Builder** is the only place where depth and render frequency coincide:
74 panel elements, 12.3% of its DOM, nested **54** deep. Depth alone is not a
defect — Captain Coverage reaches 21 and pays 1.4% — so the intersection is what
matters, and only one host sits in it.

Nothing here justifies changing the pattern. It justifies knowing which screen to
look at first if a rendering cost ever shows up, and that screen is Auto Team
Builder.

## When a new component needs one

- **It needs a panel** when it carries screen-specific CSS that must reach light
  DOM *outside* its own view — Ionic parts, slotted content, `ion-content`'s
  descendants — and should not be in `styles.scss` for every screen.
- **It does not** when component-scoped styles are enough. That is the default,
  and most of the ~53 rendering components have no panel.
- **Split panels by concern, not by depth.** Layout, card, media, responsive are
  the recurring names; the nesting order carries no meaning, so do not invent one.
- **A shared picker's panels belong to neither host.** `check-tag-picker-panel-scoping.mjs`
  exists because a rule naming one modal class silently skipped the other picker's
  eight hosts. A selector naming one host must have a twin naming the other.

## The inventory

Generated from source by `npm run styles:panel-inventory`, which also fails when
this table drifts, when a panel selector is rendered by nothing, or when a
declaration in one of these files lacks `ViewEncapsulation.None` and a `styleUrl`
— the two properties that make it a lazily loaded stylesheet rather than nesting.

<!-- style-panel-inventory:start -->
| Host | Panel components | Deepest chain | Templates that render it |
| --- | ---: | ---: | ---: |
| `auto-team-builder` | 55 | 14 | 1 |
| `saved-enemies` | 30 | 20 | 1 |
| `auto-team-builder-rumble` | 22 | 7 | 1 |
| `captain-coverage` | 20 | 19 | 1 |
| `characters` | 19 | 10 | 1 |
| `crew-forge` | 14 | 13 | 1 |
| `manual-team-builder` | 14 | 7 | 1 |
| `saved-teams` | 14 | 13 | 1 |
| `ability-requirement-picker` | 11 | 10 | 1 |
| `ability-tag-set-picker` | 9 | 8 | 2 |
| `character-detail` | 9 | 8 | 1 |
| `home` | 9 | 8 | 1 |
| `account` | 8 | 7 | 1 |
| `character-boxes` | 8 | 7 | 1 |
| `rumble-characters` | 7 | 6 | 1 |
| `ship-picker` | 7 | 6 | 1 |
| `character-facet-filter` | 3 | 2 | 1 |
| `character-tag-filter` | 3 | 2 | 1 |
| **Total** | **262** | | |
<!-- style-panel-inventory:end -->
