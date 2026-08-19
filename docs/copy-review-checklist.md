# Copy Review Checklist

Use this checklist when a change touches user-facing copy, public guide content,
or maintainer-facing release guidance. It keeps bilingual UI text, public
English guides, and release-maintenance docs aligned without forcing every
domain term into Greek.

## Hybrid Greek Glossary

Keep stable OPTC product and transfer terms in English across Greek UI copy:

| Term | Use |
| --- | --- |
| Auto Team Builder | Product surface and route name. |
| Manual Team Builder | Product surface and route name. |
| Saved Teams | Product surface, transfer source, and page family. |
| Captain Coverage | Product surface and validation area. |
| Release Android | GitHub Actions workflow and production release path. |
| JSON, preset, payload | Transfer and diagnostics formats. |
| share link, share code | Saved-team sharing formats. |
| slot, ship, fallback | Team-building mechanics that match app controls and tests. |
| tag, tags | Character tag and ability tag vocabulary shared with the dataset. |

Tag-filter boolean copy is **not** a glossary case. The AND/OR tag-set modals
(`public/i18n/ability-tag-sets/`, `public/i18n/character-tag-sets/`) must render
their operators as natural Greek — «και» / «ή», «Έχει όλα αυτά» / «Έχει έστω ένα
από αυτά» — never as bare `AND` / `OR`. The whole point of the modal is that a
non-technical reader understands the logic without knowing boolean algebra, so
leaving the operators in English defeats the feature in Greek.

Character **type** and **class** copy (`public/i18n/character-facet-filter/`, 19
leaves) is a glossary case in the other direction. `kind.type.label` and
`kind.class.label` stay `"Type"` / `"Class"` in Greek, matching every shipped
scope that already labels these facets — `characters.filters.type.label`,
`character-boxes.filters.typeLabel`, `captain-coverage.filters.type.label`,
`character-image-picker.filters.type` and `manual-team-builder.picker.filters.type`
are all English in `el`. The surrounding sentences still read as Greek
(«Φίλτρο ανά type»). `SHARED_TERM_KEYS` in
`character-facet-filter.i18n.spec.ts` is the machine-checked list of the two.

Facet **values** are never translated in any scope. `STR`, `QCK`, `Free Spirit`
and the rest are in-game identifiers that every predicate and every SQL `LIKE`
parameter compares against the dataset verbatim, so a translated class name would
silently stop matching in Greek. The i18n spec asserts that no locale file in the
scope contains one.

The match-mode copy is the tag-modal rule again: `mode.any` / `mode.all` and the
`mode.capacity.*` / `mode.disjoint.*` explanations must read as natural Greek,
never as bare `ANY` / `ALL`. `mode.capacity.*` reports something the control did
on the user's behalf (it demoted an impossible "All" across three values back to
"Any"), so the Greek must say what changed and why, not merely name the mode.

Translate the surrounding Greek sentence naturally. Do not leave standalone
states or button labels in English when they are not one of the glossary terms.
Examples: use Greek labels for source/state words such as `Πηγή`, `Κενό`,
`Αλλαγμένα slots`, and `Ανάκτηση:`.

## Review Steps

1. Inventory shared terms before editing copy. Check the affected i18n scope,
   route metadata, public guide text, and maintainer docs that describe the same
   flow.
2. Compare English and Greek intent. Greek can be hybrid, but it must not omit a
   warning, recovery instruction, supported format, or user action that exists in
   English.
3. Keep UI, guide, and runbook terms aligned for guided build, compare mode,
   Saved Teams sharing/import, Manual Team Builder share hydration, and release
   maintenance workflows.
4. For copy-only changes, run `npm run i18n:validate`. Run
   `npm run test:i18n-regression` when the change touches public help/guide
   links or critical Saved Teams, Auto Team Builder, or Manual Team Builder
   runtime help/error copy.
5. Add focused page specs, guide discoverability, docs drift, or browser
   evidence when route metadata, public guide content, or live UI behavior is
   touched.
6. In PR traceability, call out the user-facing surfaces and whether the copy is
   UI-facing, public-guide-facing, or maintainer-facing.

## Anti-Drift Checks

- Do not introduce new English-only Greek labels unless they are approved
  glossary terms.
- Do not translate transfer formats in a way that changes the expected wire
  format, route query name, or diagnostic code.
- Do not mix `Saved Teams`, `saved teams`, and Greek equivalents in adjacent
  help text unless the distinction is intentional: product surface versus plain
  saved-team records.
- Do not update public guide SEO route copy without also checking
  `scripts/generate-seo-pages.mjs` when the generated page repeats the same
  wording.
- Do not add critical runtime help/error text for Saved Teams, Auto Team Builder,
  or Manual Team Builder without deciding whether the key belongs in
  `scripts/i18n-regression-check.mjs`. The same applies to root-scope shell copy
  such as the `appUpdate` banner: its keys live in the `root` scope entry of that
  file, so a new one is only covered once it is listed there.
