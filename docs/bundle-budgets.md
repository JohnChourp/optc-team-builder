# Bundle budgets: which number guards what

**Status:** recorded 2026-09-15 · [869f135rq](https://app.clickup.com/t/90121749478/869f135rq)
· measured on v0.4.48

Two systems budget "the initial bundle" and they do not measure the same thing.
Before this file existed, both of their numbers had been set from the *other*
one's measurement.

## The two definitions

| Name | What it counts | Measured 2026-09-15 |
| --- | --- | ---: |
| **Entry scripts** | only the files `index.html` names in a `<script src>` — `main-*.js` and `app-config.js` | **2 files**, 378,675 raw / 96,700 gzip |
| **Initial payload** | those, plus every chunk they import with a static `import` statement — what a browser fetches before the app runs | **20 files**, 1,491,088 raw / 375,577 gzip |

The initial payload is **3.9x** the entry scripts. It is also Angular's own
`Initial total` of 1.55 MB once its 58.81 kB of CSS is taken out, which is the
cross-check that the two agree.

Anything reached through a **dynamic** `import()` is a route chunk, not initial.
The per-route budgets in `scripts/perf-route-load.mjs` already own those.

## What went wrong

`scripts/perf-route-load.mjs` budgeted the **entry scripts** at `1_500_000` raw
and `383_000` gzip. Those are the **initial payload** figures. So the budget sat
at **3.96x** the value it guarded, on both rows, and nothing the app could
plausibly do would trip either.

The subtask that found this made the mirror of the same mistake, in the other
direction: it read `main-*.js` at 358,083 bytes, compared it with the
`angular.json` `initial` budget of 2 MB, and concluded that budget was **6x too
loose**. It is not. `angular.json` budgets the initial payload, so 2 MB against
1.55 MB was **1.29x** — a reasonable number described as an absurd one.

Neither the budget nor the bug report was careless. Both compared two
measurements that share a name.

## What guards what now

**`scripts/perf-route-load.mjs` is the gate.** Four hard byte budgets, each set
from its own measurement `x1.03` — the margin this repository already uses for
bytes, because bytes reproduce to 0.01% across runs and there is no weather to
absorb:

| Row | Budget | Actual | Headroom |
| --- | ---: | ---: | ---: |
| `entry script raw JS` | 391,000 | 378,675 | 3.3% |
| `entry script gzip JS` | 100,000 | 96,700 | 3.4% |
| `initial payload raw JS` | 1,536,000 | 1,491,088 | 3.0% |
| `initial payload gzip JS` | 387,000 | 375,577 | 3.0% |

**`angular.json` is the backstop.** One budget over the initial payload, set
deliberately looser so it never fires during ordinary work and still refuses a
catastrophe:

```json
{ "type": "initial", "maximumWarning": "1800kb", "maximumError": "2100kb" }
```

That is **1.19x** and **1.39x** the measured payload. `maximumError` fails
`ng build`, so it is the one number that no build can get past — which is why it
is the coarse one. A 20% jump warns; a 40% jump cannot ship.

The entry-script pair is kept alongside the payload pair because it is the only
figure that isolates `main` itself, which is what moves when something joins the
eagerly-loaded graph rather than a route chunk.

## Why the entry rows changed id

The report builds a result-row id from the metric **label**, so renaming
`initial raw JS` to `entry script raw JS` moves the row from
`route-load.bundle.bundle.initial-raw-js` to
`route-load.bundle.bundle.entry-script-raw-js`, and the trend restarts there.

That was accepted rather than worked around. The measurement did not change, so
the earlier points are still readable in the history files under the old id; only
the automatic join restarts. Keeping the misleading label to preserve a twelve-day
trend of a metric reproducible to 0.01% would have preserved the exact thing that
caused the wrong budget.

## Changing one of these

Set it from a measurement and say which. `npm run perf:route-load` prints all
four actuals; `npx ng build --configuration production` prints `Initial total`.
A budget raised to make a build pass, with no measurement beside it, is how the
old numbers got there.

## What every other budgeted number is — 869f135u7

The four rows above are the **only** budgets in this repository set from a
recorded measurement. The performance report carries **38** budgeted metric
definitions; the other **34** were committed in
[`b06342bd`](https://github.com/JohnChourp/optc-team-builder/commit/b06342bd)
(2026-09-14) with no measurement recorded beside them.

So each definition now carries three fields, and the report publishes them:

| Field | What it says |
| --- | --- |
| `profile` | which harness produced it — `browser`, `node` or `bundle` |
| `setOn` | a date for a measured budget, the commit id for a provisional one |
| `provenance` | `measured` (4 rows) or `provisional` (34 rows) |

`provisional` is deliberate and is the honest state. Inventing a measurement date
for the 34 would be worse than the silence it replaces: the next reader would
believe the number was chosen from evidence and would stop asking.

### The profiles, measured rather than assumed

| Profile | Basis | Conditions |
| --- | --- | --- |
| `browser` | **single observation** | desktop: Chromium 1440x1000, Desktop Chrome UA. mobile: Playwright `devices['Pixel 7']`. **No throttling** on either |
| `node` | **mean over N loops** (40 to 1,200, per metric) of a 1,500-team / 519,013-byte fixture | Node on `ubuntu-latest`, no throttling |
| `bundle` | **deterministic** — read from the esbuild `stats.json` | a production build |

All three browser harnesses share one profile, verified at
`perf-route-load.mjs:265-271`, `perf-ability-filters.mjs:42-48` and
`perf-explanation-compare.mjs:93-99`. And `grep -rn "throttl" scripts/perf-*.mjs`
returns **nothing** — which is the single most important line on this page,
because it means every timing budget describes an **unthrottled CI machine** and
not a player's phone.

The `browser`/`node` split is the one that changes how a number should be read: a
single observation moves with the runner's weather, a mean over 600 loops does
not.

### The headroom nobody had looked at — measured, then closed

The eight `node` rows are the ones anybody can re-measure without a browser, so
they were re-measured. Three runs of `npm run perf:saved-team-codecs` on
2026-09-16 agreed within 8%, which is what a mean over 40–1,200 loops should do.

They were **12x to 333x** their own measurements. That is not headroom, it is
absence: `invalid input validation` read **0.003 ms against a 1 ms budget**, so the
codec would have had to get **333 times slower** before the row noticed.

**The owner's answer was to re-set them from measurement rather than delete them**,
and they now sit at roughly **9x**:

| Row | Measured (slowest of 3) | Was | Now | Now at |
| --- | ---: | ---: | ---: | ---: |
| `bulk parse and sanitize` | 1.356 ms | 15 | **12** | 8.8x |
| `bulk sanitize` | 0.881 ms | 10 | **8** | 9.1x |
| `bulk export encode` | 0.549 ms | 10 | **5** | 9.1x |
| `bulk JSON parse` | 0.482 ms | 10 | **4** | 8.3x |
| `share encode` | 0.299 ms | 5 | **2.5** | 8.4x |
| `share resolve and sanitize` | 0.097 ms | 4 | **1** | 10.3x |
| `share decode` | 0.067 ms | 3 | **0.6** | 9.0x |
| `invalid input validation` | 0.003 ms | 1 | **0.1** | 33x — see below |

**Why 9x and not 1.03x.** The bundle rows above sit at 1.03x because bytes
reproduce to 0.01% and there is no weather to absorb. These are timings on a CI
runner, so the multiplier is absorbing a *slower machine*, not run-to-run noise —
9x covers a runner about 6.7x slower than this one even against the repository's
documented ±35% day-to-day movement. And these budgets are **advisory**: they
report and do not gate, so the cost of being slightly tight is a line in a report
rather than a failed build.

**One row is not at 9x, deliberately.** `invalid input validation` measures 0.003 ms
per loop — 3.6 ms in total across 1,200 loops — which is near what this harness can
resolve at all. It keeps a loose 0.1 ms, and saying so is better than pretending
the ratio is uniform.

All eight are now `provenance: 'measured'` with `setOn: '2026-09-16'`, joining the
four bundle rows. **The 30 browser rows remain `provisional`** and must stay that
way until somebody runs those harnesses — they need a browser, and inventing a date
for them is exactly what that field exists to prevent.

### `hardBudgets` is gone

`budgetPolicy.hardBudgets` was a second hand-maintained copy of every budget,
published inside the report. **Nine** of its entries contradicted the enforced
values — `savedTeamsImportReadyMs` read 3000/4000 against an enforced 5800/6000 —
it was misnamed (42 of the 52 budgeted rows are advisory, not hard), and nothing
in the repository read it: one occurrence, its own declaration.

`metricRows` is now the only statement of a budget, and
`perf-budget-report.spec.ts` asserts no second budget literal grows back.

## The other budget in that block: `anyComponentStyle`

**Status:** recorded 2026-09-15 · [869f135rr](https://app.clickup.com/t/90121749478/869f135rr)

`anyComponentStyle` measures the **compiled** stylesheet, and the same
source-versus-output confusion that produced the wrong bundle budget produced a
wrong reading of this one.

[869f135rr](https://app.clickup.com/t/90121749478/869f135rr) reported
`captain-coverage-result-badges-panel.component.scss` at **10,344 bytes, 86% of
the 12 kB warning**, and called it "the one budget in this repo actually doing
something". That 10,344 is the **source** file, 94 of whose 331 lines are
comments. Compiled it is **4,300 bytes — 35.8%**, and it is not even the largest:

| Stylesheet | Compiled | Share of warning |
| --- | ---: | ---: |
| `ability-tag-set-picker-set-panel` | 5,790 | **48.3%** |
| `app.component` | 5,100 | 42.5% |
| `auto-team-builder-results-comparison-panel` | 4,750 | 39.6% |
| `captain-coverage-result-badges-panel` | 4,300 | 35.8% |

So nothing is close to firing, and there was nothing to reduce. The file is large
in source because it is well commented, which is not a defect.

### What was built instead

The part of that subtask that does stand is making the approach visible before the
threshold is hit. `npm run styles:component-budget`
([`scripts/check-component-style-budget.mjs`](../scripts/check-component-style-budget.mjs))
runs the real production build under the `style-budget-probe` configuration —
`production` with `anyComponentStyle` lowered so every stylesheet reports — and
reads **Angular's own** numbers rather than re-compiling the Sass, because a
number that is merely similar is how both wrong budgets in this wave happened.

It fails when a stylesheet reaches **70%** of the warning, when one moves more
than **15%** from its recorded size, or when a recorded stylesheet stops being
reported. `scripts/data/component-style-budget-baseline.json` holds every size, so
growth arrives as a reviewable diff in git rather than in a parallel history
store — that is the trend.

Proven: grown to **9,010 bytes (75.1%)**, Angular's own budget reports **zero
warnings** and this check names the file and its share.
