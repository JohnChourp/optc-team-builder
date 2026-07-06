# Data Schemas

This document records the canonical local data shapes used by OPTC Team Builder. The app remains offline-first: generated dataset files live under `public/assets/data`, while user-created backups use explicit transfer payloads with their own schema versions.

## Generated Dataset

The importer writes these files:

- `optc-manifest.json`: dataset metadata, counts, schema version, source version, and offline pack summaries.
- `optc-seed.sql`: SQLite seed containing `characters`, `character_details`, `ships`, and `meta`.
- `optc-auto-builder-abilities.json`: ability catalog consumed by Auto Team Builder filters and saved enemy requirements.
- `optc-unresolved-images.json`: characters that still need image coverage for the installed offline packs.
- `optc-preview.json`: small preview sample for early UI loading and checks.

`optc-manifest.json` is versioned with `schemaVersion: 1`. The repository service normalizes older manifests without this field to `1`, so existing local builds keep loading. Breaking generated dataset changes must increment this value and update `DatasetManifest`.

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
- `partyConflictKeys` drive duplicate base-character prevention
- `characterTags` drive tag filters and captain coverage requirements
- `builderAbilities` are canonical ability entries used by Auto Team Builder and Captain Coverage filters

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

## Enemy Definitions

Saved enemy definitions use the `SavedEnemy` model and the enemy mechanic catalog in `enemy-mechanic-draft.utils.ts`.

Required fields include:

- enemy identity and notes
- selected type/class/tag/name filters
- required abilities and required character groups
- optional battle requirements
- enemy mechanics with `mechanicKey`, category, turns, trigger/response/condition tags, and optional `derivedAbilityKey`

Import/export supports the saved enemies transfer payload:

```json
{
  "schemaVersion": 1,
  "source": "saved-enemies",
  "exportedAt": "2026-05-16T00:00:00.000Z",
  "enemies": []
}
```

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

## Migration Policy

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
