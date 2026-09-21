# What a tier is on Captain Coverage — and what it is not

**Status:** recorded 2026-09-21 · [869f13erm](https://app.clickup.com/t/90121749478/869f13erm) ·
extracted from `src/app/core/models/optc.models.ts` and
`src/app/core/services/captain-coverage-tier-view.utils.ts`

## The collision worth naming first

**In the OPTC community, a "tier" is a power ranking of units** — published monthly by
several sites, voted on publicly, revised whenever a new unit arrives. That is what a player
means when they ask *"what tier is this?"*.

**In this app a tier is none of those things.** It is a threshold inside one captain's
parsed ability: the condition under which that captain's boost applies. It says **when** an
effect is active, never **how strong the unit is**.

The two are unrelated, this app uses the less common meaning, and it never said so. A
question about tiers is therefore ambiguous by default — establish which one is meant before
answering.

## What a tier actually holds

`CharacterCaptainAbilityCoverageTier`:

| Field | What it is |
| --- | --- |
| `tier` | the threshold's index within this captain's ability — an **order**, not a grade |
| `kind` | one of `baseline`, `unconditional-top`, `conditional`, `baseline-and-conditional` |
| `scope` | who the boost reaches — types, classes, character tags |
| `characterConditions` | `universal` / `fallbackOther`: whether it covers everyone, or everyone else |
| `teamConditions` | conditions about the rest of the crew |
| `fieldConditions` | conditions about the state of the fight |
| `triggerConditions` | what has to happen for it to fire |
| `clauses` | the effect text, as clauses |
| `atkBoost` / `hpBoost` | the multipliers, when the ability states them |

The four `kind` values are the part that carries the most meaning and the least attention:
a `baseline` tier applies with nothing asked of you, an `unconditional-top` is the best case
that needs no condition, a `conditional` fires only when its conditions hold, and
`baseline-and-conditional` is one tier that is **both** — an unconditional floor with gated
extras on top, which is why the view model splits `baselineClauses` from
`conditionalClauses` so the two can be labelled apart.

## Why the condition lines keep English in them

A condition line is assembled from translated pieces plus **raw parser output**, and the raw
part stays in the game's own English on purpose: inventing a Greek translation for text the
dataset spells in English would be worse than showing the English.

That is not a small tail. Measured 2026-09-21 by `npm run dataset:unresolved-clauses`:

| | Unresolved | Total | Share |
| --- | :-: | :-: | :-: |
| Trigger clauses | **520** | 858 | **60.6%** |
| Team conditions, raw only | **67** | 301 | **22.3%** |
| Together | **587** | 1,159 | **50.6%** |

`scopeLabel` and `conditionLines` are English and **kept** English deliberately — the view
model's own comments say a half-Greek label would read worse than a consistent English one.
`scopeLabelTokens` and `conditionLineTokens` are the same content in pieces, so a template
can translate the structural parts and leave the dataset's words alone.

## What a tier explicitly does not claim

- Not that the unit is strong. There is no damage model and no notion of level or investment.
- Not that a lower-numbered tier is worse. `tier` is position in the ability, not quality.
- Not that two captains' tiers are comparable. Each is an index into its own ability.
- Not a ranking of any kind. See the brain's *No tier list, and the refusal to grade* rule
  (`../optc-team-builder-brain/CLAUDE.md`) for why that stays true.

## Where a player meets this

On the Captain Coverage result list, as the condition lines under each captain. The FAQ
entry *"What does tier mean here, and is it a tier list?"* is the maintainer-facing version
of this file and points back at it.
