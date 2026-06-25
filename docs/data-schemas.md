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

Saved teams are on-device user data with this transfer payload:

```json
{
  "schemaVersion": 1,
  "source": "saved-teams",
  "exportedAt": "2026-05-16T00:00:00.000Z",
  "teams": []
}
```

Team records contain id, name, six character slots, optional ship id, notes, and timestamps. Saved team schema remains v1 in this data epic; no migration is needed because no saved-team wire shape changed.

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
- If a future saved-team or saved-enemy schema changes, add a migration or an explicit unsupported-schema error before accepting the new payload.

## Fixtures

Small local fixtures live in `scripts/fixtures/data`. They are intended for tests and local development only, not as production data sources.
