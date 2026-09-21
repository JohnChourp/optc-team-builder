# How each kind of number is presented

**Status:** recorded 2026-09-21 · [869f13erf](https://app.clickup.com/t/90121749478/869f13erf)

This app renders several kinds of number that are not counts — multipliers, percentages,
sizes, durations, identifiers — and until now each call site decided precision and shape for
itself. This is the contract they must satisfy.

It is the companion to [`locale-behaviour.md`](locale-behaviour.md), which says **which
locale** a value follows. This says **what shape** it takes.

## The contract

| Kind | Decimals | Grouped | Follows the language | Where it is produced |
| --- | :-: | :-: | :-: | --- |
| **Count** | 0 | yes | **yes** | `toLocaleString(formattingLanguage())` |
| **Multiplier** | up to 3, trailing zeros dropped | not in practice | **yes** | `formatBoost`, Captain Coverage |
| **Percentage** | 0 | no | n/a | `(value * 100).toFixed(0)` + `%` |
| **Size** | 1, in MB | no | **no — fixed** | `update-payload-size.utils.ts` |
| **Duration** | 1, in seconds | no | **no — fixed** | the debug report |
| **Identifier** | none — never formatted | **never** | **no** | `#{{ character.id }}`, raw |
| **Version** | none — never formatted | **never** | **no** | `APP_VERSION`, raw |

### The two that must never be touched

**An identifier is not a number.** `#4000` must never become `#4,000` or `#4.000`, and
`0.6.1` must never be reformatted. These are identifiers wearing the shape of numbers, and a
locale-aware fix applied indiscriminately is the most likely way this whole family of
changes goes wrong.

Verified 2026-09-21: character ids render as `#{{ character.id }}` — raw interpolation,
never through a formatter — in every one of their call sites, and `APP_VERSION` has **zero**
formatted uses. **The danger this row exists for does not currently exist**, and the row is
here so that stays true.

### The three that are deliberately fixed

A size, a duration in the debug report, and a whole-number percentage do **not** follow the
interface language:

- a **size** is read back to us in bug reports, so `8.7 MB` has to mean one thing;
- the **debug report** is a maintainer artifact pasted into issues;
- a **whole-number percentage** has no separator that could differ between the two languages,
  so there is nothing for a locale to change.

Each of those is an entry in `FIXED_PRECISION_ALLOWLIST` in
`scripts/check-locale-formatting.mjs`, with that reason next to it.

### The one that was wrong

**A multiplier.** Captain Coverage rendered leader boosts with
`String(Number(value.toFixed(3)))`, which prints `2.5` in every language — so a Greek reader,
who writes `2,5`, saw an English decimal separator on the result card, beside numbers that
did follow their language.

It is the **third spelling** of one defect: 869f17h2x fixed `toLocaleString`, 869f13epb fixed
`Intl`, and both guards read those two names. This one is arithmetic plus `String` and names
neither. Fixed in 869f13epu, and **rule E** of the formatting guard now fails any `toFixed`
that is not in the allowlist above.

## Why this is a data-clarity record and not a styling one

A multiplier is a claim about the game. `2.5x` and `250%` are the same number and different
statements, and a player has to know which convention the app uses before they can compare it
with a wiki, a video or anything else. Declaring the convention is what makes a value
checkable; until it is declared, "wrong" has no meaning.

## The guard

`npm run i18n:locale-formatting` enforces the *follows the language* column: rules A–C for
`toLocale*`, **D** for `Intl` constructions, and **E** for `toFixed`. The *decimals* and
*grouped* columns are not machine-checked — they are a contract for a reader, and a rule that
tried to infer a quantity's kind from its call site would guess.
