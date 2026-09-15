# The project's position on linting

**Status:** recorded 2026-09-14 · [869f17h4j](https://app.clickup.com/t/90121749478/869f17h4j)
· §2 corrected 2026-09-15 · [869f135rm](https://app.clickup.com/t/90121749478/869f135rm)

## The position

**A check is adopted when a defect demonstrates the need for it, and it is
written to catch that defect specifically.** No general rule set is installed.

That is not "no linting". It is the same discipline the 53 lanes in
`scripts/ci-check-routing.mjs` already follow — each was written after something
broke — stated so that the next reader does not have to guess whether the absence
of ESLint is a position or an oversight.

Both readings have been wrong here before, which is why this file exists.

## What the repository has instead

53 check lanes, each with its own spec, wired into `npm run verify:local`. A
representative few, with what motivated them:

| Lane | Written after |
| --- | --- |
| `overlay-contrast` | Ionic's light literal reaching a `#070b17` surface at **1.30:1**, reported three times |
| `ionic-host-property` | `--border-radius` never reaching the host, so `border-radius: inherit` rendered square corners |
| `worker-bundling` | Angular's worker transformer silently not emitting a worker when the `new URL(...)` argument is not a literal |
| `tag-picker-scoping` | one picker's panel rules naming a single modal class and silently skipping the other picker's eight hosts |
| `storage-keys` | `crewForgeImageProfiles` missing from a full export |
| `scripts-references` | `test:e2e:webkit` reported as orphaned while it ran on every `verify:local:full` |
| `unused-members` | two dead public fields surviving a lane named `dead-code`, and the tool named as the remedy turning out not to have the feature |

Not one of those is expressible as a rule in a standard set. They are facts about
this codebase, and a generic linter has no opinion about any of them.

## The two arguments said to defeat this position

Wave 10 raised two defects as ones "a standard rule set would have caught". Both
were checked on 2026-09-14. **Neither claim survives.**

### 1. Bare `toLocaleString()` with no locale

There is **no standard ESLint rule that requires the locale argument.** The
nearest rule, `@typescript-eslint/no-base-to-string`, is about values that
stringify to `[object Object]`, not about a missing locale — and
[typescript-eslint#2440](https://github.com/typescript-eslint/typescript-eslint/issues/2440)
records that it does not even cover `toLocaleString`.

Measured: **36** bare `toLocaleString()` calls in `src`, and `0` bare
`toLocaleDateString()` / `toLocaleTimeString()`. Nothing in the repository guards
them. So the defect class is real and currently uncovered — and adopting ESLint
would not have covered it either. The available remedy is a custom check, which
is what this position already prescribes.

### 2. Unused public class members

`no-unused-private-class-members` (ESLint core) and
`@typescript-eslint/no-unused-private-class-members` report **private** members
only. There is no standard rule for unused *public* members, because a public
member is an API surface a rule cannot assume is unused.

The two real cases — `regionAvailability` and `recentCharacterIds` — were public.

**This section said knip finds them. It does not, and the correction is the point
of the entry.** Measured 2026-09-15 under [869f135rm](https://app.clickup.com/t/90121749478/869f135rm):
knip's `classMembers` issue type existed in knip 5 and was **removed in 6**. The
installed `^6.35.1` has no trace of it — absent from the binary, absent from
`schema.json`, and `--include classMembers` exits with `Invalid issue type`.
Proven rather than read: a used class carrying two dead public members left
`dead-code:check` green (expected) while `npx knip --include files,exports,types`
named the unused *export* that wired the probe in and named **neither member**.

So the claim was not "noisy tool we have not tuned" but "no tool at all", and the
difference matters: the first is a configuration question, the second is a missing
check. The check is now `npm run test:unused-members`
([`scripts/check-unused-public-members.mjs`](../scripts/check-unused-public-members.mjs)),
a targeted TypeScript-program pass in its own `unused-members` lane, and the
defect class is covered.

knip stays installed and stays out of the gate, for the unchanged reason recorded
in `scripts/ci-check-routing.mjs`: its unused-export output is dominated by
symbols used only inside their own file. That was always a separate argument from
this one.

## The shortlist

Every rule considered, and whether a real defect from this project's history
would have been caught by it:

| Rule | Caught a real defect here? | Evidence, measured 2026-09-14 |
| --- | :--: | --- |
| locale argument on `toLocaleString` | **n/a** | no such rule exists in any standard set |
| `no-unused-private-class-members` | **no** | both real cases were `public`; the rule is private-only |
| `@typescript-eslint/no-base-to-string` | **no** | targets `[object Object]`, not the missing locale |
| `eqeqeq` | **no** | 7 loose-equality sites in `src`, all `!= null`, which every common config allows |
| `no-fallthrough` | **no** | already enforced by `noFallthroughCasesInSwitch` in `tsconfig.json` |
| `no-unused-vars` | **no** | already enforced by `--noUnusedLocals --noUnusedParameters` in `test:dead-code` |

**The shortlist is empty.** No rule in a standard set is known to have caught a
defect this project has actually had.

## What would change this

One entry in the table above turning into a **yes**: a defect that really
happened, a named rule in a published rule set that would have flagged it, and
the commit that fixed it. That is the same bar every existing lane cleared.

Adopting a rule set on the general argument that linting is good practice is
explicitly **not** the bar, because it has been tried as an argument twice and
produced no rule either time.

## What this file is not

It is not a claim that the code is clean, or that a linter would find nothing. It
is a claim that **nobody has yet named a rule that would have caught a defect
this project had** — and that until someone does, the effort is better spent on
checks that encode what this codebase actually gets wrong.
