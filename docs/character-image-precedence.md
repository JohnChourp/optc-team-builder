# Which image a character shows

**869f135u6.** There are **five** image precedence orders in this app and, before
this page, none of them was written down anywhere. They are not variations on one
rule: they disagree about the first entry, two of them exist in the same function,
and one runs at build time and cannot see the others.

This page is the whole set, in one place, so a "why is this card showing the wrong
picture" question has somewhere to start.

## 1 and 2 — the running app, list rows and detail rows

`OptcRepositoryService.resolveImageUrl`. One function, two orders, switched by
`preferExactLocal`:

| Step | List rows (`preferExactLocal: false`) | Detail rows (`preferExactLocal: true`) |
| ---: | --- | --- |
| 1 | `thumbnailLocal` | **`exactLocal`** |
| 2 | `exactLocal` | `thumbnailLocal` |
| 3 | `thumbnailGlobal`, **only if** the `thumbnailsGlo` pack is installed | same |
| 4 | `thumbnailJapan`, **only if** the `thumbnailsJapan` pack is installed | same |
| 5 | `FALLBACK_CHARACTER_IMAGE` | same |

List rows call it at `optc-repository.service.ts:1753`, detail rows at
`:1788-1789`. The difference is deliberate: a locally corrected **exact** portrait
is the large image, so it wins where the card is large and loses in a list of
thumbnails.

## 3 — the reader's own override, which outranks all of it

Applied **after** `resolveImageUrl` returns, in `character-overrides.utils.ts`:

- `applyOverrideToCharacterListItem` — `thumbnailDataUrl ?? detailDataUrl ?? character.imageUrl` (`:466-467`)
- `applyOverrideToCharacterDetailRecord` — `detailDataUrl ?? character.detailImageUrl` (`:484`)

So a picture the reader pasted in beats every dataset answer, on both surfaces.
This is the order most likely to be forgotten when debugging, because it is not in
the function whose name says "resolve image url".

## 4 — ships, which never reach a placeholder

`resolveShipThumbUrl` (`optc-repository.service.ts:1984-2007`) has its own rules
and returns **`null`**, never the placeholder: an absolute or `assets/`-prefixed
thumb is used as-is, otherwise the ship-thumbnail pack must be installed, otherwise
there is no image at all.

## 5 — build time, for `og:image`

`resolveCharacterImageUrl` in `scripts/generate-seo-pages.mjs:1029-1038`:
`exactLocal` → `thumbnailLocal` → `glo` → `jap` → `null`.

Note what it does **not** do: it ignores installedness entirely, because nothing is
installed on a build machine. So the generated page's `og:image` can name a pack
image that a given reader's device does not have — which is correct, since the
crawler fetches it from the site rather than from the device.

## What `thumbnailGlobal: false` means

**Not** "no thumbnail is installed." It means **no path was found in the upstream
pack listing** when the dataset was built (`buildCharacterAssetsMap`,
`import-optc-data.mjs:454` → `:1484`). Installedness is the separate, later
`.pack-ready` → `manifest.installed` fact, read on the device at runtime.

## What happens when an image fails to load: nothing

There is **no runtime image-error fallback anywhere**. `grep -rn "(error)=" src/app`
returns nothing across **63** `<img>` sites, **57** of which bind `[src]`.

So the placeholder is the fallback for *"no path was recorded"*, never for *"the
path did not load"*. A manifest claiming a pack is installed against a device where
the file is gone renders a **broken image**, not the placeholder. That is reachable
in normal use, though **less so since 2026-09-17**: the `runtime-media` dataGroup
capped at `maxSize: 750` against 11,023 shipped PNGs, which made eviction routine.
[869f138pr](https://app.clickup.com/t/90121749478/869f138pr) raised it to **12,000**
with `maxAge` from 30 days to a year, on the owner's decision, so the cap no longer
evicts anything a reader has opened. Eviction under the device's own storage
pressure still happens, and the broken image is still what it renders.

Recorded rather than fixed — adding `(error)` handling to 57 bindings is a real
change with its own design question (per-image fallback, or a shared directive),
and this page exists to make the gap visible first.

## One divergence, recorded rather than pinned

`canResolveWithoutPlaceholder` at build time (`scripts/lib/optc-dataset.mjs:629-645`)
checks `exactLocal` / `glo` / `jap`. The runtime order above also honours
`thumbnailLocal`, at precedence #2.

The divergence is **unreachable twice over**: `thumbnailLocal` is `null` for all
4,618 shipped characters, and `manual-characters.json` has been empty since
2026-04-24. A test asserting today's behaviour would prove nothing, so this
sentence is the proportionate response — not a guard.
