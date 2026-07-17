import fs from 'node:fs';
const hits = JSON.parse(fs.readFileSync('/private/tmp/claude-501/-Users-john-Downloads-projects-optc-team-builder-brain/74091495-975b-45b1-9add-42305aba5065/scratchpad/despair-hits.json','utf8'));
const BY_N = /(?:reduces{0,2}|removes?)\s+((?:(?!\breduces{0,2}\b|\bremoves?\b|\bcompletely\b)[^.;])+?)\s+(?:duration\s+(?:by\s+)?|by\s+)(\d+)(?:\s*-\s*\d+)?\s+turns?/gi;
const COMPL = /(?:reduces{0,2}|removes?)\s+((?:(?!\breduces{0,2}\b|\bremoves?\b)[^.;])+?)\s+(?:duration\s+)?completely/gi;

const conds = {
  'if (same sentence, before clause)': /\bif\b/i,
  'if|when': /\b(?:if|when)\b/i,
  'if|when|depending': /\b(?:if|when|depending)\b/i,
  'if|when|depending|against|per|for each': /\b(?:if|when|depending|against|per|for each)\b/i,
};
for (const [name, cond] of Object.entries(conds)) {
  let clauses=0; const chars=new Set();
  for (const h of hits) for (const s of h.sp.split(/(?<!\d)\.(?!\d)/)) {
    for (const re of [BY_N, COMPL]) { re.lastIndex=0; let m;
      while ((m=re.exec(s))!==null) { const t=m[1].toLowerCase();
        if (!t.includes('despair')||t.includes('sailor despair')) continue;
        if (cond.test(s.slice(0,m.index))) { clauses++; chars.add(h.id); } } }
  }
  console.log(name.padEnd(42),'-> clauses:',String(clauses).padStart(3),'| chars:',chars.size);
}
