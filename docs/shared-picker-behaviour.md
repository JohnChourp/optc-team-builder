# How every shared picker behaves — 869f138pv

**Status:** measured 2026-09-17 on `d8c3ba25` ·
[869f138pv](https://app.clickup.com/t/90121749478/869f138pv)

The `src/app/shared/` folder holds the app's real UI vocabulary, and six of its
components are modal pickers reused across Auto Team Builder, Manual Team Builder,
Captain Coverage, Crew Forge, Character Boxes, Saved Enemies and Saved Teams. Three
ClickUp tasks have existed because a shared picker behaved differently in one host
than another, so this is what they actually agree on, measured rather than assumed.

## What was already consistent

More than the task expected. All six modal pickers —
`ability-requirement-picker`, `ability-tag-set-picker`, `character-image-picker`,
`character-tag-set-picker`, `ship-picker`, `special-ability-picker` — already:

- render an **empty state** when their catalogue or their search returns nothing;
- bind `(didDismiss)` to a handler with the **same four-step contract** below, to the
  line.

The one thing nothing protected was that contract itself.

## The dismissal contract

1. The component holds `dismissReason: 'save' | 'cancel' | null`, reset to `null`
   when the modal opens.
2. The **save** path sets it to `'save'` before emitting its selection.
3. The **cancel** path sets it to `'cancel'` before emitting `dismiss`.
4. `onModalDidDismiss()` — bound to `(didDismiss)`, which Ionic fires for *every*
   close including the backdrop and Escape — consumes a non-null reason and returns;
   otherwise it emits `dismiss`.

So **a close the host did not route is treated exactly as Cancel**, and an explicit
Save or Cancel does not emit twice. Neither half is visible from any single call
site, and each fails differently: a handler that ignores the reason emits `dismiss`
a second time after Save, and one that never emits leaves the host believing a
dismissed pop-up is still open.

`npm run shared:picker-dismissal` enforces it, in the `picker-dismissal` lane of
`npm run verify:local`.

## What is deliberately NOT uniform

**Whether a picker confirms or applies live**, and a guard that flattened this would
make the app worse on purpose:

| Picker | Closes with | Because |
| --- | --- | --- |
| `ability-requirement-picker` | **Save / Cancel** | Builds a multi-field draft — effect, turns, slot scope, character count |
| `special-ability-picker` | **Save / Cancel** | The same, per ability |
| `ability-tag-set-picker` | Applies live | Picks tag sets; each toggle is complete on its own |
| `character-tag-set-picker` | Applies live | The same |
| `character-image-picker` | Applies live | Picks one image |
| `ship-picker` | Applies live | Picks one ship |

A confirm step exists where a selection is only meaningful once several fields
agree. Where one tap is a whole decision, a confirm step is a button in the way.

## Which pages host what

`docs/shared-component-map.json` lists every shared component's hosts, inputs and outputs,
**generated from the imports** ([869f138qz](https://app.clickup.com/t/90121749478/869f138qz)) - 17
components and **69 host relationships**, so "does this change affect Crew Forge?" is a lookup
rather than a grep. It also carries `hostConstraint`, the one thing a host must not do, which is
`null` wherever none has been established rather than invented.

## What still has no guard

Panel **styling** per host is covered separately by
`npm run theme:tag-picker-scoping`, which exists because a shared picker's panel
styling leaked into one host. Nothing here duplicates it.
