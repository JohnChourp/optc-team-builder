import { analyzeSpecialText } from './auto-team-builder-ability-parser.mjs';

const t1833 =
  'If your captain is an [INT] or [PSY] character, recovers 7,000 HP, removes Poison duration completely and reduces Paralysis, Despair and Special Bind duration by 3 turns. If your Captain is a Powerhouse character, reduces damage received by 70% for 2 turns';
const t1675 =
  'Boosts ATK of Slasher and Driven characters by 1.5x for 1 turn. If your Captain is a Slasher or Driven character, changes orbs of adjacent characters into Matching orbs and reduces Paralysis and Despair duration by 2 turns';

for (const [id, t] of [
  ['1833', t1833],
  ['1675', t1675],
]) {
  console.log('=== #' + id);
  for (const a of analyzeSpecialText(t) ?? []) {
    console.log('   ', a.key, '| minTurns=', a.minTurns, '| complete=', a.isCompleteRemoval);
  }
}
