# Saved-Team Schema Lifecycle

This is the canonical lifecycle contract for saved-team transfer formats. It
covers Saved Teams JSON exports, Manual Team Builder share links and codes,
Settings/Drive all-data embedding, and Auto Team Builder preset embedding.

## Current Formats

The public app contract is declared in
`src/app/pages/saved-teams/saved-teams-transfer.utils.ts`:

- `SAVED_TEAMS_TRANSFER_SCHEMA_VERSION = 1`
- `SAVED_TEAMS_TRANSFER_SOURCE = 'saved-teams'`
- `SAVED_TEAM_SHARE_SCHEMA_VERSION = 1`
- `SAVED_TEAM_SHARE_SOURCE = 'saved-team-share'`
- `SAVED_TEAM_SHARE_QUERY_PARAM = 'teamShare'`

Saved Teams JSON exports use a multi-team payload:

```json
{
  "schemaVersion": 1,
  "source": "saved-teams",
  "exportedAt": "2026-05-16T00:00:00.000Z",
  "teams": []
}
```

Share links and raw share codes use a single-team payload encoded in the
`teamShare` query parameter on `/tabs/manual-team-builder`:

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

Settings and Drive all-data backups embed the same `saved-teams` v1 payload
under `savedTeams`. Auto Team Builder preset exports may embed the same payload
as `savedTeamImport`; that embedded payload follows this lifecycle, while the
Auto Team Builder preset itself keeps its own independent schema version.

## Compatibility Rules

- The payload boundary is strict: importers accept only the declared
  `schemaVersion` and `source` pairs above.
- Team records are forgiving after the boundary is accepted. Stable string
  `id` values are required; names, notes, ship ids, slots, and timestamps are
  normalized or repaired when possible.
- Non-object records, missing ids, malformed JSON, malformed share codes,
  unsupported sources, and unsupported schema versions are rejected or skipped
  through the existing typed import errors.
- Corrupted local `savedTeams` storage is repaired on load. Valid or repairable
  records are kept, unrecoverable records are removed, and invalid/non-array
  storage resets to an empty saved-team list.
- User-facing failures must use safe diagnostic codes and recovery copy. Error
  objects, logs, UI details, and support notes must not include raw JSON, share
  codes, URLs, team names, notes, decoded payload text, or slot contents.

## Migration Rules

Future schema work must update the exported markers, this document, fixtures,
and tests in the same change. A new saved-team format is not supported until the
implementation does one of the following:

- adds an explicit migration path from the older supported payload into the
  current in-app `SavedTeam` model, or
- rejects the unsupported payload with the existing unsupported-schema
  diagnostic before any partial import or persistence happens.

Do not infer migrations from optional-field repair alone. If a future change
alters payload identity, source ownership, team array semantics, encoded share
shape, or embedded backup behavior, treat it as a schema lifecycle change.

## Test And Fixture Ownership

The compact v1 fixtures in `scripts/fixtures/data/` are the source fixtures for
current, legacy/partial, and share-payload compatibility coverage:

- `saved-teams-v1.json`
- `saved-teams-v1-legacy-partial.json`
- `saved-team-share-v1-legacy-partial.json`
- `saved-team-codec-fuzz-corpus.json`

The focused transfer specs must cover the exported markers, current payload
builders, unsupported-schema rejection, repairable legacy v1 records, and share
payload conversion into normal saved-team imports. Settings all-data and Auto
Team Builder compare/preset tests should reference the same v1 payload contract
instead of defining a separate saved-team schema. The deterministic codec fuzz
suite must also keep round-trip, mutation, truncation, malformed-field,
duplicate-id, fixed-slot, share-code/share-url, and diagnostic-redaction
invariants in regular targeted CI through `npm run test:saved-team-codecs`.
