import fs from 'node:fs';
const hits = JSON.parse(fs.readFileSync('/private/tmp/claude-501/-Users-john-Downloads-projects-optc-team-builder-brain/74091495-975b-45b1-9add-42305aba5065/scratchpad/despair-hits.json','utf8'));

// Re-derive the cure clauses the same way the parser's "by N turns" / "completely"
// patterns do, then ask whether an "If <cond>," wrapper precedes the clause inside
// the SAME sentence.
const BY_N = /(?:reduces{0,2}|removes?)\s+((?:(?!\breduces{0,2}\b|\bremoves?\b|\bcompletely\b)[^.;])+?)\s+(?:duration\s+(?:by\s+)?|by\s+)(\d+)(?:\s*-\s*\d+)?\s+turns?/gi;
const COMPL = /(?:reduces{0,2}|removes?)\s+((?:(?!\breduces{0,2}\b|\bremoves?\b)[^.;])+?)\s+(?:duration\s+)?completely/gi;

let gatedClauses = 0; const gatedChars = new Set();
let ungatedClauses = 0; const ungatedChars = new Set();
const gatedRows = [];

for (const h of hits) {
  // sentence split on "." not part of a decimal (DECIMAL TRAP)
  const sentences = h.sp.split(/(?<!\d)\.(?!\d)/);
  for (const s of sentences) {
    for (const re of [BY_N, COMPL]) {
      re.lastIndex = 0;
      let m;
      while ((m = re.exec(s)) !== null) {
        const target = m[1].toLowerCase();
        if (!target.includes('despair')) continue;
        if (target.includes('sailor despair')) continue;
        const before = s.slice(0, m.index);
        const gated = /\bif\b/i.test(before);
        if (gated) { gatedClauses++; gatedChars.add(h.id); gatedRows.push({id:h.id,name:h.name,clause:m[0].trim()}); }
        else { ungatedClauses++; ungatedChars.add(h.id); }
      }
    }
  }
}
console.log('conditional-gated cure clauses:', gatedClauses, '| distinct chars:', gatedChars.size);
console.log('ungated cure clauses:', ungatedClauses, '| distinct chars:', ungatedChars.size);
console.log('chars with a gated clause AND no ungated clause:',
  [...gatedChars].filter((id) => !ungatedChars.has(id)).length);
fs.writeFileSync('/private/tmp/claude-501/-Users-john-Downloads-projects-optc-team-builder-brain/74091495-975b-45b1-9add-42305aba5065/scratchpad/gated.json', JSON.stringify(gatedRows,null,1));
