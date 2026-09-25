# How the Rumble builder scores a unit

**Status:** recorded 2026-09-21 · [869f13erp](https://app.clickup.com/t/90121749478/869f13erp) ·
extracted from `src/app/core/services/auto-team-builder-rumble.engine.ts`

The Rumble builder is the **one** engine in this project that scores. `slot.score` is a
real field, it is carried through export and import, and it is rendered to the player as
*"Score {{score}}"*. The quest builder deliberately has none — that difference is recorded
in `src/app/core/data/team-builder-engine-divergences.data.ts`, which says *that* the two
differ. This says **how** the one that scores does it.

Everything below is read out of the code, not designed here. Where a number looks
arbitrary it is quoted as it appears, because that is the honest form.

## The base score of one unit

`scoreCandidate` produces a unit's score before any team or opponent is considered:

| Part | How it is computed |
| --- | --- |
| `statScore` | `hp/120 + atk/18 + rcv/45 + def*1.4 + spd*0.9` |
| `passiveScore` | the sum of `scoreEffect(effect, 'ability')` over the unit's passive effects |
| `specialScore` | the sum of `scoreEffect(effect, 'special')` over its special effects, **plus** `max(0, 40 − cooldown) * 3.5` when it has a cooldown |
| `recencyScore` | **`character.id / 10000`** |
| `roleScore` | `roleTags.length * 12` |
| **`total`** | the five added together |

Two of those are worth stating plainly rather than leaving to be discovered:

- **`recencyScore` is the unit's id divided by 10,000.** A newer unit scores higher for no
  reason except being newer. On ids in the low thousands that is a fraction of a point
  against totals in the hundreds, so it is a **tie-break**, not a driver — but it is a
  deliberate thumb on the scale for recency and it should be read as one.
- **The displayed breakdown is not the computed breakdown.** `roleScore` is added into
  `breakdown.passiveScore` before it is shown, so a reader adding up the parts on screen
  cannot recover `roleScore`. `breakdown.synergyScore` is `0` at this stage and filled in
  later.

## Every unit is scored before Level Limit Break

**869f6td5p, decided 2026-09-25.** The builder reads a unit's pre-Level Limit Break kit and
nothing else. No `llb*` field and no `gp*` field of `rumbleData` is read - not the LLB passive,
special, super special or resilience, and none of the `gp*` ones.

- **Why.** The app cannot know which of a reader's units are LLB'd, and it will not ask players
  to maintain investment state (869f13c8m), so every unit is scored the same way whatever the
  reader's box holds.
- **What it replaced.** The passive and special were already the pre-LLB ones (no super special
  is read at all), but `llbresilience` was read and **added** to the base resilience it upgrades. 174 of the 181 units
  with an LLB resilience repeat an attribute of their base line, so a matching opponent counted it
  twice: Sengoku the Buddha against an Action Bind opponent scored **140.4** (32.4 base + 108.0
  LLB) where either line alone says 32.4 or 108.0. It is **32.4** now.
- **Where the player is told.** The top of the Rumble builder says every unit is scored as it is
  before Level Limit Break, in English and Greek.
- **What pins it.** `src/app/core/services/auto-team-builder-rumble-pre-llb.spec.ts` takes each
  field away in turn and compares everything the builder computes, and requires exactly these to
  matter: `ability`, `cost`, `pattern`, `resilience`, `special`, `stats`, `target` (and `basedOn`
  for a unit that inherits). Reading an LLB field again turns it red, which is the point: it has to
  be a decision.

The Character screen still shows the LLB lines; this is about what the builder scores.

## What the opponent changes

An opponent team is turned into a profile of threats, then units that counter it are
rewarded: `scoreUnitOpponentCounters(unit, profile) * ACTIVE_SLOT_WEIGHT`.

| Constant | Value | Meaning |
| --- | :-: | --- |
| `ACTIVE_SLOT_WEIGHT` | **1** | a slot that fights |
| `BENCH_SLOT_WEIGHT` | **0.45** | a bench slot counts for less than half |

Opponent stats are normalised before they become threat weights — HP by **900** and ATK
by **260** — so the two are comparable to each other rather than to anything outside this
engine.

## Are two scores comparable?

| Question | Answer |
| --- | --- |
| Two units in the **same** build? | **Yes.** That is what the ordering is |
| Two units in **different** builds, no opponent set? | **Yes.** The base score depends only on the unit and the dataset |
| Two units in different builds **with different opponents**? | **No.** The counter term is a function of that build's opponent profile |
| A score against anything outside this app? | **No.** The units are this engine's own |

**A score is not a percentage, a power level, or a claim about the game.** It is an ordering
key whose scale is set by the constants above, and changing any one of them changes every
score without changing any unit.

## The modelling claim nobody had written down

The builder counters filled opponent slots, and warns the player that *"enemy debuffs can
outweigh some self-buff value when they create a stronger matchup"*. That sentence is a real
claim about Rumble: it says a unit that removes an opponent's advantage can be worth more
than one that adds to your own. It is implemented in the counter term and it has never been
stated anywhere a reader could disagree with it.

It is recorded here so it can be argued with, which is the only way it improves.

## What this does not make the quest builder

Nothing here is a precedent for scoring the quest builder. The per-slot score was refused
there deliberately, and
the brain's *No tier list, and the refusal to grade* rule
(`../optc-team-builder-brain/CLAUDE.md`)
keeps it refused. This file exists because Rumble's score already exists and was
undocumented, not because scoring won an argument.
