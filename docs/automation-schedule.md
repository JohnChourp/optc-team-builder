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

## Why the minutes are what they are

`:17`, `:23`, `:31`, `:37`, `:41` are **deliberate, and they are all prime.** GitHub Actions has a
well-known scheduling crush at the top of the hour, where `0 * * * *` jobs queue behind each other
and start minutes late. Odd, non-round minutes avoid it.

**This was previously unrecorded**, which left the next person two bad options: preserve them
superstitiously, or change them blindly. Neither is necessary now.

**If you change a schedule, change this table in the same commit.** A minute with no reason
written next to it is how the reason was lost the first time.

## Do they interfere with each other?

**Unknown, and deliberately recorded as unknown.** This is 869f13gbc's question, and it is the
honest state of it.

On a **Tuesday**, four of the five run inside 80 minutes, and three of those exercise the live
public site: `guide-discoverability` 06:17, `performance-budgets` 06:23, `public-entry-synthetics`
06:41. `performance-budgets` measures regressions of a few hundred milliseconds, and a measurement
taken while another job is loading the same pages has an uncontrolled variable in it.

Then `check-optc-db-release` at 07:37 can dispatch a release, which changes the very thing the
earlier jobs measured.

**Nothing here has been shown to be a problem, and nothing has been shown not to be.** The
performance system keeps its own history, so this is answerable from data rather than reasoning -
compare Tuesday samples against the other weekdays for the same route. That measurement has not
been taken. It is cheap and it is the whole of what 869f13gbc needs.

**Do not space the schedule out on the strength of the reasoning alone.** The 80-minute overlap is
suspicious, not proven, and moving a cron to fix an unmeasured problem trades a recorded reason for
an invented one.

## The one that must keep working

`check-optc-db-release` → `release-android` → `deploy-pages` is the automatic release chain. It
releases new upstream data with no human involved. Whatever is decided about the other four, this
one runs, and the brain's instruction file forbids disabling it to save minutes.
