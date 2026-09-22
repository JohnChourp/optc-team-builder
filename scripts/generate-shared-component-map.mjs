#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import {
  buildSharedComponentMap,
  findConstraintGaps,
} from './lib/shared-component-map.mjs';

/**
 * 869f138qz. Writes `docs/shared-component-map.json` from the imports.
 *
 * Why it is generated, and why most constraints are null, is in
 * `scripts/lib/shared-component-map.mjs`.
 *
 * Run: npm run shared:component-map           (write)
 *      npm run shared:component-map -- --check (fail when the file is stale)
 */

const APP_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUTPUT_PATH = path.join(APP_ROOT, 'docs/shared-component-map.json');

/**
 * The one thing a host must not do, per shared component.
 *
 * Kept in source rather than in the generated file so it is reviewed as code, and `null` wherever no
 * constraint has been established. Seventeen invented rules would read as seventeen rules; four
 * grounded ones and an honest count of the rest is worth more, and the count is in the document so
 * the gap is visible rather than implied.
 *
 * Every entry that is not null cites what established it.
 */
export const HOST_CONSTRAINTS = Object.freeze({
  /* 869f138q3. The utility, not the attribute: a title that changes while the pop-up is open has to
   * be re-applied on present, and setting aria-label once does not do that. */
  a11y: 'Must not set the dialog name by writing `aria-label` once and leaving it - route through `applyIonicModalDialogLabel` so a title that changes while the pop-up is open is re-applied.',
  'ability-filter-rail': null,
  /* 869f138pv. Proven from all six pickers: `dismiss` fires only when nothing was chosen. */
  'ability-requirement-picker':
    'Must not treat `dismiss` as "the reader changed something" - it fires only when the pop-up closed WITHOUT a save, including on a backdrop tap, and never after the save output.',
  'ability-tag-set-picker':
    'Must not treat `dismiss` as "the reader changed something" - it fires only when the pop-up closed WITHOUT a save, including on a backdrop tap, and never after the save output.',
  'captain-team-condition-status': null,
  'character-ability-groups': null,
  'character-facet-filter': null,
  'character-filter-row': null,
  'character-image-picker':
    'Must not treat `dismiss` as "the reader changed something" - it fires only when the pop-up closed WITHOUT a save, including on a backdrop tap, and never after the save output.',
  'character-tag-filter': null,
  'character-tag-set-picker':
    'Must not treat `dismiss` as "the reader changed something" - it fires only when the pop-up closed WITHOUT a save, including on a backdrop tap, and never after the save output.',
  clipboard: null,
  'ship-picker':
    'Must not treat `dismiss` as "the reader changed something" - it fires only when the pop-up closed WITHOUT a save, including on a backdrop tap, and never after the save output.',
  'special-ability-picker':
    'Must not treat `dismiss` as "the reader changed something" - it fires only when the pop-up closed WITHOUT a save, including on a backdrop tap, and never after the save output.',
  /*
   * 869f13gb3. A pure builder with no host at all - the page assembles the report and
   * copies it. Nothing to constrain until something presents it.
   */
  'disagreement': null,
  'team-coverage-summary': null,
  'toolbar-back-button': null,
  /* Presented by the side menu only, and its own modal owns its open state. */
  'whats-new': null,
});

function serialize(document) {
  return `${JSON.stringify(document, null, 2)}\n`;
}

function build() {
  return buildSharedComponentMap({ appRoot: APP_ROOT, constraints: HOST_CONSTRAINTS });
}

function main() {
  const check = process.argv.includes('--check');
  const document = build();
  const gaps = findConstraintGaps({
    componentIds: document.components.map((component) => component.id),
    constraints: HOST_CONSTRAINTS,
  });

  if (gaps.length) {
    console.error('[shared-component-map] constraint entries do not match the shared folder:');

    for (const gap of gaps) {
      console.error(`- [${gap.kind}] ${gap.componentId} - ${gap.detail}`);
    }

    process.exitCode = 1;

    return;
  }

  const next = serialize(document);

  if (!check) {
    writeFileSync(OUTPUT_PATH, next, 'utf8');
    console.log(
      `[shared-component-map] wrote docs/shared-component-map.json (${document.componentCount} components, ${document.relationshipCount} host relationships).`,
    );

    return;
  }

  let current = '';

  try {
    current = readFileSync(OUTPUT_PATH, 'utf8');
  } catch {
    current = '';
  }

  if (current === next) {
    console.log(
      `[shared-component-map] OK - ${document.componentCount} components, ${document.relationshipCount} host relationships, ${document.constraintsEstablished} constraints established.`,
    );

    return;
  }

  console.error(
    '[shared-component-map] docs/shared-component-map.json does not match the imports. It is GENERATED - run `npm run shared:component-map`.',
  );
  process.exitCode = 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}

export { build, serialize };
