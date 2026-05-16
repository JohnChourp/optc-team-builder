# Data Fixtures

Small JSON fixtures for local development and focused tests. They mirror the public v1 shapes used by generated datasets and user transfer payloads without depending on the full OPTC import.

- `sample-characters.json`: normalized character records with captain coverage, tags, and builder abilities.
- `sample-ships.json`: normalized ship records.
- `saved-teams-v1.json`: Saved Teams transfer payload with `schemaVersion: 1`.
- `saved-enemies-v1.json`: Saved Enemies transfer payload with `schemaVersion: 1`.

Keep these fixtures compact and deterministic. Add new files only when a test needs a distinct schema edge case.
