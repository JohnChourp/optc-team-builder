# What a player can configure, and what each setting does

**869f13gbz.** Measured 2026-09-22. The player configures more than the Settings screen suggests:
some of it is in Settings, some is inline on the screen it affects, and some is an implicit side
effect of using a screen at all.

## The authoritative source is the registry, not this page

`src/app/core/data/browser-storage-keys.data.ts` holds **31 keys** in four classifications, and it
is guarded by `npm run test:storage-keys`. This page is a **reading** of it for the two kinds a
player can actually change; if the two disagree, the registry is right.

Regenerate this table with:

Command status: manual/illustrative.
<!-- docs-command: manual/illustrative -->
```bash
node --input-type=module -e "import {readStorageRegistry} from './scripts/lib/browser-storage-registry.mjs'; console.log(readStorageRegistry(process.cwd()).length)"
```

| Classification | Count | What it means |
| --- | --: | --- |
| `durable-user-data` | 11 | the reader's own work. **Must** survive an export/import round trip |
| `device-preference` | 7 | a choice about **this device**, deliberately not exported |
| `transient-ui-state` | 11 | derived or dismissable UI state; losing it costs nothing |
| `credential` | 2 | never exported, never synced |

## The two kinds a player changes

| Key | Kind | Backend | Survives export as | Note |
| --- | --- | --- | --- | --- |
| `analyticsConsent` | device-preference | preferences | **no** | Consent is given per browser and must not travel in a file: importing someone else’s export must never turn an |
| `appLanguage` | device-preference | preferences | **no** | Which language this device shows. A choice about the device, not content the reader made. |
| `autoTeamBuilderWorkerPreference` | device-preference | preferences | **no** | How many workers to run. Tuned to THIS device’s cores; restoring it on a weaker phone would be wrong. |
| `driveSyncMetadata` | device-preference | preferences | **no** | This device’s bookkeeping about its own last sync, and it carries connectedAccountEmail and connectedAccountId |
| `firstRunTransferNoticeDismissed` | device-preference | local | **no** | Whether the reader dismissed the empty-install notice (869f13d6j). A choice about this device, not content, so |
| `gameRegionHideUnavailable` | device-preference | preferences | **no** | Whether an out-of-region unit is removed from results rather than merely marked. False by default, and deliber |
| `gameRegionPreference` | device-preference | preferences | **no** | Which version of the game the reader plays - 'all' (default), 'global' or 'japan'. Drives the out-of-region ba |
| `boostedCharacterIds` | durable-user-data | preferences | `boostedCharacterIds` | Characters the reader marked as boosted for the event they are playing, entered by hand because there is no bo |
| `characterBoxes` | durable-user-data | preferences | `characterBoxes` | What the reader owns, per box. |
| `characterOverrides` | durable-user-data | preferences | `characterOverrides` | Local edits to dataset characters. Invisible until something looks wrong, so losing them is worse than losing  |
| `crewForgeImageProfiles` | durable-user-data | preferences | `crewForgeProfiles` | The tuning that makes the screenshot importer read THIS reader’s screenshots. Absent from the export until 869 |
| `crewForgeLastImageProfileId` | durable-user-data | preferences | `crewForgeProfiles` | Which of those profiles was selected. Carried inside the same scope, as lastProfileId. |
| `favoriteCharacterIds` | durable-user-data | preferences | `favorites` | The characters the reader marked. Theirs, and not derivable from anything else. |
| `favoriteShipIds` | durable-user-data | preferences | `favoriteShips` | As above, for ships. |
| `savedEnemies` | durable-user-data | preferences | `savedEnemies` | Enemies the reader described, with their links to teams. |
| `savedRumbleOpponents` | durable-user-data | preferences | `savedRumbleOpponents` | Opponent crews the reader saved to face again across a Rumble season. Added by 869f12x45; this guard is what r |
| `savedRumbleTeams` | durable-user-data | preferences | `savedRumbleTeams` | The Rumble side of the same thing. |
| `savedTeams` | durable-user-data | preferences | `savedTeams` | The reader’s teams. Its schema lifecycle is docs/saved-team-schema-lifecycle.md. |

## The setting that is not in the registry at all

**Crew Forge image profiles carry their own `matchThreshold`**, inside `crewForgeImageProfiles`.
The registry knows the key; it cannot know that a value *inside* that blob is a tuning dial a
player can move, and that moving it changes how many screenshot slots resolve.

That is the gap 869f13gay is about: a threshold set too high silently rejects correct matches, too
low and it accepts wrong ones, and in both cases the import just looks worse with nothing pointing
at the setting that caused it. The scale that threshold is compared against is documented in
`src/app/core/data/crew-forge-confidence.data.ts`, and the matching pipeline that produces it is in
[`docs/crew-forge-matching.md`](crew-forge-matching.md).

## Why an inventory rather than a paragraph in the Settings docs

Because two other things depend on the list, and both have already been wrong once:

- **Export.** A setting nobody enumerated is a setting nobody exports. That is exactly how
  `crewForgeImageProfiles` and `crewForgeLastImageProfileId` came to be missing from the payload
  (869f12x4p) - real configuration a player had tuned, silently left behind on a device move, with
  nothing on screen to say so.
- **Drive sync**, which carries the same payload and must agree with it.

## What is not done here

869f13gbz's *Done when* asks that "a new player-configurable value that reaches storage without a
row fails the lane". **The lane already exists** - `npm run test:storage-keys` fails on a storage
key with no registry row, which is the mechanical half. What it cannot see is a tunable value
*nested inside* a registered blob, like `matchThreshold`. That gap is recorded here rather than
closed, because it has occurred once, and a guard earns its lane when a class recurs.
