import { analyzeSpecialText } from './auto-team-builder-ability-parser.mjs';
import { analyzeBuilderAbilityText } from './auto-team-builder-ability-parser.mjs';
import { readFileSync } from 'node:fs';

const SCRATCH =
  '/private/tmp/claude-501/-Users-john-Downloads-projects-optc-team-builder-brain/74091495-975b-45b1-9add-42305aba5065/scratchpad/all.json';
const rows = JSON.parse(readFileSync(SCRATCH, 'utf8'));
if (rows.length !== 4582) throw new Error('corpus wrong size: ' + rows.length);

const sentences = (text) => String(text).split(/(?<=\.)\s+/).filter((s) => s.trim());

function run(label, { fields, gateTest }) {
  const chars = new Map();
  let clauses = 0;
  for (const r of rows) {
    const d = JSON.parse(r.detail_json);
    for (const field of fields) {
      const text = d[field];
      if (!text || typeof text !== 'string') continue;
      const tags = analyzeBuilderAbilityText(text, 'specialText') ?? [];
      if (!tags.some((a) => a.key === 'remove_despair')) continue;
      for (const s of sentences(text)) {
        const st = analyzeBuilderAbilityText(s, 'specialText') ?? [];
        if (!st.some((a) => a.key === 'remove_despair')) continue;
        if (!gateTest(s)) continue;
        clauses++;
        if (!chars.has(r.id)) chars.set(r.id, []);
        chars.get(r.id).push({ field, s: s.trim() });
      }
    }
  }
  console.log(label, '=> clauses:', clauses, '| distinct chars:', chars.size);
  return chars;
}

run('A leading-If, specialText only', {
  fields: ['specialText'],
  gateTest: (s) => /^\s*if\b/i.test(s),
});
run('B leading-If, special+superSpecial', {
  fields: ['specialText', 'superSpecialText'],
  gateTest: (s) => /^\s*if\b/i.test(s),
});
const c = run('C if-anywhere, special+superSpecial', {
  fields: ['specialText', 'superSpecialText'],
  gateTest: (s) => /\bif\b/i.test(s),
});
run('D if/when-anywhere, special+superSpecial', {
  fields: ['specialText', 'superSpecialText'],
  gateTest: (s) => /\b(if|when)\b/i.test(s),
});
run('E if-anywhere, specialText only', {
  fields: ['specialText'],
  gateTest: (s) => /\bif\b/i.test(s),
});
