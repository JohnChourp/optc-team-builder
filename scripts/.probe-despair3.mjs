import { readFileSync } from 'node:fs';
import { analyzeBuilderAbilityText } from './auto-team-builder-ability-parser.mjs';

const SCRATCH =
  '/private/tmp/claude-501/-Users-john-Downloads-projects-optc-team-builder-brain/74091495-975b-45b1-9add-42305aba5065/scratchpad/all.json';
const rows = JSON.parse(readFileSync(SCRATCH, 'utf8'));
if (rows.length !== 4582) throw new Error('corpus wrong size: ' + rows.length);

// The two real TURN_PATTERNS that can carry a despair target, copied verbatim
// from the parser source (line ~1404 and ~1437) purely to LOCATE clause offsets.
const P1 =
  /(?:reduces{0,2}|removes?)\s+((?:(?!\breduces{0,2}\b|\bremoves?\b|\bcompletely\b)[^.;])+?)\s+(?:duration\s+(?:by\s+)?|by\s+)(\d+)(?:\s*-\s*\d+)?\s+turns?/gi;
const P2 =
  /(?:reduces{0,2}|removes?)\s+((?:(?!\breduces{0,2}\b|\bremoves?\b)[^.;])+?)\s+(?:duration\s+)?completely/gi;

function clauseMatches(text) {
  const out = [];
  for (const P of [P1, P2]) {
    P.lastIndex = 0;
    let m;
    while ((m = P.exec(text))) {
      if (/despair/i.test(m[1]) && !/sailor despair/i.test(m[1])) {
        out.push({ index: m.index, cap: m[1], whole: m[0] });
      }
    }
  }
  return out;
}

function run(label, { fields, gate }) {
  const chars = new Set();
  let clauses = 0;
  for (const r of rows) {
    const d = JSON.parse(r.detail_json);
    for (const field of fields) {
      const text = d[field];
      if (!text || typeof text !== 'string') continue;
      const tags = analyzeBuilderAbilityText(text, 'specialText') ?? [];
      if (!tags.some((a) => a.key === 'remove_despair')) continue;
      for (const m of clauseMatches(text)) {
        if (!gate(text, m)) continue;
        clauses++;
        chars.add(r.id);
      }
    }
  }
  console.log(label, '=> clauses:', clauses, '| distinct chars:', chars.size);
}

// gate: any "if" anywhere earlier in the WHOLE text (over-broad, ignores sentences)
run('F if-before-match-index, specialText', {
  fields: ['specialText'],
  gate: (text, m) => /\bif\b/i.test(text.slice(0, m.index)),
});
run('G if-before-match-index, special+super', {
  fields: ['specialText', 'superSpecialText'],
  gate: (text, m) => /\bif\b/i.test(text.slice(0, m.index)),
});
run('H if-anywhere-in-text, specialText', {
  fields: ['specialText'],
  gate: (text) => /\bif\b/i.test(text),
});
run('I if-anywhere-in-text, special+super', {
  fields: ['specialText', 'superSpecialText'],
  gate: (text) => /\bif\b/i.test(text),
});
run('J if/when-before-index, special+super', {
  fields: ['specialText', 'superSpecialText'],
  gate: (text, m) => /\b(if|when)\b/i.test(text.slice(0, m.index)),
});
run('K ALL despair clauses (no gate), specialText', {
  fields: ['specialText'],
  gate: () => true,
});
