import {
  analyzeBuilderAbilityText,
  extractMaxLevelAbilityBranchText,
  extractPrimaryAbilityBranchText,
} from './auto-team-builder-ability-parser.mjs';
import { execFileSync } from 'node:child_process';

const rows = JSON.parse(
  execFileSync('sqlite3', ['-json', '/tmp/optc-audit.db',
    "SELECT c.id,c.name,cd.detail_json FROM characters c JOIN character_details cd ON cd.character_id=c.id"],
  { maxBuffer: 1 << 30 }),
);
console.log('rows', rows.length);

const diffs = [];
let despairSpecialChars = 0;
for (const row of rows) {
  const d = JSON.parse(row.detail_json);
  for (const source of ['specialText', 'superSpecialText']) {
    const text = d[source];
    if (typeof text !== 'string' || !text.length) continue;
    const published = analyzeBuilderAbilityText(text, source).filter((a) => a.key === 'remove_despair');
    if (!published.length) continue;
    if (source === 'specialText') despairSpecialChars += 1;
    const maxText = extractMaxLevelAbilityBranchText(text);
    const primText = extractPrimaryAbilityBranchText(text);
    if (!maxText || maxText === primText) continue;
    const maxTier = analyzeBuilderAbilityText(maxText, source, false).filter((a) => a.key === 'remove_despair');
    for (const p of published) {
      const m = maxTier.find((x) => x.source === p.source);
      if (!m) continue;
      if (p.minTurns !== m.minTurns) {
        diffs.push({ id: row.id, name: row.name, source, published: p.minTurns, maxTier: m.minTurns });
      }
    }
  }
}
console.log('remove_despair specialText chars:', despairSpecialChars);
console.log('published != max-level tier:', diffs.length);
for (const x of diffs) console.log(`  #${x.id} ${x.name} [${x.source}] ${x.published} -> ${x.maxTier}`);
