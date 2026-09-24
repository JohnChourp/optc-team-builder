# TypeScript strictness: every flag, and why it is where it is

**Status:** recorded 2026-09-14 · [869f17h5m](https://app.clickup.com/t/90121749478/869f17h5m) · re-measured and corrected 2026-09-25 · [869f1zxuy](https://app.clickup.com/t/90121749478/869f1zxuy)

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

**Scoped to `tsconfig.app.json`, deliberately.** Spec files are type-checked:
`ng test`, the `angular` lane of `npm run verify:local`, builds them through
`tsconfig.spec.json` and fails on a type error. Putting the flag in the shared
base would therefore turn the 228 errors it finds in specs into a red `angular`
lane — see [below](#nouncheckedindexedaccess-in-the-spec-files--228-errors-deferred).

## Off, with the measured cost

| Flag | Scope | Cost to turn on | Position |
| --- | --- | :--: | --- |
| `exactOptionalPropertyTypes` | app | **117 errors** in 34 files | deferred |
| `noUncheckedIndexedAccess` | spec files | **228 errors** in 28 files | deferred |

Both counts re-measured 2026-09-25 with the commands in *How to re-measure*.

### `exactOptionalPropertyTypes` — 117 errors, deferred

It distinguishes *absent* from *present and undefined*. That is the right
distinction for this codebase, and it is the type-level form of the open question
about what "we do not know" looks like per field.

It is deferred rather than rejected because its fixes are a different kind from
the 62 above: they change optional-property semantics across shared interfaces —
the character model in particular — rather than adding a check at one read. That
is a change to what the types *mean*, and it deserves its own pass instead of
riding along with an index-safety one.

Measured against the tree **after** the 62 fixes: `106` on 2026-09-14.
Re-measured 2026-09-25: **117 errors in 34 files**, all of them the flag's own
diagnostics (TS2379, TS2375, TS2412 and their neighbours). The position is
unchanged.

### `noUncheckedIndexedAccess` in the spec files — 228 errors, deferred

**Spec files are type-checked, and already were when this file said nothing
checked them.** `ng test` — the `angular` lane of `npm run verify:local` — builds
every spec through `tsconfig.spec.json`, and the Angular compiler plugin fails the
run on a type error before a single test starts. Measured 2026-09-25 by planting
one in a copy of a spec:

```text
✘ [ERROR] TS2322: Type 'string' is not assignable to type 'number'. [plugin angular-compiler]
```

The old sentence came from `dead-code:check`, which does read the app config
alone — true of that check, and not of the specs.

So the question this section used to record, whether specs should be type-checked
at all, was already answered by the build. What remains is this one flag:
`tsconfig.spec.json` compiles with **0** errors today and **228 in 28 files** with
`noUncheckedIndexedAccess` (202 on 2026-09-14). Adopting it there is deferred, and
the number is recorded so that decision is not made blind.

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

Write the throwaway file **beside** `tsconfig.app.json`. One written anywhere else
moves `rootDir`, every file then fails TS6059 before any semantic check runs, and
the count that prints is not the flag's — measured on 2026-09-25 as 11.

For the spec files, pass the flag on the command line instead:

Command status: manual/illustrative.
<!-- docs-command: manual/illustrative -->
```bash
npx tsc -p tsconfig.spec.json --noEmit --pretty false | grep -c 'error TS'
npx tsc -p tsconfig.spec.json --noEmit --pretty false --noUncheckedIndexedAccess | grep -c 'error TS'
```

Do not measure with `tsc -p tsconfig.json`: the root config is references-only
and exits 0 without checking anything.
