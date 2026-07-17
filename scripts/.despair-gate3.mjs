import { execFileSync } from 'node:child_process';
import { analyzeSpecialText } from './auto-team-builder-ability-parser.mjs';

const rows = JSON.parse(execFileSync('sqlite3', ['-json','/tmp/optc-audit.db',
  "SELECT c.id,c.name,cd.detail_json FROM characters c JOIN character_details cd ON cd.character_id=c.id"],
  { maxBuffer: 1<<30, encoding:'utf8' }));
if (rows.length < 4000) throw new Error('DB EMPTY');
console.log('rows:', rows.length);

const BY_N = /(?:reduces{0,2}|removes?)\s+((?:(?!\breduces{0,2}\b|\bremoves?\b|\bcompletely\b)[^.;])+?)\s+(?:duration\s+(?:by\s+)?|by\s+)(\d+)(?:\s*-\s*\d+)?\s+turns?/gi;
const COMPL = /(?:reduces{0,2}|removes?)\s+((?:(?!\breduces{0,2}\b|\bremoves?\b)[^.;])+?)\s+(?:duration\s+)?completely/gi;

function countGates(texts, label) {
  let gated=0, ungated=0; const gc=new Set(), uc=new Set();
  for (const {id, text} of texts) {
    for (const s of text.split(/(?<!\d)\.(?!\d)/)) {
      for (const re of [BY_N, COMPL]) {
        re.lastIndex=0; let m;
        while ((m = re.exec(s)) !== null) {
          const t = m[1].toLowerCase();
          if (!t.includes('despair') || t.includes('sailor despair')) continue;
          if (/\bif\b/i.test(s.slice(0,m.index))) { gated++; gc.add(id); } else { ungated++; uc.add(id); }
        }
      }
    }
  }
  console.log(label.padEnd(40), 'gated clauses:', String(gated).padStart(3), '| chars:', String(gc.size).padStart(3),
              '|| ungated:', String(ungated).padStart(3), '| chars:', uc.size);
}

const sp=[], spss=[];
for (const r of rows) {
  const d = JSON.parse(r.detail_json);
  if (d.specialText) { sp.push({id:r.id,text:d.specialText}); spss.push({id:r.id,text:d.specialText}); }
  if (d.superSpecialText) spss.push({id:r.id,text:d.superSpecialText});
}
countGates(sp, 'specialText only');
countGates(spss, 'specialText + superSpecialText');
