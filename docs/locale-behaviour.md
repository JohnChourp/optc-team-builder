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

## The language a first visit starts in

**869f13c59.** Until then every first visit started in English, and the only way
to Greek was the switch in the side menu. Now, when the device has **no stored
choice**, `AppI18nService` walks the browser's `navigator.languages` in the
reader's order and takes the first language the app is translated into —
`resolveFirstVisitLanguage` in `src/app/core/i18n/first-visit-language.ts`:

| Browser languages | First visit |
| --- | --- |
| `el-GR, en-US` | Greek |
| `en-US, el` | English |
| `de-DE, el` | Greek |
| `fr-FR` | English |

A stored choice always wins, and every visit stores the language it applied, so
this decides the **first** visit only. Readers who came before this change keep
the English that was stored for them then: a stored `en` cannot tell a choice
from the old default, so it is left alone.

Nothing public changes. The prerendered documents still ship `lang="en"`
([first-paint.md](first-paint.md)), crawlers ask in English, and no URL moves.

What it does change is any browser a test opens: a fresh context now starts in
its own locale's language. `playwright.config.ts` sets the e2e suite to `en-US`,
because its locators name English labels. The perf, synthetics and PWA-shell
scripts stay unpinned on purpose. Measured, they locate only text that reads the
same in both languages: guide headings, character and team names, test ids.

Held by `src/app/core/services/app-i18n-first-visit-language.spec.ts`.

## English text inside a Greek page is marked English

With Greek selected the page is `<html lang="el">`. English text inside it has
to say so, or a screen reader reads English sentences with a Greek voice:

- the seven tool and guide pages, whose words are written once, in English —
  `seo-content.page.ts` declares `host: { lang: 'en' }` (869dwcbb8);
- on a character page, the four paragraphs that print the community database's
  English verbatim — captain ability, notes, special and effect texts — carry
  `lang="en"` (869f13c59), held by
  `src/app/pages/character-detail/character-detail-english-text.spec.ts`, which
  also makes whoever adds an untranslated paragraph decide its language.

The lists and rows on the same page are deliberately **not** marked. They mix
dataset words with numbers formatted in the chosen language (`formatNumber`,
`formatScalar`), and a Greek `1.234` read by an English voice is a different
number.
