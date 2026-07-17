import { analyzeSpecialText } from './auto-team-builder-ability-parser.mjs';
import { readFileSync } from 'node:fs';

const SCRATCH =
  '/private/tmp/claude-501/-Users-john-Downloads-projects-optc-team-builder-brain/74091495-975b-45b1-9add-42305aba5065/scratchpad/all.json';
const rows = JSON.parse(readFileSync(SCRATCH, 'utf8'));
if (rows.length !== 4582) throw new Error('corpus wrong size: ' + rows.length);

const hasDespair = (text) =>
  (analyzeSpecialText(text) ?? []).some((a) => a.key === 'remove_despair');

// Split into sentences, keeping the terminator.
const sentences = (text) => String(text).split(/(?<=\.)\s+/).filter((s) => s.trim());

const gatedChars = new Map();
let gatedClauses = 0;
let ungatedClauses = 0;
const allDespairChars = new Set();

for (const r of rows) {
  const d = JSON.parse(r.detail_json);
  for (const field of ['specialText', 'superSpecialText']) {
    const text = d[field];
    if (!text || typeof text !== 'string') continue;
    if (field !== 'specialText') continue; // audit scope: specialText
    if (!hasDespair(text)) continue;
    allDespairChars.add(r.id);
    for (const s of sentences(text)) {
      if (!hasDespair(s)) continue;
      // Does an "If <condition>," wrapper precede the cure inside this sentence?
      const gated = /^\s*if\b/i.test(s);
      if (gated) {
        gatedClauses++;
        if (!gatedChars.has(r.id)) gatedChars.set(r.id, []);
        gatedChars.get(r.id).push(s.trim());
      } else {
        ungatedClauses++;
      }
    }
  }
}

console.log('remove_despair chars (specialText):', allDespairChars.size);
console.log('conditional-gated cure clauses:', gatedClauses, '| distinct chars:', gatedChars.size);
console.log('ungated cure clauses:', ungatedClauses);
console.log('---- sample gated ----');
let n = 0;
for (const [id, cl] of gatedChars) {
  if (n++ >= 5) break;
  console.log('#' + id, JSON.stringify(cl));
}
