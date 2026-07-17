import { execFileSync } from 'node:child_process';
import { analyzeSpecialText } from './auto-team-builder-ability-parser.mjs';

const rows = JSON.parse(
  execFileSync('sqlite3', ['-json', '/tmp/optc-audit.db',
    "SELECT c.id,c.name,cd.detail_json FROM characters c JOIN character_details cd ON cd.character_id=c.id"],
    { maxBuffer: 1 << 30, encoding: 'utf8' }),
);
console.error('rows loaded:', rows.length);
if (rows.length < 4000) throw new Error('DB LOOKS EMPTY - ABORT');

const hits = [];
for (const r of rows) {
  const d = JSON.parse(r.detail_json);
  const sp = d.specialText;
  if (!sp) continue;
  const abil = analyzeSpecialText(sp);
  const m = abil.find((a) => a.key === 'remove_despair');
  if (m) hits.push({ id: r.id, name: r.name, sp, minTurns: m.minTurns });
}
console.error('remove_despair via specialText:', hits.length);
process.stdout.write(JSON.stringify(hits, null, 1));
