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
