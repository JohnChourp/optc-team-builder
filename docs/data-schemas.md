# Data Schemas

This document records the canonical local data shapes used by OPTC Team Builder. The app remains offline-first: generated dataset files live under `public/assets/data`, while user-created backups use explicit transfer payloads with their own schema versions.

## Generated Dataset

The importer writes these files:

- `optc-manifest.json`: dataset metadata, counts, schema version, source version, the upstream repository and commit the data was read at (`sourceRepository`, `sourceCommit`), and offline pack summaries.
- `optc-seed.sql`: SQLite seed containing `characters`, `character_details`, `character_evolutions`, `character_drops`, `ships`, and `meta`. The source of truth for the dataset; the app only executes it as a fallback. **Every table, column, type and row count is generated from it into [dataset-schema.json](dataset-schema.json)** by `npm run dataset:schema` (869f138qt) - this page documents the application shapes those rows become, that file documents the rows.
- `optc-seed.sqlite.gz` (build output, not committed): the same rows as a gzipped SQLite database, built from `optc-seed.sql` by `npm run dataset:binary` before every build. This is what the app downloads and opens - see [dataset-delivery.md](dataset-delivery.md).
- `optc-auto-builder-abilities.json`: ability catalog consumed by Auto Team Builder filters and saved enemy requirements. Written minified, and an index over `character_details` rather than a second set of facts - see [The catalogue is an index over the database](#the-catalogue-is-an-index-over-the-database--869f138qm).
- `optc-unresolved-images.json`: characters that still need image coverage for the installed offline packs. Read by scripts only; not shipped.
- `optc-preview.json`: the first 24 character records and 12 ships, a sample the scripts read. The app does not read it and it is not shipped (869f138py).

`generatedAt` in these files is the time the data last changed, not the time of the last import: an import that would change nothing but that timestamp leaves all five files byte-identical, so a release with no new data costs an installed client nothing (869f138qb, see [dataset-delivery.md](dataset-delivery.md)).

`sourceRepository` and `sourceCommit` say which upstream built the data (869f63gtc). `sourceVersion` cannot: both candidate repositories report `dbVersion 36`, and their `version.js` has not changed since 2016-05-23. The importer resolves the source's `master` to a commit when it starts and reads every file at that one commit, so the files agree with each other and with the commit recorded; `--ref=<branch, tag or commit>` reads another point instead, which is how a dataset is rebuilt from the commit its manifest names. The manual-character overlay rebuilds the manifest and carries both fields through. Like `generatedAt`, `sourceCommit` is the commit the data **last changed** at: upstream commits things the importer never reads, and the seed embeds the manifest, so an import whose only differences are the timestamp and the commit keeps the previous files byte-for-byte - the new commit's data is identical to what they record. A different `sourceRepository` always counts as a change. The importer refuses `--source=optc-db`, the original repository whose data stopped changing on 2024-08-14, unless `--allow-stale-source` says the two-year-old data is really intended; the manifest then names the stale repository.

`optc-manifest.json` is versioned with `schemaVersion: 2` (it shipped as `1`; the field is read from the file, and this sentence is the one place that has to be moved by hand). The repository service normalizes older manifests without this field to `1`, so existing local builds keep loading. Breaking generated dataset changes must increment this value and update `DatasetManifest`.

The manifest counts must match the generated records:

- `characterCount`: number of normalized character records.
- `detailCount`: characters with special or captain text.
- `shipCount`: number of normalized ships.
- `rumbleCount`: characters with usable Rumble data.

The importer runs centralized integrity checks before writing generated files. Critical errors fail the import before partial data is published.

## Character Records

Character rows are normalized from upstream unit/detail data plus manual overlays:

- stable ids are positive integers
- `name`, `type`, `classes`, stars/cost/combo, stats, assets, and search text are stored on the list record
- full ability and advanced metadata are stored in `detail_json`
- `families` (the `families_json` column) is upstream's `common/data/families.js` list of the character(s) on each card, and decides which cards are the same character - the duplicate-character rule in `src/app/core/grammar/same-character-keys.ts` (869f63grj). `[]` means upstream names no family for the unit
- `partyConflictKeys` are keys derived from the card name. They decide "same character" only for a unit with no `families`; super-criteria and name matching in the Auto Team Builder, and the SEO pages' related characters, read them
- `characterTags` drive tag filters and captain coverage requirements
- `builderAbilities` are canonical ability entries used by Auto Team Builder and Captain Coverage filters
- a **Support-only** character (869f6td4p) has `supportData` and no Captain Ability (no
  `captainAbility` text and no `captainAbilityVariants` text) and no `specialText`. The official
  Global letter of 2026-04-16 says such characters "do not have any Specials, Captain Abilities,
  Co-Op Captain Abilities, or Pirate Rumble Combat Stats" and can only be added to a Support slot.
  The rule is `src/app/core/grammar/support-only-character.ts`, read at runtime from the record the
  app already holds - the importer is unchanged and no column says it. No crew slot takes one -
  Captain, Friend Captain and subs alike - on Manual Team Builder, Captain Coverage and the Auto
  Team Builder's manual picks, and each says why; they stay in every list and the Character screen
  says what they are for (marked, never hidden). A saved team that already holds one is kept exactly
  as stored: Manual Team Builder names the seat in its validation panel, Captain Coverage marks the
  seat, and the Auto Team Builder marks the pick and never requires it, so the build leaves it out.
  The census is `supportOnlyCharacters` in `src/app/core/data/dataset-measurements.json`, counted
  with the same function - 6 when this was written (2026-09-25). The Auto Team Builder never picked
  one by itself (its candidate pool keeps only units with Captain, special or sailor text), and the
  Rumble pool leaves them out too, since their Rumble data carries no ability and no special.

For normal upstream records, `detail.characterId` must match the row `id`.
Reserved manual overlay records (`id >= 900000`) may instead store an existing
canonical character id in `detail.characterId` when they represent a linked
variant that must remain selectable by its internal id while sharing canonical
search and conflict behavior with an upstream record.

Captain ability data is stored as:

- `captainAbility`: default display text
- `captainAbilityVariants`: keyed variant list such as base, level, dual-character, or combined captain branches
- `captainAbilityCoverage.entries`: generated coverage summaries per variant

Each coverage entry contains:

- `key`: variant identifier matching the source `captainAbilityVariants` entry
- `label`: human-readable variant label
- `tiers`: ordered list of `(conditions → effects)` tier bundles parsed from the captain ability

Each tier in `tiers` contains:

- `tier`: 1-indexed position
- `kind`: `baseline`, `unconditional-top`, or `conditional`
- `scope`: one of `crew-wide`, `captain-only`, `subset`, `none`
- `characterConditions`: target subset (types, classes, character tags, cost range, dominant type, universal, fallbackOther, selfOnly)
- `teamConditions`: crew composition / count / exclusion / requires-captain conditions
- `fieldConditions`: territory and other field-state gates
- `triggerConditions`: in-fight or branch-state triggers (action special, HP threshold, captain-branch-state, etc.)
- `clauses`: raw clause text fragments for display
- `atkBoost` / `hpBoost`: best derived multipliers for that tier

## Ability Catalog

Ability catalog entries use canonical keys from the definition files in `scripts/data/*ability-definitions.json` plus legacy keys where needed. Deduplication identity is:

```text
key|minTurns|slotTokens|source|coverageMode
```

Canonical keys are deterministic, labels are display-only, and collisions are resolved by keeping one entry per identity. Manual corrections in `scripts/data/builder-ability-corrections.json` may remove or replace derived abilities for specific character ids.

### Dual-named effects

Where an effect is worded differently depending on who applies it, or where the community name differs from the wording in ability text, the definition label carries both as `Primary (Alias)`: the wording our own characters' ability text literally uses first, the other actor's or community name in parentheses. The pickers search both the key and the label, so one remembered name is enough to find the effect.

Existing examples are `Boost Type Effects (Color Affinity)`, `Tap-Timing Requirement (PERFECT)` and `Protect from Defeat (Resilience)` — the last being the crew-side survival buff, which is deliberately *not* labelled bare "Resilience" because that word names the opposite actor's buff in the enemy mechanic picker and in `remove_resilience` ("Enemy Resilience").

#### What `isIncomplete` means, and what the app does with one — 869f138r7

**Status:** measured 2026-09-17 · [869f138r7](https://app.clickup.com/t/90121749478/869f138r7)

The dataset has carried a notion of its own quality in three shapes for a long time -
`isIncomplete` on a character, `optc-unresolved-images.json`, and the importer's
`thumbnailGlobal` / `thumbnailJapan` booleans - with no shared definition. This is the
one for the whole record.

**Zero of 4,618 characters in the shipped dataset carry the flag.** It can only become
true three ways, and all three are the reader's own data:

| How it becomes true | Where |
| --- | --- |
| A manual character declares it | `scripts/data/manual-characters.json` |
| A manual character is missing min/max stats, and it is inferred | `hasIncompleteManualStats` in `manual-character-overlay.mjs` |
| The reader ticks it themselves | The **Character edit** screen |

**An incomplete character is fully eligible for a team, deliberately.** Nothing in the
builder filters on the flag, and it should not: since the flag is almost always on
something the reader added or edited on purpose, silently refusing to use it would be
the app second-guessing its owner.

**What was missing is that nothing said so.** The Characters and Rumble Characters
screens badge an incomplete card, and the debug report has always counted
`incompleteTeamCharacterIds` for whoever reads a bug report - but a player whose team
came back containing one was told nothing. **Auto Team Builder now names them above the
Final team report**, says the team was built with them anyway, and points at the
screen where they can be corrected. EN + EL.

### How the seed is built — 869f138r4

`docs/import-pipeline.json` lists the importer's stages and, for every hand-maintained file under
`scripts/data/`, which script reads it. Generated, so it moves with the importer rather than
lagging it.

**The format question is closed and recorded.** The seed is a SQL text dump because it is diffable
and about twenty scripts read it as text; what *ships* is a gzipped SQLite database built from it at
build time - [869f138q7](https://app.clickup.com/t/90121749478/869f138q7), reasoning in
[dataset-delivery.md](dataset-delivery.md). The zero-byte `optc.db` that used to sit beside the seed,
which is what made the question look unanswered, was removed by
[869f138qe](https://app.clickup.com/t/90121749478/869f138qe).

The census found one file read by **no code at all**: `manual-character-template.json`, which a
maintainer copies by hand when adding an entry to `manual-characters.json`. Legitimate,
undocumented, and indistinguishable from dead until somebody looked - so a readerless file now needs
a recorded reason or the lane fails.

## The catalogue is an index over the database — 869f138qm

`optc-auto-builder-abilities.json` and `optc-seed.sql` are written by the same import, from the
same upstream, on the same release, and the first is prefetched beside the second. So the question
[869f138qm](https://app.clickup.com/t/90121749478/869f138qm) asked is worth answering here rather
than re-deriving it every time somebody notices the file size: **what does the JSON hold that the
database does not?**

The importer parses each character's ability text and stores the result on that character, in
`character_details.detail_json.builderAbilities`. The catalogue's per-key character lists are the
inverted index of exactly those rows — the same facts, read the other way round. Measured
2026-09-17: all **241** keys some character actually has re-derive from the database with identical
id sets, and rebuilding the whole index from the database took **76 ms** in Node.

Three things are genuinely only in the file, and they are why it exists:

| Only in the catalogue | Why the database cannot hold it |
| --- | --- |
| **22 keys no character has** | An index has no entry for a key nothing matched. The app still needs them, so the picker can offer an effect and say nothing matches it. |
| **`label`, `category`, `groupLabel`, `groupOrder`, `effectOrder`** | Presentation, defined in `scripts/data/*ability-definitions.json` — a property of the effect, not of any character. |
| **`sampleCharacterIds` / `sampleTexts`** | The first five matches in import order and the text each matched, which is a choice the importer makes rather than something the rows state. |

Everything else — `matchCount`, `matchingCharacterIds`, `turnMatchingCharacterIds`,
`completeRemovalCharacterIds` and the three `captainAbility*` lists — is derived, and therefore can
drift: two files regenerated separately, one of them again by the manual character overlay, and
until 869f138qm nothing compared them. `npm run abilities:catalogue-check` now re-derives the lists
from the seed and fails on any difference. It deliberately does not call the importer's own
accumulator; a guard that runs the code under test proves the file was written, not that it is
right.

The scope lists (`effectTargetScopeMatchingCharacterIds`, `captainAbilityEffectMatches`) are checked
one way only. Both are filtered by the importer's `CAPTAIN_STRUCTURED_EFFECT_KEYS`, which is a
policy rather than something the data states, so the guard checks that every character they name
really carries that key with that scope — the direction a stale file fails — and leaves the
completeness of the filter with the importer.

**The file is written minified**, unlike the four beside it, because it is the only one that is
prefetched: pretty printing was 880,193 of its 1,674,521 bytes. `npm run dataset:digest` is how a
data change is reviewed, not `git diff` on an index.

## Queries over 13,860 rows: no indexes, and none justified — 869f138q1

**Status:** re-measured 2026-09-20 on `c27bb849` (**v0.5.3**) · first measured 2026-09-17 on `f2e98a09` ·
[869f138q1](https://app.clickup.com/t/90121749478/869f138q1)

The seed inserts 13,860 rows and every catalogue query, facet filter and picker search runs against
them through sql.js. **The row count moves with every release that imports characters** — it read
9,303 when this was first measured — so treat the heading as the order of magnitude, not a constant.
Today: 4,622 characters, 4,622 detail rows, 2,928 evolutions, 1,621 drops, 66 ships and 1 meta row. Three questions were worth answering with numbers rather than instinct.

**Is anything indexed?** No. The schema declares **zero** `CREATE INDEX` statements. The only index
that exists is the one SQLite gives for free: `characters.id` and `character_details.character_id`
are `INTEGER PRIMARY KEY`, so they *are* the rowid and a lookup by id is already a tree descent.
Everything else — `search_text`, `type`, the class columns — is a scan.

**Does that cost anything?** Measured by the `dataset-perf` lane over all 4,622 characters:

| | 2026-09-20, v0.5.3 | 2026-09-17, first run |
| --- | ---: | ---: |
| `searchAverageMs` | **0.40** | 0.35 |
| `filterAverageMs` | **0.63** | 0.66 |
| `combinedAverageMs` | **0.84** | 0.89 |

A scan of 4,622 rows inside WebAssembly is under a millisecond, so an index would buy a fraction of
that and cost real bytes in a database [869f138q7](https://app.clickup.com/t/90121749478/869f138q7)
had just spent a wave shrinking. **The answer is no, and the number is written here so it is not
asked a fourth time.** Re-check with `npm run perf:dataset` if the row count ever changes by an
order of magnitude.

**869f63gkm, 2026-09-25: the search now pays for a JavaScript call per row it reaches.** Search
compares words, not punctuation, so the loader registers `optc_search_text`
(`src/app/core/grammar/character-search-text.ts`) with SQLite on both load paths and the repository
reads `optc_search_text(c.search_text) LIKE ...`. `npm run perf:dataset` times that clause now,
loading the same grammar file, because timing the bare `LIKE` the app no longer runs would stay
green over a search that had become slow. Measured on an M4 Pro, 20 repeats: `searchAverageMs`
**0.29 → 1.36**, `combinedAverageMs` **0.90 → 0.78**. The second went DOWN because the repository
puts the search clause last and SQLite evaluates the terms in the order written: first, the
function ran on all 4,622 rows of a type-and-class search (5.4 ms); last, on the 310 the facets let
through. A search with no other filter reaches most of the table and costs about 4.5 ms here -
still a fraction of a frame, and no reason for an index.

**Where do they run?** All of them on the main thread, in `optc-repository.service.ts`. The app's
three Web Workers exist for the long CPU passes — Auto Team Builder's search, its Rumble variant,
and Captain Coverage's filter pass — and not for SQL. The numbers above are why that split is
correct rather than accidental: moving a 0.89 ms query to a worker would add more postMessage
latency than it removes.

**What does a picker feel like?** Measured the same day on a 390x844 mobile profile:

| Flow | Measured |
| --- | ---: |
| Manual picker opens | **146 ms** |
| Special ability picker opens | **344 ms** |
| Special filter applies | **436 ms** |
| Character image picker opens | **518 ms** |
| Character image picker loads more | **290 ms** |

All inside budget, and none of them near the threshold where a search box stops feeling like one.

**What the measurement did turn up** is not about rows at all: `savedTeams.firstToggleMs` measured
**1,041 ms** against a **600 ms** warning threshold in `perf-mobile-pickers.mjs`, while
`perf-budget-report.mjs` enforces **2,100 ms** for the same metric. That is the two-copies-of-one-
budget shape [869f135u7](https://app.clickup.com/t/90121749478/869f135u7) audited; the warning
threshold has been re-set from the measurement so it stops reporting a regression that is not one.
The enforced budget is still `provisional` and twice what the app measures, which is a decision for
whoever re-bases that set rather than something to change quietly here.

## Enemy Definitions

Saved enemy definitions use the `SavedEnemy` model and the enemy mechanic catalog in `enemy-mechanic-draft.utils.ts`.

Required fields include:

- enemy identity and notes
- selected type/class/tag/name filters
- required abilities and required character groups
- optional battle requirements
- enemy mechanics with `mechanicKey`, category, turns, trigger/response/condition tags, and optional `derivedAbilityKey`

Optional, and written only when they hold something
([869f63gma](https://app.clickup.com/t/90121749478/869f63gma)):

- `avoidedTypes` / `avoidedClasses` - what the enemy punishes. `avoidMode` sits beside them, `hard`
  (the default, and what an absent mode means) or `soft`: hard keeps avoided units out of every seat
  the Auto Team Builder fills and is relaxed to a ranking only when no team can be built, soft only
  ranks them lower. The reader's own picks are never removed.
- `preferredTypes` / `preferredClasses` - what the enemy is weak to. Ranking only.

A type is one of the five and upper-cased; a class keeps the case it was written in. An enemy
without a rule carries none of the five keys, so a Drive backup written before they existed still
matches it. `auto-team-builder-avoid-prefer.utils.ts` is the one reader and writer.

Import/export supports the saved enemies transfer payload:

```json
{
  "schemaVersion": 1,
  "source": "saved-enemies",
  "exportedAt": "2026-05-16T00:00:00.000Z",
  "enemies": []
}
```

An import keeps only the required character groups and battle requirements a file carries. The ones
it leaves out are derived exactly as they are when a stored enemy loads: the manual abilities first,
then the ones the enemy mechanics imply, at most six groups
([869f6td1y](https://app.clickup.com/t/90121749478/869f6td1y)).

A single-enemy file (`"source": "optc-enemy-skill"`, `"exportType": "enemy"`) carries no id, so the
import builds one from the name: `enemy-skill-` plus a slug of it - NFKC-normalised, lower-cased,
quotes dropped, and every run of characters other than letters, combining marks and digits of any
script turned into one `-`, trimmed at both ends. An ASCII name gets exactly the id it always did.
A name with no letter or digit at all gets `enemy-skill-untitled-` plus a hash of the whole enemy
record, so importing the same file again updates that enemy instead of adding a second one
([869f6td37](https://app.clickup.com/t/90121749478/869f6td37)).

## Saved Teams

The saved-team format lifecycle is governed by
[`docs/saved-team-schema-lifecycle.md`](saved-team-schema-lifecycle.md). Keep
that contract, the exported format markers, fixtures, and tests aligned whenever
saved-team payload support changes.

Saved teams are on-device user data with this transfer payload:

```json
{
  "schemaVersion": 1,
  "source": "saved-teams",
  "exportedAt": "2026-05-16T00:00:00.000Z",
  "teams": []
}
```

Team records contain id, name, six character slots, optional ship id, notes, and timestamps. Saved team schema remains v1 in this data epic.

The v1 compatibility contract is strict at the payload boundary and forgiving inside stable team records:

- Supported payloads must use `schemaVersion: 1` with source `saved-teams`, or `schemaVersion: 1` with source `saved-team-share` for single-team share payloads.
- Repairable v1 team records must have a stable string `id`. Missing names become the app's untitled crew label, invalid notes become empty text, invalid ship ids are cleared, slots are padded or truncated to six positions, invalid slot values are cleared, and invalid timestamps fall back to the payload timestamp or the current import time.
- Unrecoverable team records without a stable id, non-object records, malformed JSON, malformed share codes, unsupported sources, and unsupported schema versions are rejected instead of imported silently.
- Corrupted local `savedTeams` storage is repaired in place on load. Valid or repairable stable-id teams are kept, unrecoverable records are removed, invalid/non-array storage resets to an empty saved-team list, and the cleaned state is written back locally.

Import and share failures are surfaced through safe diagnostic codes plus short recovery guidance on Saved Teams import, Settings saved-team import, Manual Team Builder share-route import, and Auto Team Builder compare import:

| Code | Meaning | Recovery class |
| --- | --- | --- |
| `SAVED_TEAMS_EMPTY_INPUT` | The import/share field was empty. | Choose a JSON export or paste the full share link/code. |
| `SAVED_TEAMS_INVALID_JSON` | A JSON-looking payload could not be parsed. | Re-export the file and avoid editing the JSON by hand. |
| `SAVED_TEAMS_INVALID_SHARE_CODE` | The share link/code was malformed or could not be decoded. | Copy the full share link/code again. |
| `SAVED_TEAMS_INVALID_SHARE_JSON` | The share code decoded, but its payload was not valid JSON. | Generate a new share link from the source team. |
| `SAVED_TEAMS_UNSUPPORTED_SCHEMA` | The schema version or source is not supported. | Import a current saved-team export or supported share link. |
| `SAVED_TEAMS_INVALID_PAYLOAD` | The saved-team transfer payload shape is incomplete. | Re-export from Saved Teams or Settings. |
| `SAVED_TEAMS_INVALID_SHARE_PAYLOAD` | The decoded share payload is missing required share fields. | Generate a new share link from Manual Team Builder or Saved Teams. |
| `SAVED_TEAMS_NO_IMPORTABLE_TEAM` | The payload parsed, but no stable team could be imported. | Re-share or re-export a saved team with a stable id. |
| `BROWSER_STORAGE_QUOTA_EXCEEDED` | The payload parsed, but browser storage rejected the saved-team or compare-session write because quota/storage limits were reached. | Export or back up important local data, remove unused saved teams or site storage, then retry the import or compare action. |
| `BROWSER_STORAGE_UNAVAILABLE` | The payload parsed, but the current browser profile/session cannot read or write the local storage surface. | Enable site storage for this profile or retry in a normal browser window. |

Diagnostics must stay redacted. Error objects and user-facing diagnostic lines may include only the translation key, diagnostic code, and recovery class. They must not include raw JSON, share codes, URLs, team names, notes, decoded payload text, or slot contents.

Browser-storage diagnostics are persistence diagnostics, not schema versions.
Saved-team and share payloads remain schema v1 when these failures occur.
Settings standalone saved-team imports, Settings all-data saved-team sections,
Saved Teams imports, and Auto Team Builder compare-session restore/write paths
must surface the same redacted diagnostic class without exposing the payload.

Browser share and clipboard capability failures are also outside the payload
schema. Saved Teams classifies unavailable clipboard APIs, denied/security
errors, insecure contexts, and unknown write failures without exposing raw
exception text. Share links and raw share codes provide a readonly manual-copy
fallback when both native share and clipboard writes are blocked. JSON copy
failures direct users to the Export/download action instead of rendering large
payloads for manual selection.

Single-team share links use a separate self-contained payload encoded into the `teamShare` query parameter on `/tabs/manual-team-builder`:

```json
{
  "schemaVersion": 1,
  "source": "saved-team-share",
  "exportedAt": "2026-05-16T00:00:00.000Z",
  "team": {
    "id": "team-1",
    "name": "Crew",
    "slots": [],
    "shipId": null,
    "notes": "",
    "createdAt": "2026-05-16T00:00:00.000Z",
    "updatedAt": "2026-05-16T00:00:00.000Z"
  }
}
```

Opening a share link preloads Manual Team Builder as an unsaved draft. Saving from that screen creates a normal local saved team.

For the user-facing flow across guided builds, compare mode, saved-team JSON, share links, and share codes, see `/guides/guided-build-compare-team-sharing/`.

## Auto Team Builder debug report

"Copy debug report" on Auto Team Builder copies the last build as text for a bug report. The
button sits under a result, next to the preset download, and in the card of a build that found no
team. The text is a few plain summary lines followed by one fenced JSON block, built by
`src/app/pages/auto-team-builder/auto-team-builder-debug-report.utils.ts`. The block prints one line
per section and one line per slot: fully indented, a real team ran past 16 KB. It is shown
indented here for reading:

```json
{
  "schema": "optc-atb-debug-report",
  "schemaVersion": 1,
  "createdAt": "2026-09-11T19:00:00.000Z",
  "app": { "version": "0.4.15", "platform": "web", "language": "en" },
  "dataset": {
    "generatedAt": "2026-09-11T18:00:00.000Z",
    "sourceVersion": "36",
    "characterCount": 4618,
    "detailCount": 4530,
    "abilityCatalogGeneratedAt": "2026-09-11T18:00:01.000Z"
  },
  "dataQuality": {
    "abilityCatalogLoaded": true,
    "localOverrideCount": 0,
    "overriddenTeamCharacterIds": [],
    "incompleteTeamCharacterIds": [],
    "executionPath": "pool"
  },
  "context": {
    "candidateSource": "all",
    "candidatePoolSize": null,
    "boxCharacterCount": null,
    "excludeBoxCharacterCount": null,
    "favoriteCharacterCount": 12,
    "guidedAutoBuild": false,
    "workerCount": 4
  },
  "request": { "types": ["DEX"], "classes": ["Fighter"], "manualSlots": [], "flags": {} },
  "outcome": {
    "status": "exact",
    "candidateCount": 412,
    "teamKey": "101,102|103,104,105,106",
    "ship": null,
    "slots": []
  },
  "rules": [{ "key": "types", "state": "passed" }],
  "relaxation": { "usedFallback": false },
  "coverage": { "missingAbilityKeys": [] },
  "performance": {
    "wallMs": 3210,
    "searchMs": 2800,
    "attemptsCompleted": 4,
    "totalAttempts": 9,
    "activeWorkers": 4
  }
}
```

The example shortens `request`, `outcome.slots`, `relaxation` and `coverage`; the util's
`AutoTeamDebugReport` type is the full shape.

- **Codes and ids, never translated text.** Slot reasons, rejected alternatives and rule states
  carry the engine's own codes and parameters, so a report reads the same in either language.
  The summary lines are English on purpose: they are read by whoever fixes the problem.
- **`outcome.status`** is `exact` (no rule relaxed, though the summary still names any ability
  requirement or battle the team leaves uncovered), `fallback`, `noTeam`, `searchTooLarge`,
  `buildFailed`, `guidedRelaxedOnly` or `guidedSlotRejected`. The two guided codes still carry the
  team the build found, which the page did not use. A build without a team has no `rules`,
  `relaxation`, `coverage` or slots. `performance` is present when the build reported a completed
  stage.
- **`request`** is the result's `requestedInput`: what was asked, not what a fallback settled for.
  With no team it is what the page sent when Build was pressed, before the service normalizes it.
  `context` is also read when Build is pressed, so starring a favourite afterwards changes nothing.
- **`outcome.fallbackReasons`** appears once, when the engine relaxed something: the engine gives
  every slot the same fallback reasons, derived from `relaxation`.
- **`outcome.infeasibility`** appears when the search found no team AND the pool it searched had
  nothing behind one of the requirements (issue #523). One entry per requirement group, each with
  the ability keys and turn counts asked for, how many characters in the pool satisfied the group,
  the pool's size, and - for `requirementOutsideLeaderScope` - the pinned leader whose captain
  ability boosts none of them. `battleIndex` and never the battle's title, which is player text the
  redaction rule below keeps out. An empty or absent list means every requirement was individually
  satisfiable and the search failed on their combination, which this does not diagnose.
- **`dataQuality.executionPath`** says where the build ran: `pool`, `worker`, `mainThread`, or
  `mainThreadAfterWorkerFailure`, which is otherwise silent. It is present when the service
  reported a path.
- **Close alternatives** in `outcome.slots[].rejected` carry any hard-constraint codes first, then
  the one ranking dimension that decided. A dimension the ranking never compared for this request is
  never listed. `rankingTieBreak` means the newest id decided and nothing else;
  `searchRejectedTeam` means the alternative ranked ahead and the search still could not build the
  team around it, which is the only thing known about it.
- **`requiredAbilityMatch`** on a slot counts only what that seat can cover: a requirement scoped to
  the subs is never credited to a leader, and a leader-scoped one is never credited to a sub.
- **`teamKey`** is the leaders' ids then the subs' ids, each sorted, so the same team reads the
  same whatever its slot order.
- **Redaction.** No team name, notes, box names or ids, battle titles, file names, share codes or
  user agent. Character ids and names are game data and are the point of the report. Two kinds of
  player text stay on purpose, because they are the problem being reported: character-name filters
  as typed, and a slot's name as shown, including a name changed by a local edit.
- **Nothing is sent.** The report goes to the clipboard only. When the clipboard refuses it, the
  same text is shown read-only to copy by hand. The "Report a problem on GitHub" link opens
  `https://github.com/JohnChourp/optc-team-builder/issues/new` and never carries the report.
- **Versioning.** Fields may be added within schema version 1; removing or reinterpreting one bumps
  `schemaVersion`.

Copying goes through `src/app/shared/clipboard/clipboard-copy.utils.ts`, the same helper and failure
classification Saved Teams uses for share links, share codes and JSON copies.

## Migration Policy

## Character facet filter shapes

Character **type** and **class** filters use a different, deliberately simpler
shape than the tag-set filters below: a flat list of values plus one match mode,
not a selection of sets.

```jsonc
{
  "values": ["STR", "QCK"],   // author-cased facet values, order-insensitive
  "matchMode": "all"          // "all" = holds every value; "any" = holds one
}
```

- `CharacterFacetSelection` is defined in `src/app/core/models/optc.models.ts`;
  `CharacterSearchQuery` carries it as the optional `typeFacet` / `classFacet`.
  `DetailedCharacterSearchQuery` keeps its flat
  `selectedTypes` / `selectedTypesMatchMode` (and the class twin) wire fields;
  `toDetailedQueryFacetFields` converts between the two.
- An **empty `values` list applies no filter**, whatever `matchMode` says.
- Values are normalized (trimmed, de-duplicated, whitespace-collapsed) but keep
  their author case, because `ion-select[multiple]` compares option values by
  strict equality against the stored manifest strings — lowercasing would make
  `Free Spirit` render a chip while showing nothing selected in the dropdown.
- A character holds **at most two** types and **at most two** classes, so an
  `all` selection of three or more values can never match. The UI prevents
  reaching that state and demotes to `any` visibly where it cannot; the
  normalizer enforces the same rule as a boundary invariant.
- `characters.type` is a single **comma-joined** column, and dual-type pairs are
  stored in both orders (`INT,PSY` and `PSY,INT` both occur). Never compare
  `type` by exact string; match through `matchesCharacterFacet` (in-memory) or
  `buildCharacterFacetSqlClause` (SQL, `',' || c.type || ','` with `ESCAPE '\'`).
  `classes_json` is the authoritative class list — `primary_class` /
  `secondary_class` alone under-report characters that carry a class only in the
  JSON list.
- Multi-set facet formulas such as `(STR AND QCK) OR (INT AND PSY)` are an
  explicit non-goal and are not representable in this shape.

## Tag-set filter shapes

Ability tag filters and `characterTags` filters are both stored as a *selection*
of *sets*, each set carrying its own boolean operator:

```jsonc
{
  "operator": "all",          // how the sets combine: "all" | "any"
  "sets": [
    { "id": "…", "operator": "any", "requirements": [ /* AutoBuildAbilityRequirement */ ] },
    { "id": "…", "operator": "all", "tags": ["Straw Hat Pirates"] }
  ]
}
```

`AbilityFilterTagSetSelection` carries `requirements`; `CharacterTagSetSelection`
carries `tags`. Empty sets are skipped during evaluation, so a half-built group
never blanks a result list.

- Tag values are stored **case-preserved** and compared case-insensitively.
  Do not lowercase on write: persisted `characterTags` were never normalized, so
  folding case would shift existing user data.
- The Auto Team Builder preset payload is `schemaVersion: 34`. Version 33 added
  `filters.characterTagSets`; version 32 and earlier import cleanly by expanding
  the legacy flat `selectedCharacterTags` plus `requireAllSelectedCharacterTagsInTeam`
  into a single set. The flat field is still emitted for back-compat. Version 34
  adds a loaded Saved Enemy's avoid and prefer rules to `filters`, written only
  when set; a version 33 preset imports with none.
- `SavedEnemy` and the saved-teams/all-data transfer payloads stay at their
  existing versions and carry only the flat tag list, so a set structure that
  round-trips through them widens to one group. This is a widening, never a
  spurious rejection.

- Generated dataset compatibility is governed by `DatasetManifest.schemaVersion`.
- User backups use their payload-level `schemaVersion`.
- Unsupported user backup versions must fail with the existing typed import errors.
- If a future saved-team schema changes, follow the saved-team lifecycle contract before accepting the new payload.
- If a future saved-enemy schema changes, add a migration or an explicit unsupported-schema error before accepting the new payload.
- Saved-team v1 compatibility is covered by compact fixtures for current, legacy/partial, and share payload shapes.

## Fixtures

Small local fixtures live in `scripts/fixtures/data`. They are intended for tests and local development only, not as production data sources.

- `saved-teams-v1.json`: current Saved Teams transfer payload.
- `saved-teams-v1-legacy-partial.json`: Saved Teams transfer payload with repairable partial records and invalid records.
- `saved-team-share-v1-legacy-partial.json`: single-team share payload with repairable partial fields.

## Dataset Provenance

<!-- generated:dataset-provenance start -->

_Generated by `npm run dataset:provenance` from the importer itself. Do not edit by hand._

| Shipped column | Origin | Source or transform |
| --- | --- | --- |
| `id` | derived | The key of the upstream units.js entry, which is the unit id: units.js is an object keyed by id, with gaps below the highest id, so the id is never a position. A key with a suffix (1983-1, 1983-2) is a form of the unit before the hyphen and never becomes a character of its own. Only the legacy array format used the row index plus one. |
| `name` | upstream | `units.js .name` |
| `is_incomplete` | derived | True when a MANUAL overlay character was added without full stats. Derived, never carried upstream, and set on no other path: the upstream importer always writes 0, so 0 of 4,622 shipped rows carry it (measured 2026-09-20, v0.5.3). An always-false column, kept because the overlay can still set it. |
| `type` | upstream | `units.js [1]` |
| `primary_class` | derived | classes[0] of the normalized class list. |
| `secondary_class` | derived | classes[1] of the normalized class list, or null. |
| `classes_json` | derived | The normalized class list, serialized. |
| `stars` | upstream | `units.js [3] via normalizedStars.stars` |
| `stars_label` | upstream | `units.js [3] via normalizedStars.starsLabel` |
| `cost` | upstream | `units.js .cost` |
| `combo` | upstream | `units.js .combo` |
| `min_hp` | upstream | `units.js .minHP` |
| `min_atk` | upstream | `units.js .minATK` |
| `min_rcv` | upstream | `units.js .minRCV` |
| `max_hp` | upstream | `units.js .maxHP` |
| `max_atk` | upstream | `units.js .maxATK` |
| `max_rcv` | upstream | `units.js .maxRCV` |
| `growth` | upstream | `units.js .growth` |
| `captain_hp_boost` | derived | Parsed out of the captain ability PROSE by resolveCharacterCaptainBoosts. |
| `captain_atk_boost` | derived | Parsed out of the captain ability PROSE by resolveCharacterCaptainBoosts. |
| `captain_average_boost` | derived | Derived from the two boosts above. |
| `max_sockets` | upstream | `units.js .sockets` |
| `special_cooldown_max` | upstream | `cooldowns.js [0]` |
| `special_cooldown_min` | upstream | `cooldowns.js [1]` |
| `region_json` | derived | Which regions the app found artwork for; an app-side fact, not an upstream one. |
| `region_release_json` | upstream | `flags.js .global` |
| `assets_json` | derived | Resolved image paths per region; an app-side fact, not an upstream one. |
| `search_text` | derived | Built from name, type, classes and aliases by createCharacterSearchText. |
| `families_json` | upstream | `families.js` |

<!-- generated:dataset-provenance end -->
