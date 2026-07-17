import { analyzeSpecialText } from './auto-team-builder-ability-parser.mjs';

const cases = [
  'Reduces Active Ability Silence duration by 3 turns.',
  'Reduces Silence duration by 3 turns.',
  'Reduces Special Bind duration by 3 turns.',
  'Removes Active Ability Silence completely.',
  'Reduces Active Ability Silence duration by 3 turns on this character.',
  'Reduces Despair duration by 3 turns.',
  'Reduces Sailor Despair duration by 3 turns.',
  'Reduces Bind and Active Ability Silence duration by 3 turns.',
];
for (const t of cases) {
  const r = analyzeSpecialText(t);
  const tags = (r?.abilities ?? r ?? []).map(a => typeof a === 'string' ? a : `${a.key}(${a.minTurns ?? '-'})`);
  console.log(JSON.stringify(t), '->', JSON.stringify(tags));
}
