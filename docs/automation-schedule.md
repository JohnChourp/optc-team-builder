# The scheduled automations: why each one runs when it runs

**869f13gc0.** Measured 2026-09-22 from `.github/workflows/*.yml`. Five schedules, all between
03:31 and 07:37 UTC.

| Workflow | Cron (UTC) | Cadence | Depends on | Missing a run costs |
| --- | --- | --- | --- | --- |
| `codeql` | `31 3 * * 2` | Tuesdays | nothing | a week's delay on a static-analysis finding |
| `guide-discoverability` | `17 6 * * 2` | Tuesdays | the live site | a week's delay on a broken guide link |
| `performance-budgets` | `23 6 * * 1-5` | weekdays | the live site | one sample missing from the history |
| `public-entry-synthetics` | `41 6 * * *` | daily | the live site | a day without an entry-point check |
| `check-optc-db-release` | `37 7 * * *` | daily | upstream optc-db | **new upstream data ships a day late** |

## The cron times are not when these jobs run

**Measured 2026-09-22 over the last 20 scheduled runs of each workflow.** Not one of the five runs
at its cron time. GitHub creates the run **hours** later:

| Workflow | Cron | Most recent actual | Delay | Oldest sampled |
| --- | --- | --- | --: | --- |
| `codeql` | 03:31 | 09-22 08:45 | **+5.2h** | 08-04 06:12 (+2.7h) |
| `guide-discoverability` | 06:17 | 09-22 11:38 | **+5.4h** | 08-04 09:06 (+2.8h) |
| `performance-budgets` | 06:23 | 09-22 11:53 | **+5.5h** | 08-26 07:15 (+0.9h) |
| `public-entry-synthetics` | 06:41 | 09-22 12:02 | **+5.4h** | 09-21 13:21 (+6.7h) |
| `check-optc-db-release` | 07:37 | 09-21 14:31 | **+6.9h** | 09-02 12:16 (+4.7h) |

GitHub documents that scheduled workflows may be delayed under load; what is not obvious until you
look is the **size** of it here, and that **it is growing**: `performance-budgets` was +0.9h on
26 August and is +5.5h now.

### What the cron minutes still do, and what they do not

They set the **order**, and the order is preserved: `:17 < :23 < :41` came out as
`11:38 < 11:53 < 12:02`. They do **not** set the absolute time, and they do not preserve the gaps -
6 and 18 minutes of cron became 15 and 9 minutes of reality.

So `:17`, `:23`, `:31`, `:37`, `:41` being prime is a reasonable habit for avoiding the top-of-hour
crush, and it is **not** what determines when anything runs here. Keep them for ordering; do not
reason about absolute time from them, and do not tune them expecting a job to move.

**If you change a schedule, change this table in the same commit** - and re-measure, because the
cron column is an intention and the delay column is the fact.

### The thing actually worth watching

The delay is growing and nothing monitors it. `check-optc-db-release` is a **daily** job already
running +6.9h after its cron; there is no alarm for this project (that is a standing rule) and no
signal either. If it keeps growing it eventually lands near the following day's window. That is a
real, measured trend, and it is the only part of this schedule with a direction.

## Do they interfere with each other? No - measured

**869f13gbc's premise is false as stated, and the measurement above is why.**

The premise was: on a Tuesday four of the five run inside 80 minutes, three of them exercising the
live site, so `performance-budgets` measures regressions of a few hundred milliseconds with an
uncontrolled variable in it. That 80-minute window is computed from **cron times GitHub does not
honour**.

What actually happened on Tuesday 2026-09-22:

| Workflow | Started | Ended | Gap to the next |
| --- | --- | --- | --- |
| `guide-discoverability` | 11:38:07 | 11:39:20 | 14m 12s |
| `performance-budgets` | 11:53:32 | 11:56:45 | 6m 1s |
| `public-entry-synthetics` | 12:02:46 | 12:03:43 | - |

**Zero overlap.** Each finished minutes before the next began. No job was loading the public site
while another measured it, so there is no uncontrolled variable of that kind to remove.

Two things this does **not** claim. It does not say the three can never overlap - they are
serialized by a delay nobody controls, not by design, and the delay is drifting. And it does not
say performance numbers are free of Tuesday variance from any other cause; it says the cause the
subtask named is not present.

**Do not space the schedule out.** There is nothing to space - and spacing crons would not move
the runs anyway.

## The one that must keep working

`check-optc-db-release` → `release-android` → `deploy-pages` is the automatic release chain. It
releases new upstream data with no human involved. Whatever is decided about the other four, this
one runs, and the brain's instruction file forbids disabling it to save minutes.
