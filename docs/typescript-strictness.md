# TypeScript strictness: every flag, and why it is where it is

**Status:** recorded 2026-09-14 · [869f17h5m](https://app.clickup.com/t/90121749478/869f17h5m)

Turning a strictness flag on in a codebase this size produces an error count, and
the number is meaningful: it measures how many unchecked assumptions exist today.
Somebody will eventually see such a count and reach for a blanket suppression.
This file exists so the position is already decided when they do.

Every "off" below carries a **measured** cost, not an estimate.

## On

| Flag | Where | Why |
| --- | --- | --- |
| `strict` | `tsconfig.json` | the baseline everything else assumes |
| `noImplicitReturns` | `tsconfig.json` | a function that falls off the end returns `undefined` silently |
| `noFallthroughCasesInSwitch` | `tsconfig.json` | makes `eqeqeq`-class switch bugs impossible rather than reviewable |
| `noUncheckedIndexedAccess` | `tsconfig.app.json` | see below |
| `strictTemplates` | `tsconfig.app.json` | Angular template checking at maximum |
| `strictInputAccessModifiers` | `tsconfig.app.json` | a template cannot reach a private input |
| `strictStandalone` | `tsconfig.app.json` | every component in this app is standalone |
| `typeCheckHostBindings` | `tsconfig.app.json` | host bindings are where the Ionic host-property defect lived |
| `extendedDiagnostics.defaultCategory: "error"` | `tsconfig.app.json` | a diagnostic nobody must act on is not a diagnostic |

### `noUncheckedIndexedAccess` — enabled 2026-09-14, 62 fixes

`arr[i]` and `map[key]` now yield `T | undefined`, which is the truth. This app's
core is data access: rows out of SQLite, JSON columns parsed with defaults,
optional fields across the character model, lookups by id and by index across
9,303 rows. Without the flag, **every index read was a silent assertion that the
element exists.**

Enabling it surfaced **62 such assertions across 11 files**, concentrated where
the argument predicted:

| File | Sites | What they actually were |
| --- | :--: | --- |
| `optc-repository.service.ts` | 17 | `SqlRow` column reads; two helpers already handled `undefined` at runtime and only their signatures denied it |
| `auto-team-builder-rumble.engine.ts` | 15 | a bounded loop index, two regex capture groups, and a non-empty-array invariant the type could not state |
| `auto-team-builder.utils.ts` | 11 | `leaderSlots[0]` passed to a cost-budget pair that voids every parameter |
| `auto-team-builder.page.ts` | 7 | three `.filter(Boolean)` chains, which remove holes at runtime but do not narrow the type |
| the remaining 7 files | 12 | bounded indexes and regex groups |

All 62 were fixed. **None was suppressed and none was cast.** Three findings were
worth more than the fix itself:

- **`.filter(Boolean)` does not narrow.** Three chains fed
  `CharacterListItem | undefined` into code typed to receive
  `CharacterListItem`. Replaced with a type predicate.
- **A `.length` check cannot narrow a later index read.** Four sites guarded the
  array and then indexed it, which reads as safe and is not the same statement.
- **`teamCostWithinBudget` and `canAddSubWithinTeamCostBudget` are stubs** that
  `void` every parameter and return `true`. Their `captain` parameter now admits
  `undefined`, so whoever implements the budget has to decide what an absent
  Captain means rather than inheriting the assumption.

**Scoped to `tsconfig.app.json`, deliberately.** Nothing type-checks
`tsconfig.spec.json` — `dead-code:check` runs against the app config alone — so
putting the flag in the shared base would light up 202 errors in editors with no
lane that owns them.

## Off, with the measured cost

| Flag | Scope | Cost to turn on | Position |
| --- | --- | :--: | --- |
| `exactOptionalPropertyTypes` | app | **106 errors** | deferred |
| `noUncheckedIndexedAccess` | spec files | **202 errors** | deferred with the whole question of type-checking specs |

### `exactOptionalPropertyTypes` — 106 errors, deferred

It distinguishes *absent* from *present and undefined*. That is the right
distinction for this codebase, and it is the type-level form of the open question
about what "we do not know" looks like per field.

It is deferred rather than rejected because its fixes are a different kind from
the 62 above: they change optional-property semantics across shared interfaces —
the character model in particular — rather than adding a check at one read. That
is a change to what the types *mean*, and it deserves its own pass instead of
riding along with an index-safety one.

Measured against the tree **after** the 62 fixes, so the number is current: `106`.

### Type-checking the spec files — 202 errors, and a prior question

No lane type-checks `tsconfig.spec.json` today. That is pre-existing and not
something this flag introduced; the 202 is what it would cost to adopt
`noUncheckedIndexedAccess` there *if* spec type-checking were adopted first.

The prior question is whether specs should be type-checked at all, given that a
spec is verified by running it. Nobody has decided that, and this file does not
decide it either — it records the number so the decision is not made blind.

## How to re-measure

Command status: manual/illustrative.
<!-- docs-command: manual/illustrative -->
```bash
npx tsc -p tsconfig.app.json --noEmit --pretty false | grep -c 'error TS'
```

For a flag that is off, extend the config in a throwaway file rather than editing
a tracked one:

Command status: manual/illustrative.
<!-- docs-command: manual/illustrative -->
```bash
echo '{ "extends": "./tsconfig.app.json", "compilerOptions": { "exactOptionalPropertyTypes": true } }' > tsconfig.measure.json
npx tsc -p tsconfig.measure.json --noEmit --pretty false | grep -c 'error TS'
rm tsconfig.measure.json
```

Do not measure with `tsc -p tsconfig.json`: the root config is references-only
and exits 0 without checking anything.
