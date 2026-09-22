# Timestamps: which are payload and which are display

**869f13gbr.** Measured 2026-09-22: `toISOString` appears in **27** files under `src` and **35**
under `scripts`. `getTimezoneOffset` appears in **0**.

Every timestamp this project writes is a **UTC ISO string**. That is correct, and it is not the
problem. The problem is that one string does two very different jobs, and converting the wrong one
corrupts stored data - a corrupted saved-team timestamp survives into the Drive backup, where
nothing will ever notice it.

## The two roles

| | **Payload** | **Display** |
| --- | --- | --- |
| What it is | a value that is stored, compared, sorted, exported and round-tripped | the same instant, rendered for a player |
| Must be | UTC, byte-stable, `toISOString()` | the reader's own zone and language |
| Produced by | `new Date().toISOString()` at the write site | a formatter at the render site |
| May it be localised? | **Never.** Localising it changes stored data | that is its entire job |
| Where it lives | `savedTeams`, `savedEnemies`, Drive `updatedAt`, export `exportedAt`, `optc-manifest.json` `generatedAt`, evidence records | Character Boxes' *Updated*, the dataset version card, saved-team dates |

## The rule, stated so it can be broken loudly

**A payload timestamp is never passed through a locale formatter, and a display timestamp is never
written back to storage.**

The boundary itself is implemented and guarded: `src/app/core/i18n/app-locale-format.ts` holds the
formatting locale, and `scripts/check-locale-formatting.mjs` carries six rules over it. Rule F
exists because rules A-E all read a formatter being **invoked** and were therefore blind to a value
nothing ever formatted - `character-boxes.page.html` rendered a raw
`2026-09-22T07:30:00.000Z` to a player on a screen they open every session, while the lane
certified the file (869f13gb9).

## Where the producers are

Concentrated, not scattered:

| Producer | Role | Count |
| --- | --- | --- |
| `drive-backup.service.ts` `updatedAt` | payload | 30 of the 27 files' sites - by far the largest single consumer |
| `user-data-transfer.service.ts` `exportedAt` | payload | 1 |
| saved-team / saved-enemy `createdAt` / `updatedAt` | payload | the model declares them at 6 sites in `optc.models.ts` |
| `scripts/**` generation stamps | payload | 35 files |

**Nothing in `src` currently produces a display timestamp by hand**, which is the shape that makes
this worth writing down: the display side goes through one formatter, and every other site is
payload. A new `toISOString()` in a template or a presenter is therefore **the defect**, not the
norm.

## What is not done here

This is the **record**, which is what 869f13gbr asked for and what the wave-9 fixes parent needed
to exist first. Its own *Done when* also asks that "a display conversion applied to a payload field
fails a test". That guard is **not** built: `check-locale-formatting.mjs` rule F covers the
converse - an unformatted value reaching a player - and the defect class this would catch has not
occurred once, let alone twice. A guard earns its lane when a class **recurs**.

Recorded deliberately as not-done, rather than left to look finished.
