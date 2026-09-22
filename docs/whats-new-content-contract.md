# What's New: the content contract

**869f13gc3.** `check-whats-new.mjs` has always enforced the **shape** - both languages, newest
first, the released version present. The **content** rules lived only as prose in a 56 KB
instruction file, so a script checked the structure and a human checked the voice.

This page states those rules beside the data, and records which of them are now mechanical.

Measured 2026-09-22: **203 entries, 642 bullets, 166 marked `userVisible: true`.**

## Which list a bullet belongs in

| List | For |
| --- | --- |
| `added` | something that did not exist before and a player can now do |
| `improved` | something that existed and is now better, clearer or faster |
| `fixed` | something that was going wrong and has stopped |

A change that both adds and fixes gets a line in **both**. The test is what the player would say,
not what the diff did: the v0.6.4 bold rendering is `improved`, because the notes already existed
and now display properly.

## When `userVisible` is false

A release that touched **only** tooling, tests, docs, CI, dependencies or dataset regeneration.
It leaves all three lists empty and says plainly that nothing changed for the player.

**Do not invent value, and do not drop the entry.** A gap in the version numbers reads as
something withheld. Rules C and D already enforce both halves: a silent release claiming bullets
fails, and a visible release with no bullets fails.

## Every bullet says WHERE

Name the screen, and when the change is not on the screen itself, the place inside it. In the
player's words:

| Say | Never |
| --- | --- |
| pop-up | modal, dialog, overlay |
| the filter bar, the results list, the team slots, the character card, the side menu | component, control, widget, a file name |
| αναδυόμενο παράθυρο, η μπάρα φίλτρων, η λίστα αποτελεσμάτων | the same words in English |

The place is written in **bold**, which is what makes it findable when a later report asks where a
change landed.

## The Greek reads as Greek

Not a translation of the English word order. The game's own terms stay untranslated - Captain,
Friend Captain, Super Tandem, Rumble, sugo - because that is how players say them, and that is why
a correct Greek bullet still differs from its English sibling even when it keeps four English
words.

## What is mechanical now, and what is still a human's job

| Rule | Enforced? | Scope | Why that scope |
| --- | --- | --- | --- |
| shape: both languages, newest first, released version present | ✅ A-B | every entry | structural, always true |
| a silent release claims no bullets | ✅ C | every entry | structural |
| a visible release lists at least one bullet | ✅ D | every entry | measured: 0 violations today |
| no developer vocabulary, no file names | ✅ E | **newest only** | published entries never change |
| **the Greek is not byte-identical to the English** | ✅ **F** (new) | every entry | measured: **0 of 642** - a true invariant |
| **every bullet names a place in bold** | ✅ **G** (new) | **newest only** | **556 of 642** published bullets predate the rule |
| is it in the right list? | ❌ human | - | requires knowing what the change was |
| does the Greek read as Greek? | ❌ human | - | not mechanical |
| is the place name the one a player would use? | ❌ human | - | `**Thing**` is checkable; whether *Thing* is the player's word is not |

### Why F is global and G is not

**F** is measured as already universally true, so making it global costs nothing and catches a real
failure - a bullet where the Greek was skipped and the English pasted, which a Greek reader meets
as English.

**G** cannot be global. The place-naming rule arrived partway through the project's life, and
**556 of 642 published bullets predate it**. Those entries are permanent by design and are not
regenerated. Making G global would paint `main` red for a rule that history could not have
followed - which is the difference between a ratchet and a trap.

They were mutation-tested separately, not as a suite: F red on a Greek bullet replaced by its
English, G red on a bullet with its bold stripped, both green again on restore.
