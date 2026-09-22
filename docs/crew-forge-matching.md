# How Crew Forge decides that a screenshot slot is a character

**869f13gc4.** Read from `crew-forge-image-import.service.ts` (576 lines) and
`crew-forge-fingerprint.utils.ts` on 2026-09-22. Nothing here is chosen; it is all read from the
code that runs.

The scale the confidence is measured on is already documented, in
`src/app/core/data/crew-forge-confidence.data.ts`. **This page is the other half: the method that
produces it.** A number means nothing without the method, and a sibling project -
`optc-box-exporter` - solves the same problem separately, which cannot be compared while neither
is described.

## The pipeline, stage by stage

| # | Stage | What happens | Knob |
| --: | --- | --- | --- |
| 1 | **Slot crop** | each slot rectangle is scaled from the profile's reference size to the actual screenshot's, then cropped | the profile's slot definitions |
| 2 | **Blur** | `context.filter = blur(Npx)`, set **before** the draw | `blurRadius` (default `0`) |
| 3 | **Downscale** | the crop is drawn into a `fingerprintSize × fingerprintSize` canvas | `fingerprintSize` (default `16` → **256 samples**) |
| 4 | **Luminance** | `grayscale` ? Rec.601 `0.299R + 0.587G + 0.114B` : the plain mean of R,G,B - both over 255 | `grayscale` (default `true`) |
| 5 | **Alpha** | luminance is multiplied by `alpha / 255`, so transparent pixels read as black | - |
| 6 | **Contrast / brightness** | `(luminance·alpha − 0.5) · contrast + 0.5 + brightness`, i.e. contrast pivots on mid-grey | `contrast` (`1`), `brightness` (`0`) |
| 7 | **Clamp** | to `[0, 1]` | - |
| 8 | **Invert** | `1 − value` | `invert` (default `false`) |

The result is a plain `number[]` of `fingerprintSize²` values in `[0, 1]`. That array is the
fingerprint, and it is **all** the matcher ever compares. Everything else about the image is gone.

> **The blur is applied before the draw, so it is in DESTINATION pixels.** On the default 16×16
> canvas, `blurRadius: 1` is a blur of one sixteenth of the whole image - enormous. It is not a
> gentle denoise, and that is why the default is `0`.

## Comparison

```
confidence = max(0, 1 − sqrt(mean((a[i] − b[i])²)))
```

over the first `min(a.length, b.length)` samples - root-mean-square error, turned into a
similarity. Both inputs are bounded in `[0, 1]`, so **the range is [0, 1] and that is misleading**:
two real portraits almost never reach either end. The measured anchors are in
`crew-forge-confidence.data.ts`; the same crop is `1.0000`, and a crop shifted 0.10 per sample is
already `0.9035`.

That is why the default `matchThreshold` is **0.92** and not something that looks like a
percentage-of-correct.

## The two thresholds

| Knob | Default | What it decides |
| --- | --: | --- |
| `emptyVarianceThreshold` | `0.005` | below this **variance**, the slot is treated as **empty** and never matched at all |
| `matchThreshold` | `0.92` | the best candidate is accepted only at or above this; below it the slot resolves to `null` |

`emptyVarianceThreshold` runs **first**, and it is a variance test, not a similarity test - a flat
slot is empty regardless of what it resembles.

## Candidate order

1. the profile's own **exemplars** - corrections a player has made;
2. the **catalog** fingerprints, cached per `(catalog ids, serialized preprocess)`.

Both lists are merged and sorted by confidence descending; **an exemplar wins a tie**, then the
lower `characterId` wins; then duplicates are dropped keeping the first.

So a player's own correction outranks the catalog at equal confidence. That is the point of a
profile.

## Why a profile exists at all, rather than one fixed pipeline

Because the input is a **screenshot of someone else's phone**: different resolution, different
scaling, different compression, different in-game frame. The slot rectangles differ per device, and
so does what preprocessing makes the crops comparable. `resolveProfile` picks a profile by the
screenshot's width and height.

The cache key includes the serialized preprocess config, so **changing any knob invalidates every
cached catalog fingerprint** - a profile edit is not free.

## What is not done here

869f13gc4's *Done when* also asks for "a small fixture corpus pinning known-good and known-bad
cases", so that a pipeline change moves fixture numbers rather than intuitions.
`crew-forge-confidence.data.ts` already pins **measured anchors** for the comparison function, and
`crew-forge-image-import.service.spec.ts` drives the threshold clamp out of range with six boundary
tests (869f13gbg). What does not exist is a corpus of **real screenshots**. Recorded as not done:
it needs sample images the repository does not have and must not invent.
