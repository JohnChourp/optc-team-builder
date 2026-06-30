# Fixture Ownership Guide

This guide defines where OPTC Team Builder test fixtures live, which suite owns
them, and when a contributor should share, regenerate, or keep a fixture local.
Use it with `docs/maintainer-validation-guide.md` when changing tests,
validation harnesses, or release evidence.

## Shared Fixture Rules

- Put cross-suite builders and fixture metadata in `scripts/fixtures/shared/`.
- Keep runtime fixture files in their existing suite directories unless more
  than one suite reads the exact same file shape.
- Keep fixture data deterministic: fixed timestamps, stable IDs, compact
  records, and no live network dependency.
- Prefer builders for user-transfer payloads and expected replay matrices.
  Prefer checked-in JSON or script files when the fixture represents a persisted
  compatibility shape or captured upstream replay.
- Update this guide in the same PR when adding, renaming, or materially changing
  a fixture source.

## Fixture Inventory

| Source | Owner | Consumers | Regeneration rule |
| --- | --- | --- | --- |
| `scripts/fixtures/shared/saved-team-fixtures.ts` | Saved Teams transfer and browser regression owners | `e2e/regression-fixtures.ts` and future transfer/import tests that need the same deterministic teams | Edit builder records directly when the public v1 saved-team shape changes; keep IDs stable unless the scenario itself changes. |
| `scripts/fixtures/shared/release-check-fixtures.mjs` | OPTC DB release-detector owners | `scripts/check-optc-release-needed.spec.ts` and future release workflow tests | Update metadata when adding/removing bundled replay directories or changing expected detector outcomes. |
| `e2e/regression-fixtures.ts` | Browser regression owners | `e2e/regression-flows.spec.ts` | Keep Playwright-only helpers here; move only reusable data builders to `scripts/fixtures/shared/`. |
| `scripts/fixtures/release-check/<fixture>/` | OPTC DB release-detector owners | `npm run test:release-check`, release detector replay, and workflow fixture validation | Add a new directory only for a distinct release branch or captured upstream failure. Each directory must include the four files named by shared release-check metadata. |
| `src/app/core/services/fixtures/captain-contract-cases.json` | Captain parser and captain coverage owners | script-side captain contract tests and Angular captain coverage/matching specs | Add a case for a new captain wording class; update expected generated boosts and tiers together. |
| `scripts/fixtures/data/*.json` | Saved Teams, Saved Enemies, and compact dataset owners | transfer compatibility specs and local development checks | Keep files small and schema-focused. Add a file only for a distinct persisted payload edge case. |
| `scripts/fixtures/release-readiness/*` | Release readiness owners | `npm run test:release-readiness` | Update source JSON and expected Markdown together when the report schema or maintainer summary contract changes. |
| performance harness fixture builders in `scripts/perf-ability-filters.mjs` and `scripts/perf-explanation-compare.mjs` | Performance budget owners | browser performance harnesses and `Performance Budgets` workflow | Keep large generated fixtures local to the harness until another suite needs the same data shape. Store run output as artifacts, not checked-in fixtures. |

## Migration Policy

Move fixture data into `scripts/fixtures/shared/` when both of these are true:

- at least two suites need the same semantic scenario, naming convention, or
  expected branch matrix
- sharing the fixture reduces drift without making runtime scripts depend on
  test-only helpers

Do not move a fixture only because two files both contain JSON. Captured
upstream release replay files, expected Markdown outputs, and compatibility
payloads should stay near the suite that owns their file format.

## Validation

Use the smallest validation path that covers the changed owner:

- shared saved-team fixtures: `npm run test:e2e:chromium` plus focused saved
  team transfer tests when transfer utilities change
- shared release-check fixtures: `npm run test:release-check`
- fixture ownership docs: `npm run docs:integrity -- --brain-root ../optc-team-builder-brain`
- broad shared fixture changes: `npm run test:ci` and `git diff --check`
