import fs from 'node:fs';
const hits = JSON.parse(fs.readFileSync('/private/tmp/claude-501/-Users-john-Downloads-projects-optc-team-builder-brain/74091495-975b-45b1-9add-42305aba5065/scratchpad/despair-hits.json','utf8'));
const BY_N = /(?:reduces{0,2}|removes?)\s+((?:(?!\breduces{0,2}\b|\bremoves?\b|\bcompletely\b)[^.;])+?)\s+(?:duration\s+(?:by\s+)?|by\s+)(\d+)(?:\s*-\s*\d+)?\s+turns?/gi;
const COMPL = /(?:reduces{0,2}|removes?)\s+((?:(?!\breduces{0,2}\b|\bremoves?\b)[^.;])+?)\s+(?:duration\s+)?completely/gi;

const variants = {
  'A: "if" before clause, same sentence (mine)': (sp, s, before) => /\bif\b/i.test(before),
  'B: "if" anywhere before clause in whole text': (sp, s, before, absBefore) => /\bif\b/i.test(absBefore),
  'C: "if" anywhere in specialText at all': (sp) => /\bif\b/i.test(sp),
  'D: sentence containing clause starts with "If"': (sp, s) => /^\s*if\b/i.test(s),
};

for (const [name, fn] of Object.entries(variants)) {
  let clauses = 0; const chars = new Set();
  for (const h of hits) {
    const sentences = h.sp.split(/(?<!\d)\.(?!\d)/);
    let offset = 0;
    for (const s of sentences) {
      for (const re of [BY_N, COMPL]) {
        re.lastIndex = 0; let m;
        while ((m = re.exec(s)) !== null) {
          const t = m[1].toLowerCase();
          if (!t.includes('despair') || t.includes('sailor despair')) continue;
          if (fn(h.sp, s, s.slice(0, m.index), h.sp.slice(0, offset + m.index))) { clauses++; chars.add(h.id); }
        }
      }
      offset += s.length + 1;
    }
  }
  console.log(name.padEnd(46), '-> clauses:', String(clauses).padStart(3), '| chars:', chars.size);
}
