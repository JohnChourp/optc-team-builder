#!/usr/bin/env node
/**
 * 869f1328p. Writes the ability tag catalogue, and checks it for drift.
 *
 * `--check` fails when a tag's match count has moved further than the threshold allows, or when a
 * tag the filter bar offered has disappeared. It deliberately does NOT fail on small movement: the
 * dataset is regenerated and committed by every release.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import {
  buildAbilityTagCatalogue,
  findAbilityTagDrift,
  findGlossaryGaps,
  parseGlossaryKeys,
} from './lib/ability-tag-catalogue.mjs';

export const ABILITY_CATALOG_PATH = 'public/assets/data/optc-auto-builder-abilities.json';
export const PARSER_PATH = 'scripts/auto-team-builder-ability-parser.mjs';
export const GLOSSARY_PATH = 'src/app/core/data/ability-tag-glossary.data.ts';
export const CATALOGUE_JSON_PATH = 'docs/ability-tag-catalogue.json';

export function readAbilityTagCatalogue({
  appRoot = process.cwd(),
  generatedAt = new Date().toISOString(),
} = {}) {
  return buildAbilityTagCatalogue({
    abilityCatalogue: JSON.parse(readFileSync(path.join(appRoot, ABILITY_CATALOG_PATH), 'utf8')),
    parserSource: readFileSync(path.join(appRoot, PARSER_PATH), 'utf8'),
    glossaryKeys: parseGlossaryKeys(readFileSync(path.join(appRoot, GLOSSARY_PATH), 'utf8')),
    generatedAt,
  });
}

async function main() {
  const appRoot = process.cwd();
  const measured = readAbilityTagCatalogue({ appRoot });
  const targetPath = path.join(appRoot, CATALOGUE_JSON_PATH);
  const committed = existsSync(targetPath) ? JSON.parse(readFileSync(targetPath, 'utf8')) : null;
  const drift = findAbilityTagDrift(committed, measured);

  if (drift.length) {
    console.error(`[ability-tags] ${drift.length} tag(s) moved further than the threshold allows:`);
    for (const entry of drift) {
      console.error(`  - ${entry}`);
    }
    process.exitCode = 1;
    return;
  }

  const glossaryGaps = findGlossaryGaps(measured, new Set(
    measured.tags.filter((tag) => tag.hasPlayerDefinition).map((tag) => tag.key),
  ));

  if (glossaryGaps.length) {
    console.error(`[ability-tags] ${glossaryGaps.length} of the most-met term(s) have no definition:`);
    for (const gap of glossaryGaps) {
      console.error(`  - ${gap}`);
    }
    process.exitCode = 1;
    return;
  }

  if (!process.argv.includes('--check')) {
    writeFileSync(targetPath, `${JSON.stringify(measured, null, 2)}\n`, 'utf8');
    console.log(`[ability-tags] wrote ${CATALOGUE_JSON_PATH} (${measured.tagCount} tags).`);
  }

  console.log(
    `[ability-tags] OK - ${measured.tagCount} tags, ${measured.proseMatchedTagCount} produced by an ability-prose matcher, ${measured.definedTagCount} explained to the player, no count moved further than the threshold allows.`,
  );
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  await main();
}
