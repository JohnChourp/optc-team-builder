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
thumbnails. That is the intent; in practice step 1 of the list order is empty for
every character, so lists show the large portrait too - see
[the list rows show the large portraits](#the-list-rows-show-the-large-portraits).

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

`resolveCharacterImageUrl` in `scripts/generate-seo-pages.mjs`:
`exactLocal` → `thumbnailLocal` → `glo` → `jap` → `null`.

Note what it does **not** do: it ignores installedness entirely, because nothing is
installed on a build machine. So the generated page's `og:image` can name a pack
image that a given reader's device does not have — which is correct, since the
crawler fetches it from the site rather than from the device.

## The 44 exact images, and what reads each — 869f13c6h

`public/assets/exact-character-images/` holds **44** files, and none of them is
named anywhere in `src/` - which a 2026-09-12 brief read as "44 images nothing
references". Every one has a reader; [869f135u6](https://app.clickup.com/t/90121749478/869f135u6)
found them, and they are written down here:

| Ids | Files | Read by |
| --- | ---: | --- |
| 4202–4215 (`source: manual`) | 14 | the seed's `exactLocal`: list and detail images in the app, and each character page's `og:image`; 4208 and 4209 are also home-page heroes |
| 5601 (`source: upstream`) | 1 | the home-page hero that `generate-seo-pages.mjs` hardcodes - 5601 is not in the dataset |
| 5490, 5491, 5574–5600 (`source: upstream`) | 29 | nothing yet: staged for characters not released, declared in `stagedIds` |

Two checks keep it that way. `npm run data:overlay-register` rule **G** fails on an
image with no override entry and on an entry whose image is gone - the file name is
the character id, exactly as `materializeExactImageSources` writes it. And
`npm run seo:public-assets` declares every folder under `public/` with its reader,
so the next folder nothing reads fails a check instead of waiting to be found.

### The list rows show the large portraits

Step 2 of the list order above is `exactLocal`, and `thumbnailLocal` is `null` for
every shipped character, so a character with an exact image shows it in lists as
well. Four of those images are 1820×2048 PNGs of 5.0–5.3 MB - 4202, 4211, 4212 and
4213, 20.6 MB together, 93% of the folder. Recorded, not fixed here: the cure, a
downscaled list copy or `exactLocal` on detail rows only, changes what players see
and is follow-up work of its own.

## The packs themselves, as data — 869f138qw

`docs/offline-pack-contract.json` declares each pack as data: what it holds, what it
weighs **on disk**, where it sits in the chain above, and the `runtime-media` cache
policy that decides how much of it is ever available offline. A pack directory with
no manifest entry, or one whose file count no longer matches the manifest's claim,
fails `npm run packs:contract -- --check`.

**The byte totals are recorded, not enforced, and that is deliberate.**
`import-optc-data.mjs` writes `totalBytes: cached?.totalBytes` - what the pack weighed
when it was cached, not what is on disk now. Measured 2026-09-17 the two disagree by
**+919 B** for `thumbnails-glo` and **-563 B** for `thumbnails-jap`, against exact
agreement on every file count. Nothing had ever compared them, and the Settings card
added by [869f138pr](https://app.clickup.com/t/90121749478/869f138pr) shows the
manifest's claim. The drift is a fraction of a percent and harmless on screen; failing
a lane on it would be red today for something nobody has decided to change.

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
