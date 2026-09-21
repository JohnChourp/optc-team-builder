# What this project deliberately does not measure, and what it simply cannot

**Status:** recorded 2026-09-21 · [869f13d8r](https://app.clickup.com/t/90121749478/869f13d8r)

Six waves found five artifacts that existed for no consumer. This is the mirror: **things
that do not exist for no recorded reason**, which nobody will ever propose adding because
nobody knows they are missing.

The distinction this file exists to draw is not between "measured" and "unmeasured". It is
between **a decision and an accident** — and from the outside those look identical. That
resemblance is how five of the artifacts above accumulated, and it is why an undocumented
absence tends to become a permanent one.

## Deliberate — decided, and the reason recorded

| What we do not know | Why, and where it is decided |
| --- | --- |
| How many people use the app | [`measurement-position.md`](measurement-position.md): no new event stream. One `page_view`, and only after the reader accepts |
| Which features get used | The same position. Where a question can be answered from data already on the reader's device, it is answered there and transmitted nowhere |
| What a player's teams contain | The diagnostics export is **counts only**, and `buildStorageDiagnosticsPayload` says so and is written to keep saying so |
| The text of a player's errors | 869f13d6y. The recent-problems log stays on the device; the export carries when, which mechanism, the constructor name and the bundle location — never the message |
| Whether the test suite is fully covered, as a percentage | 869f13d72, closed **won't-do** on 2026-09-21. The load-failure it would have caught happened once, and the standing rule is that a guard earns a lane only when a defect class recurs. Comparing test totals between runs already catches it and costs nothing |

## Cannot — and now decided, rather than merely absent

Each of these was on the "unrecorded" side of this table when the task was written. Each was
answered on 2026-09-21, and the point of the row is the answer, not the absence.

| What we could not know | What was decided |
| --- | --- |
| Whether an error reached a player | **Ended, locally.** Before 869f13d6y there was no error reporting of any kind: `ErrorHandler`, `window.onerror` and `unhandledrejection` were zero occurrences each. Now there is a 20-entry log the reader can see, clear, and choose to attach |
| Which files no test touches | **Left unknown, deliberately.** See the coverage row above. This moved from "cannot" to "decided not to" |
| Whether an installed app failed to update | **Still unknown, and still undecided.** The native updater reports failure to the reader on their own screen (869f135r6), and nothing reports it to us. Under the local-only position of 869f13d9w, learning it would need transmission — which is the line that position draws |

## The one genuinely open row

**Whether an installed app failed to update.** It is the only item here without an answer,
and it is left open on purpose rather than closed quietly in either direction: ending it
means transmitting something, and the owner's 2026-09-21 decision was local-only.

What exists instead: the failure is visible to the reader, and the diagnostics file they may
choose to send carries the update phase. That is the most this position allows without a new
decision.

## What this file is not

It is not an argument for measuring more. The default answer to *"should we track this?"*
stays **no**, so that a future yes has to argue for itself — that is
[`measurement-position.md`](measurement-position.md)'s job and this file does not reopen it.

It is a guard against a different failure: an absence that nobody chose, sitting
indistinguishable from one that somebody did.
