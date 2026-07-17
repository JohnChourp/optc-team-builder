import { execFileSync } from 'node:child_process';
const rows = JSON.parse(execFileSync('sqlite3', ['-json', '/tmp/optc-audit.db',
  "SELECT c.id,c.name,cd.detail_json FROM characters c JOIN character_details cd ON cd.character_id=c.id"], {maxBuffer: 1<<30}));
console.log('rows:', rows.length);
let texts = 0;
const hits = [];
const scopeWords = new Map();
for (const r of rows) {
  const d = JSON.parse(r.detail_json);
  const pool = [];
  const push=(f,t)=>{ if(typeof t==='string'&&t) pool.push([f,t]); };
  push('specialText', d.specialText); push('superSpecialText', d.superSpecialText);
  push('captainAbility', d.captainAbility);
  (d.captainAbilityVariants??[]).forEach((v,i)=>push(`captainAbilityVariants[${i}]`, v?.text));
  (Array.isArray(d.sailorAbilities)?d.sailorAbilities:[]).forEach((s,i)=>push(`sailorAbilities[${i}]`, typeof s==='string'?s:s?.text));
  for (const [f,t] of pool) {
    texts++;
    // find every cure clause tail preposition after "duration completely" / "duration by N turns"
    for (const m of t.matchAll(/(?:reduces?|removes?)\s+([^.;]{0,60}?)\s+(?:duration\s+)?(?:completely|by\s+\d+\s+turns?)/gi)) {
      const tail = t.slice(m.index + m[0].length, m.index + m[0].length + 30);
      const w = /^\s*(for|on|of|to)\s+([a-z ]{0,22})/i.exec(tail);
      if (w) {
        const key = (w[1]+' '+w[2].trim()).toLowerCase();
        scopeWords.set(key, (scopeWords.get(key)??0)+1);
      }
    }
    if (/for one character/i.test(t)) hits.push({id:r.id,name:r.name,field:f,text:t.slice(0,150)});
  }
}
console.log('texts scanned:', texts);
console.log('\n=== texts containing "for one character" ===', hits.length);
hits.forEach(h=>console.log(`#${h.id} ${h.name} [${h.field}]\n   ${h.text}`));
console.log('\n=== cure-clause trailing prepositions (top 25) ===');
[...scopeWords.entries()].sort((a,b)=>b[1]-a[1]).slice(0,25).forEach(([k,v])=>console.log(String(v).padStart(5), JSON.stringify(k)));
