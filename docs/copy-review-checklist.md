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
4. For copy-only changes, run `npm run i18n:validate`. Add focused page specs,
   guide discoverability, docs drift, or browser evidence when route metadata,
   public guide content, or live UI behavior is touched.
5. In PR traceability, call out the user-facing surfaces and whether the copy is
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
