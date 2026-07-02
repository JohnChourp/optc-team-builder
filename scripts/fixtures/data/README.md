# Data Fixtures

Small JSON fixtures for local development and focused tests. They mirror the public v1 shapes used by generated datasets and user transfer payloads without depending on the full OPTC import.
Saved-team payload fixture changes must follow
[`docs/saved-team-schema-lifecycle.md`](../../../docs/saved-team-schema-lifecycle.md).

- `sample-characters.json`: normalized character records with captain coverage, tags, and builder abilities.
- `sample-ships.json`: normalized ship records.
- `saved-teams-v1.json`: Saved Teams transfer payload with `schemaVersion: 1`.
- `saved-teams-v1-legacy-partial.json`: Saved Teams v1 payload with repairable partial records and invalid records for compatibility tests.
- `saved-team-share-v1-legacy-partial.json`: single-team share v1 payload with repairable partial fields for compatibility tests.
- `saved-team-codec-fuzz-corpus.json`: deterministic synthetic corpus for Saved Teams import/export/share codec fuzz invariants, malformed payload diagnostics, and mutation boundary tests.
- `saved-enemies-v1.json`: Saved Enemies transfer payload with `schemaVersion: 1`.

Keep these fixtures compact and deterministic. Add new files only when a test needs a distinct schema edge case.
