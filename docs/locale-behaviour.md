# What follows the language, and what deliberately does not

**Status:** recorded 2026-09-15 · [869f17h2x](https://app.clickup.com/t/90121749478/869f17h2x)

Switching the app's language changes more than its words. This records exactly
what, and — more usefully — what it does **not** change and why, because three of
those are decisions that look like oversights.

## The defect this started from

`Number.prototype.toLocaleString()` with no argument formats in the **browser's**
locale, which has nothing to do with the language this app is running in.

| Value | `en` | `el` |
| --- | --- | --- |
| `1234567.89` | `1,234,567.89` | `1.234.567,89` |
| `9303` | `9,303` | `9.303` |

A Greek reader with an English browser saw a thousands separator exactly where
they expect a decimal point. Measured 2026-09-15: **41** call sites passed no
locale at all, and the 12 `localeCompare` calls that looked bound were passing
`undefined` — they set `sensitivity` and `numeric`, never a locale.

So **0 of 85** locale-dependent call sites followed the chosen language.

## What follows the language now

| Behaviour | Bound | How |
| --- | :--: | --- |
| `documentElement.lang` | yes — **already did** | `AppI18nService.setLanguage` |
| Number grouping and decimals | yes | `toLocaleString(formattingLanguage())`, 40 sites |
| Dates in translated copy | yes | same, via `formattingLanguage()` |

`app-locale-format.ts` holds the locale as module state, not an injected service,
because half the call sites are presenters and `*.utils.ts` files with no
injector and the page specs run without a TestBed. `AppI18nService.setLanguage`
is its only writer, and is also the only place `documentElement.lang` is written,
so the two cannot disagree.

Call sites pass the locale to the `toLocaleString` they already had rather than
being rewritten around a helper. The receivers are expressions like
`this.effectiveAutoBuildCandidateIds()?.length`, and re-parsing 41 of those to
wrap them is a way to introduce a bug while fixing a formatting one.

## What deliberately does not follow the language

### 1. Numbers inside untranslated English sentences

`auto-team-builder-rumble.engine.ts` builds phrases from dataset text —
`"50% chance to resist Poison"`, `"Lv 5"`. Those sentences are English whatever
the interface language is. Formatting their numbers as Greek produces a sentence
in neither language, so that file keeps an explicit `'en-US'` and is the single
entry in the formatting guard's allowlist.

### 2. Sort order

Character names come from the community database and are **Latin script**
whatever the interface language is. Collating them with a Greek collator changes
established ordering and buys nothing a reader would notice. The 31 bare
`localeCompare` calls stay as they are, and a test asserts that ordering is
identical under both languages so this is a check rather than a comment somebody
deletes.

This is the one to revisit **if** character names are ever translated. They are
not, and the game's own terms stay untranslated by policy.

### 3. The dataset card's date

`dataset-summary.utils.ts` prints an ISO date on purpose, and says why in its own
comment: the card is read back to us in bug reports, so the same dataset has to
print the same string for every reader in every timezone. That predates this work
and is left exactly as it was.

## The guard

`npm run i18n:locale-formatting` fails on a bare `toLocale*()` call anywhere in
`src`, on a hard-coded locale that is not allowlisted with a reason, and on an
allowlist entry that no longer matches the code it excuses. Comments are
stripped first, so prose describing the defect does not trip the check that fixes
it.

It deliberately says nothing about `localeCompare`, because "unbound" is the
correct state there and a guard demanding otherwise would be wrong.
